-- نظام «أداء فريق العز» — قاعدة البيانات
-- يُشغَّل مرة وحدة في Supabase ← SQL Editor. آمن لإعادة التشغيل.

create extension if not exists pgcrypto;

-- ============ الأعضاء والصلاحيات ============
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  roles text[] not null default '{}',      -- creator, approver, shipper, media, snap, social, design, owned
  is_admin boolean not null default false,
  active boolean not null default false,    -- يفعّله المدير بعد التسجيل
  aliases text[] not null default '{}',     -- الأسماء المكتوبة في الشيتات القديمة
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where id = auth.uid() and active)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from members where id = auth.uid() and active and is_admin)
$$;

-- أول شخص يسجّل يصير المدير تلقائياً، والباقي ينتظرون التفعيل
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members(id, email, name, is_admin, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''),
          not exists(select 1 from members), not exists(select 1 from members))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ الإعدادات والحملات ============
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings(key, value) values
  ('sla', '{"nom":3,"appr":2,"intake":3,"ship":7,"video":10,"live":2}'),
  ('daily_tasks', '{}')
on conflict (key) do nothing;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  product text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.campaigns(name, product) values
  ('هيرش سيطرة','هيرش سيطرة'), ('سطوة القرن منزلي','سطوة القرن'),
  ('هيرش اشتري2 والثالث مجانا','بكج اشتري2 والثالث مجانا'), ('مجموعة هيرش مشكل','هيرش'),
  ('تغطيات منزلي الامارات',''), ('بيوتي ورد المعتمد','')
on conflict (name) do nothing;

-- ============ دورة المؤثر (6 مراحل) ============
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id),          -- صانع المحتوى صاحب الترشيح
  campaign_id uuid references public.campaigns(id),
  -- 1 الترشيح
  name text not null,
  phone text default '', handle text default '', platform text default '',
  city text default '', acc_type text default '', followers text default '',
  price numeric, currency text default 'SAR', price_note text default '',
  notes text default '',
  sent_at timestamptz,                                     -- أُرسل للاعتماد
  -- 2 الاعتماد
  approval text not null default 'pending',                -- pending / approved / backup / rejected
  approved_by uuid references public.members(id), approved_at timestamptz,
  -- 3 بيانات المؤثر (يعبّيها بنفسه من الرابط)
  intake_token text unique default encode(gen_random_bytes(12), 'hex'),
  rcv_name text default '', rcv_phone text default '', rcv_city text default '',
  address text default '', short_code text default '', country text default 'السعودية',
  intake_at timestamptz, no_ship boolean not null default false, no_pay boolean not null default false,
  -- 4 الشحن
  shipped_at timestamptz, delivered_at timestamptz, tracking text default '',
  -- 5 المقطع
  draft_url text default '', draft_at timestamptz, rounds int not null default 0,
  video_ok_at timestamptz, video_score int,
  post_url text default '', tt_code text default '', ig_code text default '', sn_code text default '',
  hook text default '', posted_at timestamptz,
  -- 6 الإعلان
  ad_name text default '', live_at timestamptz,
  -- الدفع والإغلاق
  paid_at timestamptz, closed_reason text default '', closed_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now()
);
create index if not exists deals_member on public.deals(member_id);
create index if not exists deals_phone on public.deals(phone);
create index if not exists deals_handle on public.deals(handle);

-- البيانات البنكية: مشفّرة في المتصفح بمفتاح المدير العام، ولا يقرأها إلا المدير
create table if not exists public.deal_bank (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  cipher jsonb not null,
  created_at timestamptz not null default now()
);

