-- التحديث 6: مراجعة المقطع الخام إلزامية قبل تسجيل النشر
-- صانع المحتوى يرسل رابط المقطع الخام مع ملاحظاته، ومتعب يعتمد أو يرجّعه مع السبب.
-- ما ينسجّل «نزل» على أي منصة إلا بعد اعتماد المقطع (الأدمن مستثنى للحالات الخاصة).
-- يُشغَّل مرة وحدة بعد 005، وقبل نشر تحديث الواجهة. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists draft_note text default '';       -- ملاحظات صانع المحتوى على المقطع الخام
alter table public.deals add column if not exists draft_feedback text default '';   -- سبب إرجاع المقطع للتعديل (من المعتمد)

create or replace function public.guard_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'deals' then
    if (tg_op = 'INSERT' and new.approval <> 'pending') or (tg_op = 'UPDATE' and new.approval is distinct from old.approval and new.approval <> 'pending') then
      if not public.has_role('approver') then raise exception 'اعتماد ترشيحات الحملات لمتعب فقط'; end if;
      if new.member_id = auth.uid() and not public.is_admin() then raise exception 'ترشيحاتك يعتمدها عبدالمحسن، مو أنت'; end if;
    end if;
    if tg_op = 'UPDATE' then
      -- اعتماد المقطع: للمعتمد فقط، وما يعتمد مقطع من ترشيحاته
      if new.video_ok_at is not null and old.video_ok_at is null then
        if not public.has_role('approver') then raise exception 'اعتماد المقطع لمتعب فقط'; end if;
        if new.member_id = auth.uid() and not public.is_admin() then raise exception 'مقاطعك يعتمدها عبدالمحسن، مو أنت'; end if;
      end if;
      -- تسجيل النزول على أي منصة: بعد اعتماد المقطع الخام
      if ((new.tt_at is not null and old.tt_at is null) or (new.ig_at is not null and old.ig_at is null) or (new.sn_at is not null and old.sn_at is null))
         and new.video_ok_at is null and not public.is_admin() then
        raise exception 'لازم متعب يعتمد المقطع الخام قبل تسجيل النزول';
      end if;
    end if;
  elsif tg_table_name = 'influencers' then
    if (tg_op = 'INSERT' and new.acq_status in ('approved','rejected','needs_edit')) or (tg_op = 'UPDATE' and new.acq_status is distinct from old.acq_status and new.acq_status in ('approved','rejected','needs_edit')) then
      if not public.has_role('approver') then raise exception 'اعتماد الاستقطاب لمتعب فقط'; end if;
      if new.nominated_by = auth.uid() and not public.is_admin() then raise exception 'استقطابك يعتمده عبدالمحسن، مو أنت'; end if;
    end if;
  elsif tg_table_name = 'quotas' then
    if new.member_id = auth.uid() and not public.is_admin() and (tg_op = 'INSERT' or new.quota is distinct from old.quota) then
      raise exception 'حصتك يحددها عبدالمحسن، مو أنت';
    end if;
  end if;
  return new;
end $$;
