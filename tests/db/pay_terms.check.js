// اختبار التحديث 20 (طريقة الدفع + بوابة الدفع) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node pay_terms.check.js   (القاعدة فيها كل التحديثات لين 020)
// النتيجة المطلوبة: ولا سطر يبدأ بـ VULN أو BROKEN.
const { Client } = require('pg'); const DB = process.env.DB || 't1';
const U = { admin: '00000000-0000-0000-0000-00000000000a', mitab: '00000000-0000-0000-0000-0000000000b1', reem: '00000000-0000-0000-0000-0000000000c1', saqr: '00000000-0000-0000-0000-0000000000d1' };
const cfg = { host: process.env.PGHOST || '/tmp/pgd', port: +(process.env.PGPORT || 5544), user: 'postgres', database: DB };
async function su(sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U.admin]); const r = (await c.query(sql, p)).rows; await c.query('commit'); return r; } finally { await c.end(); } }
async function as(who, sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U[who]]); const r = await c.query(sql, p); await c.query('commit'); return { ok: true, n: r.rowCount }; } catch (e) { try { await c.query('rollback'); } catch (_) {} return { ok: false, err: e.message }; } finally { await c.end(); } }
const res = []; const blocked = (n, r) => { const v = r.ok && r.n > 0; res.push([v ? 'VULN' : 'ok  ', n, v ? '' : (r.err || '0 rows')]); }; const allowed = (n, r) => res.push([r.ok && r.n > 0 ? 'ok  ' : 'BROKEN', n, r.ok ? 'rows=' + r.n : r.err]);
(async () => {
  for (const [k, id] of Object.entries(U)) await su('insert into auth.users(id,email) values($1,$2) on conflict do nothing', [id, k + '@x.com']);
  await su('update members set is_admin=true,active=true where id=$1', [U.admin]);
  const roles = { mitab: ['creator', 'approver'], reem: ['creator'], saqr: ['creator', 'shipper'] };
  for (const [k, r] of Object.entries(roles)) await su('update members set active=true,roles=$2 where id=$1', [U[k], r]);
  const camp = (await su("select id from campaigns limit 1"))[0].id; await su('update campaigns set budget=null where id=$1', [camp]);
  // ملف معتمد عند ريم، وصل المنتج، والمقطع معتمد (جاهز للنشر)
  const mk = async (who = 'reem') => { const id = (await su(`insert into deals(name,member_id,campaign_id,price,price_before,platform,approval,approved_at,approved_by,sent_at,delivered_at)
      values('pt',$1,$2,500,600,'تيك توك','approved',now(),$3,now(),now()) returning id`, [U[who], camp, U.mitab]))[0].id; return id; };
  const okVideo = id => su('update deals set draft_at=now(),video_ok_at=now(),video_score=4 where id=$1', [id]);

  let d = await mk();
  blocked('creator sets pay terms on own file', await as('reem', "update deals set pay_terms='after_post' where id=$1", [d]));
  blocked('shipper sets pay terms', await as('saqr', "update deals set pay_terms='advance' where id=$1", [d]));
  allowed('approver sets pay terms on someone else file', await as('mitab', "update deals set pay_terms='before_post' where id=$1", [d]));
  blocked('invalid pay terms value', await as('mitab', "update deals set pay_terms='whenever' where id=$1", [d]));
  await okVideo(d);
  blocked('before_post: creator posts before payment', await as('reem', "update deals set tt_at=now(),tt_code='X1' where id=$1", [d]));
  blocked('before_post: creator ticks «no payment needed» to open the gate', await as('reem', 'update deals set no_pay=true where id=$1', [d]));
  allowed('admin approves payment', await as('admin', 'update deals set pay_ok_at=now(),pay_ok_by=$2 where id=$1', [d, U.admin]));
  allowed('approver records paid', await as('mitab', 'update deals set paid_at=now() where id=$1', [d]));
  allowed('before_post: creator posts after payment', await as('reem', "update deals set tt_at=now(),tt_code='X1' where id=$1", [d]));
  blocked('pay terms change after payment', await as('mitab', "update deals set pay_terms='after_post' where id=$1", [d]));

  d = await mk(); await as('mitab', "update deals set pay_terms='advance' where id=$1", [d]);
  blocked('advance: creator sends raw video before payment', await as('reem', "update deals set draft_url='https://x',draft_at=now() where id=$1", [d]));
  d = await mk(); await as('mitab', "update deals set pay_terms='after_post' where id=$1", [d]); await okVideo(d);
  allowed('after_post: creator posts without payment', await as('reem', "update deals set tt_at=now(),tt_code='X2' where id=$1", [d]));
  d = await mk(); await okVideo(d);
  allowed('empty terms = after_post: creator posts (old data unaffected)', await as('reem', "update deals set tt_at=now(),tt_code='X3' where id=$1", [d]));
  allowed('empty terms: creator still saves «no payment needed»', await as('reem', 'update deals set no_pay=true where id=$1', [d]));

  d = await mk('mitab');
  blocked('approver sets pay terms on his own file', await as('mitab', "update deals set pay_terms='advance' where id=$1", [d]));
  allowed('admin sets pay terms on approver file', await as('admin', "update deals set pay_terms='before_post' where id=$1", [d]));
  await okVideo(d);
  allowed('admin emergency: posts before payment', await as('admin', "update deals set tt_at=now(),tt_code='X4' where id=$1", [d]));

  for (const r of res) console.log(r.join(' | '));
  const bad = res.filter(r => r[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
