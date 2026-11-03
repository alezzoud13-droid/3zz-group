-- استرجاع نظام «أداء فريق العز» من ملف النسخة اليومية (يوم-DD نسخة نظام فريق العز.json)
-- الاستخدام (على قاعدة بيانات فيها نفس الجداول، من schema.sql ثم 002 و003 و004):
--   psql "<رابط قاعدة البيانات>" -v backup="$(cat 'يوم-04 نسخة نظام فريق العز.json')" -f restore_from_backup.sql
-- ينفّذ كل شي في عملية وحدة: إذا فشل أي جدول، ما يتغير شي.
-- تنبيه: يمسح محتوى الجداول المسترجعة ويحط بدالها محتوى النسخة. لا تشغّله على القاعدة الحقيقية إلا بعد قرار.

begin;
set local session_replication_role = replica;   -- يوقف المحفزات والقيود مؤقتاً أثناء الإدخال (الترتيب ما يهم)
create temp table _b on commit drop as select ltrim(:'backup', chr(65279))::jsonb as j;   -- يشيل علامة BOM لو موجودة

truncate public.request_reads, public.request_events, public.requests, public.quotas, public.deals,
         public.influencers, public.daily_reports, public.campaigns, public.members cascade;
delete from public.settings where key <> 'bank_pub';

insert into public.members        select * from jsonb_populate_recordset(null::public.members,        (select j->'members' from _b));
insert into public.campaigns      select * from jsonb_populate_recordset(null::public.campaigns,      (select j->'campaigns' from _b));
insert into public.influencers    select * from jsonb_populate_recordset(null::public.influencers,    (select j->'influencers' from _b));
insert into public.deals          select * from jsonb_populate_recordset(null::public.deals,          (select j->'deals' from _b));
insert into public.quotas         select * from jsonb_populate_recordset(null::public.quotas,         (select j->'quotas' from _b));
insert into public.requests       select * from jsonb_populate_recordset(null::public.requests,       (select j->'requests' from _b));
insert into public.request_events select * from jsonb_populate_recordset(null::public.request_events, (select j->'request_events' from _b));
insert into public.daily_reports  select * from jsonb_populate_recordset(null::public.daily_reports,  (select j->'daily_reports' from _b));
insert into public.settings       select * from jsonb_populate_recordset(null::public.settings,       (select j->'settings' from _b))
  on conflict (key) do update set value = excluded.value;
select setval(pg_get_serial_sequence('public.request_events', 'id'), greatest(1, coalesce((select max(id) from public.request_events), 1)));

-- تقرير: عدد الصفوف المسترجعة مقابل النسخة
select t as "الجدول", jsonb_array_length((select j->t from _b)) as "في النسخة",
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::int as "بعد الاسترجاع"
from unnest(array['members','campaigns','influencers','deals','quotas','requests','request_events','daily_reports','settings']) t;
commit;
