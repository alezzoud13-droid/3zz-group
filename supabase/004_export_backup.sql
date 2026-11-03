-- التحديث 4: تصدير يومي للنسخة الاحتياطية على جهاز عبدالمحسن
-- دالة export_all تقرأ كل بيانات النظام (ما عدا البيانات البنكية والمفتاح العام) وما تشتغل إلا برمز سري.
-- الرمز نفسه ما ينحفظ هنا ولا في قاعدة البيانات: ينحفظ «بصمته» (SHA-256) بس، والرمز عند عبدالمحسن.
-- قراءة فقط: الدالة ما تعدّل ولا تحذف شي.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.export_keys (
  hash text primary key,
  label text default '',
  created_at timestamptz not null default now()
);
alter table public.export_keys enable row level security;
revoke all on public.export_keys from anon, authenticated;

create or replace function public.export_all(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_token is null or length(p_token) < 32
     or not exists (select 1 from export_keys where hash = encode(digest(p_token, 'sha256'), 'hex')) then
    raise exception 'رمز النسخ غير صحيح';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'members',        (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]') from members t),
    'campaigns',      (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from campaigns t),
    'quotas',         (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from quotas t),
    'influencers',    (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from influencers t),
    'deals',          (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from deals t),
    'requests',       (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from requests t),
    'request_events', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from request_events t),
    'daily_reports',  (select coalesce(jsonb_agg(to_jsonb(t) order by t.day), '[]') from daily_reports t),
    'settings',       (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from settings t where t.key <> 'bank_pub')
  );
end $$;
revoke all on function public.export_all(text) from public;
grant execute on function public.export_all(text) to anon, authenticated;

-- بعد تشغيل هذا الملف: يُضاف سطر واحد في export_keys ببصمة الرمز (من محرر SQL، مو من هنا).
