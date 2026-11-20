// اختبار التحديث 21 (الانسحاب بطلب واعتماد + مدفوع سابقاً/بعقد) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node pay_terms.check.js   (القاعدة فيها كل التحديثات لين 021)
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
  // ملف معتمد عند ريم، وصل المنتج، والمقطع معتمد (جاهز للنشر)
  const mk = async (who = 'reem') => { const id = (await su(`insert into deals(name,member_id,campaign_id,price,price_before,platform,approval,approved_at,approved_by,sent_at,delivered_at)
      values('pt',$1,$2,500,600,'تيك توك','approved',now(),$3,now(),now()) returning id`, [U[who], camp, U.mitab]))[0].id; return id; };
  const okVideo = id => su('update deals set draft_at=now(),video_ok_at=now(),video_score=4 where id=$1', [id]);


  const ship = id => su('update deals set shipped_at=now(),delivered_at=now() where id=$1', [id]);
  const req = (who, id, reason = 'المؤثر اعتذر') => as(who, "update deals set wd_req_at=now(),wd_reason=$2,wd_product='يبقى عنده' where id=$1", [id, reason]);
  const okWd = (who, id) => as(who, "update deals set wd_ok_at=now(),wd_ok_by=$2,closed_at=now(),closed_reason='انسحب' where id=$1", [id, U[who]]);

  let d = await mk(); await ship(d);
  blocked('creator closes approved shipped file directly (no request)', await as('reem', "update deals set closed_at=now(),closed_reason='x' where id=$1", [d]));
  blocked('approver closes approved file without a request', await as('mitab', "update deals set closed_at=now(),closed_reason='x' where id=$1", [d]));
  blocked('someone else requests withdrawal for reem file', await req('kh', d));
  blocked('request without reason', await req('reem', d, ''));
  allowed('owner requests withdrawal (after shipping)', await req('reem', d));
  blocked('owner approves own withdrawal', await okWd('reem', d));
  blocked('shipper approves withdrawal', await okWd('saqr', d));
  allowed('approver approves withdrawal and closes', await okWd('mitab', d));
  blocked('approver reopens withdrawn file', await as('mitab', "update deals set closed_at=null,closed_reason='' where id=$1", [d]));
  allowed('owner nominates replacement linked to withdrawn file', await as('reem', "insert into deals(name,member_id,campaign_id,price,price_before,replaces_id) values('بديل',$1,$2,400,500,$3)", [U.reem, camp, d]));
  blocked('another member links replacement to reem withdrawn file', await as('kh', "insert into deals(name,member_id,campaign_id,price,price_before,replaces_id) values('x',$1,$2,400,500,$3)", [U.kh, camp, d]));
  const d2 = await mk();
  blocked('replacement linked to a file that was not withdrawn', await as('reem', "insert into deals(name,member_id,campaign_id,price,price_before,replaces_id) values('x',$1,$2,400,500,$3)", [U.reem, camp, d2]));

  // رفض الطلب وإلغاؤه
  allowed('owner requests withdrawal', await req('reem', d2));
  allowed('approver rejects withdrawal with reason', await as('mitab', "update deals set wd_req_at=null,wd_reject='المؤثر ملتزم' where id=$1", [d2]));
  blocked('owner forges rejection note', await as('reem', "update deals set wd_reject='' where id=$1", [d2]));
  allowed('owner requests again', await req('reem', d2));
  allowed('owner cancels own request', await as('reem', 'update deals set wd_req_at=null where id=$1', [d2]));

  // بعد الدفع: عبدالمحسن فقط
  const d3 = await mk(); await su('update deals set pay_ok_at=now(),pay_ok_by=$2,paid_at=now() where id=$1', [d3, U.admin]);
  allowed('owner requests withdrawal of a paid file (goes to admin)', await req('reem', d3));
  blocked('approver approves withdrawal of a paid file', await okWd('mitab', d3));
  allowed('admin approves withdrawal of a paid file', await okWd('admin', d3));

  // ملفات متعب: عبدالمحسن يعتمد انسحابها
  const d4 = await mk('mitab'); allowed('approver requests withdrawal of own file', await req('mitab', d4));
  blocked('approver approves own withdrawal', await okWd('mitab', d4));

  // مدفوع سابقاً / بعقد
  const d5 = await mk();
  blocked('prepaid without contract note', await as('mitab', "update deals set pay_terms='prepaid' where id=$1", [d5]));
  allowed('approver sets prepaid with note', await as('mitab', "update deals set pay_terms='prepaid',pay_note='عقد 3 إعلانات دُفع 1 نوفمبر' where id=$1", [d5]));
  blocked('creator edits contract note', await as('reem', "update deals set pay_note='x' where id=$1", [d5]));
  await su('update deals set draft_at=now(),video_ok_at=now(),video_score=4 where id=$1', [d5]);
  allowed('prepaid: creator posts without a new payment', await as('reem', "update deals set tt_at=now(),tt_code='P1' where id=$1", [d5]));
  // ترشيح عادي قبل الاعتماد: صاحبه يقفله بنفسه زي قبل
  const d6 = (await su("insert into deals(name,member_id,campaign_id,price,price_before) values('مسودة',$1,$2,100,100) returning id", [U.reem, camp]))[0].id;
  allowed('owner still closes own unapproved file', await as('reem', "update deals set closed_at=now(),closed_reason='ما رد' where id=$1", [d6]));

  for (const r of res) console.log(r.join(' | '));
  const bad = res.filter(r => r[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
