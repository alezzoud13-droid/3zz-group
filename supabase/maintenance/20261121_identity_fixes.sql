-- صيانة 21 نوفمبر (3): تصحيح ملفات المؤثرين اللي تلوثت بخطأ الدمج التلقائي (قبل التحديث 24)
-- المرجع: بيانات الترشيح نفسه (اليوزر والاسم في الترشيح هم الصح).
--  1) ملف حساب asel1012so اسمه «نوره» بالغلط وهو حساب «رندا» (ترشيح رندا عند ريم) → يتصحّح الاسم.
--  2) ملف «مستشار العطور» فيه انستقرام zd1t1 وهو حساب «زياد بن نادر» → ينشال من مستشار العطور ويبقى عند زياد.
--  3) 3 ملفات مؤثرين بدون أي ترشيح، بقايا من التجربة والمسودات المحذوفة: مهدي، كشاف الرياض، زياد ب نادر (بدون يوزر).
-- ما يتغيّر: انستقرام n_iiti (موجود في ملف نوره وملف رندا) لين تأكد ريم لمين هو.
-- الأمان: نسخة من الصفوف المتأثرة في archive_20261121.influencers_fix3، وكل تعديل مشروط بالقيمة القديمة بالضبط.
begin;
drop table if exists archive_20261121.influencers_fix3;
create table archive_20261121.influencers_fix3 as select * from influencers
  where handle = 'asel1012so' or handle = 'perfumes_adviser'
     or (id in ('dc4bcc77-503f-4a62-9a15-2dcb1b8fa54e','51cd7dd2-800e-4bb4-afd9-d91ebbaf98e7','9278f6cd-ce99-443d-9756-cbffea82af09'));
alter table archive_20261121.influencers_fix3 enable row level security;

-- 1) رندا
update influencers set name = 'رندا', name_en = 'Randa'
 where handle = 'asel1012so' and name = 'نوره'
   and exists (select 1 from deals d where d.influencer_id = influencers.id and d.name = 'رندا' and d.handle = 'asel1012so');
-- 2) مستشار العطور
update influencers set ig_user = ''
 where handle = 'perfumes_adviser' and public._uname(ig_user) = 'zd1t1';
-- 3) الملفات اليتيمة (تنحذف بس لو فعلاً ما لها أي ترشيح)
delete from influencers
 where id in ('dc4bcc77-503f-4a62-9a15-2dcb1b8fa54e','51cd7dd2-800e-4bb4-afd9-d91ebbaf98e7','9278f6cd-ce99-443d-9756-cbffea82af09')
   and not exists (select 1 from deals d where d.influencer_id = influencers.id);

do $$ begin
  if (select count(*) from influencers where handle = 'asel1012so' and name = 'رندا') <> 1 then raise exception 'تصحيح رندا ما تم — انلغت العملية'; end if;
  if exists (select 1 from influencers where handle = 'perfumes_adviser' and public._uname(ig_user) = 'zd1t1') then raise exception 'انستقرام مستشار العطور ما انشال — انلغت'; end if;
  if exists (select 1 from deals d where d.influencer_id is not null and not exists (select 1 from influencers i where i.id = d.influencer_id)) then raise exception 'ترشيح صار بدون ملف — انلغت'; end if;
end $$;

select 'ملفات المؤثرين' as item, (select count(*) from influencers)::text as value
union all select 'ملف رندا', (select name || ' / ' || name_en || ' / ig ' || coalesce(ig_user, '') from influencers where handle = 'asel1012so')
union all select 'مستشار العطور ig', (select coalesce(nullif(ig_user, ''), '(فاضي)') from influencers where handle = 'perfumes_adviser')
union all select 'زياد بن نادر ig', (select ig_user from influencers where handle = 'zd1t1')
union all select 'ملفات بدون ترشيح', (select count(*)::text from influencers i where not exists (select 1 from deals d where d.influencer_id = i.id));
commit;
