-- التحديث 12: إرجاع دورة المؤثر لتسع مراحل (قرار عبدالمحسن 16 نوفمبر — الأصل في pipeline.md)
-- الجديد في القاعدة: مرحلة «تسجيل زياد في ملف العمليات» قبل التشغيل.
-- عمودان ops_logged_at/by، والتسجيل لمنسق المحتوى (زياد) أو عبدالمحسن فقط، والتاريخ يُختم بوقت الحفظ الفعلي.
-- يُشغَّل مرة وحدة بعد 011. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists ops_logged_at timestamptz;
alter table public.deals add column if not exists ops_logged_by uuid references public.members(id);

create or replace function public.guard_ops() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.ops_logged_at is distinct from old.ops_logged_at or new.ops_logged_by is distinct from old.ops_logged_by then
    if not public.has_role('snap') then raise exception 'تسجيل ملف العمليات لمنسق المحتوى (زياد) أو عبدالمحسن فقط'; end if;
    if old.ops_logged_at is not null and new.ops_logged_at is null then raise exception 'التراجع عن تسجيل ملف العمليات لعبدالمحسن فقط'; end if;
    if new.ops_logged_at is not null then new.ops_logged_at := now(); new.ops_logged_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_ops on public.deals;
create trigger guard_ops before update on public.deals for each row execute function public.guard_ops();
