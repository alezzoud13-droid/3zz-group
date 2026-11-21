-- صيانة 21 نوفمبر 2026: حذف بيانات التجربة (الديمو) — قرار عبدالمحسن
-- يبقى: حملتا «بكج الشتاء» و«افنت حضوري بكج شتاء الملوك» بكل ترشيحاتهما وطلباتهما، وكل مؤثر انضاف من وقت إنشاء بكج الشتاء
--        (15 نوفمبر 12:20 ظهراً) أو مربوط بترشيح باقي، وكل طلب انشأ بعد هذا الوقت، والأعضاء والإعدادات.
-- ينحذف: الحملات السبع الثانية وترشيحاتها (32) وحصصها وروابطها، والمؤثرين القدامى غير المربوطين (45)،
--        والطلبات قبل الوقت أو المربوطة بالمحذوف (18) وسجلها، وتقارير اليوم القديمة (4)، وجداول نسخة 3 نوفمبر.
-- الأمان: (1) نسخة كاملة داخل القاعدة في archive_20261121 قبل أي حذف. (2) كل شي في معاملة وحدة:
--        إذا أي رقم من أرقام بكج الشتاء تغيّر بعد الحذف، العملية كلها تتلغى وما يتغيّر شي.
--        (3) سجل التدقيق audit_log يحفظ كل صف محذوف كامل.

begin;

-- 1) النسخة الكاملة قبل الحذف
create schema if not exists archive_20261121;
revoke all on schema archive_20261121 from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['campaigns','deals','influencers','requests','request_events','request_reads','quotas','deal_links','deal_bank','daily_reports'] loop
    execute format('drop table if exists archive_20261121.%I', t);
    execute format('create table archive_20261121.%I as table public.%I', t, t);
  end loop;
end $$;

-- 2) الأرقام المرجعية قبل الحذف
create temp table _before as
select (select count(*) from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء') as w_all,
       (select count(*) from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء' and d.approval = 'approved' and d.closed_at is null) as w_net,
       (select coalesce(sum(d.price), 0) from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء' and d.approval = 'approved' and d.closed_at is null) as w_spend,
       (select count(*) from deals d join campaigns c on c.id = d.campaign_id where c.name like 'افنت حضوري%') as e_all;

-- 3) تحديد المحذوف
create temp table _t0 as select created_at as t from campaigns where name = 'بكج الشتاء';
create temp table _keep_c as select id from campaigns where name = 'بكج الشتاء' or name like 'افنت حضوري%';
do $$ begin
  if (select count(*) from _keep_c) <> 2 then raise exception 'لازم تكون حملتين باقيات بالضبط — وقفنا بدون أي حذف'; end if;
  if (select count(*) from _t0) <> 1 then raise exception 'حملة بكج الشتاء مو موجودة أو مكررة — وقفنا بدون أي حذف'; end if;
end $$;
create temp table _del_c as select id from campaigns where id not in (select id from _keep_c);
create temp table _del_d as select id from deals where campaign_id is null or campaign_id in (select id from _del_c);
create temp table _del_i as select id from influencers
  where created_at < (select t from _t0)
    and id not in (select influencer_id from deals where influencer_id is not null and id not in (select id from _del_d));
create temp table _del_r as select id from requests
  where created_at < (select t from _t0) or deal_id in (select id from _del_d) or campaign_id in (select id from _del_c);

-- 4) الحذف (الأبناء قبل الآباء)
delete from request_reads  where request_id in (select id from _del_r);
delete from request_events where request_id in (select id from _del_r);
delete from requests       where id in (select id from _del_r);
delete from deal_links     where deal_id in (select id from _del_d);
delete from deal_bank      where deal_id in (select id from _del_d);
delete from deals          where id in (select id from _del_d);
delete from quotas         where campaign_id in (select id from _del_c);
delete from campaigns      where id in (select id from _del_c);
delete from influencers    where id in (select id from _del_i);
delete from daily_reports  where day < (select t::date from _t0);
drop table if exists public.backup_20261103_campaigns, public.backup_20261103_deals, public.backup_20261103_requests, public.backup_20261103_requests_v3;

-- 5) التحقق: أرقام الحملتين الباقيتين ما تغيّرت، وولا ترشيح باقي يأشر على شي محذوف
do $$ declare b record; a_all int; a_net int; a_spend numeric; e int; orphan int; begin
  select * into b from _before;
  select count(*) into a_all from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء';
  select count(*), coalesce(sum(d.price), 0) into a_net, a_spend from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء' and d.approval = 'approved' and d.closed_at is null;
  select count(*) into e from deals d join campaigns c on c.id = d.campaign_id where c.name like 'افنت حضوري%';
  select count(*) into orphan from deals d where (d.influencer_id is not null and not exists (select 1 from influencers i where i.id = d.influencer_id))
                                           or (d.replaces_id is not null and not exists (select 1 from deals x where x.id = d.replaces_id))
                                           or not exists (select 1 from campaigns c where c.id = d.campaign_id);
  if a_all <> b.w_all or a_net <> b.w_net or a_spend <> b.w_spend or e <> b.e_all or orphan <> 0 then
    raise exception 'التحقق فشل (قبل: % / % / % — بعد: % / % / %، مربوط بمحذوف: %) — انلغت العملية كاملة ولا شي تغيّر',
      b.w_all, b.w_net, b.w_spend, a_all, a_net, a_spend, orphan;
  end if;
  if (select count(*) from campaigns) <> 2 then raise exception 'باقي حملات غير الثنتين — انلغت العملية'; end if;
end $$;

-- 6) التقرير
select 'campaigns' as tbl, (select count(*) from archive_20261121.campaigns) as before, (select count(*) from campaigns) as after
union all select 'deals', (select count(*) from archive_20261121.deals), (select count(*) from deals)
union all select 'influencers', (select count(*) from archive_20261121.influencers), (select count(*) from influencers)
union all select 'requests', (select count(*) from archive_20261121.requests), (select count(*) from requests)
union all select 'request_events', (select count(*) from archive_20261121.request_events), (select count(*) from request_events)
union all select 'quotas', (select count(*) from archive_20261121.quotas), (select count(*) from quotas)
union all select 'deal_links', (select count(*) from archive_20261121.deal_links), (select count(*) from deal_links)
union all select 'daily_reports', (select count(*) from archive_20261121.daily_reports), (select count(*) from daily_reports)
union all select 'winter net approved / spend', (select w_net from _before), (select count(*) from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء' and d.approval = 'approved' and d.closed_at is null)
union all select 'winter spend', (select w_spend from _before), (select coalesce(sum(d.price), 0) from deals d join campaigns c on c.id = d.campaign_id where c.name = 'بكج الشتاء' and d.approval = 'approved' and d.closed_at is null);

commit;
