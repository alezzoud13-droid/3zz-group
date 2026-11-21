-- صيانة 21 نوفمبر (4): دمج البيانات التعريفية من الترشيحات في ملفات المؤثرين (قرار عبدالمحسن)
-- 1) انستقرام n_iiti لنوره فقط (تأكيد عبدالمحسن) → ينشال من ملف رندا.
-- 2) الجوال: الملف اللي جواله فاضي ياخذ جوال المؤثر من ترشيحه (جوال الترشيح أولاً، وجوال المستلم لو ما فيه غيره).
-- 3) يوزر سناب: الملف اللي سنابه فاضي ياخذه من الترشيح.
-- الجوال واليوزر ما يتكررون أبداً: أي رقم أو يوزر مسجّل لملف ثاني (أو بين ملفين ناقصين) ما ينكتب، ويطلع في التقرير
-- عشان صاحب الملف يكتب الصحيح من «مهامي ← كمّل البيانات التعريفية».
-- الأمان: نسخة قبل التعديل في archive_20261121.influencers_fix4.
begin;
set local app.allow_incomplete = 'on';   -- مسح انستقرام رندا الغلط (التحديث 25 يمنع مسح اليوزر من الواجهة)
drop table if exists archive_20261121.influencers_fix4;
create table archive_20261121.influencers_fix4 as select * from influencers;
alter table archive_20261121.influencers_fix4 enable row level security;

-- 1) n_iiti لنوره
update influencers set ig_user = '' where handle = 'asel1012so' and public._uname(ig_user) = 'n_iiti';

-- 2) الجوال
create temp table _p as
select i.id, (select coalesce(nullif(d.phone, ''), nullif(d.rcv_phone, '')) from deals d
              where d.influencer_id = i.id and coalesce(nullif(d.phone, ''), nullif(d.rcv_phone, '')) is not null
              order by d.created_at desc limit 1) as ph
from influencers i where public._ph9(i.phone) is null;
create temp table _p_skip as
select p.id, p.ph from _p p where p.ph is not null and (
  exists (select 1 from influencers o where o.id <> p.id and public._ph9(o.phone) = public._ph9(p.ph))
  or exists (select 1 from _p o where o.id <> p.id and public._ph9(o.ph) = public._ph9(p.ph)));
update influencers i set phone = p.ph from _p p
 where i.id = p.id and p.ph is not null and p.id not in (select id from _p_skip) and public._ph9(i.phone) is null;

-- 3) يوزر سناب
create temp table _s as
select i.id, (select d.sn_user from deals d where d.influencer_id = i.id and public._uname(d.sn_user) is not null order by d.created_at desc limit 1) as sn
from influencers i where public._uname(i.snap_user) is null;
update influencers i set snap_user = s.sn from _s s
 where i.id = s.id and s.sn is not null and public._uname(i.snap_user) is null
   and not exists (select 1 from influencers o where o.id <> s.id and public._uname(o.snap_user) = public._uname(s.sn))
   and not exists (select 1 from _s o where o.id <> s.id and public._uname(o.sn) = public._uname(s.sn));

-- التقرير
select 'جوالات انضافت للملفات' as item, (select count(*) from influencers i join archive_20261121.influencers_fix4 a on a.id = i.id where public._ph9(a.phone) is null and public._ph9(i.phone) is not null)::text as value
union all select 'سنابات انضافت للملفات', (select count(*) from influencers i join archive_20261121.influencers_fix4 a on a.id = i.id where public._uname(a.snap_user) is null and public._uname(i.snap_user) is not null)::text
union all select 'جوال ما انكتب (مسجّل لملف ثاني)', (select coalesce(string_agg(i.name || ' ↔ ' || coalesce((select string_agg(o.name, '/') from influencers o where o.id <> i.id and public._ph9(o.phone) = public._ph9(s.ph)), (select string_agg(i2.name, '/') from _p_skip s2 join influencers i2 on i2.id = s2.id where s2.id <> s.id and public._ph9(s2.ph) = public._ph9(s.ph))), '، '), '—') from _p_skip s join influencers i on i.id = s.id)
union all select 'باقي بدون جوال', (select coalesce(string_agg(name, '، '), '—') from influencers where public._ph9(phone) is null)
union all select 'ملف رندا ig / ملف نوره ig', (select coalesce(nullif(ig_user, ''), '(فاضي)') from influencers where handle = 'asel1012so') || ' / ' || (select coalesce(ig_user, '') from influencers where handle = 'nouraa198')
union all select 'ترشيحات شغّالة ملفها ناقص (بعد الدمج)', (select count(*)::text from deals d where d.closed_at is null and d.approval <> 'rejected' and public.deal_id_missing(d.id) <> '');
commit;
