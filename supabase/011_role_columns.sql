-- التحديث 11: كل دور يعدّل خانات مرحلته فقط (فحص أمني 15 نوفمبر، مُجرّب على PostgreSQL حقيقي)
-- قبل هذا التحديث: أي أحد يقدر يعدّل صف كان يقدر يغيّر أي خانة فيه، والحماية كانت على «التعديل» بس مو «الإنشاء».
-- أمثلة انجرّبت ونجحت قبل التحديث، وتنرفض بعده (تفاصيلها في tests/db):
--   صانع المحتوى يسجّل «انشحن ووصل» أو «انطلق الإعلان» على ترشيحه، أو ينسب الاعتماد لغير متعب، أو يرجّع ترشيحه المعتمد.
--   الشحن يغيّر عنوان المستلم أو يقفل ملف غيره، أو يمسح «اعتماد الدفع» ويغيّر الآيبان من رابط المؤثر.
--   إنشاء ترشيح فيه «اعتماد الدفع» أو «المقطع معتمد ونزل» من البداية، أو بتواريخ قديمة.
--   المعتمد يعتمد ترشيحه بنقله باسم غيره ثم يرجّعه، أو يتخطى سقف الميزانية (إضافة معتمد مباشرة، رفع السعر بعد الاعتماد، إعادة فتح ملف مقفول).
--   المعتمد يرفع حصة أي أحد بدون طلب، أو يكرر نفس الطلب، أو ياخذ حصة غيره.
--   المطلوب منه يعتمد تسليمه بنفسه، والطالب يسوي طلب لنفسه ويحسبه إنجاز.
--   تقرير يوم قديم، وتواريخ مزوّرة (مثلاً «نزل» قبل 20 يوم) ترفع مؤشرات الأداء.
-- عبدالمحسن (الأدمن) والصيانة من محرر SQL مستثنين. آمن لإعادة التشغيل، ولا يحذف أي بيانات. يُشغَّل بعد 010.

-- أداة: أول خانة تغيّرت من القائمة
create or replace function public._chg(o jsonb, n jsonb, cols text[]) returns text
language sql immutable as $$
  select c from unnest(cols) c where (o -> c) is distinct from (n -> c) limit 1
$$;

