-- التحديث 17: تقييم المقطع عند اعتماده + بيانات التعامل في كشف الدفع
-- يستخدم خانة video_score الموجودة (مقفولة أصلاً على المعتمد في 011)، ويضيف ملاحظة التقييم.
-- القاعدة ترفض: اعتماد مقطع بدون تقييم 1–5، وتعديل ملاحظة التقييم من غير المعتمد. الأدمن مستثنى.
-- كشف الدفع يقرأ التقييم من المقطع السابق لنفس المؤثر. يُشغَّل مرة وحدة بعد 016. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists video_score_note text default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'deals_video_score_range') then
    alter table public.deals add constraint deals_video_score_range check (video_score is null or video_score between 1 and 5);
  end if;
end $$;

create or replace function public.guard_video_score() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.video_score_note := ''; return new; end if;
  if new.video_score_note is distinct from old.video_score_note
     and not (public.has_role('approver') and old.member_id is distinct from auth.uid()) then
    raise exception 'ملاحظة تقييم المقطع للمعتمد (متعب) فقط';
  end if;
  -- اعتماد المقطع يتطلب تقييم (النزول المباشر بدون مراجعة مستثنى)
  if new.video_ok_at is not null and old.video_ok_at is null and new.video_score is null and new.posted_at is null then
    raise exception 'اختر تقييم المقطع (1–5) قبل الاعتماد';
  end if;
  return new;
end $$;

drop trigger if exists a1_guard_video_score on public.deals;
create trigger a1_guard_video_score before insert or update on public.deals
  for each row execute function public.guard_video_score();
