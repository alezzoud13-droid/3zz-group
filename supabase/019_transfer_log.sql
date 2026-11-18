-- التحديث 19: سجل نقل الملفات (قرار عبدالمحسن 18 نوفمبر — عدالة النسب)
-- عند نقل ملف مؤثر لموظف آخر، يتسجل النقل بتاريخه على الملف وعلى كل ترشيحاته:
-- اللي صار قبل تاريخ النقل يُنسب للمسؤول السابق، واللي بعده للمسؤول الجديد —
-- «حرام ننسب له الشغل هذا» إذا كان التقصير أو الإنجاز قبل استلامه.
-- سجل النقل يكتبه عبدالمحسن فقط (هو الوحيد اللي ينقل أصلاً).
-- يُشغَّل مرة وحدة بعد 018. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.influencers add column if not exists transfers jsonb not null default '[]'::jsonb;
alter table public.deals add column if not exists transfers jsonb not null default '[]'::jsonb;

create or replace function public.guard_transfers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.transfers := '[]'::jsonb; return new; end if;
  if new.transfers is distinct from old.transfers then
    raise exception 'سجل نقل الملفات يكتبه عبدالمحسن فقط';
  end if;
  return new;
end $$;
drop trigger if exists guard_transfers_i on public.influencers;
create trigger guard_transfers_i before insert or update on public.influencers for each row execute function public.guard_transfers();
drop trigger if exists guard_transfers_d on public.deals;
create trigger guard_transfers_d before insert or update on public.deals for each row execute function public.guard_transfers();