-- ميزانية الحملة: مجموع المعتمد المفتوح (لغير الأدمن)
create or replace function public._check_budget(p_deal uuid, p_campaign uuid, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare b numeric; tot numeric;
begin
  select budget into b from campaigns where id = p_campaign for update;   -- يمنع اعتمادين بنفس اللحظة يتخطون السقف
  if b is null or b <= 0 then return; end if;
  select coalesce(sum(price), 0) into tot from deals
    where campaign_id = p_campaign and approval = 'approved' and closed_at is null and id <> p_deal;
  if tot + coalesce(p_price, 0) > b then
    raise exception 'هذا يرفع صرف الحملة إلى % وسقفها %. كلم عبدالمحسن يرفع السقف أو يعتمدها بنفسه.', tot + coalesce(p_price, 0), b;
  end if;
end $$;

-- ============ الترشيحات ============
create or replace function public.guard_deal_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb; n jsonb; c text;
  me uuid := auth.uid();
  owner boolean; appr boolean; appr_on boolean; ship boolean; media boolean;
  creator_cols text[] := array['name','phone','handle','platform','city','acc_type','followers','price','currency','price_note','notes',
    'sent_at','draft_url','draft_at','draft_note','post_url','tt_code','ig_code','sn_code','hook','posted_at','tt_at','ig_at','sn_at',
    'sn_user','planned_date','price_before','ad_type','campaign_id','influencer_id','batch_id',
    'rcv_name','rcv_phone','rcv_city','address','short_code','country','no_ship','no_pay','closed_at','closed_reason'];
  approver_cols text[] := array['approved_by','approved_at','decision_reason','draft_feedback','rounds','video_score','video_ok_at','member_id'];
  ship_cols text[] := array['shipped_at','delivered_at','tracking','ship_company','ship_failed_at','ship_note'];
  launch_cols text[] := array['ad_name','live_at','tt_live_at','ig_live_at','sn_live_at'];
  admin_cols text[] := array['id','pay_ok_at','pay_ok_by','created_by','created_at','intake_at','intake_token'];
  -- تواريخ الإنجاز: لغير الأدمن تنحفظ بوقت الحفظ الفعلي (ما ينفع تاريخ قديم أو مستقبلي)
  stamp_cols text[] := array['sent_at','draft_at','tt_at','ig_at','sn_at','posted_at','shipped_at','delivered_at','ship_failed_at',
    'live_at','tt_live_at','ig_live_at','sn_live_at','approved_at','video_ok_at','paid_at','closed_at'];
  insert_null text[] := array['approved_by','approved_at','video_ok_at','video_score','shipped_at','delivered_at','ship_failed_at',
    'tt_at','ig_at','sn_at','posted_at','live_at','tt_live_at','ig_live_at','sn_live_at','ad_name','paid_at','pay_ok_at','pay_ok_by',
    'closed_at','intake_at','draft_at','draft_feedback','tracking','ship_company','ship_note'];
begin
  if me is null or public.is_admin() or current_setting('app.intake', true) = 'on' then return new; end if;
  appr := public.has_role('approver');
  ship := public.has_role('shipper');
  media := public.has_role('media') or public.has_role('snap');

  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    if new.approval not in ('pending','draft') then raise exception 'الترشيح الجديد يبدأ «بانتظار الاعتماد». الاعتماد خطوة منفصلة'; end if;
    select x into c from unnest(insert_null) x where coalesce(n ->> x, '') <> '' limit 1;
    if c is not null then raise exception 'ما ينفع ترشيح جديد يبدأ وفيه «%» معبّى', c; end if;
    if coalesce(new.rounds, 0) <> 0 then raise exception 'ما ينفع ترشيح جديد يبدأ وفيه مرات إرجاع'; end if;
    new.created_at := now(); new.created_by := me;
    if new.sent_at is not null then new.sent_at := now(); end if;
    return new;
  end if;

  o := to_jsonb(old); n := to_jsonb(new);
  owner := old.member_id = me;
  -- المعتمد على ترشيحه هو: يعامَل كصانع محتوى (قراره لعبدالمحسن)
  appr_on := appr and old.member_id is distinct from me and new.member_id is distinct from me;

  c := public._chg(o, n, admin_cols);
  if c is not null then raise exception 'هذي الخانة (%) لعبدالمحسن فقط', c; end if;
  c := public._chg(o, n, ship_cols);
  if c is not null and not ship then raise exception 'بيانات الشحن (%) يعدّلها مسؤول الشحن فقط', c; end if;
  c := public._chg(o, n, launch_cols);
  if c is not null and not media then raise exception 'تسجيل إطلاق الإعلان (%) للميديا باير ومنسق المحتوى فقط', c; end if;
  c := public._chg(o, n, approver_cols);
  if c = 'decision_reason' and coalesce(new.decision_reason, '') = '' and owner then c := public._chg(o, n, array_remove(approver_cols, 'decision_reason')); end if;
  if c is not null and not appr_on then raise exception 'هذي الخانة (%) قرار المعتمد، وعلى ترشيحاتك يقررها عبدالمحسن', c; end if;
  c := public._chg(o, n, creator_cols);
  if c is not null and not (owner or appr) then raise exception 'بيانات الترشيح (%) يعدّلها صاحبه أو المعتمد فقط', c; end if;
  -- قرار الاعتماد: ما يتغيّر على ترشيحك (حتى لو نقلته باسم غيرك)
  if new.approval is distinct from old.approval and new.approval <> 'pending' and not appr_on then
    raise exception 'قرار الاعتماد للمعتمد، وعلى ترشيحاتك لعبدالمحسن';
  end if;
  if new.approval is distinct from old.approval and old.approval in ('approved','backup','rejected') and not appr_on then
    raise exception 'إرجاع الترشيح بعد قرار المعتمد يحتاج المعتمد أو عبدالمحسن';
  end if;
  if old.closed_at is not null and new.closed_at is null and not appr_on then raise exception 'إعادة فتح الملف للمعتمد أو عبدالمحسن'; end if;
  if new.paid_at is distinct from old.paid_at and not appr then raise exception 'تسجيل الدفع للمعتمد أو عبدالمحسن'; end if;
  if old.paid_at is not null and new.paid_at is distinct from old.paid_at then raise exception 'التراجع عن «تم الدفع» لعبدالمحسن فقط'; end if;
  -- المقطع والنزول بعد اعتماد الترشيح فقط
  if new.approval <> 'approved' and ((new.video_ok_at is not null and old.video_ok_at is null)
     or (new.tt_at is not null and old.tt_at is null) or (new.ig_at is not null and old.ig_at is null) or (new.sn_at is not null and old.sn_at is null)) then
    raise exception 'المقطع والنزول بعد اعتماد الترشيح';
  end if;
  -- الميزانية: أي تغيير يزيد صرف معتمد مفتوح (السعر، الحملة، إعادة الفتح)
  if new.approval = 'approved' and new.closed_at is null and (
       old.approval is distinct from 'approved' or old.closed_at is not null
    or new.price is distinct from old.price or new.campaign_id is distinct from old.campaign_id) then
    perform public._check_budget(new.id, new.campaign_id, new.price);
  end if;
  -- تواريخ الإنجاز بوقت الحفظ الفعلي
  foreach c in array stamp_cols loop
    if (n -> c) is distinct from (o -> c) and n ->> c is not null then
      n := jsonb_set(n, array[c], to_jsonb(now()));
    end if;
  end loop;
  if (n -> 'approved_by') is distinct from (o -> 'approved_by') and n ->> 'approved_by' is not null then n := jsonb_set(n, '{approved_by}', to_jsonb(me)); end if;
  new := jsonb_populate_record(new, n);
  return new;
end $$;
drop trigger if exists guard_deal_columns on public.deals;
drop trigger if exists a0_guard_deal_columns on public.deals;
create trigger a0_guard_deal_columns before insert or update on public.deals for each row execute function public.guard_deal_columns();

-- ============ رابط المؤثر: مرة وحدة، ويقفل بعد موافقة الدفع ============
-- لو احتاج المؤثر يصحح بياناته: عبدالمحسن يفتح الرابط من جديد (يمسح «intake_at» من محرر الجدول).
create or replace function public.intake_submit(p_token text, p jsonb, p_cipher jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from deals where intake_token = p_token and approval = 'approved' and closed_at is null
    and intake_at is null and pay_ok_at is null and paid_at is null
    for update;
  if v_id is null then return false; end if;
  perform set_config('app.intake', 'on', true);
  update deals set rcv_name = left(coalesce(p->>'rcv_name',''),120), rcv_phone = left(coalesce(p->>'rcv_phone',''),30),
    rcv_city = left(coalesce(p->>'rcv_city',''),80), address = left(coalesce(p->>'address',''),400),
    short_code = left(coalesce(p->>'short_code',''),20), country = left(coalesce(p->>'country','السعودية'),60),
    intake_at = now()
  where id = v_id;
  if p_cipher is not null then
    insert into deal_bank(deal_id, cipher) values (v_id, p_cipher)
    on conflict (deal_id) do update set cipher = excluded.cipher, created_at = now();
  end if;
  perform set_config('app.intake', 'off', true);
  return true;
end $$;
revoke all on function public.intake_submit(text, jsonb, jsonb) from public;
grant execute on function public.intake_submit(text, jsonb, jsonb) to anon, authenticated;

-- البيانات البنكية: من رابط المؤثر فقط (أو عبدالمحسن)
drop policy if exists b_ins on public.deal_bank;
drop policy if exists b_upd on public.deal_bank;
create policy b_ins on public.deal_bank for insert with check (public.is_admin());
create policy b_upd on public.deal_bank for update using (public.is_admin()) with check (public.is_admin());

-- ============ ملف المؤثر ============
create or replace function public.guard_infl_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); appr_on boolean;
begin
  if me is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.acq_decided_by is not null or new.acq_decided_at is not null then raise exception 'قرار الاستقطاب للمعتمد'; end if;
    new.created_at := now();
    if new.acq_sent_at is not null then new.acq_sent_at := now(); end if;
    if new.agreed_at is not null then new.agreed_at := now(); end if;
    return new;
  end if;
  appr_on := public.has_role('approver') and old.nominated_by is distinct from me and new.nominated_by is distinct from me;
  if new.nominated_by is distinct from old.nominated_by and new.nominated_by = me then raise exception 'ما ينفع تنقل ملف مؤثر باسمك'; end if;
  if new.acq_status is distinct from old.acq_status and new.acq_status in ('approved','rejected','needs_edit') and not appr_on then
    raise exception 'قرار الاستقطاب للمعتمد، وعلى ملفاتك لعبدالمحسن';
  end if;
  if (new.acq_decided_by is distinct from old.acq_decided_by or new.acq_decided_at is distinct from old.acq_decided_at) and not appr_on then
    raise exception 'قرار الاستقطاب للمعتمد، وعلى ملفاتك لعبدالمحسن';
  end if;
  if old.acq_status = 'approved' and new.acq_status is distinct from old.acq_status and not appr_on then
    raise exception 'تغيير حالة استقطاب معتمد للمعتمد أو عبدالمحسن';
  end if;
  if old.agreed_at is not null and new.agreed_at is distinct from old.agreed_at and not public.has_role('approver') then
    raise exception 'بعد «تم الاتفاق» التعديل للمعتمد أو عبدالمحسن';
  end if;
  if new.created_at is distinct from old.created_at then raise exception 'ما ينفع تغيير تاريخ التسجيل'; end if;
  if new.acq_decided_at is distinct from old.acq_decided_at and new.acq_decided_at is not null then new.acq_decided_at := now(); end if;
  if new.acq_sent_at is distinct from old.acq_sent_at and new.acq_sent_at is not null then new.acq_sent_at := now(); end if;
  if new.agreed_at is distinct from old.agreed_at and new.agreed_at is not null then new.agreed_at := now(); end if;
  return new;
end $$;
drop trigger if exists guard_infl_agreed on public.influencers;
drop function if exists public.guard_infl_agreed();
drop trigger if exists guard_infl_columns on public.influencers;
drop trigger if exists a0_guard_infl_columns on public.influencers;
create trigger a0_guard_infl_columns before insert or update on public.influencers for each row execute function public.guard_infl_columns();

-- ============ الحصص ============
create or replace function public.guard_quota_keys() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or current_setting('app.quota', true) = 'on' then return new; end if;
  if new.member_id is distinct from old.member_id or new.campaign_id is distinct from old.campaign_id then
    raise exception 'ما ينفع نقل الحصة لموظف أو حملة ثانية';
  end if;
  return new;
end $$;
drop trigger if exists guard_quota_keys on public.quotas;
create trigger guard_quota_keys before update on public.quotas for each row execute function public.guard_quota_keys();

-- زيادة الحصة: من طلب زيادة مفتوح بنفس العدد بالضبط، والطلب ينقفل في نفس العملية (ما ينعاد)
create or replace function public.quota_grant(p_campaign uuid, p_member uuid, p_qty int) returns int
language plpgsql security definer set search_path = public as $$
declare newq int; v_req uuid;
begin
  if p_qty is null or p_qty < 1 then raise exception 'عدد الزيادة غير صحيح'; end if;
  if not (public.is_admin() or public.has_role('approver')) then raise exception 'اعتماد زيادة الحصص لمتعب أو عبدالمحسن فقط'; end if;
  if p_member = auth.uid() and not public.is_admin() then raise exception 'زيادة حصتك يعتمدها عبدالمحسن، مو أنت'; end if;
  select id into v_req from requests where kind = 'quota' and campaign_id = p_campaign and from_member = p_member
    and status not in ('done','cancelled') and qty = p_qty order by created_at limit 1 for update;
  if v_req is null and not public.is_admin() then raise exception 'ما فيه طلب زيادة مفتوح من الموظف بهذا العدد'; end if;
  perform set_config('app.quota', 'on', true);
  update campaigns set target_total = target_total + p_qty where id = p_campaign and target_total is not null;
  insert into quotas (campaign_id, member_id, quota, updated_by) values (p_campaign, p_member, p_qty, auth.uid())
    on conflict (campaign_id, member_id) do update set quota = quotas.quota + excluded.quota, updated_by = auth.uid(), updated_at = now();
  if v_req is not null then update requests set status = 'done', done_at = now() where id = v_req; end if;
  perform set_config('app.quota', 'off', true);
  select quota into newq from quotas where campaign_id = p_campaign and member_id = p_member;
  return newq;
end $$;
revoke all on function public.quota_grant(uuid, uuid, int) from public, anon;
grant execute on function public.quota_grant(uuid, uuid, int) to authenticated;

-- ============ الطلبات ============
-- آخر حدث يكتبه النظام فقط
create or replace function public.req_event_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.reqevt', 'on', true);
  update requests set last_event_at = new.created_at, last_event_by = new.member_id, last_event_type = new.type where id = new.request_id;
  perform set_config('app.reqevt', 'off', true);
  return new;
end $$;

create or replace function public.guard_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); requester boolean; boss boolean; k text; st text; fm uuid; tm uuid;
begin
  if me is null or public.is_admin() then return new; end if;
  boss := public.has_role('approver');
  if tg_table_name = 'requests' then
    if tg_op = 'INSERT' then
      if new.to_member = me then raise exception 'ما ينفع طلب من نفسك لنفسك'; end if;
      new.created_at := now(); new.started_at := null; new.done_at := null; new.status := 'new'; new.rounds := 0; new.result_url := '';
      new.last_event_at := null; new.last_event_by := null; new.last_event_type := '';
      return new;
    end if;
    if current_setting('app.reqevt', true) = 'on' or current_setting('app.quota', true) = 'on' then return new; end if;
    if public._chg(to_jsonb(old), to_jsonb(new), array['last_event_at','last_event_by','last_event_type','from_member','created_at','kind']) is not null then
      raise exception 'هذي الخانة ما تتعدل';
    end if;
    if new.to_member = new.from_member then raise exception 'ما ينفع طلب من نفسك لنفسك'; end if;
    requester := old.from_member = me;
    if requester then
      if new.to_member is distinct from old.to_member and old.status not in ('new','fix') then raise exception 'تغيير المطلوب منه قبل ما يبدأ فقط'; end if;
      if public._chg(to_jsonb(old), to_jsonb(new), array['result_url','started_at']) is not null then raise exception 'التسليم يكتبه المطلوب منه'; end if;
      if old.kind = 'quota' and (public._chg(to_jsonb(old), to_jsonb(new), array['qty','campaign_id']) is not null
         or (new.status is distinct from old.status and new.status <> 'cancelled')) then raise exception 'طلب الزيادة: تقدر تلغيه بس'; end if;
      -- الطالب: يلغي الطلب المفتوح، ويعتمد أو يرجّع بعد التسليم، ويرجّع المنتهي للتعديل
      if new.status is distinct from old.status and not (
           (new.status = 'cancelled' and old.status not in ('done','cancelled'))
        or (old.status = 'review' and new.status in ('done','fix'))
        or (old.status = 'done' and new.status = 'fix')) then
        raise exception 'هذا التغيير في حالة الطلب مو لك';
      end if;
      if old.status in ('done','cancelled') and new.status = old.status and public._chg(to_jsonb(old), to_jsonb(new), array['title','details','ref_url','size','due','deal_id']) is not null then
        raise exception 'الطلب منتهي';
      end if;
    elsif boss and old.kind = 'quota' then
      if public._chg(to_jsonb(old), to_jsonb(new), array['title','details','ref_url','size','to_member','due','deal_id','campaign_id','qty','result_url','started_at']) is not null
         or (old.status in ('done','cancelled') and new.status is distinct from old.status) then raise exception 'طلب الزيادة: القرار بس'; end if;
    else
      -- المطلوب منه: يبدأ ويسلّم بس
      if old.to_member is distinct from me then raise exception 'هذا الطلب مو مطلوب منك'; end if;
      if public._chg(to_jsonb(old), to_jsonb(new), array['title','details','ref_url','size','to_member','due','deal_id','campaign_id','qty','done_at','rounds']) is not null
         or (new.status is distinct from old.status and (new.status not in ('doing','review') or old.status in ('done','cancelled'))) then
        raise exception 'اعتماد الطلب أو إلغاؤه أو تعديله لصاحب الطلب';
      end if;
    end if;
    if new.started_at is distinct from old.started_at and new.started_at is not null then new.started_at := now(); end if;
    if new.done_at is distinct from old.done_at and new.done_at is not null then new.done_at := now(); end if;
    return new;
  else -- request_events
    select q.kind, q.status, q.from_member, q.to_member into k, st, fm, tm from requests q where q.id = new.request_id;
    requester := fm = me;
    new.created_at := now();
    if new.type in ('approve','fix','cancel','reopen','edit') and not (requester or (boss and k = 'quota')) then raise exception 'هذا الحدث لصاحب الطلب'; end if;
    if new.type in ('start','deliver') and tm is distinct from me then raise exception 'هذا الحدث للمطلوب منه'; end if;
    if new.type in ('quota_ok','quota_no') and not boss then raise exception 'اعتماد الزيادة لمتعب أو عبدالمحسن'; end if;
    return new;
  end if;
