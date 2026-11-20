-- التحديث 21: الانسحاب من الحملة بطلب واعتماد + خيار «مدفوع سابقاً / بعقد» (قرار عبدالمحسن 20 نوفمبر — قرار 38)
-- (أ) الانسحاب: بعد اعتماد الاتفاق ما أحد يقفل الملف بنفسه. صاحب الملف يطلب الانسحاب بسبب (ووش صار في المنتج لو انشحن)،
--     ومتعب يعتمد أو يرفض (ملفات متعب يعتمدها عبدالمحسن). بعد «تم الدفع»: الاعتماد لعبدالمحسن فقط.
--     الملف المسحوب ينقفل، ومكانه يرجع لحصة الموظف، ويطلع من قوائم الدفع. البديل ينربط بالمسحوب (replaces_id).
-- (ب) طريقة دفع جديدة prepaid = «مدفوع سابقاً / بعقد» (مثل عقد 3 إعلانات بدفعة وحدة): ما يستحق عليه دفع ولا يقفل شي،
--     ولازم ملاحظة توضح العقد (pay_note).
-- عبدالمحسن (الأدمن) مستثنى للطوارئ. يُشغَّل مرة وحدة بعد 020. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists wd_req_at timestamptz;
alter table public.deals add column if not exists wd_req_by uuid references public.members(id);
alter table public.deals add column if not exists wd_reason text not null default '';
alter table public.deals add column if not exists wd_product text not null default '';
alter table public.deals add column if not exists wd_ok_at timestamptz;
alter table public.deals add column if not exists wd_ok_by uuid references public.members(id);
alter table public.deals add column if not exists wd_reject text not null default '';
alter table public.deals add column if not exists replaces_id uuid references public.deals(id);
alter table public.deals add column if not exists pay_note text not null default '';

alter table public.deals drop constraint if exists deals_pay_terms_chk;
alter table public.deals add constraint deals_pay_terms_chk check (pay_terms is null or pay_terms in ('advance','before_post','after_post','prepaid'));

create or replace function public.guard_withdraw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  appr_on boolean;
  r record;
begin
  if me is null or public.is_admin() or current_setting('app.intake', true) = 'on' then return new; end if;

  if tg_op = 'INSERT' then
    if new.wd_req_at is not null or new.wd_ok_at is not null or coalesce(new.wd_reason,'') <> '' or coalesce(new.wd_reject,'') <> '' then
      raise exception 'ترشيح جديد ما يبدأ وفيه انسحاب';
    end if;
    if new.pay_terms = 'prepaid' and coalesce(new.pay_note,'') = '' then raise exception 'اكتب ملاحظة العقد أو الدفع السابق'; end if;
    if new.replaces_id is not null then
      select * into r from deals where id = new.replaces_id;
      if r.id is null or r.wd_ok_at is null or r.campaign_id is distinct from new.campaign_id or r.member_id is distinct from new.member_id then
        raise exception 'البديل لازم يكون في نفس الحملة ولنفس الموظف، وعن ملف انسحابه معتمد';
      end if;
    end if;
    return new;
  end if;

  appr_on := public.has_role('approver') and old.member_id is distinct from me;

  if new.replaces_id is distinct from old.replaces_id then raise exception 'ربط البديل يصير عند إنشاء الترشيح فقط'; end if;

  -- طلب الانسحاب: صاحب الملف فقط، على ملف معتمد مفتوح
  if new.wd_req_at is distinct from old.wd_req_at and new.wd_req_at is not null then
    if old.member_id is distinct from me then raise exception 'طلب الانسحاب لصاحب الملف'; end if;
    if old.approval <> 'approved' or old.closed_at is not null then raise exception 'الانسحاب للملفات المعتمدة المفتوحة. قبل الاعتماد تقدر تقفل الملف بنفسك'; end if;
    if coalesce(new.wd_reason,'') = '' then raise exception 'اكتب سبب الانسحاب'; end if;
    new.wd_req_at := now(); new.wd_req_by := me;
  elsif (new.wd_reason is distinct from old.wd_reason or new.wd_product is distinct from old.wd_product)
        and not (old.member_id = me and new.wd_req_at is not null and old.wd_ok_at is null) and not appr_on then
    raise exception 'بيانات الانسحاب لصاحب الملف وقت الطلب';
  end if;

  -- إلغاء الطلب (صاحبه) أو رفضه (المعتمد)
  if old.wd_req_at is not null and new.wd_req_at is null and old.wd_ok_at is null then
    if not (old.member_id = me or appr_on) then raise exception 'إلغاء طلب الانسحاب لصاحبه، ورفضه للمعتمد'; end if;
  end if;
  if new.wd_reject is distinct from old.wd_reject and not appr_on then raise exception 'رفض الانسحاب للمعتمد'; end if;

  -- اعتماد الانسحاب
  if new.wd_ok_at is distinct from old.wd_ok_at or new.wd_ok_by is distinct from old.wd_ok_by then
    if not appr_on then raise exception 'اعتماد الانسحاب للمعتمد، وعلى ملفاتك لعبدالمحسن'; end if;
    if old.wd_req_at is null then raise exception 'ما فيه طلب انسحاب من صاحب الملف'; end if;
    if old.paid_at is not null then raise exception 'الملف اندفع — الانسحاب بعد الدفع يعتمده عبدالمحسن فقط'; end if;
    if new.wd_ok_at is null then raise exception 'التراجع عن الانسحاب لعبدالمحسن (إعادة فتح)'; end if;
    new.wd_ok_at := now(); new.wd_ok_by := me;
  end if;

  -- قفل الملف المعتمد: بانسحاب معتمد فقط، وبعد الدفع لعبدالمحسن فقط
  if old.closed_at is null and new.closed_at is not null and old.approval = 'approved' then
    if old.paid_at is not null then raise exception 'الملف اندفع — إنهاؤه أو سحبه بموافقة عبدالمحسن فقط'; end if;
    if new.wd_ok_at is null then raise exception 'الملف معتمد: اطلب انسحاب ويعتمده المعتمد'; end if;
  end if;
  -- ملف منسحب ما يرجع يتفتح إلا من عبدالمحسن (عشان البديل والحصة)
  if old.closed_at is not null and new.closed_at is null and old.wd_ok_at is not null then
    raise exception 'إعادة فتح ملف منسحب لعبدالمحسن فقط';
  end if;

  -- مدفوع سابقاً / بعقد: لازم ملاحظة
  if new.pay_terms = 'prepaid' and coalesce(new.pay_note,'') = '' then raise exception 'اكتب ملاحظة العقد أو الدفع السابق (مثلاً: عقد 3 إعلانات دُفع 1 نوفمبر)'; end if;
  if new.pay_note is distinct from old.pay_note and not public.has_role('approver') then raise exception 'ملاحظة الدفع للمعتمد أو عبدالمحسن'; end if;
  return new;
end $$;
drop trigger if exists a2_guard_withdraw on public.deals;
create trigger a2_guard_withdraw before insert or update on public.deals for each row execute function public.guard_withdraw();
