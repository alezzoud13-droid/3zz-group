// اختبار التحديث 25 (البيانات التعريفية إلزامية في كل مرحلة) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node identity_required.check.js   — المطلوب: ولا سطر VULN أو BROKEN.
const { Client } = require('pg'); const DB = process.env.DB || 't1';
const U = { admin: '00000000-0000-0000-0000-00000000000a', mitab: '00000000-0000-0000-0000-0000000000b1', reem: '00000000-0000-0000-0000-0000000000c1', saqr: '00000000-0000-0000-0000-0000000000d1' };
const cfg = { host: process.env.PGHOST || '/tmp/pgd', port: +(process.env.PGPORT || 5544), user: 'postgres', database: DB };
async function su(sql, p, allow) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); if (allow) await c.query("set local app.allow_incomplete='on'"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U.admin]); const r = (await c.query(sql, p)).rows; await c.query('commit'); return r; } finally { await c.end(); } }
async function as(who, sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U[who]]); const r = await c.query(sql, p); await c.query('commit'); return { ok: true, n: r.rowCount, rows: r.rows }; } catch (e) { try { await c.query('rollback'); } catch (_) {} return { ok: false, err: e.message }; } finally { await c.end(); } }
const res = []; const blocked = (n, r) => { const v = r.ok && r.n > 0; res.push([v ? 'VULN' : 'ok  ', n, v ? '' : (r.err || '0 rows')]); }; const allowed = (n, r) => res.push([r.ok && r.n > 0 ? 'ok  ' : 'BROKEN', n, r.ok ? 'rows=' + r.n : r.err]);
(async () => {
  for (const [k, id] of Object.entries(U)) await su('insert into auth.users(id,email) values($1,$2) on conflict do nothing', [id, k + '@x.com']);
  await su('update members set is_admin=true,active=true,name=$2 where id=$1', [U.admin, 'عبدالمحسن']);
  for (const [k, r] of Object.entries({ mitab: ['creator', 'approver'], reem: ['creator'], saqr: ['creator', 'shipper'] })) await su('update members set active=true,roles=$2,name=$3 where id=$1', [U[k], r, k]);
  const camp = (await su("select id from campaigns limit 1"))[0].id; await su('update campaigns set budget=null where id=$1', [camp]);
  await su("delete from deals", [], true); await su("delete from influencers", [], true);
  const insI = (who, o) => as(who, "insert into influencers(name,name_en,handle,snap_user,ig_user,phone,nominated_by,source,acq_status) values($1,$2,$3,$4,$5,$6,$7,'campaign','none') returning id", [o.name, o.en || '', o.tt || '', o.sn || '', o.ig || '', o.ph || '', U[who]]);

  // 1) ملف جديد
  blocked('new influencer without phone (even draft)', await insI('reem', { name: 'بدون جوال', en: 'X', tt: 'np_1' }));
  blocked('new influencer with invalid phone', await insI('reem', { name: 'جوال غلط', en: 'X', tt: 'np_2', ph: '123' }));
  blocked('new influencer without name', await insI('reem', { name: '', en: 'X', tt: 'np_3', ph: '0511111111' }));
  allowed('new influencer with name + phone (draft can miss English name)', await insI('reem', { name: 'روح', tt: 'rore193m', ph: '0541489788' }));
  const roh = (await su("select id from influencers where handle='rore193m'"))[0].id;
  // 2) الترشيح ما يتقدّم والملف ناقص
  const ins = (who, sent, plat) => as(who, `insert into deals(name,member_id,campaign_id,influencer_id,price,price_before,platform,handle${sent ? ',sent_at' : ''}) values('روح',$1,$2,$3,500,600,$4,'rore193m'${sent ? ',now()' : ''})`, [U[who], camp, roh, plat]);
  blocked('send nomination while English name missing', await ins('reem', true, 'تيك توك'));
  allowed('save nomination as draft while English name missing', await ins('reem', false, 'تيك توك'));
  const d = (await su("select id from deals where influencer_id=$1", [roh]))[0].id;
  blocked('send the draft later (still missing English name)', await as('reem', "update deals set sent_at=now() where id=$1", [d]));
  allowed('owner completes English name', await as('reem', "update influencers set name_en='Roh' where id=$1", [roh]));
  allowed('send now (TikTok only, file complete)', await as('reem', "update deals set sent_at=now() where id=$1", [d]));
  allowed('approver approves', await as('mitab', "update deals set approval='approved', approved_by=$2, approved_at=now() where id=$1", [d, U.mitab]));
  // المنصة تتغيّر لسناب: يوزر سناب لازم
  await su("update deals set platform='تيك توك + سناب شات', sn_user='' where id=$1", [d], true);
  blocked('shipper ships while snap username missing (snap platform)', await as('saqr', "update deals set shipped_at=now(), ship_company='سلاسل' where id=$1", [d]));
  allowed('owner adds snap', await as('reem', "update influencers set snap_user='rmen193' where id=$1", [roh]));
  allowed('shipper ships now', await as('saqr', "update deals set shipped_at=now(), ship_company='سلاسل' where id=$1", [d]));
  // 3) التعريف ما ينمسح
  blocked('owner clears phone', await as('reem', "update influencers set phone='' where id=$1", [roh]));
  blocked('owner clears snap', await as('reem', "update influencers set snap_user='' where id=$1", [roh]));
  blocked('owner clears English name', await as('reem', "update influencers set name_en='' where id=$1", [roh]));
  allowed('owner corrects phone to another valid number', await as('reem', "update influencers set phone='0549999999' where id=$1", [roh]));
  allowed('non-advancing edit on deal still works (hook)', await as('reem', "update deals set hook='جديد' where id=$1", [d]));
  // 4) الانسحاب ما يتعطّل حتى لو الملف ناقص
  const i2 = (await insI('reem', { name: 'ناقص', tt: 'nq_1', ph: '0533333333' })).rows; const iid2 = (await su("select id from influencers where handle='nq_1'"))[0].id;
  const d2 = (await su("insert into deals(name,member_id,campaign_id,influencer_id,price,price_before,platform,approval,approved_at,approved_by,sent_at) values('ناقص',$1,$2,$3,1,1,'تيك توك','approved',now(),$4,now()) returning id", [U.reem, camp, iid2, U.mitab], true))[0].id;
  allowed('withdrawal request on incomplete file', await as('reem', "update deals set wd_req_at=now(), wd_reason='اعتذر' where id=$1", [d2]));
  allowed('withdrawal approval on incomplete file', await as('mitab', "update deals set wd_ok_at=now(), wd_ok_by=$2, wd_cause='influencer', closed_at=now(), closed_reason='انسحب' where id=$1", [d2, U.mitab]));
  // 5) الدالة
  const r = await as('reem', "select public.deal_id_missing($1) m", [d]); res.push([r.ok && r.rows[0].m === '' ? 'ok  ' : 'BROKEN', 'deal_id_missing → empty for complete file', r.ok ? JSON.stringify(r.rows[0].m) : r.err]);
  for (const x of res) console.log(x.join(' | '));
  const bad = res.filter(x => x[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