end $$;
drop trigger if exists guard_request on public.requests;
drop trigger if exists a0_guard_request on public.requests;
create trigger a0_guard_request before insert or update on public.requests for each row execute function public.guard_request();
drop trigger if exists guard_request_event on public.request_events;
create trigger guard_request_event before insert on public.request_events for each row execute function public.guard_request();

-- حذف الطلب: صاحبه قبل ما يبدأ فيه أحد (أو عبدالمحسن)
drop policy if exists r_del on public.requests;
create policy r_del on public.requests for delete using (
  public.is_admin() or (from_member = auth.uid() and status = 'new' and started_at is null
    and not exists (select 1 from public.request_events e where e.request_id = requests.id and e.type <> 'created')));

-- ============ تقرير اليوم: يومه أو اليوم اللي قبله (بتوقيت الرياض) ============
create or replace function public.guard_daily() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.day < d - 1 or new.day > d then raise exception 'تقرير اليوم يتعبّى في يومه أو اليوم اللي بعده فقط'; end if;
  if tg_op = 'UPDATE' and new.day is distinct from old.day then raise exception 'ما ينفع تغيير تاريخ التقرير'; end if;
  return new;
end $$;
drop trigger if exists guard_daily on public.daily_reports;
create trigger guard_daily before insert or update on public.daily_reports for each row execute function public.guard_daily();

