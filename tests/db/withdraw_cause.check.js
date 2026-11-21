// اختبار التحديث 23 (سبب الانسحاب) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node withdraw_cause.check.js   (القاعدة فيها كل التحديثات لين 023)
// النتيجة المطلوبة: ولا سطر يبدأ بـ VULN أو BROKEN.
const { Client } = require('pg'); const DB = process.env.DB || 't1';
const U = { admin: '00000000-0000-0000-0000-00000000000a', mitab: '00000000-0000-0000-0000-0000000000b1', reem: '00000000-0000-0000-0000-0000000000c1', kh: '00000000-0000-0000-0000-0000000000c2', saqr: '00000000-0000-0000-0000-0000000000d1' };
const cfg = { host: process.env.PGHOST || '/tmp/pgd', port: +(process.env.PGPORT || 5544), user: 'postgres', database: DB };
async function su(sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U.admin]); const r = (await c.query(sql, p)).rows; await c.query('commit'); return r; } finally { await c.end(); } }
async function as(who, sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U[who]]); const r = await c.query(sql, p); await c.query('commit'); return { ok: true, n: r.rowCount }; } catch (e) { try { await c.query('rollback'); } catch (_) {} return { ok: false, err: e.message }; } finally { await c.end(); } }
const res = []; const blocked = (n, r) => { const v = r.ok && r.n > 0; res.push([v ? 'VULN' : 'ok  ', n, v ? '' : (r.err || '0 rows')]); }; const allowed = (n, r) => res.push([r.ok && r.n > 0 ? 'ok  ' : 'BROKEN', n, r.ok ? 'rows=' + r.n : r.err]);
(async () => {
  for (const [k, id] of Object.entries(U)) await su('insert into auth.users(id,email) values($1,$2) on conflict do nothing', [id, k + '@x.com']);
  await su('update members set is_admin=true,active=true where id=$1', [U.admin]);
  const roles = { mitab: ['creator', 'approver'], reem: ['creator'], kh: ['creator'], saqr: ['creator', 'shipper'] };
  for (const [k, r] of Object.entries(roles)) await su('update members set active=true,roles=$2 where id=$1', [U[k], r]);
  const camp = (await su("select id from campaigns limit 1"))[0].id; await su('update campaigns set budget=null where id=$1', [camp]);
  const mk = async (who = 'reem') => (await su(`insert into deals(name,member_id,campaign_id,price,price_before,platform,approval,approved_at,approved_by,sent_at)
      values('wc',$1,$2,500,600,'تيك توك','approved',now(),$3,now()) returning id`, [U[who], camp, U.mitab]))[0].id;
  const req = (who, id) => as(who, "update deals set wd_req_at=now(),wd_reason='المؤثر اعتذر' where id=$1", [id]);

  blocked('new nomination starts with a withdrawal cause', await as('reem', "insert into deals(name,member_id,campaign_id,price,price_before,wd_cause) values('x',$1,$2,1,1,'company')", [U.reem, camp]));
  let d = await mk(); await req('reem', d);
  blocked('owner sets cause while requesting', await as('reem', "update deals set wd_cause='company' where id=$1", [d]));
  blocked('approver sets cause before withdrawal is approved', await as('mitab', "update deals set wd_cause='company' where id=$1", [d]));
  blocked('invalid cause value', await as('mitab', "update deals set wd_ok_at=now(),wd_ok_by=$2,wd_cause='xyz',closed_at=now(),closed_reason='انسحب' where id=$1", [d, U.mitab]));
  allowed('approver approves withdrawal with cause (one save)', await as('mitab', "update deals set wd_ok_at=now(),wd_ok_by=$2,wd_cause='influencer',closed_at=now(),closed_reason='انسحب' where id=$1", [d, U.mitab]));
  blocked('owner changes cause after approval', await as('reem', "update deals set wd_cause='company' where id=$1", [d]));
  blocked('shipper changes cause', await as('saqr', "update deals set wd_cause='company' where id=$1", [d]));
  allowed('approver reclassifies cause', await as('mitab', "update deals set wd_cause='company' where id=$1", [d]));
  allowed('admin reclassifies cause', await as('admin', "update deals set wd_cause='employee' where id=$1", [d]));
  // ملف متعب: السبب لعبدالمحسن
  const d2 = await mk('mitab'); await req('mitab', d2);
  allowed('admin approves approver-own withdrawal with cause', await as('admin', "update deals set wd_ok_at=now(),wd_ok_by=$2,wd_cause='company',closed_at=now(),closed_reason='انسحب' where id=$1", [d2, U.admin]));
  blocked('approver changes cause on own file', await as('mitab', "update deals set wd_cause='influencer' where id=$1", [d2]));
  // القديم بدون سبب: المعتمد يصنّفه
  const d3 = await mk(); await req('reem', d3);
  allowed('old-style approval without cause still works', await as('mitab', "update deals set wd_ok_at=now(),wd_ok_by=$2,closed_at=now(),closed_reason='انسحب' where id=$1", [d3, U.mitab]));
  allowed('approver classifies an old unclassified withdrawal', await as('mitab', "update deals set wd_cause='company' where id=$1", [d3]));
  // البديل ينربط زي قبل
  allowed('replacement still links to withdrawn file', await as('reem', "insert into deals(name,member_id,campaign_id,price,price_before,replaces_id) values('بديل',$1,$2,400,500,$3)", [U.reem, camp, d]));

  for (const r of res) console.log(r.join(' | '));
  const bad = res.filter(r => r[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
