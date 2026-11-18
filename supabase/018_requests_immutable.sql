-- التحديث 18: الطلب بعد إرساله ما يتعدل (قرار عبدالمحسن 18 نوفمبر)
-- السبب: زر «تعديل الطلب» كان يسمح لصاحب الطلب يغيّر نص الطلب الأساسي بعد الإرسال،
-- فالمطلوب منه يشتغل على نص يتغيّر تحت يده. القرار: الطلب يثبت من لحظة إرساله —
-- الرد في السجل، والإلغاء، والمتابعة (تسليم/اعتماد/إرجاع) فقط. اللي غلط في طلبه يلغيه وينشئ جديداً.
-- عبدالمحسن مستثنى للطوارئ. يُشغَّل مرة وحدة بعد 017. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

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
    -- الجديد في 18: نص الطلب ومحتواه يثبت بعد الإرسال — لكل الأدوار، حتى صاحبه
    if public._chg(to_jsonb(old), to_jsonb(new), array['title','details','ref_url','size','due','deal_id','campaign_id','qty','to_member']) is not null then
      raise exception 'الطلب بعد إرساله ما يتعدل — رد عليه في السجل، أو ألغه وأنشئ طلباً جديداً';
    end if;
    if new.to_member = new.from_member then raise exception 'ما ينفع طلب من نفسك لنفسك'; end if;
    requester := old.from_member = me;
    if requester then
      if public._chg(to_jsonb(old), to_jsonb(new), array['result_url','started_at']) is not null then raise exception 'التسليم يكتبه المطلوب منه'; end if;
      if old.kind = 'quota' and new.status is distinct from old.status and new.status <> 'cancelled' then raise exception 'طلب الزيادة: تقدر تلغيه بس'; end if;
      -- الطالب: يلغي الطلب المفتوح، ويعتمد أو يرجّع بعد التسليم، ويرجّع المنتهي للتعديل
      if new.status is distinct from old.status and not (
           (new.status = 'cancelled' and old.status not in ('done','cancelled'))
        or (old.status = 'review' and new.status in ('done','fix'))
        or (old.status = 'done' and new.status = 'fix')) then
        raise exception 'هذا التغيير في حالة الطلب مو لك';
      end if;
    elsif boss and old.kind = 'quota' then
      if public._chg(to_jsonb(old), to_jsonb(new), array['result_url','started_at']) is not null
         or (old.status in ('done','cancelled') and new.status is distinct from old.status) then raise exception 'طلب الزيادة: القرار بس'; end if;
    else
      -- المطلوب منه: يبدأ ويسلّم بس
      if old.to_member is distinct from me then raise exception 'هذا الطلب مو مطلوب منك'; end if;
      if public._chg(to_jsonb(old), to_jsonb(new), array['done_at','rounds']) is not null
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