-- ============ أدوات داخلية: ما تنستدعى من برّا ============
revoke all on function public._chg(jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public._check_budget(uuid, uuid, numeric) from public, anon, authenticated;

-- ============ رابط المؤثر في جدول خاص: يشوفه صاحب الترشيح وعبدالمحسن فقط ============
-- قبل: رمز الرابط كان خانة في «deals»، فالشحن والميديا يقدرون يقرونه ويعبّون الرابط قبل المؤثر بآيبانهم.
-- الروابط اللي انرسلت للمؤثرين تبقى شغالة (نفس الرمز ينتقل).
create table if not exists public.deal_links (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);
insert into public.deal_links(deal_id, token)
  select id, intake_token from public.deals where coalesce(intake_token, '') <> ''
on conflict (deal_id) do nothing;
insert into public.deal_links(deal_id) select id from public.deals d where not exists (select 1 from public.deal_links l where l.deal_id = d.id)
on conflict (deal_id) do nothing;
alter table public.deals alter column intake_token drop default;
do $$ begin
  perform set_config('app.intake', 'on', true);
  update public.deals set intake_token = null where intake_token is not null;
end $$;

create or replace function public.deal_link_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deal_links(deal_id) values (new.id) on conflict (deal_id) do nothing;
  return new;
end $$;
drop trigger if exists deal_link_new on public.deals;
create trigger deal_link_new after insert on public.deals for each row execute function public.deal_link_new();

alter table public.deal_links enable row level security;
grant select on public.deal_links to authenticated;
revoke all on public.deal_links from anon;
drop policy if exists dl_sel on public.deal_links;
create policy dl_sel on public.deal_links for select using (
  public.is_admin() or exists (select 1 from public.deals d where d.id = deal_id and d.member_id = auth.uid()));

create or replace function public.intake_get(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', d.name, 'campaign', c.name, 'done', d.intake_at is not null,
                            'no_pay', d.no_pay, 'no_ship', d.no_ship, 'bank_pub', (select value from settings where key='bank_pub'))
  from deal_links l join deals d on d.id = l.deal_id left join campaigns c on c.id = d.campaign_id
  where l.token = p_token and d.approval = 'approved' and d.closed_at is null
$$;
create or replace function public.intake_submit(p_token text, p jsonb, p_cipher jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select d.id into v_id from deal_links l join deals d on d.id = l.deal_id
    where l.token = p_token and d.approval = 'approved' and d.closed_at is null
      and d.intake_at is null and d.pay_ok_at is null and d.paid_at is null
    for update of d;
  if v_id is null then return false; end if;
  perform set_config('app.intake', 'on', true);
  update deals set rcv_name = left(coalesce(p->>'rcv_name',''),120), rcv_phone = left(coalesce(p->>'rcv_phone',''),30),
    rcv_city = left(coalesce(p->>'rcv_city',''),80), address = left(coalesce(p->>'address',''),400),
    short_code = left(coalesce(p->>'short_code',''),20), country = left(coalesce(p->>'country','السعودية'),60),
    intake_at = now()
  where id = v_id;
  if p_cipher is not null then
    insert into deal_bank(deal_id, cipher) values (v_id, p_cipher)
    on conflict (deal_id) do update set cipher = excluded.cipher, created_at = now();
  end if;
  perform set_config('app.intake', 'off', true);
  return true;
end $$;
revoke all on function public.intake_get(text) from public;
revoke all on function public.intake_submit(text, jsonb, jsonb) from public;
grant execute on function public.intake_get(text) to anon, authenticated;
grant execute on function public.intake_submit(text, jsonb, jsonb) to anon, authenticated;
