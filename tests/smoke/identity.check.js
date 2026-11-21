/* فحص 21 نوفمبر (التحديث 24): الخانات الإلزامية ومنع تكرار المؤثر في الترشيح والاستقطاب.
   التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/identity.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const PATCH = `(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),me=fx.personas||{},D=fx.db.deals,I=fx.db.influencers;
  var c=fx.db.campaigns.filter(function(c){return (c.status||'active')==='active';})[0]; c.budget=null; c.quota_mode='count'; window.__cid=c.id;
  fx.db.quotas.forEach(function(q){if(q.campaign_id===c.id&&q.member_id===me.creator)q.quota=40;});
  if(!fx.db.quotas.some(function(q){return q.campaign_id===c.id&&q.member_id===me.creator;})) fx.db.quotas.push({campaign_id:c.id,member_id:me.creator,quota:40});
  var mine=I.filter(function(i){return i.nominated_by===me.creator&&!D.some(function(d){return d.influencer_id===i.id&&d.campaign_id===c.id;});});
  var roh=mine[0]; roh.name='روح'; roh.phone='+966541489788'; roh.snap_user='rmen193'; window.__roh=roh.id; window.__rohUrl=roh.tiktok_url;
  var other=I.filter(function(i){return i.nominated_by!==me.creator;})[0]; other.snap_user='taken_snap'; other.ig_user='taken_ig'; window.__otherName=other.name;
  return fx;};})();`;
const BODY = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\n;\n' + PATCH + '\n;\n' + fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, n, v) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (v !== undefined ? ' → ' + v : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', r => { const u = r.request().url(); if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: BODY }); if (/xlsx/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); if (u.startsWith(APP_URL)) return r.continue(); return r.abort(); });
  await ctx.addInitScript(() => { window.__PERSONA = 'creator'; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.clock.setFixedTime(new Date('2026-11-11T08:00:00.000Z'));
  await p.goto(APP_URL + 'index.html#camps'); await p.waitForFunction(() => !document.getElementById('appView').hidden, null, { timeout: 15000 }); await p.waitForTimeout(500);
  const cid = await p.evaluate(() => window.__cid);
  const openNom = async () => { await p.evaluate(() => { const o = document.querySelector('.ov'); if (o && !o.hidden) { const x = document.getElementById('cn_x'); if (x) x.click(); } }); await p.waitForTimeout(200); await p.click(`[data-camp="${cid}"] [data-nom]`); await p.waitForTimeout(500); };
  const card = () => p.$('.ov [data-card]:not([data-deal]), .ov [data-card][data-deal=""]');
  const fill = async (el, o) => {
    for (const [k, v] of Object.entries(o.f || {})) await el.$eval(`[data-f="${k}"]`, (e, v) => { if (e.tagName === 'SELECT') { e.value = v || e.options[1].value; } else e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    for (const pl of o.plats || []) await el.$eval(`input[data-plat][value="${pl}"]`, e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
    for (const [k, v] of Object.entries(o.after || {})) await el.$eval(`[data-f="${k}"]`, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
  };
  const base = { name: 'اختبار', name_en: 'Test', acc_type: '', price_before: '600', price: '500' };
  const writes = () => p.evaluate(() => window.__writes.filter(w => ['deals', 'influencers'].includes(w.table)).map(w => ({ t: w.table, op: w.op, p: w.payload })));
  const reset = () => p.evaluate(() => { window.__writes.length = 0; });
  const toast = () => p.$eval('#toast', e => e.hidden ? '' : e.innerText);

  /* 1) سناب فقط: رابط تيك توك مخفي وما هو إلزامي، والجوال إلزامي */
  await openNom(); let el = await card();
  ok(await el.$eval('[data-for="tt"]', e => e.hidden), 'رابط تيك توك مخفي لين تختار تيك توك');
  await fill(el, { f: { ...base, phone: '' }, plats: ['sn'], after: { sn_user: 'brand_new_snap' } });
  const pill = await el.$eval('[data-cst]', e => e.innerText); ok(/ناقص/.test(pill) && /الجوال/.test(pill), 'بدون جوال: البطاقة «ناقص: الجوال»', pill);
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(600);
  let w = await writes(); const dr = w.find(x => x.t === 'deals' && x.op === 'insert');
  ok(dr && !dr.p.sent_at, 'بدون جوال: انحفظ مسودة وما انرسل للاعتماد'); ok(/ناقص: الجوال/.test(await toast()), 'الرسالة تقول وش الناقص', await toast());
  /* النافذة تنفتح من جديد بعد الحفظ: نلقى البطاقة اللي انحفظت مسودة (فيها يوزر السناب) */
  el = await p.$('.ov [data-card] [data-f="sn_user"][value="brand_new_snap"]').then(x => x && x.evaluateHandle(e => e.closest('[data-card]')));
  if (!el) { ok(false, 'المسودة ما ظهرت بعد الحفظ'); } else await el.$eval('[data-f="phone"]', e => { e.value = '0551112222'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(700); w = await writes();
  const up = w.find(x => x.t === 'deals' && x.p && x.p.sent_at); const inf = w.find(x => x.t === 'influencers' && x.p && (x.p.phone || x.p.snap_user));
  ok(!!up, 'سناب فقط + جوال: انرسل للاعتماد بدون رابط تيك توك'); ok(!!inf, 'ملف المؤثر انحفظ فيه الجوال/السناب', inf && JSON.stringify({ ph: inf.p.phone, sn: inf.p.snap_user }));

  /* 2) جوال مسجّل لمؤثر ثاني (حالة محال وروح): ينمنع ولا يندمج */
  await openNom(); el = await card();
  await fill(el, { f: { ...base, name: 'محال', phone: '0541489788' }, plats: ['tt', 'sn'], after: { url: 'https://www.tiktok.com/@fy2b_5', sn_user: 'Fy2b_5' } });
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(700); w = await writes();
  ok(!w.some(x => x.t === 'deals' && x.op === 'insert'), 'جوال روح مع يوزر مختلف: ما انحفظ ترشيح');
  ok(!w.some(x => x.t === 'influencers' && x.op === 'update'), 'وما انكتب شي في ملف روح (ما فيه تلوّث)');
  ok(/رقم الجوال مسجّل للمؤثر «روح»/.test(await toast()), 'الرسالة: الجوال مسجّل للمؤثر روح', await toast());

  /* 3) سناب مسجّل عند زميل */
  await openNom(); el = await card();
  await fill(el, { f: { ...base, phone: '0553334444' }, plats: ['sn'], after: { sn_user: '@Taken_Snap' } });
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(700); w = await writes();
  ok(!w.some(x => x.t === 'deals' && x.op === 'insert') && /يوزر سناب مسجّل/.test(await toast()), 'يوزر سناب مسجّل (حتى بـ@ وحروف كبيرة): ينمنع', await toast());

  /* 4) نفس المؤثر يرجع (مستمر): رابطه وجواله يطابقون ملفه → ينربط بملفه بدون ملف جديد */
  const roh = await p.evaluate(() => window.__roh), rohUrl = await p.evaluate(() => window.__rohUrl);
  await openNom(); el = await card();
  await fill(el, { f: { ...base, name: 'روح', phone: '0541489788' }, plats: ['tt'], after: { url: rohUrl } });
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(700); w = await writes();
  const d4 = w.find(x => x.t === 'deals' && x.op === 'insert');
  ok(d4 && d4.p.influencer_id && !w.some(x => x.t === 'influencers' && x.op === 'insert'), 'المؤثر المستمر: انربط بملفه وما انشأ ملف مكرر', d4 && d4.p.influencer_id);
  /* 5) ونفس المؤثر مرة ثانية في نفس الحملة: ينمنع */
  await openNom(); el = await card();
  await fill(el, { f: { ...base, name: 'روح', phone: '0541489788' }, plats: ['tt'], after: { url: rohUrl } });
  await reset(); await p.click('#cn_send'); await p.waitForTimeout(700); w = await writes();
  ok(!w.some(x => x.t === 'deals' && x.op === 'insert') && /مرشّح في هذي الحملة من قبل/.test(await toast()), 'نفس المؤثر مرتين في الحملة: ينمنع', await toast());

  /* 6) الاستقطاب: الجوال والمنصات إلزامية، والمكرر ينمنع */
  await p.evaluate(() => { const x = document.getElementById('cn_x'); if (x) x.click(); }); await p.waitForTimeout(200);
  await p.goto(APP_URL + 'index.html#acq'); await p.waitForTimeout(600);
  const opened = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /استقطاب جديد/.test(x.innerText)); if (b) { b.click(); return true; } return false; });
  await p.waitForTimeout(400);
  if (opened && await p.$('#q_phone')) {
    await p.fill('#q_name', 'جديد'); await p.fill('#q_name_en', 'Jadeed'); await p.selectOption('#q_type', { index: 1 }); await p.fill('#q_url', 'https://www.tiktok.com/@acq_new_one');
    await reset(); await p.click('#q_send'); await p.waitForTimeout(400);
    ok(!(await writes()).some(x => x.t === 'influencers') && /ناقص: .*الجوال/.test(await toast()), 'الاستقطاب بدون جوال: ما ينحفظ', await toast());
    await p.fill('#q_phone', '0541489788'); await reset(); await p.click('#q_send'); await p.waitForTimeout(500);
    ok(!(await writes()).some(x => x.t === 'influencers') && /رقم الجوال مسجّل/.test(await toast()), 'الاستقطاب بجوال مسجّل: ينمنع', await toast());
    await p.fill('#q_phone', '0559998888'); await p.check('input[data-plat="q"][value="ig"]'); await p.waitForTimeout(150);
    ok(!(await p.$eval('[data-for="ig"]', e => e.hidden)), 'اختيار انستقرام يظهر خانة يوزره');
    await reset(); await p.click('#q_send'); await p.waitForTimeout(400);
    ok(/يوزر انستقرام/.test(await toast()), 'انستقرام مختار بدون يوزر: ناقص', await toast());
    await p.fill('#q_ig', 'https://www.instagram.com/brand_new_ig'); await reset(); await p.click('#q_send'); await p.waitForTimeout(700);
    const ai = (await writes()).find(x => x.t === 'influencers' && x.op === 'insert');
    ok(ai && ai.p.phone === '+966559998888' && ai.p.ig_user && /انستقرام/.test(ai.p.platforms || ''), 'الاستقطاب المكتمل ينحفظ بالجوال والمنصات', ai && JSON.stringify({ ph: ai.p.phone, ig: ai.p.ig_user, pl: ai.p.platforms }));
  } else ok(false, 'نافذة الاستقطاب ما فيها خانة الجوال');
  await p.screenshot({ path: '/tmp/identity_acq.png' });
  await b.close(); console.log(errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors'); console.log(`${pass} pass, ${fail} fail`); process.exit(fail || errs.length ? 1 : 0);
})();
