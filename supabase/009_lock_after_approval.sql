-- التحديث 9: قفل البيانات الأساسية بعد الاعتماد + توحيد نوع الإعلان
-- بعد اعتماد الترشيح: الاسم واليوزر والأسعار والمنصات والنوع والحملة ما تتعدل إلا من المعتمد (متعب) أو عبدالمحسن.
-- ترشيحات المعتمد نفسه بعد الاعتماد يعدّلها عبدالمحسن فقط (فصل المهام).
-- ملف المؤثر: الاسم واليوزر والرابط تنقفل بعد اعتماد الاستقطاب، والأسعار تنقفل بعد «تم الاتفاق».
-- دالة مستقلة (ما تلمس guard_approvals). آمن لإعادة التشغيل، ولا يحذف أي بيانات.

create or replace function public.guard_locked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- صيانة من محرر SQL أو دوال النظام (بدون مستخدم): ما ينطبق القفل
  if tg_op <> 'UPDATE' or auth.uid() is null then return new; end if;
  if tg_table_name = 'deals' then
    if old.approval = 'approved' and new.approval = 'approved' and (
         new.name is distinct from old.name or new.handle is distinct from old.handle
      or new.price is distinct from old.price or new.price_before is distinct from old.price_before or new.currency is distinct from old.currency
      or new.platform is distinct from old.platform or new.acc_type is distinct from old.acc_type or new.ad_type is distinct from old.ad_type
      or new.campaign_id is distinct from old.campaign_id or new.influencer_id is distinct from old.influencer_id or new.member_id is distinct from old.member_id) then
      if not public.has_role('approver') then raise exception 'بيانات الترشيح مقفولة بعد الاعتماد. اطلب تعديل من متعب أو عبدالمحسن'; end if;
      if old.member_id = auth.uid() and not public.is_admin() then raise exception 'ترشيحك بعد الاعتماد يعدّله عبدالمحسن، مو أنت'; end if;
    end if;
  elsif tg_table_name = 'influencers' then
    if (old.acq_status = 'approved' and new.acq_status = 'approved' and (
          new.name is distinct from old.name or new.handle is distinct from old.handle or new.tiktok_url is distinct from old.tiktok_url
       or new.nominated_by is distinct from old.nominated_by))
       or (old.agreed_at is not null and (
          new.price_before is distinct from old.price_before or new.price_after is distinct from old.price_after or new.currency is distinct from old.currency)) then
      if not public.has_role('approver') then raise exception 'بيانات المؤثر مقفولة بعد الاعتماد. اطلب تعديل من متعب أو عبدالمحسن'; end if;
      if old.nominated_by = auth.uid() and not public.is_admin() then raise exception 'ملفك بعد الاعتماد يعدّله عبدالمحسن، مو أنت'; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_locked_deals on public.deals;
create trigger guard_locked_deals before update on public.deals for each row execute function public.guard_locked();
drop trigger if exists guard_locked_influencers on public.influencers;
create trigger guard_locked_influencers before update on public.influencers for each row execute function public.guard_locked();

-- توحيد نوع الإعلان: «خارجي» و«حضوري» نفس المعنى
update public.deals set ad_type = 'حضوري' where ad_type = 'خارجي';
