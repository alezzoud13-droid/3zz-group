-- التحديث 24: منع تكرار المؤثر (قرار عبدالمحسن 21 نوفمبر)
-- المؤثر يتعرّف بأربع هويات: يوزر تيك توك، يوزر سناب، يوزر انستقرام، والجوال (آخر 9 أرقام).
-- أي ملف جديد أو تعديل يكرر هوية مسجّلة لملف ثاني ينرفض — حتى لو انضاف من خارج الواجهة.
-- قبل هذا التحديث: الواجهة كانت تربط الترشيح تلقائياً بأي ملف يطابق الجوال، وتكتب بيانات الترشيح في الملف
-- (حالة «محال» انكتبت في ملف «روح»، و«رندا» في ملف «نوره»، وانستقرام زياد بن نادر في ملف مستشار العطور).
-- وكمان: نفس المؤثر ما ينرشّح مرتين في نفس الحملة وهو شغّال (غير مغلق وغير مرفوض).
-- يُشغَّل مرة وحدة بعد 023. آمن لإعادة التشغيل، ولا يحذف أي بيانات.
-- الاستثناء الوحيد: صيانة من محرر SQL بـ  set local app.allow_dup = 'on';

-- اليوزر الموحّد: يقبل اليوزر أو @اليوزر أو رابط الحساب، ويشيل المسافات وعلامات الاتجاه الخفية
create or replace function public._uname(s text) returns text
language sql immutable as $$
  select nullif(lower(regexp_replace(regexp_replace(coalesce(
    substring(s from '[Ii][Nn][Ss][Tt][Aa][Gg][Rr][Aa][Mm]\.[Cc][Oo][Mm]/([A-Za-z0-9._]+)'),
    substring(s from '[Ss][Nn][Aa][Pp][Cc][Hh][Aa][Tt]\.[Cc][Oo][Mm]/(?:add/)?@?([A-Za-z0-9._-]+)'),
    substring(s from '[Tt][Ii][Kk][Tt][Oo][Kk]\.[Cc][Oo][Mm]/@([A-Za-z0-9._-]+)'),
    s, ''), '[[:space:]‎‏‪-‮⁦-⁩]', '', 'g'), '^@', '')), '')
$$;
-- الجوال: آخر 9 أرقام (يطابق 05… و+966… و00966…)
create or replace function public._ph9(s text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(s, ''), '\D', '', 'g')) >= 9
              then right(regexp_replace(s, '\D', '', 'g'), 9) end
$$;

-- ============ منع تكرار الهوية بين ملفات المؤثرين ============
create or replace function public.guard_infl_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text; nm text; own text; lbl text; col text;
begin
  if current_setting('app.allow_dup', true) = 'on' then return new; end if;
  foreach col in array array['handle','snap_user','ig_user','phone'] loop
    -- في التعديل: نفحص بس الهوية اللي تغيّرت (عشان تعديل خانة ثانية ما يتعطّل)
    if tg_op = 'UPDATE' and (to_jsonb(new) ->> col) is not distinct from (to_jsonb(old) ->> col) then continue; end if;
    v := case when col = 'phone' then public._ph9(to_jsonb(new) ->> col) else public._uname(to_jsonb(new) ->> col) end;
    if v is null or (col = 'handle' and length(v) < 3) then continue; end if;
    select i.name, coalesce(m.name, '') into nm, own from influencers i left join members m on m.id = i.nominated_by
     where i.id <> new.id and (case when col = 'phone' then public._ph9(to_jsonb(i) ->> col) else public._uname(to_jsonb(i) ->> col) end) = v
     order by i.created_at limit 1;
    if found then
      lbl := case col when 'handle' then 'يوزر تيك توك' when 'snap_user' then 'يوزر سناب' when 'ig_user' then 'يوزر انستقرام' else 'رقم الجوال' end;
      raise exception '% مسجّل للمؤثر «%»% — ما ينفع ينسجّل مرتين. إذا هو نفس المؤثر رشّحه من ملفه', lbl, nm, case when own <> '' then ' عند ' || own else '' end;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists a4_guard_infl_identity on public.influencers;
create trigger a4_guard_infl_identity before insert or update of handle, snap_user, ig_user, phone on public.influencers
  for each row execute function public.guard_infl_identity();

-- ============ نفس المؤثر مرة وحدة في الحملة (وهو شغّال) ============
create or replace function public.guard_deal_once() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.influencer_id is null or new.campaign_id is null or new.closed_at is not null or new.approval = 'rejected' then return new; end if;
  if exists (select 1 from deals d where d.id <> new.id and d.influencer_id = new.influencer_id and d.campaign_id = new.campaign_id
               and d.closed_at is null and d.approval <> 'rejected') then
    raise exception 'المؤثر «%» مرشّح في هذي الحملة من قبل — ما يتكرر في نفس الحملة', new.name;
  end if;
  return new;
end $$;
drop trigger if exists a5_guard_deal_once on public.deals;
create trigger a5_guard_deal_once before insert or update of influencer_id, campaign_id, closed_at, approval on public.deals
  for each row execute function public.guard_deal_once();

-- ============ للواجهة: وش اللي يتكرر؟ (الاسم وصاحب الترشيح فقط — بدون سعر ولا جوال) ============
create or replace function public.infl_clash(p_tt text, p_sn text, p_ig text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_member() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'owner_name', x.owner_name, 'mine', x.mine, 'field', x.field)) from (
      select i.id, i.name, coalesce(m.name, '') owner_name, i.nominated_by is not distinct from auth.uid() mine, f.field
      from influencers i left join members m on m.id = i.nominated_by
      cross join lateral (values
        ('tt', length(coalesce(public._uname(p_tt), '')) > 2 and public._uname(i.handle) = public._uname(p_tt)),
        ('sn', public._uname(p_sn) is not null and public._uname(i.snap_user) = public._uname(p_sn)),
        ('ig', public._uname(p_ig) is not null and public._uname(i.ig_user) = public._uname(p_ig)),
        ('ph', public._ph9(p_phone) is not null and public._ph9(i.phone) = public._ph9(p_phone))) f(field, hit)
      where f.hit limit 20) x), '[]'::jsonb) end
$$;
revoke all on function public.infl_clash(text, text, text, text) from public;
grant execute on function public.infl_clash(text, text, text, text) to authenticated;
