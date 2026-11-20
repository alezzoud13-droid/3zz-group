-- التحديث 20: طريقة الدفع لكل اتفاق + مسار الدفع الموازي (قرار عبدالمحسن 20 نوفمبر — حكم Roast Room 🟡)
-- كل ملف له طريقة دفع تنحدد مع الاتفاق:
--   advance     = مقدم: يستحق الدفع فور اعتماد الاتفاق، والمقطع الخام يتقفل لين يندفع.
--   before_post = قبل النشر: يستحق الدفع فور اعتماد المقطع، والنشر يتقفل لين يندفع.
--   after_post  = بعد النشر: يستحق الدفع بعد ما ينزل على كل المنصات، وما يقفل شي (هذا الافتراضي لو الخانة فاضية).
-- مين يحددها: المعتمد (متعب) على ملفات غيره، وعبدالمحسن على الكل. صانع المحتوى يشوفها بس.
-- بعد «تم الدفع» ما تتغير. و«ما يحتاج دفع» ما ينفع يستخدمه صانع المحتوى عشان يتخطى البوابة.
-- عبدالمحسن (الأدمن) مستثنى للطوارئ. يُشغَّل مرة وحدة بعد 019. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists pay_terms text;
alter table public.deals drop constraint if exists deals_pay_terms_chk;
alter table public.deals add constraint deals_pay_terms_chk check (pay_terms is null or pay_terms in ('advance','before_post','after_post'));

create or replace function public.guard_pay_terms() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  term text;
  gated boolean;
begin
  if me is null or public.is_admin() or current_setting('app.intake', true) = 'on' then return new; end if;

  if tg_op = 'INSERT' then
    if new.pay_terms is not null and not public.has_role('approver') then
      raise exception 'طريقة الدفع يحددها المعتمد أو عبدالمحسن';
    end if;
    return new;
  end if;

  if new.pay_terms is distinct from old.pay_terms then
    if not public.has_role('approver') then raise exception 'طريقة الدفع يحددها المعتمد أو عبدالمحسن'; end if;
    if old.member_id = me or new.member_id = me then raise exception 'طريقة الدفع على ملفاتك يحددها عبدالمحسن'; end if;
    if old.paid_at is not null then raise exception 'الملف اندفع — طريقة الدفع ما تتغير'; end if;
  end if;

  term := coalesce(new.pay_terms, 'after_post');
  -- «ما يحتاج دفع» على ملف دفعه مقدم أو قبل النشر: للمعتمد بس (عشان ما تنفتح البوابة من طرف صانع المحتوى)
  if new.no_pay is distinct from old.no_pay and term <> 'after_post' and not public.has_role('approver') then
    raise exception 'هذا الملف دفعه «%» — تغيير «ما يحتاج دفع» للمعتمد أو عبدالمحسن', case term when 'advance' then 'مقدم' else 'قبل النشر' end;
  end if;

  -- البوابة: الخطوة المقفولة ما تنسجّل قبل «تم الدفع»
  gated := not coalesce(new.no_pay, false) and new.paid_at is null;
  if gated and term = 'advance' and new.draft_at is not null and old.draft_at is null then
    raise exception 'الاتفاق «مقدم»: المقطع الخام يتقفل لين يندفع المبلغ. تابع الدفع مع عبدالمحسن ومتعب';
  end if;
  if gated and term in ('advance','before_post') and (
       (new.tt_at is not null and old.tt_at is null) or (new.ig_at is not null and old.ig_at is null)
    or (new.sn_at is not null and old.sn_at is null) or (new.posted_at is not null and old.posted_at is null)) then
    raise exception 'الاتفاق «%»: النشر يتقفل لين يندفع المبلغ. خل المؤثر ينتظر لين يتسجل «تم الدفع»', case term when 'advance' then 'مقدم' else 'قبل النشر' end;
  end if;
  return new;
end $$;
drop trigger if exists a1_guard_pay_terms on public.deals;
create trigger a1_guard_pay_terms before insert or update on public.deals for each row execute function public.guard_pay_terms();
