/* فحص قواعد 12 نوفمبر: (1) كشف الدفع ينزّل المحدد والمعتمد للدفع فقط. (2) ممنوع الانتقال بين المراحل والمبلغ ناقص.
   يشتغل على قاعدة البيانات الوهمية مع ترشيحين بدون مبلغ. التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/rules.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const PATCH = `(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),D=fx.db.deals,me=fx.personas||{};
  var open=function(d){return d.approval==='approved'&&!d.closed_at&&!d.paid_at&&!d.no_pay;};
  D.forEach(function(d){d.pay_terms=null;});
  var g=D.filter(function(d){return open(d)&&d.member_id===me.creator&&d.video_ok_at&&!d.posted_at&&!d.tt_at&&!d.sn_at&&!d.ig_at;})[0]; if(g){g.pay_terms='before_post';window.__gated=g.id;}
  var a=D.filter(function(d){return open(d)&&d.member_id!==me.approver&&!d.delivered_at&&d.id!==window.__gated;})[0]; if(a){a.pay_terms='advance';window.__adv=a.id;}
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
  /* المعتمد: قائمة «حدد طريقة الدفع» */
  let p = await open('approver', '#mine');
  const n0 = (await p.$$(`${M} [data-g="terms"] [data-terms]`)).length; ok(n0 > 0, `المعتمد يشوف قائمة طريقة الدفع (${n0} ملف)`);
  const tid = await p.$eval(`${M} [data-g="terms"] [data-terms]`, e => e.dataset.terms); await reset(p);
  await p.selectOption(`${M} [data-terms="${tid}"]`, 'before_post'); await p.waitForTimeout(400);
  const w = await lastW(p); ok(w && w.payload && w.payload.pay_terms === 'before_post', 'اختيار «قبل النشر» ينحفظ في الملف');
  ok(await p.$(`${M} [data-terms="${tid}"]`) === null, 'الملف يطلع من القائمة بعد التحديد');
  await p.screenshot({ path: '/tmp/shot_approver_terms.png', fullPage: false });
  await p.click(`${M} [data-g="terms"] [data-open]`); await p.waitForTimeout(400);
  ok(await p.$('#f_pay_terms') !== null, 'داخل الملف: المعتمد يقدر يغيّر طريقة الدفع');
  await p.evaluate(() => document.querySelector('#f_pay_terms').scrollIntoView()); await p.screenshot({ path: '/tmp/shot_modal_desktop.png' });
  await p.context().close();
  /* عبدالمحسن: الدفع المقدم يطلع له قبل النزول */
  p = await open('admin', '#mine'); const adv = await p.evaluate(() => window.__adv);
  ok(!!adv && await p.$(`${M} [data-g="pay"] [data-bulk="${adv}"]`) !== null, 'ملف «مقدم» يستحق دفعه فور الاعتماد ويطلع لعبدالمحسن');
  await p.screenshot({ path: '/tmp/shot_admin_pay.png' }); await p.context().close();
  /* صانع المحتوى: النشر مقفول قبل الدفع */
  p = await open('creator', '#mine'); const gid = await p.evaluate(() => window.__gated);
  if (gid) { await p.evaluate(id => { const b = document.querySelector(`[data-open="${id}"]`); if (b) b.click(); }, gid); await p.waitForTimeout(500);
    ok(await p.$('#f_pay_terms') === null, 'صانع المحتوى ما يقدر يغيّر طريقة الدفع');
    const btn = await p.$('[data-act^="dl_"]');
    if (btn) { await p.evaluate(() => { document.querySelectorAll('[data-act^="dl_"]').forEach(x => { const card = x.closest('.card') || document; card.querySelectorAll('input').forEach(i => { if (!i.value) i.value = 'CODE1'; }); }); }); await reset(p); await btn.click(); await p.waitForTimeout(300);
      ok(await nW(p) === 0 && /يتقفل/.test(await toast(p)), 'النشر قبل الدفع مرفوض برسالة واضحة'); } else ok(false, 'زر تسجيل النزول ما ظهر');
    await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => { const c = [...document.querySelectorAll('.card b')].find(b => b.textContent === 'مسار الدفع'); if (c) c.scrollIntoView(); }); await p.screenshot({ path: '/tmp/shot_modal_mobile.png' });
  } else ok(false, 'ما لقيت ملف مناسب في البيانات الوهمية');
  await b.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(`${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
})();
