-- التحديث 22: توزيع الحصص بالعدد أو بالمبلغ (قرار عبدالمحسن 20 نوفمبر)
-- قبل: الحصة عدد مقاطع فقط. الحين: عبدالمحسن يختار طريقة التوزيع لكل حملة:
--   count  = بالعدد فقط (الوضع القديم، الافتراضي)
--   budget = بالمبلغ فقط (كل موظف له حد صرف بالريال)
--   both   = بالاثنين (عدد وحد صرف)
-- وكل موظف يتابع حده في الإنفاق: مجموع ترشيحاته الشغّالة في الحملة ما يتجاوز حصته من الصرف.
-- يُشغَّل مرة وحدة بعد 021. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.campaigns add column if not exists quota_mode text not null default 'count';
alter table public.quotas    add column if not exists quota_budget numeric;
alter table public.requests  add column if not exists qty_budget numeric;

-- ============ 1) سقف التوزيع: مجموع حصص الصرف ما يتجاوز ميزانية الحملة ============
-- (النسخة السابقة كانت تفحص العدد فقط)
create or replace function public.guard_quota_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare tgt int; tot int; b numeric; totb numeric;
begin
  -- العدد
  if tg_op = 'INSERT' or new.quota > old.quota then
    select target_total into tgt from campaigns where id = new.campaign_id;
    if tgt is not null and tgt > 0 then
      select coalesce(sum(quota), 0) into tot from quotas where campaign_id = new.campaign_id and member_id <> new.member_id;
      if tot + new.quota > tgt then
        raise exception 'مجموع الحصص بيصير % والعدد المطلوب للحملة %. ما ينوزع أكثر من اللي حدده عبدالمحسن: اعتمد طلب زيادة ترشيح، أو زد «العدد المطلوب» للحملة أولاً.', tot + new.quota, tgt;
      end if;
    end if;
  end if;
  -- المبلغ
  if coalesce(new.quota_budget, 0) > 0 and (tg_op = 'INSERT' or coalesce(new.quota_budget, 0) > coalesce(old.quota_budget, 0)) then
    select budget into b from campaigns where id = new.campaign_id;
    if b is not null and b > 0 then
      select coalesce(sum(quota_budget), 0) into totb from quotas where campaign_id = new.campaign_id and member_id <> new.member_id;
      if totb + new.quota_budget > b then
        raise exception 'مجموع حصص الصرف بيصير % وسقف صرف الحملة %. ما ينوزع أكثر من السقف: اعتمد طلب زيادة، أو ارفع سقف الحملة أولاً.', totb + new.quota_budget, b;
      end if;
    end if;
  end if;
  return new;
end $$;

-- ============ 2) حد الصرف لكل موظف: ترشيحاته الشغّالة ما تتجاوز حصته من الصرف ============
-- الشغّال = مُرسل أو معتمد، غير مغلق وغير مرفوض (نفس حسبة «أرسل (شغّال)» في الواجهة).
create or replace function public.guard_member_budget() returns trigger
language plpgsql security definer set search_path = public as $$
declare qb numeric; tot numeric;
begin
  if new.campaign_id is null or new.member_id is null then return new; end if;
  if new.closed_at is not null or new.approval = 'rejected' then return new; end if;
  if new.sent_at is null and new.approval <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and new.price is not distinct from old.price
     and new.sent_at is not distinct from old.sent_at and new.approval is not distinct from old.approval
     and new.member_id is not distinct from old.member_id and new.campaign_id is not distinct from old.campaign_id then
    return new;
  end if;
  select quota_budget into qb from quotas where campaign_id = new.campaign_id and member_id = new.member_id;
  if qb is null or qb <= 0 then return new; end if;
  select coalesce(sum(price), 0) into tot from deals
    where campaign_id = new.campaign_id and member_id = new.member_id and id <> new.id
      and closed_at is null and approval <> 'rejected' and (sent_at is not null or approval = 'approved');
  if tot + coalesce(new.price, 0) > qb and not public.is_admin() then
    raise exception 'صرفك في هذي الحملة بيصير % وحدك %. اطلب زيادة حصة، أو عدّل المبلغ.', tot + coalesce(new.price, 0), qb;
  end if;
  return new;
