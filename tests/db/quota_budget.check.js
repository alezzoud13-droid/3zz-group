// اختبار التحديث 22 (التوزيع بالعدد أو بالمبلغ + حد صرف كل موظف) على PostgreSQL حقيقي.
// التشغيل: PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node quota_budget.check.js   (القاعدة فيها كل التحديثات لين 022)
// النتيجة المطلوبة: ولا سطر يبدأ بـ VULN أو BROKEN.
const { Client } = require('pg'); const DB = process.env.DB || 't1';
const U = { admin: '00000000-0000-0000-0000-00000000000a', mitab: '00000000-0000-0000-0000-0000000000b1', reem: '00000000-0000-0000-0000-0000000000c1', kh: '00000000-0000-0000-0000-0000000000d1' };
const cfg = { host: process.env.PGHOST || '/tmp/pgd', port: +(process.env.PGPORT || 5544), user: 'postgres', database: DB };
async function su(sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U.admin]); const r = await c.query(sql, p); await c.query('commit'); return r.rows; } finally { await c.end(); } }
async function as(who, sql, p) { const c = new Client(cfg); await c.connect(); try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [U[who]]); const r = await c.query(sql, p); await c.query('commit'); return { ok: true, n: r.rowCount, rows: r.rows }; } catch (e) { return { ok: false, err: (e.message || '').split('\n')[0].slice(0, 110) }; } finally { await c.end(); } }
const res = []; const blocked = (n, r) => { const v = r.ok && r.n > 0; res.push([v ? 'VULN' : 'ok  ', n, v ? '' : (r.err || '0 rows')]); }; const allowed = (n, r) => res.push([r.ok && r.n > 0 ? 'ok  ' : 'BROKEN', n, r.ok ? '' : r.err]);
(async () => {
  for (const [k, id] of Object.entries(U)) await su('insert into auth.users(id,email) values($1,$2) on conflict do nothing', [id, k + '@x.com']);
  await su('update members set is_admin=true,active=true where id=$1', [U.admin]);
  for (const [k, r] of Object.entries({ mitab: ['creator', 'approver'], reem: ['creator'], kh: ['creator'] })) await su('update members set active=true,roles=$2 where id=$1', [U[k], r]);
  const camp = (await su("insert into campaigns(name,product,target_total,budget,quota_mode) values('حملة الحصص','منتج',10,10000,'both') returning id"))[0].id;
  await su('delete from quotas where campaign_id=$1', [camp]);
  const nom = (who, price, sent = true) => as(who, `insert into deals(name,member_id,campaign_id,price,price_before,platform,acc_type${sent ? ',sent_at' : ''}) values('ترشيح',$1,$2,$3,$3,'تيك توك','بيعي'${sent ? ',now()' : ''}) returning id`, [U[who], camp, price]);

  // 1) التوزيع: العدد والمبلغ معاً، والسقف على الاثنين
  allowed('المعتمد يوزّع لريم 3 ترشيحات و4000 ريال', await as('mitab', "insert into quotas(campaign_id,member_id,quota,quota_budget) values($1,$2,3,4000) returning member_id", [camp, U.reem]));
  blocked('توزيع يتجاوز ميزانية الحملة (4000+7000 > 10000)', await as('mitab', "insert into quotas(campaign_id,member_id,quota,quota_budget) values($1,$2,2,7000) returning member_id", [camp, U.kh]));
  blocked('توزيع يتجاوز العدد المطلوب (3+8 > 10)', await as('mitab', "insert into quotas(campaign_id,member_id,quota,quota_budget) values($1,$2,8,1000) returning member_id", [camp, U.kh]));
  allowed('توزيع داخل السقفين (6000 و7 ترشيحات)', await as('mitab', "insert into quotas(campaign_id,member_id,quota,quota_budget) values($1,$2,7,6000) returning member_id", [camp, U.kh]));
  blocked('المعتمد يزيد حصة صرف نفسه', await as('mitab', "insert into quotas(campaign_id,member_id,quota,quota_budget) values($1,$2,0,500) returning member_id", [camp, U.mitab]));

  // 2) حد الصرف لكل موظف
  const d1 = await nom('reem', 3000); allowed('ريم ترشّح بـ3000 (حدها 4000)', d1);
  blocked('ترشيح يتجاوز حدها (3000+1500 > 4000)', await nom('reem', 1500));
  const d2 = await nom('reem', 1000); allowed('ترشيح يكمّل الحد بالضبط (4000)', d2);
  blocked('رفع مبلغ ترشيح قائم فوق الحد (3500+1000 > 4000)', await as('reem', 'update deals set price=3500 where id=$1 returning id', [d1.rows[0].id]));
  allowed('تعديل خانة ثانية على ترشيح قائم ما ينحجب', await as('reem', "update deals set hook='هوك' where id=$1 returning id", [d1.rows[0].id]));
  allowed('مسودة بدون إرسال ما تستهلك الحد', await nom('reem', 5000, false));
  blocked('إرسال المسودة الكبيرة للاعتماد', await as('reem', 'update deals set sent_at=now() where id=$1 returning id', [(await su("select id from deals where member_id=$1 and campaign_id=$2 and sent_at is null order by created_at desc limit 1", [U.reem, camp]))[0].id]));

  // 3) المرفوض والمغلق ما ياخذون من الحد
  await su("update deals set approval='rejected',decision_reason='ما يناسب' where id=$1", [d2.rows[0].id]);
  allowed('بعد الرفض: مكانه يرجع لها (1000)', await nom('reem', 1000));
  const d3 = (await su("select id from deals where member_id=$1 and campaign_id=$2 and approval<>'rejected' and sent_at is not null order by created_at desc limit 1", [U.reem, camp]))[0].id;
  await su("update deals set closed_at=now(),closed_reason='ما رد' where id=$1", [d3]);
  allowed('بعد الإغلاق: مكانه يرجع لها', await nom('reem', 900));

  // 4) الحدود ما تنطبق إلا على من له حصة صرف، وعبدالمحسن يتجاوز
  allowed('موظف بدون حصة صرف أصلاً: ما ينحجب بالمبلغ', await nom('mitab', 9000));
  blocked('خالد يتجاوز حده (9000 > 6000)', await nom('kh', 9000));
  allowed('عبدالمحسن يتجاوز حد الموظف عند الحاجة', await as('admin', "insert into deals(name,member_id,campaign_id,price,price_before,platform,acc_type,sent_at) values('استثناء',$1,$2,9000,9000,'تيك توك','بيعي',now()) returning id", [U.kh, camp]));

  // 5) اعتماد طلب الزيادة بالعدد و/أو المبلغ
  const before = (await su('select target_total,budget from campaigns where id=$1', [camp]))[0];
  const g = await as('mitab', 'select public.quota_grant_b($1,$2,$3,$4) as r', [camp, U.reem, 1, 2000]);
  allowed('المعتمد يزيد حصة ريم عدداً ومبلغاً', g);
  const after = (await su('select target_total,budget from campaigns where id=$1', [camp]))[0];
  const q = (await su('select quota,quota_budget from quotas where campaign_id=$1 and member_id=$2', [camp, U.reem]))[0];
  res.push([(+q.quota === 4 && +q.quota_budget === 6000 && +after.target_total === +before.target_total + 1 && +after.budget === +before.budget + 2000) ? 'ok  ' : 'BROKEN', 'الزيادة ترفع حصة الموظف وسقف الحملة معاً', `حصة ${q.quota}/${q.quota_budget} · حملة ${after.target_total}/${after.budget}`]);
  blocked('المعتمد يزيد حصة نفسه', await as('mitab', 'select public.quota_grant_b($1,$2,$3,$4) as r', [camp, U.mitab, 1, 100]));
  blocked('صانع محتوى يزيد حصته بنفسه', await as('reem', 'select public.quota_grant_b($1,$2,$3,$4) as r', [camp, U.reem, 1, 100]));
  blocked('زيادة بصفر عدد وصفر مبلغ', await as('mitab', 'select public.quota_grant_b($1,$2,$3,$4) as r', [camp, U.kh, 0, 0]));
  allowed('بعد الزيادة: ريم ترشّح بالمبلغ الجديد', await nom('reem', 1500));

  for (const r of res) console.log(r.join(' | '));
  const bad = res.filter(r => r[0] !== 'ok  ').length; console.log(bad ? `FAILED: ${bad}` : `ALL OK (${res.length})`); process.exit(bad ? 1 : 0);
})();
