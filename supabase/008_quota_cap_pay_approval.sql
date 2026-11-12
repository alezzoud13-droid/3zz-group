-- التحديث 8: سقف توزيع الحصص + موافقة عبدالمحسن قبل الدفع
-- 1) مجموع حصص الحملة ما يتجاوز «العدد المطلوب» (قرار عبدالمحسن 12 نوفمبر: متعب وزّع 55 والمطلوب 50).
--    الزيادة لها طريق واحد: طلب زيادة ترشيح يُعتمد، فيرفع حصة الموظف والعدد المطلوب مع بعض (دالة quota_grant).
-- 2) الدفع بخطوتين: عبدالمحسن يعتمد الدفع (pay_ok)، وبعدها متعب أو عبدالمحسن يسجّل «تم الدفع».
-- يُشغَّل مرة وحدة بعد 007، وقبل نشر تحديث الواجهة. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists pay_ok_at timestamptz;
alter table public.deals add column if not exists pay_ok_by uuid references public.members(id);

-- ============ 1) سقف الحصص ============
create or replace function public.guard_quota_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare tgt int; tot int;
begin
  if tg_op = 'UPDATE' and new.quota <= old.quota then return new; end if;
  select target_total into tgt from campaigns where id = new.campaign_id;
  if tgt is null or tgt <= 0 then return new; end if;
  select coalesce(sum(quota), 0) into tot from quotas where campaign_id = new.campaign_id and member_id <> new.member_id;
  if tot + new.quota > tgt then
    raise exception 'مجموع الحصص بيصير % والعدد المطلوب للحملة %. ما ينوزع أكثر من اللي حدده عبدالمحسن: اعتمد طلب زيادة ترشيح، أو زد «العدد المطلوب» للحملة أولاً.', tot + new.quota, tgt;
  end if;
  return new;
end $$;
drop trigger if exists guard_quota_cap on public.quotas;
create trigger guard_quota_cap before insert or update on public.quotas for each row execute function public.guard_quota_cap();

-- اعتماد طلب الزيادة: يرفع العدد المطلوب والحصة في عملية وحدة (المعتمد ما يقدر يزيد لنفسه)
create or replace function public.quota_grant(p_campaign uuid, p_member uuid, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare newq int;
begin
  if p_qty is null or p_qty < 1 then raise exception 'عدد الزيادة غير صحيح'; end if;
  if not (public.is_admin() or public.has_role('approver')) then raise exception 'اعتماد زيادة الحصص لمتعب أو عبدالمحسن فقط'; end if;
  if p_member = auth.uid() and not public.is_admin() then raise exception 'زيادة حصتك يعتمدها عبدالمحسن، مو أنت'; end if;
  update campaigns set target_total = target_total + p_qty where id = p_campaign and target_total is not null;
  insert into quotas (campaign_id, member_id, quota, updated_by) values (p_campaign, p_member, p_qty, auth.uid())
    on conflict (campaign_id, member_id) do update set quota = quotas.quota + excluded.quota, updated_by = auth.uid(), updated_at = now();
  select quota into newq from quotas where campaign_id = p_campaign and member_id = p_member;
  return newq;
end $$;
revoke all on function public.quota_grant(uuid, uuid, int) from public, anon;
grant execute on function public.quota_grant(uuid, uuid, int) to authenticated;

-- ============ 2) الدفع بموافقة عبدالمحسن ============
create or replace function public.guard_pay() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pay_ok_at is distinct from old.pay_ok_at and new.pay_ok_at is not null and not public.is_admin() then
    raise exception 'اعتماد الدفع لعبدالمحسن فقط';
  end if;
  if new.paid_at is not null and old.paid_at is null and new.pay_ok_at is null and not public.is_admin() then
    raise exception 'تسجيل الدفع يحتاج اعتماد عبدالمحسن أولاً';
  end if;
  return new;
end $$;
drop trigger if exists guard_pay on public.deals;
create trigger guard_pay before update on public.deals for each row execute function public.guard_pay();
