-- التحديث 25: البيانات التعريفية إلزامية في كل مرحلة (قرار عبدالمحسن 21 نوفمبر)
-- البيانات التعريفية = الاسم عربي، الاسم بالإنجليزي، الجوال، ويوزر كل منصة ينزل عليها الترشيح (تيك توك / سناب / انستقرام).
-- 1) ملف مؤثر جديد ما ينحفظ بدون اسم وجوال صحيح (حتى لو مسودة)، والبيانات التعريفية ما تنمسح من ملف بعد ما تنكتب.
-- 2) أي ترشيح ما يتقدّم مرحلة (إرسال للاعتماد، اعتماد، شحن، وصول، مقطع خام، اعتماد المقطع، نشر، تسجيل زياد، تشغيل، اعتماد الدفع، الدفع)
--    وملف مؤثره ناقص. الرسالة تقول وش الناقص ومين يكمّله.
-- ما يلمس: الانسحاب والإغلاق، وتعبئة المؤثر لعنوانه من الرابط، وأي تعديل ما يقدّم مرحلة.
-- يُشغَّل مرة وحدة بعد 024. آمن لإعادة التشغيل، ولا يحذف أي بيانات.
-- صيانة استثنائية من محرر SQL فقط:  set local app.allow_incomplete = 'on';

-- وش الناقص في ملف مؤثر الترشيح؟ (نص فاضي = مكتمل)
create or replace function public.deal_id_missing(p_deal uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare d record; i record; p text; m text[] := '{}';
begin
  select * into d from deals where id = p_deal; if d.id is null then return ''; end if;
  select * into i from influencers where id = d.influencer_id;
  if i.id is null then return 'ملف المؤثر'; end if;
  p := coalesce(d.platform, '');
  if coalesce(trim(i.name), '') = '' then m := array_append(m, 'الاسم'::text); end if;
  if coalesce(trim(i.name_en), '') = '' then m := array_append(m, 'الاسم بالإنجليزي'::text); end if;
  if public._ph9(i.phone) is null then m := array_append(m, 'الجوال'::text); end if;
  if (p ~ 'تيك|جميع') and public._uname(coalesce(nullif(i.handle, ''), d.handle)) is null then m := array_append(m, 'يوزر تيك توك'::text); end if;
  if (p ~ 'سناب|جميع') and public._uname(coalesce(nullif(i.snap_user, ''), d.sn_user)) is null then m := array_append(m, 'يوزر سناب'::text); end if;
  if (p ~ 'انستقرام|انستغرام|جميع') and public._uname(i.ig_user) is null then m := array_append(m, 'يوزر انستقرام'::text); end if;
  return array_to_string(m, '، ');
end $$;
grant execute on function public.deal_id_missing(uuid) to authenticated;

-- ============ الترشيح: ما يتقدّم مرحلة وملف المؤثر ناقص ============
create or replace function public.guard_deal_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare adv boolean := false; c text; m text; own text; nm text;
begin
  if current_setting('app.allow_incomplete', true) = 'on' then return new; end if;
  if new.closed_at is not null or new.approval = 'rejected' then return new; end if;
  if tg_op = 'INSERT' then
    adv := new.sent_at is not null;
  else
    adv := (new.approval = 'approved' and old.approval is distinct from 'approved');
    foreach c in array array['sent_at','shipped_at','delivered_at','draft_at','video_ok_at','tt_at','sn_at','ig_at','posted_at',
                             'tt_ops_at','sn_ops_at','ig_ops_at','ops_logged_at','live_at','tt_live_at','sn_live_at','ig_live_at','pay_ok_at','paid_at'] loop
      exit when adv;
      if (to_jsonb(old) ->> c) is null and (to_jsonb(new) ->> c) is not null then adv := true; end if;
    end loop;
  end if;
  if not adv then return new; end if;
  -- نفحص الملف بالقيم الجديدة للترشيح (المنصات واليوزر) قبل الحفظ
  select string_agg(x, '، ') into m from (
    select 'الاسم' x from influencers i where i.id = new.influencer_id and coalesce(trim(i.name), '') = ''
    union all select 'الاسم بالإنجليزي' from influencers i where i.id = new.influencer_id and coalesce(trim(i.name_en), '') = ''
    union all select 'الجوال' from influencers i where i.id = new.influencer_id and public._ph9(i.phone) is null
    union all select 'يوزر تيك توك' from influencers i where i.id = new.influencer_id and coalesce(new.platform, '') ~ 'تيك|جميع' and public._uname(coalesce(nullif(i.handle, ''), new.handle)) is null
    union all select 'يوزر سناب' from influencers i where i.id = new.influencer_id and coalesce(new.platform, '') ~ 'سناب|جميع' and public._uname(coalesce(nullif(i.snap_user, ''), new.sn_user)) is null
    union all select 'يوزر انستقرام' from influencers i where i.id = new.influencer_id and coalesce(new.platform, '') ~ 'انستقرام|انستغرام|جميع' and public._uname(i.ig_user) is null
    union all select 'ملف المؤثر' where new.influencer_id is null or not exists (select 1 from influencers i where i.id = new.influencer_id)
  ) z;
  if coalesce(m, '') <> '' then
    select i.name, coalesce(mb.name, '') into nm, own from influencers i left join members mb on mb.id = i.nominated_by where i.id = new.influencer_id;
    raise exception 'ما تمشي المرحلة: ملف المؤثر «%» ناقص: % — يكمّله %من «مهامي ← كمّل البيانات التعريفية»',
      coalesce(nm, new.name), m, case when own <> '' then own || ' ' else 'صاحب الملف ' end;
  end if;
  return new;
end $$;
drop trigger if exists a6_guard_deal_identity on public.deals;
create trigger a6_guard_deal_identity before insert or update on public.deals
  for each row execute function public.guard_deal_identity();

-- ============ ملف المؤثر: اسم وجوال من أول ما ينحفظ، والتعريف ما ينمسح ============
create or replace function public.guard_infl_required() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.allow_incomplete', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(trim(new.name), '') = '' then raise exception 'اسم المؤثر إلزامي'; end if;
    if public._ph9(new.phone) is null then raise exception 'جوال المؤثر إلزامي — ما ينحفظ مؤثر بدون جوال صحيح حتى كمسودة'; end if;
    return new;
  end if;
  if coalesce(trim(old.name), '') <> '' and coalesce(trim(new.name), '') = '' then raise exception 'اسم المؤثر ما ينمسح'; end if;
  if coalesce(trim(old.name_en), '') <> '' and coalesce(trim(new.name_en), '') = '' then raise exception 'الاسم بالإنجليزي ما ينمسح'; end if;
  if public._ph9(old.phone) is not null and public._ph9(new.phone) is null then raise exception 'جوال المؤثر ما ينمسح — تقدر تعدّله لرقم صحيح بس'; end if;
  if public._uname(old.handle) is not null and public._uname(new.handle) is null then raise exception 'يوزر تيك توك ما ينمسح'; end if;
  if public._uname(old.snap_user) is not null and public._uname(new.snap_user) is null then raise exception 'يوزر سناب ما ينمسح'; end if;
  if public._uname(old.ig_user) is not null and public._uname(new.ig_user) is null then raise exception 'يوزر انستقرام ما ينمسح'; end if;
  return new;
end $$;
drop trigger if exists a7_guard_infl_required on public.influencers;
create trigger a7_guard_infl_required before insert or update on public.influencers
  for each row execute function public.guard_infl_required();
