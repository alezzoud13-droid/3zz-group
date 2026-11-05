-- التحديث 5: فصل المهام — ما أحد يعتمد شغله بنفسه
-- المعتمد (متعب) ما يقدر يعتمد استقطاب سجّله هو، ولا ترشيح حملة رشّحه هو، ولا يغيّر حصته بنفسه.
-- هذي الحالات يعتمدها عبدالمحسن (الأدمن). آمن لإعادة التشغيل، ولا يحذف أي بيانات.

create or replace function public.guard_approvals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'deals' then
    if (tg_op = 'INSERT' and new.approval <> 'pending') or (tg_op = 'UPDATE' and new.approval is distinct from old.approval and new.approval <> 'pending') then
      if not public.has_role('approver') then raise exception 'اعتماد ترشيحات الحملات لمتعب فقط'; end if;
      if new.member_id = auth.uid() and not public.is_admin() then raise exception 'ترشيحاتك يعتمدها عبدالمحسن، مو أنت'; end if;
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

drop trigger if exists guard_quotas on public.quotas;
create trigger guard_quotas before insert or update on public.quotas for each row execute function public.guard_approvals();