-- ============ الطلبات بين الأدوار (تصميم، شحن، إطلاق، أي شي) ============
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'design',                     -- design / ship / ad / snap / social / other
  title text not null,
  details text default '', ref_url text default '', size text default '',
  from_member uuid references public.members(id) default auth.uid(),
  to_member uuid references public.members(id),
  due date,
  status text not null default 'new',                      -- new / doing / review / done / cancelled
  result_url text default '', rounds int not null default 0,
  deal_id uuid references public.deals(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz, done_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ============ تقرير اليوم ============
create table if not exists public.daily_reports (
  member_id uuid references public.members(id) on delete cascade,
  day date not null,
  tasks jsonb not null default '{}',
  note text default '', blockers text default '',
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);

-- ============ سجل التغييرات (مين غيّر إيش ومتى) ============
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  tbl text not null, row_id text, op text not null, changes jsonb
);
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into d
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key) and n.key not in ('updated_at','updated_by');
    if tg_table_name in ('deals','requests','settings') then new.updated_at := now(); end if;
    if tg_table_name = 'deals' then new.updated_by := auth.uid(); end if;
    if d is null then return new; end if;
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(new)->>'id', ''), 'U', d);
    return new;
  elsif tg_op = 'INSERT' then
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(new)->>'id',''), 'I', null);
    return new;
  else
    insert into audit_log(tbl, row_id, op, changes) values (tg_table_name, coalesce(to_jsonb(old)->>'id',''), 'D', to_jsonb(old));
    return old;
  end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['deals','requests','members','campaigns','settings'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s before insert or update or delete on public.%1$s for each row execute function public.audit()', t);
  end loop;
end $$;

-- ============ رابط المؤثر (بدون تسجيل دخول) ============
create or replace function public.intake_get(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', d.name, 'campaign', c.name, 'done', d.intake_at is not null,
                            'no_pay', d.no_pay, 'no_ship', d.no_ship, 'bank_pub', (select value from settings where key='bank_pub'))
  from deals d left join campaigns c on c.id = d.campaign_id
  where d.intake_token = p_token and d.approval = 'approved' and d.closed_at is null
$$;
create or replace function public.intake_submit(p_token text, p jsonb, p_cipher jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from deals where intake_token = p_token and approval = 'approved' and closed_at is null;
  if v_id is null then return false; end if;
  update deals set rcv_name = left(coalesce(p->>'rcv_name',''),120), rcv_phone = left(coalesce(p->>'rcv_phone',''),30),
    rcv_city = left(coalesce(p->>'rcv_city',''),80), address = left(coalesce(p->>'address',''),400),
    short_code = left(coalesce(p->>'short_code',''),20), country = left(coalesce(p->>'country','السعودية'),60),
    intake_at = now()
  where id = v_id;
  if p_cipher is not null then
    insert into deal_bank(deal_id, cipher) values (v_id, p_cipher)
    on conflict (deal_id) do update set cipher = excluded.cipher, created_at = now();
  end if;
  return true;
end $$;
revoke all on function public.intake_get(text) from public;
revoke all on function public.intake_submit(text, jsonb, jsonb) from public;
grant execute on function public.intake_get(text) to anon, authenticated;
grant execute on function public.intake_submit(text, jsonb, jsonb) to anon, authenticated;

-- ============ الصلاحيات (RLS) ============
alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.campaigns enable row level security;
alter table public.deals enable row level security;
alter table public.deal_bank enable row level security;
alter table public.requests enable row level security;
alter table public.daily_reports enable row level security;
alter table public.audit_log enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- الأعضاء: كل عضو يشوف نفسه، والأعضاء المفعّلين يشوفون بعض، والمدير بس يعدّل
create policy m_sel on public.members for select using (id = auth.uid() or public.is_member());
create policy m_upd on public.members for update using (public.is_admin()) with check (public.is_admin());
create policy m_del on public.members for delete using (public.is_admin());

create policy s_sel on public.settings for select using (public.is_member());
create policy s_all on public.settings for all using (public.is_admin()) with check (public.is_admin());

create policy c_sel on public.campaigns for select using (public.is_member());
create policy c_all on public.campaigns for all using (public.is_admin()) with check (public.is_admin());

create policy d_sel on public.deals for select using (public.is_member());
create policy d_ins on public.deals for insert with check (public.is_member());
create policy d_upd on public.deals for update using (public.is_member()) with check (public.is_member());
create policy d_del on public.deals for delete using (public.is_admin());

create policy b_sel on public.deal_bank for select using (public.is_admin());
create policy b_ins on public.deal_bank for insert with check (public.is_member());
create policy b_upd on public.deal_bank for update using (public.is_member()) with check (public.is_member());
create policy b_del on public.deal_bank for delete using (public.is_admin());

create policy r_sel on public.requests for select using (public.is_member());
create policy r_ins on public.requests for insert with check (public.is_member());
create policy r_upd on public.requests for update using (public.is_member()) with check (public.is_member());
create policy r_del on public.requests for delete using (public.is_admin() or from_member = auth.uid());

create policy dr_sel on public.daily_reports for select using (member_id = auth.uid() or public.is_admin());
create policy dr_ins on public.daily_reports for insert with check (member_id = auth.uid() and public.is_member());
create policy dr_upd on public.daily_reports for update using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy a_sel on public.audit_log for select using (public.is_admin());