end $$;
drop trigger if exists guard_member_budget on public.deals;
create trigger guard_member_budget before insert or update on public.deals for each row execute function public.guard_member_budget();

-- ============ 3) اعتماد طلب الزيادة: عدد و/أو مبلغ في عملية وحدة ============
-- نفس قواعد quota_grant القديمة (قرار 22): المعتمد يعتمد طلب مفتوح من الموظف بنفس العدد والمبلغ فقط،
-- والطلب ينقفل في نفس العملية. زيادة العدد ترفع «العدد المطلوب» للحملة زي قبل.
-- زيادة المبلغ: ما ترفع سقف صرف الحملة إلا من عبدالمحسن (قرار 24) — المعتمد يوزّع من داخل السقف بس.
create or replace function public.quota_grant_b(p_campaign uuid, p_member uuid, p_qty int, p_budget numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare newq int; newb numeric; v_req uuid; adm boolean := public.is_admin();
begin
  p_qty := coalesce(p_qty, 0); p_budget := coalesce(p_budget, 0);
  if p_qty < 0 or p_budget < 0 then raise exception 'قيمة الزيادة غير صحيحة'; end if;
  if p_qty = 0 and p_budget = 0 then raise exception 'حدد عدد الترشيحات أو مبلغ الزيادة'; end if;
  if not (adm or public.has_role('approver')) then raise exception 'اعتماد زيادة الحصص لمتعب أو عبدالمحسن فقط'; end if;
  if p_member = auth.uid() and not adm then raise exception 'زيادة حصتك يعتمدها عبدالمحسن، مو أنت'; end if;
  select id into v_req from requests where kind = 'quota' and campaign_id = p_campaign and from_member = p_member
    and status not in ('done','cancelled') and coalesce(qty, 0) = p_qty and coalesce(qty_budget, 0) = p_budget
    order by created_at limit 1 for update;
  if v_req is null and not adm then raise exception 'ما فيه طلب زيادة مفتوح من الموظف بهذا العدد والمبلغ'; end if;
  perform set_config('app.quota', 'on', true);
  if p_qty > 0 then update campaigns set target_total = target_total + p_qty where id = p_campaign and target_total is not null; end if;
  if p_budget > 0 and adm then update campaigns set budget = budget + p_budget where id = p_campaign and budget is not null; end if;
  insert into quotas (campaign_id, member_id, quota, quota_budget, updated_by)
    values (p_campaign, p_member, p_qty, nullif(p_budget, 0), auth.uid())
    on conflict (campaign_id, member_id) do update
      set quota = quotas.quota + p_qty,
          quota_budget = case when p_budget > 0 then coalesce(quotas.quota_budget, 0) + p_budget else quotas.quota_budget end,
          updated_by = auth.uid(), updated_at = now();
  if v_req is not null then update requests set status = 'done', done_at = now() where id = v_req; end if;
  perform set_config('app.quota', 'off', true);
  select quota, quota_budget into newq, newb from quotas where campaign_id = p_campaign and member_id = p_member;
  return jsonb_build_object('quota', newq, 'quota_budget', newb);
end $$;
revoke all on function public.quota_grant_b(uuid, uuid, int, numeric) from public, anon;
grant execute on function public.quota_grant_b(uuid, uuid, int, numeric) to authenticated;

-- ============ 4) مبلغ طلب الزيادة يثبت بعد الإرسال (قرار 35) ============
create or replace function public.guard_request_budget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.qty_budget, 0) < 0 then raise exception 'مبلغ الزيادة غير صحيح'; end if;
  if tg_op = 'UPDATE' and new.qty_budget is distinct from old.qty_budget
     and not public.is_admin() and coalesce(current_setting('app.quota', true), '') <> 'on' then
    raise exception 'الطلب بعد إرساله ما يتعدل — ألغه وأنشئ طلباً جديداً';
  end if;
  return new;
end $$;
drop trigger if exists a1_guard_request_budget on public.requests;
create trigger a1_guard_request_budget before insert or update on public.requests for each row execute function public.guard_request_budget();
