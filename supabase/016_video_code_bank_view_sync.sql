-- التحديث 16: قرارات 16 نوفمبر (التطبيق النهائي)
-- 1) عمود «كود الفيديو» S02 في النظام — يكتبه زياد أو عبدالمحسن أو المزامنة فقط.
-- 2) صلاحية «عرض البيانات البنكية» (bank_view) لمتعب: يقرأ المشفّر ويفكّه بمفتاحه في متصفحه وقت تصدير كشف الدفع.
-- 3) قناة قراءة للموظف الآلي (المزامنة اليومية): دالة sync_report برمز سري — قراءة فقط، ولا تكتب شيء.
-- يُشغَّل مرة وحدة بعد 015. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists video_code text;

-- ترقية حارس التسجيل: كود الفيديو ضمن خانات زياد، وترشيح جديد ما يبدأ وهو مسجّل
create or replace function public.guard_ops() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text; o jsonb; n jsonb;
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.tt_ops_at := null; new.sn_ops_at := null; new.ig_ops_at := null;
    new.ops_logged_at := null; new.ops_logged_by := null; new.video_code := null;
    return new;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  foreach c in array array['tt_ops_at', 'sn_ops_at', 'ig_ops_at', 'ops_logged_at', 'ops_logged_by', 'video_code'] loop
    if (o -> c) is distinct from (n -> c) then
      if not public.has_role('snap') then raise exception 'تسجيل ملف العمليات وكود الفيديو لمنسق المحتوى (زياد) أو عبدالمحسن فقط'; end if;
      if (o ->> c) is not null and (n ->> c) is null then raise exception 'التراجع عن تسجيل ملف العمليات لعبدالمحسن فقط'; end if;
    end if;
  end loop;
  if new.tt_ops_at is distinct from old.tt_ops_at and new.tt_ops_at is not null then new.tt_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.sn_ops_at is distinct from old.sn_ops_at and new.sn_ops_at is not null then new.sn_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.ig_ops_at is distinct from old.ig_ops_at and new.ig_ops_at is not null then new.ig_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.ops_logged_at is distinct from old.ops_logged_at and new.ops_logged_at is not null then new.ops_logged_at := now(); new.ops_logged_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists guard_ops on public.deals;
create trigger guard_ops before insert or update on public.deals for each row execute function public.guard_ops();

-- صلاحية عرض البيانات البنكية: عبدالمحسن أو من له دور bank_view (متعب)
-- (فك التشفير يصير في متصفح صاحب المفتاح وقت التصدير — القاعدة ما تشوف الآيبان أبداً)
drop policy if exists b_sel on public.deal_bank;
create policy b_sel on public.deal_bank for select using (public.is_admin() or public.has_role('bank_view'));

-- رمز الموظف الآلي: جدول سري ما يوصله أي مستخدم، بس دوال النظام
create table if not exists public.sync_secret (key text primary key, value text not null, created_at timestamptz not null default now());
alter table public.sync_secret enable row level security;
revoke all on public.sync_secret from public, anon, authenticated;
insert into public.sync_secret(key, value) values ('sync_token', encode(gen_random_bytes(16), 'hex')) on conflict (key) do nothing;

-- قراءة فقط: الملفات المعتمدة اللي نزلت منصة منها على الأقل، بالأكواد ويوزر سناب وكود الفيديو
create or replace function public.sync_report(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  select value into t from sync_secret where key = 'sync_token';
  if t is null or p_token is distinct from t then raise exception 'رمز المزامنة غير صحيح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'name_en', i.name_en, 'campaign', c.name,
      'tt_code', d.tt_code, 'ig_code', d.ig_code, 'sn_user', d.sn_user, 'sn_code', d.sn_code,
      'video_code', d.video_code, 'platform', d.platform,
      'tt_at', d.tt_at, 'sn_at', d.sn_at, 'ig_at', d.ig_at))
    from deals d
    left join campaigns c on c.id = d.campaign_id
    left join influencers i on i.id = d.influencer_id
    where d.approval = 'approved' and d.closed_at is null
      and (d.tt_at is not null or d.sn_at is not null or d.ig_at is not null)), '[]'::jsonb);
end $$;
revoke all on function public.sync_report(text) from public;
grant execute on function public.sync_report(text) to anon, authenticated;
