-- التحديث 3: سجل أحداث لكل طلب (محادثة مرتبة)، حالة «يحتاج تعديل»، والإشعارات (مقروء/غير مقروء)
-- يُشغَّل مرة وحدة بعد 002. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

create table if not exists public.backup_20261103_requests_v3 as select * from public.requests;
alter table public.backup_20261103_requests_v3 enable row level security;

-- ============ سجل الأحداث (ما ينعدّل ولا ينحذف) ============
create table if not exists public.request_events (
  id bigserial primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  member_id uuid references public.members(id) default auth.uid(),
  type text not null,            -- created / edit / start / deliver / fix / approve / cancel / reopen / comment / quota_ok / quota_no
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists request_events_req on public.request_events (request_id, created_at);

-- ============ آخر قراءة لكل شخص ============
create table if not exists public.request_reads (
  request_id uuid references public.requests(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade default auth.uid(),
  seen_at timestamptz not null default now(),
  primary key (request_id, member_id)
);

-- ============ آخر حدث على الطلب (للإشعار والترتيب) ============
alter table public.requests add column if not exists last_event_at timestamptz;
alter table public.requests add column if not exists last_event_by uuid;
alter table public.requests add column if not exists last_event_type text default '';

create or replace function public.req_event_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update requests set last_event_at = new.created_at, last_event_by = new.member_id, last_event_type = new.type where id = new.request_id;
  return new;
end $$;
drop trigger if exists req_event_after on public.request_events;
create trigger req_event_after after insert on public.request_events for each row execute function public.req_event_after();

-- ============ نقل الطلبات الموجودة للسجل ============
do $$ declare r record; begin
  for r in select * from public.requests where not exists (select 1 from public.request_events e where e.request_id = requests.id) loop
    insert into public.request_events(request_id, member_id, type, body, created_at) values (r.id, r.from_member, 'created', coalesce(r.details, ''), r.created_at);
    if r.started_at is not null then insert into public.request_events(request_id, member_id, type, body, created_at) values (r.id, r.to_member, 'start', '', r.started_at); end if;
    if coalesce(r.result_url, '') <> '' then insert into public.request_events(request_id, member_id, type, body, created_at) values (r.id, r.to_member, 'deliver', r.result_url, greatest(coalesce(r.started_at, r.created_at), r.updated_at - interval '1 second')); end if;
    if r.done_at is not null then insert into public.request_events(request_id, member_id, type, body, created_at) values (r.id, r.from_member, case when r.kind = 'quota' then 'quota_ok' else 'approve' end, '', r.done_at); end if;
  end loop;
end $$;

-- ============ الصلاحيات ============
alter table public.request_events enable row level security;
alter table public.request_reads enable row level security;
grant select, insert on public.request_events to authenticated;
grant usage, select on sequence public.request_events_id_seq to authenticated;
grant select, insert, update on public.request_reads to authenticated;
revoke all on public.request_events, public.request_reads from anon;

drop policy if exists re_sel on public.request_events;
drop policy if exists re_ins on public.request_events;
drop policy if exists re_del on public.request_events;
create policy re_sel on public.request_events for select using (public.is_member());
create policy re_ins on public.request_events for insert with check (public.is_member() and member_id = auth.uid());
create policy re_del on public.request_events for delete using (public.is_admin());

drop policy if exists rr_sel on public.request_reads;
drop policy if exists rr_ins on public.request_reads;
drop policy if exists rr_upd on public.request_reads;
create policy rr_sel on public.request_reads for select using (member_id = auth.uid());
create policy rr_ins on public.request_reads for insert with check (member_id = auth.uid());
create policy rr_upd on public.request_reads for update using (member_id = auth.uid()) with check (member_id = auth.uid());
