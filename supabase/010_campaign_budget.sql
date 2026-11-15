-- التحديث 10: سقف صرف (ميزانية) لكل حملة بجانب العدد المطلوب (قرار عبدالمحسن 15 نوفمبر)
-- عبدالمحسن يحدد الميزانية. اعتماد ترشيح يرفع مجموع المعتمدين فوق السقف مرفوض (إلا من عبدالمحسن نفسه).
-- التنبيه عند الاقتراب (80%) في الواجهة ومهام عبدالمحسن ومتعب.
-- يُشغَّل مرة وحدة بعد 009. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.campaigns add column if not exists budget numeric;

create or replace function public.guard_budget() returns trigger
language plpgsql security definer set search_path = public as $$
declare b numeric; tot numeric;
begin
  if tg_op = 'UPDATE' and new.approval = 'approved' and old.approval is distinct from new.approval then
    select budget into b from campaigns where id = new.campaign_id;
    if b is null or b <= 0 then return new; end if;
    select coalesce(sum(price), 0) into tot from deals
      where campaign_id = new.campaign_id and approval = 'approved' and closed_at is null and id <> new.id;
    if tot + coalesce(new.price, 0) > b and not public.is_admin() then
      raise exception 'اعتماد هذا المبلغ يرفع صرف الحملة إلى % وسقفها %. كلم عبدالمحسن: يرفع السقف من إعدادات الحملة أو يعتمدها بنفسه.', tot + coalesce(new.price, 0), b;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_budget on public.deals;
create trigger guard_budget before update on public.deals for each row execute function public.guard_budget();
