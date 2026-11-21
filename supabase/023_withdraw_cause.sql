-- التحديث 23: سبب الانسحاب (قرار عبدالمحسن 21 نوفمبر)
-- المعتمد يحدد سبب كل انسحاب وقت اعتماده: من المؤثر / قرار الشركة / من الموظف.
-- «نسبة الانسحاب» في لوحة الأداء تحسب على الموظف سبب «المؤثر» و«الموظف» فقط، وقرار الشركة ما ينحسب عليه.
-- الحماية: صاحب الملف ما يحدد السبب ولا يغيّره؛ يحدده المعتمد (على ملفات غيره) أو عبدالمحسن، وعلى ملف انسحابه معتمد فقط.
-- يُشغَّل مرة وحدة بعد 022. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists wd_cause text;
alter table public.deals drop constraint if exists deals_wd_cause_chk;
alter table public.deals add constraint deals_wd_cause_chk check (wd_cause is null or wd_cause in ('influencer','company','employee'));

create or replace function public.guard_wd_cause() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or public.is_admin() or current_setting('app.intake', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.wd_cause is not null then raise exception 'ترشيح جديد ما يبدأ وفيه سبب انسحاب'; end if;
    return new;
  end if;
  if new.wd_cause is distinct from old.wd_cause then
    if not public.has_role('approver') or old.member_id = me then
      raise exception 'سبب الانسحاب يحدده المعتمد، وعلى ملفاتك عبدالمحسن';
    end if;
    if new.wd_ok_at is null then raise exception 'سبب الانسحاب لملف انسحابه معتمد فقط'; end if;
  end if;
  return new;
end $$;
drop trigger if exists a3_guard_wd_cause on public.deals;
create trigger a3_guard_wd_cause before insert or update on public.deals for each row execute function public.guard_wd_cause();
