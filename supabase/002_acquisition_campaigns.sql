-- التحديث 2: ملف المؤثر الواحد، الاستقطاب، حصص الحملات، التسليم لكل منصة
-- يُشغَّل مرة وحدة بعد schema.sql. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

-- ============ نسخة احتياطية قبل التعديل ============
create table if not exists public.backup_20261103_deals as select * from public.deals;
create table if not exists public.backup_20261103_requests as select * from public.requests;
create table if not exists public.backup_20261103_campaigns as select * from public.campaigns;
alter table public.backup_20261103_deals enable row level security;
alter table public.backup_20261103_requests enable row level security;
alter table public.backup_20261103_campaigns enable row level security;

-- ============ دور المستخدم ============
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where id = auth.uid() and active and (is_admin or r = any(roles)))
$$;

-- ============ ملف المؤثر (مرة وحدة لكل مؤثر) ============
create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_en text default '',
  handle text default '', tiktok_url text default '',
  acc_type text default '', account_status text default 'استقطاب',   -- استقطاب / مستمر
  country text default '', phone text default '', city text default '', district text default '',
  platforms text default '', snap_user text default '', ig_user text default '', yt_url text default '',
  nominated_by uuid references public.members(id) default auth.uid(),
  nominated_on date default current_date,
  source text default 'acq',                                         -- acq / campaign / import
  -- الاستقطاب: مسودة / بانتظار المراجعة / معتمد / مرفوض / يحتاج تعديل / بدون (جاي من حملة)
  acq_status text not null default 'draft',
  acq_sent_at timestamptz, acq_decided_at timestamptz, acq_decided_by uuid references public.members(id), acq_reason text default '',
  -- التواصل والتفاوض
  contacts jsonb not null default '[]',
  had_problem boolean, problem text default '', contact_summary text default '',
  price_before numeric, price_after numeric, currency text default 'SAR', agreed_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now()
);
create unique index if not exists influencers_handle_uq on public.influencers (lower(handle)) where handle <> '';
create index if not exists influencers_phone on public.influencers (phone);

-- ============ إضافات على المشاركة في الحملة ============
alter table public.deals add column if not exists influencer_id uuid references public.influencers(id);
alter table public.deals add column if not exists batch_id uuid;
alter table public.deals add column if not exists decision_reason text default '';
alter table public.deals add column if not exists ad_type text default '';
alter table public.deals add column if not exists planned_date date;
alter table public.deals add column if not exists price_before numeric;
alter table public.deals add column if not exists ship_failed_at timestamptz;
alter table public.deals add column if not exists ship_note text default '';
alter table public.deals add column if not exists sn_user text default '';
alter table public.deals add column if not exists tt_at timestamptz;
alter table public.deals add column if not exists ig_at timestamptz;
alter table public.deals add column if not exists sn_at timestamptz;
alter table public.deals add column if not exists tt_live_at timestamptz;
alter table public.deals add column if not exists ig_live_at timestamptz;
alter table public.deals add column if not exists sn_live_at timestamptz;
create index if not exists deals_influencer on public.deals (influencer_id);
create index if not exists deals_batch on public.deals (batch_id);

-- ============ الحملات: العدد المستهدف وحالتها ============
alter table public.campaigns add column if not exists target_total int;
alter table public.campaigns add column if not exists status text not null default 'active';   -- active / paused / ended

-- ============ حصة كل موظف في كل حملة (يكتبها متعب) ============
create table if not exists public.quotas (
  campaign_id uuid references public.campaigns(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  quota int not null default 0,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  primary key (campaign_id, member_id)
);

-- ============ طلب ترشيحات إضافية (نوع داخل الطلبات) ============
alter table public.requests add column if not exists campaign_id uuid references public.campaigns(id);
alter table public.requests add column if not exists qty int;

-- ============ ربط الترشيحات الموجودة بملفات مؤثرين ============
do $$ declare d record; v uuid; begin
  for d in select * from public.deals where influencer_id is null loop
    v := null;
    if coalesce(d.handle,'') <> '' then select id into v from public.influencers where lower(handle) = lower(d.handle) limit 1; end if;
    if v is null and coalesce(d.phone,'') <> '' then select id into v from public.influencers where phone = d.phone limit 1; end if;
    if v is null then
      insert into public.influencers(name, handle, phone, city, acc_type, platforms, nominated_by, source, acq_status, account_status, created_at)
      values (d.name, coalesce(d.handle,''), coalesce(d.phone,''), coalesce(d.city,''), coalesce(d.acc_type,''), coalesce(d.platform,''), d.member_id, 'import', 'none', 'مستمر', d.created_at)
      returning id into v;
    end if;
    update public.deals set influencer_id = v where id = d.id;
  end loop;
end $$;

-- ============ حماية الاعتماد على مستوى قاعدة البيانات ============
create or replace function public.guard_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'deals' then
    if (tg_op = 'INSERT' and new.approval <> 'pending') or (tg_op = 'UPDATE' and new.approval is distinct from old.approval and new.approval <> 'pending') then
      if not public.has_role('approver') then raise exception 'اعتماد ترشيحات الحملات لمتعب فقط'; end if;
    end if;
  elsif tg_table_name = 'influencers' then
    if (tg_op = 'INSERT' and new.acq_status in ('approved','rejected','needs_edit')) or (tg_op = 'UPDATE' and new.acq_status is distinct from old.acq_status and new.acq_status in ('approved','rejected','needs_edit')) then
      if not public.has_role('approver') then raise exception 'اعتماد الاستقطاب لمتعب فقط'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_deals on public.deals;
create trigger guard_deals before insert or update on public.deals for each row execute function public.guard_approvals();
drop trigger if exists guard_influencers on public.influencers;
create trigger guard_influencers before insert or update on public.influencers for each row execute function public.guard_approvals();

-- سجل التغييرات للجداول الجديدة
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into d
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at','updated_by');
    if tg_table_name in ('deals','requests','settings','influencers','quotas') then new.updated_at := now(); end if;
    if tg_table_name in ('deals','influencers') then new.updated_by := auth.uid(); end if;
    if d is null then return new; end if;
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'campaign_id', ''), 'U', d);
    return new;
  elsif tg_op = 'INSERT' then
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'campaign_id', ''), 'I', to_jsonb(new) - 'contacts');
    return new;
  else
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'campaign_id', ''), 'D', to_jsonb(old));
    return old;
  end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['influencers','quotas'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s before insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  end loop;
end $$;

-- ============ الصلاحيات ============
alter table public.influencers enable row level security;
alter table public.quotas enable row level security;
grant select, insert, update, delete on public.influencers, public.quotas to authenticated;
revoke all on public.influencers, public.quotas from anon;

drop policy if exists i_sel on public.influencers;
drop policy if exists i_ins on public.influencers;
drop policy if exists i_upd on public.influencers;
drop policy if exists i_del on public.influencers;
create policy i_sel on public.influencers for select using (public.is_member());
create policy i_ins on public.influencers for insert with check (public.is_member());
create policy i_upd on public.influencers for update using (public.is_member()) with check (public.is_member());
create policy i_del on public.influencers for delete using (public.is_admin());

drop policy if exists q_sel on public.quotas;
drop policy if exists q_all on public.quotas;
create policy q_sel on public.quotas for select using (public.is_member());
create policy q_all on public.quotas for all using (public.has_role('approver')) with check (public.has_role('approver'));
