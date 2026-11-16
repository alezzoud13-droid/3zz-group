-- التحديث 15: قرارات 16 نوفمبر مساءً (مراجعة عبدالمحسن الشاملة)
-- 1) تسجيل زياد لكل منصة على حدة (اللي جاهز يشتغل مباشرة): أعمدة tt/sn/ig_ops_at.
-- 2) إلزامية الشحن: «انشحن» تحتاج شركة الشحن، و«وصلت» تحتاج «انشحن» قبلها + رقم البوليصة (إلا لو مندوب).
-- يُشغَّل مرة وحدة بعد 014. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists tt_ops_at timestamptz;
alter table public.deals add column if not exists sn_ops_at timestamptz;
alter table public.deals add column if not exists ig_ops_at timestamptz;

-- تسجيل ملف العمليات: لزياد (منسق المحتوى) أو عبدالمحسن، والتاريخ يُختم بوقت الحفظ
create or replace function public.guard_ops() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text; o jsonb; n jsonb;
begin
  if public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    -- ترشيح جديد ما يبدأ وهو «مسجّل عند زياد»
    new.tt_ops_at := null; new.sn_ops_at := null; new.ig_ops_at := null; new.ops_logged_at := null; new.ops_logged_by := null;
    return new;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  foreach c in array array['tt_ops_at', 'sn_ops_at', 'ig_ops_at', 'ops_logged_at', 'ops_logged_by'] loop
    if (o -> c) is distinct from (n -> c) then
      if not public.has_role('snap') then raise exception 'تسجيل ملف العمليات لمنسق المحتوى (زياد) أو عبدالمحسن فقط'; end if;
      if (o ->> c) is not null and (n ->> c) is null then raise exception 'التراجع عن تسجيل ملف العمليات لعبدالمحسن فقط'; end if;
    end if;
  end loop;
  if new.tt_ops_at is distinct from old.tt_ops_at and new.tt_ops_at is not null then new.tt_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.sn_ops_at is distinct from old.sn_ops_at and new.sn_ops_at is not null then new.sn_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.ig_ops_at is distinct from old.ig_ops_at and new.ig_ops_at is not null then new.ig_ops_at := now(); new.ops_logged_by := auth.uid(); end if;
  if new.ops_logged_at is distinct from old.ops_logged_at and new.ops_logged_at is not null then new.ops_logged_at := now(); new.ops_logged_by := auth.uid(); end if;
  return new;
end $$;

-- إلزامية بيانات الشحن (عبدالمحسن مستثنى للطوارئ)
create or replace function public.guard_ship_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.shipped_at is not null and old.shipped_at is null and coalesce(new.ship_company, '') = '' then
    raise exception 'اكتب شركة الشحن قبل «انشحن»';
  end if;
  if new.delivered_at is not null and old.delivered_at is null then
    if old.shipped_at is null then raise exception 'سجّل «انشحن» قبل «وصلت»'; end if;
    if coalesce(new.tracking, '') = '' and coalesce(new.ship_company, '') <> 'مندوب' then
      raise exception 'اكتب رقم البوليصة قبل «وصلت» (إلا لو التوصيل بمندوب)';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_ship_fields on public.deals;
create trigger guard_ship_fields before update on public.deals for each row execute function public.guard_ship_fields();

-- ترقية ترقر التسجيل ليشمل الإنشاء (ترشيح جديد ما يبدأ مسجّلاً)
drop trigger if exists guard_ops on public.deals;
create trigger guard_ops before insert or update on public.deals for each row execute function public.guard_ops();
