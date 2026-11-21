// اختبار التحديث 24 (منع تكرار المؤثر بأربع هويات + مرة وحدة في الحملة) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node identity.check.js   — المطلوب: ولا سطر VULN أو BROKEN.
const { Client } = require('pg'); const DB = process.env.DB || 't1';
const U = { admin: '00000000-0000-0000-0000-00000000000a', mitab: '00000000-0000-0000-0000-0000000000b1', reem: '00000000-0000-0000-0000-0000000000c1', kh: '00000000-0000-0000-0000-0000000000c2' };
const cfg = { host: process.env.PGHOST || '/tmp/pgd', port: +(process.env.PGPORT || 5544), user: 'postgres', database: DB };
async function su(sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U.admin]); const r = (await c.query(sql, p)).rows; await c.query('commit'); return r; } finally { await c.end(); } }
async function as(who, sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U[who]]); const r = await c.query(sql, p); await c.query('commit'); return { ok: true, n: r.rowCount, rows: r.rows }; } catch (e) { try { await c.query('rollback'); } catch (_) {} return { ok: false, err: e.message }; } finally { await c.end(); } }
const res = []; const blocked = (n, r) => { const v = r.ok && r.n > 0; res.push([v ? 'VULN' : 'ok  ', n, v ? '' : (r.err || '0 rows')]); }; const allowed = (n, r) => res.push([r.ok && r.n > 0 ? 'ok  ' : 'BROKEN', n, r.ok ? 'rows=' + r.n : r.err]);
const ins = (who, o) => as(who, `insert into influencers(name,name_en,handle,snap_user,ig_user,phone,nominated_by,source,acq_status) values($1,$2,$3,$4,$5,$6,$7,'campaign','none')`, [o.name || 'x', o.en || 'X', o.tt || '', o.sn || '', o.ig || '', o.ph || '', U[who]]);
(async () => {
  for (const [k, id] of Object.entries(U)) await su('insert into auth.users(id,email) values($1,$2) on conflict do nothing', [id, k + '@x.com']);
  await su('update members set is_admin=true,active=true where id=$1', [U.admin]);
  for (const [k, r] of Object.entries({ mitab: ['creator', 'approver'], reem: ['creator'], kh: ['creator'] })) await su('update members set active=true,roles=$2 where id=$1', [U[k], r]);
  const camp = (await su("select id from campaigns limit 1"))[0].id; await su('update campaigns set budget=null where id=$1', [camp]);
  await su("delete from deals"); await su("delete from influencers");

  allowed('reem registers روح (tt rore193m, snap rmen193, ig roh1, 0541489788)', await ins('reem', { name: 'روح', tt: 'rore193m', sn: 'rmen193', ig: 'roh1', ph: '+966541489788' }));
  blocked('kh: same TikTok with @ and capitals', await ins('kh', { name: 'نسخة', tt: '@RORE193M' }));
  blocked('kh: same Snap with hidden RTL mark', await ins('kh', { name: 'نسخة', tt: 'other1', sn: '‏Rmen193' }));
  blocked('kh: same Instagram as full URL', await ins('kh', { name: 'نسخة', tt: 'other2', ig: 'https://www.instagram.com/roh1?utm_source=x' }));
  blocked('reem: same phone written 05… (محال case)', await ins('reem', { name: 'محال', tt: 'fy2b_5', sn: 'Fy2b_5', ph: '0541489788' }));
  blocked('admin from the app is not exempt', await ins('admin', { name: 'نسخة', tt: 'rore193m' }));
  allowed('reem registers محال with her own phone', await ins('reem', { name: 'محال', tt: 'fy2b_5', sn: 'Fy2b_5', ig: 'fy2b1', ph: '0540555577' }));
  const roh = (await su("select id from influencers where handle='rore193m'"))[0].id, mahal = (await su("select id from influencers where handle='fy2b_5'"))[0].id;
  blocked('reem copies محال snap into روح file (contamination)', await as('reem', "update influencers set snap_user='fy2b_5' where id=$1", [roh]));
  blocked('reem sets روح phone to محال phone', await as('reem', "update influencers set phone='+966540555577' where id=$1", [roh]));
  allowed('reem edits روح city (unrelated field)', await as('reem', "update influencers set city='الرياض' where id=$1", [roh]));
  // تكرار قديم موجود (قبل التحديث): ما يعطّل تعديل خانة ثانية
  await su("set local app.allow_dup='on'; insert into influencers(name,handle,ig_user,nominated_by,source,acq_status) values('قديم','old_x','roh1',$1,'campaign','none')", [U.reem]).catch(async () => { const c = new Client(cfg); await c.connect(); await c.query('begin'); await c.query("set local app.allow_dup='on'"); await c.query("insert into influencers(name,handle,ig_user,nominated_by,source,acq_status) values('قديم','old_x','roh1',$1,'campaign','none')", [U.reem]); await c.query('commit'); await c.end(); });
  const old = (await su("select id from influencers where handle='old_x'"))[0].id;
  allowed('pre-existing duplicate does not block editing another field', await as('reem', "update influencers set name_en='Old' where id=$1", [old]));
  allowed('pre-existing duplicate can be fixed (clear ig)', await as('reem', "update influencers set ig_user='' where id=$1", [old]));
  // الحملة: مرة وحدة
  const deal = (who, iid, name) => as(who, "insert into deals(name,member_id,campaign_id,influencer_id,price,price_before) values($1,$2,$3,$4,500,600)", [name, U[who], camp, iid]);
  allowed('nominate روح in campaign', await deal('reem', roh, 'روح'));
  blocked('nominate روح again in same campaign', await deal('reem', roh, 'روح 2'));
  allowed('nominate محال in same campaign (different file)', await deal('reem', mahal, 'محال'));
  const d1 = (await su("select id from deals where name='روح'"))[0].id;
  await su("update deals set closed_at=now(), closed_reason='ما رد' where id=$1", [d1]);
  allowed('after first closed: روح can be nominated again', await deal('reem', roh, 'روح بديل'));
  blocked('reopening the closed one while another is active', await as('reem', "update deals set closed_at=null, closed_reason='' where id=$1", [d1]));
  blocked('admin reopening it while another is active (duplicate rule itself)', await as('admin', "update deals set closed_at=null, closed_reason='' where id=$1", [d1]));
  // الدالة للواجهة
  const r = await as('kh', "select public.infl_clash('', 'RMEN193', '', '0541489788') as x");
  const arr = r.ok ? r.rows[0].x : []; res.push([arr.length === 2 && arr.every(x => x.name === 'روح' && !('phone' in x)) ? 'ok  ' : 'BROKEN', 'infl_clash: finds snap + phone, returns name only', JSON.stringify(arr.map(x => x.field))]);
  const r2 = await as('kh', "select public.infl_clash('brand_new', '', '', '0500000000') as x"); res.push([r2.ok && r2.rows[0].x.length === 0 ? 'ok  ' : 'BROKEN', 'infl_clash: new account → empty', '']);
  for (const x of res) console.log(x.join(' | '));
  const bad = res.filter(x => x[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
