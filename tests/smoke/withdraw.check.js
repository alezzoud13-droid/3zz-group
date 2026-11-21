/* فحص قواعد 12 نوفمبر: (1) كشف الدفع ينزّل المحدد والمعتمد للدفع فقط. (2) ممنوع الانتقال بين المراحل والمبلغ ناقص.
   يشتغل على قاعدة البيانات الوهمية مع ترشيحين بدون مبلغ. التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/rules.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const PATCH = `(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),D=fx.db.deals,me=fx.personas||{};
  var open=function(d){return d.approval==='approved'&&!d.closed_at&&!d.paid_at&&!d.no_pay;};
  D.forEach(function(d){d.pay_terms=null;d.wd_req_at=null;d.wd_ok_at=null;d.replaces_id=null;d.wd_reason='';d.wd_product='';d.wd_reject='';d.pay_note='';});
  var w=D.filter(function(d){return open(d)&&d.member_id===me.creator&&d.shipped_at;})[0]||D.filter(function(d){return open(d)&&d.member_id===me.creator;})[0]; if(w){window.__wd=w.id;}
  var r=D.filter(function(d){return open(d)&&d.member_id===me.creator&&d.id!==(w&&w.id);})[0]; if(r){r.wd_req_at='2026-11-10T08:00:00.000Z';r.wd_req_by=me.creator;r.wd_reason='المؤثر اعتذر';window.__wdReq=r.id;}
  var c=D.filter(function(d){return d.member_id===me.creator&&d.approval==='approved'&&d.id!==(w&&w.id)&&d.id!==(r&&r.id);})[0]; if(c){c.closed_at='2026-11-10T09:00:00.000Z';c.wd_req_at='2026-11-09T09:00:00.000Z';c.wd_ok_at='2026-11-10T09:00:00.000Z';c.wd_ok_by=me.approver;c.wd_reason='تغيّر الاتفاق';c.closed_reason='انسحب من الحملة: تغيّر الاتفاق';window.__wdDone=c.id;window.__wdCamp=c.campaign_id;}
  return fx;};})();`;
const BODY = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\n;\n' + PATCH + '\n;\n' + fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (persona, hash) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('**/*', r => { const u = r.request().url(); if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: BODY }); if (/xlsx/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); if (u.startsWith(APP_URL)) return r.continue(); return r.abort(); });
    await c.addInitScript(p => { window.__PERSONA = p; }, persona);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(persona + ': ' + e.message)); await p.clock.setFixedTime(new Date('2026-11-11T08:00:00.000Z'));
    await p.goto(APP_URL + 'index.html' + hash); await p.waitForFunction(() => !document.getElementById('appView').hidden, null, { timeout: 15000 }); await p.waitForTimeout(400); return p; };
  const nW = p => p.evaluate(() => window.__writes.filter(w => w.table === 'deals').length), reset = p => p.evaluate(() => { window.__writes.length = 0; window.__exports.length = 0; });
  const toast = p => p.$eval('#toast', e => e.hidden ? '' : e.innerText), dlg = p => p.$('.ov.top');
  const M = '#mineBody';
  const lastW = p => p.evaluate(() => window.__writes.filter(w => w.table === 'deals').slice(-1)[0]);
  const answer = async (p, text) => { await p.waitForSelector('.ov.top #rsn'); await p.fill('.ov.top #rsn', text); await p.click('.ov.top [data-y]'); await p.waitForTimeout(250); };
  const openD = (p, id) => p.evaluate(id => { const b = document.querySelector(`[data-open="${id}"]`); if (b) { b.click(); return true; } return false; }, id);

  /* صانع المحتوى: طلب انسحاب */
  let p = await open('creator', '#mine'); const wd = await p.evaluate(() => window.__wd);
  await p.evaluate(id => { location.hash = '#mine'; }, wd);
  const opened = await p.evaluate(id => { const d = (window.__fake && window.__fake.db.deals || []).find(x => x.id === id); return !!d; }, wd);
  await p.evaluate(id => window.dispatchEvent(new CustomEvent('x')), wd);
  let has = await openD(p, wd); if (!has) { await p.goto(p.url().split('#')[0] + '#pipe'); await p.waitForTimeout(500); has = await openD(p, wd); }
  await p.waitForTimeout(400);
  ok(await p.$('[data-act="close"]') === null, 'الملف المعتمد: زر «إغلاق الملف» اختفى عن صاحبه');
  ok(await p.$('[data-act="wdreq"]') !== null, 'الملف المعتمد: زر «طلب انسحاب من الحملة» ظاهر');
  await reset(p); await p.click('[data-act="wdreq"]'); await answer(p, 'المؤثر اعتذر');
  if (await p.$('.ov.top #rsn')) await answer(p, 'يبقى عنده');
  await p.waitForTimeout(300); let w = await lastW(p);
  ok(w && w.payload && w.payload.wd_req_at && w.payload.wd_reason === 'المؤثر اعتذر', 'طلب الانسحاب ينحفظ بسببه');
  await p.screenshot({ path: '/tmp/wd_creator.png' });
  if (await p.$('#dClose')) await p.click('#dClose').catch(() => {});   await p.goto(p.url().split('#')[0] + '#mine'); await p.waitForTimeout(500);
  const done = await p.evaluate(() => window.__wdDone);
  ok(await p.$(`${M} [data-g="replace"] [data-repl="${done}"]`) !== null, 'بعد اعتماد الانسحاب: يطلع لصاحب الملف «رشّح بديل»');
  await p.click(`${M} [data-repl="${done}"]`); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!document.querySelector('.ov [data-card]')), '«رشّح بديل» يفتح نافذة الترشيح لنفس الحملة');
  await p.context().close();

  /* المعتمد: يعتمد الانسحاب */
  p = await open('approver', '#mine'); const rq = await p.evaluate(() => window.__wdReq);
  ok(await p.$(`${M} [data-g="wd_review"]`) !== null, 'المعتمد يشوف «طلبات انسحاب تنتظر اعتمادك»');
  await p.screenshot({ path: '/tmp/wd_approver.png' });
  await p.click(`${M} [data-g="wd_review"] [data-open="${rq}"]`); await p.waitForTimeout(400);
  await reset(p); await p.click('[data-act="wdok"]'); await p.waitForSelector('.ov.top #wdc');
  await p.click('.ov.top [data-y]'); await p.waitForTimeout(250); ok(await nW(p) === 0 && !!(await p.$('.ov.top #wdc')), 'اعتماد الانسحاب بدون سبب: ما ينحفظ');
  await p.selectOption('.ov.top #wdc', 'company'); await p.click('.ov.top [data-y]'); await p.waitForTimeout(400);
  w = await lastW(p); ok(w && w.payload && w.payload.wd_ok_at && w.payload.closed_at, 'اعتماد الانسحاب يقفل الملف');
  ok(w && w.payload && w.payload.wd_cause === 'company', 'اعتماد الانسحاب يحفظ السبب (قرار الشركة)');
  await p.click('#dClose'); await p.waitForTimeout(300);
  /* مدفوع سابقاً / بعقد */
  const tid = await p.$eval(`${M} [data-g="terms"] [data-terms]`, e => e.dataset.terms).catch(() => null);
  if (tid) { await reset(p); await p.selectOption(`${M} [data-terms="${tid}"]`, 'prepaid'); await answer(p, 'عقد 3 إعلانات دُفع 1 نوفمبر'); await p.waitForTimeout(300);
    w = await lastW(p); ok(w && w.payload && w.payload.pay_terms === 'prepaid' && /عقد 3/.test(w.payload.pay_note), '«مدفوع سابقاً / بعقد» ينحفظ مع ملاحظة العقد'); } else ok(false, 'قائمة طريقة الدفع فاضية');
  await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: '/tmp/wd_mobile.png' });
  await p.context().close();
  await b.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
