/* فحص الإضافات الخاصة بالتصميم الجديد (غير موجودة في الكود القديم، فما لها أساس في baseline.json):
   الاعتماد الفردي المباشر من صف المهمة، تأكيد «انشحن/وصل» داخل الملف، سطر الأرقام كتصفية، «ابدأ من هنا»، الهيكل ودرج الجوال، وعزل intake.html.
   يشتغل على نفس قاعدة البيانات الوهمية. التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/redesign.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const BODY = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (persona, hash, w, h, scheme) => {
    const c = await b.newContext({ viewport: { width: w || 1440, height: h || 900 }, colorScheme: scheme || 'light', hasTouch: (w || 1440) < 900 });
    await c.route('**/*', r => { const u = r.request().url(); if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: BODY }); if (/xlsx/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); if (u.startsWith(APP_URL)) return r.continue(); return r.abort(); });
    await c.addInitScript(p => { window.__PERSONA = p; }, persona);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(persona + ' ' + hash + ': ' + e.message));
    await p.clock.setFixedTime(new Date('2026-11-11T08:00:00.000Z'));
    await p.goto(APP_URL + 'index.html' + hash); await p.waitForFunction(() => !document.getElementById('appView').hidden, null, { timeout: 15000 }); await p.waitForTimeout(400); return p;
  };
  const writes = p => p.evaluate(() => window.__writes.filter(w => w.op !== 'rpc' && !/^auth/.test(w.table || '')).map(w => ({ t: w.table, op: w.op, keys: Object.keys(w.payload || {}).sort().join(',') })));
  const reset = p => p.evaluate(() => { window.__writes.length = 0; });
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  /* ---- المعتمد: اعتماد فردي مباشر من الصف ---- */
  let p = await open('approver', '#mine');
  ok(await p.$eval('#side', e => Math.round(e.getBoundingClientRect().width)) === 232, 'الشريط الجانبي 232');
  ok(await p.$$eval('#tabs a.adm', E => E.every(e => e.hidden)), 'المعتمد: لوحة الأداء والإعدادات مخفية (نفس الصلاحيات)');
  ok(await p.$eval('#tabs a.on', e => e.getAttribute('aria-current') === 'page' && e.dataset.v === 'mine'), 'الصفحة الحالية معلّمة لقارئ الشاشة');
  const btn = '#mineBody [data-g="appr"] [data-ap1]'; const n0 = await p.$$eval('#mineBody [data-g="appr"] .qrow', e => e.length); const id = await p.$eval(btn, e => e.dataset.ap1);
  await reset(p);
  await p.evaluate(sel => { const e = document.querySelector(sel); e.click(); e.click(); }, btn);       // ضغطتين ورا بعض
  await p.waitForTimeout(600);
  const W = await writes(p);
  ok(W.length === 1 && W[0].t === 'deals' && W[0].op === 'update' && W[0].keys === 'approval,approved_at,approved_by,decision_reason', 'اعتماد فردي: حفظ واحد فوري بنفس حقول الاعتماد الجماعي، وضغطتين = حفظ واحد → ' + JSON.stringify(W));
  ok(await p.$('.ov.top') === null, 'اعتماد فردي: بدون نافذة تأكيد');
  ok(await p.$$eval('#mineBody [data-g="appr"] .qrow', e => e.length) === n0 - 1 && await p.$(`#mineBody [data-ap1="${id}"]`) === null, 'بعد نجاح الحفظ: المهمة طلعت من قائمتها ومن «ابدأ من هنا»');
  const n1 = await p.$$eval('#mineBody [data-g="appr"] .qrow', e => e.length);
  /* الاعتماد الجماعي ما زال بتأكيد */
  await reset(p); await p.check('#mineBody [data-g="appr"] [data-bulk]'); await p.click('#mineBody [data-dobulk="appr"]');
  ok(await p.$('.ov.top [data-y]') !== null && (await writes(p)).length === 0, 'اعتماد جماعي: نافذة تأكيد، ولا حفظ قبلها');
  await p.click('.ov.top [data-n]'); ok((await writes(p)).length === 0 && await p.$$eval('#mineBody [data-g="appr"] .qrow', e => e.length) === n1, 'إلغاء التأكيد: لا حفظ');
  /* التصفية و«ابدأ من هنا» */
  const total = await p.$eval('[data-mf="all"] b', e => +e.innerText), late = await p.$eval('[data-mf="late"] b', e => +e.innerText);
  ok(await p.$eval('#mineCnt', e => +e.innerText) >= total && total > 0, 'العدّاد ما يحسب مهام «ابدأ من هنا» مرتين (الإجمالي ' + total + ')');
  await p.click('[data-mf="late"]'); await p.waitForTimeout(150);
  ok(await p.$eval('[data-mf="late"]', e => e.getAttribute('aria-pressed')) === 'true' && await p.$('[data-top]') === null && await p.$$eval('#mineBody [data-g] .qrow', (E, n) => E.length > 0, late), 'تصفية «متأخرة» تشتغل وتخفي «ابدأ من هنا»');
  await p.click('[data-mf="late"]'); await p.waitForTimeout(150); ok(await p.$eval('[data-mf="all"]', e => e.getAttribute('aria-pressed')) === 'true', 'ضغطة ثانية ترجّع كل المهام');
  await p.context().close();

  /* ---- الشحن داخل الملف: تأكيد مختصر ---- */
  p = await open('shipper', '#mine');
  await p.click('#mineBody [data-g="ship_send"] [data-open]'); await p.waitForTimeout(250); await reset(p);
  await p.click('[data-act="shipped"]'); await p.waitForTimeout(200);
  ok(await p.$('.ov.top [data-y]') !== null && (await writes(p)).length === 0, 'انشحن اليوم: نافذة تأكيد، ولا حفظ قبلها');
  await p.click('.ov.top [data-n]'); await p.waitForTimeout(200); ok((await writes(p)).length === 0, 'إلغاء تأكيد الشحن: لا حفظ');
  await p.click('[data-act="shipped"]'); await p.click('.ov.top [data-y]'); await p.waitForTimeout(400); ok((await writes(p)).length === 1, 'بعد التأكيد: حفظ واحد');
  await p.context().close();

  /* ---- الميديا باير: «انطلق» مباشر ---- */
  p = await open('media', '#mine'); await reset(p);
  await p.click('#mineBody [data-launch]'); await p.waitForTimeout(500);
  ok(await p.$('.ov.top') === null && (await writes(p)).length >= 1, 'انطلق: مباشر بدون تأكيد');
  await p.context().close();

  /* ---- المدير: الإدارة ظاهرة ---- */
  p = await open('admin', '#dash'); ok(await p.$eval('#v-dash', e => !e.hidden) && await p.$$eval('#tabs a.adm', E => E.every(e => !e.hidden)), 'المدير: لوحة الأداء والإعدادات ظاهرة');
  await p.click('#sideMini'); ok(await p.$eval('#side', e => Math.round(e.getBoundingClientRect().width)) === 64, 'الشريط المصغّر 64'); await p.reload(); await p.waitForTimeout(600); ok(await p.$eval('#app', e => e.classList.contains('mini')), 'وضع الشريط ينحفظ'); await p.click('#sideMini');
  for (const v of ['mine', 'acq', 'camps', 'pipe', 'req', 'today', 'dash', 'setup']) { await p.goto(APP_URL + 'index.html#' + v); await p.waitForTimeout(300); ok(await overflow(p) === 0, 'لابتوب: لا تمرير أفقي في ' + v); }
  await p.context().close();

  /* ---- الجوال ---- */
  for (const persona of ['admin', 'creator']) { p = await open(persona, '#mine', 390, 844);
    for (const v of persona === 'admin' ? ['mine', 'acq', 'camps', 'pipe', 'req', 'today', 'dash', 'setup'] : ['mine', 'acq', 'camps', 'pipe', 'req', 'today']) { await p.goto(APP_URL + 'index.html#' + v); await p.waitForTimeout(300); ok(await overflow(p) === 0, `جوال (${persona}): لا تمرير أفقي في ${v}`); }
    await p.context().close(); }
  p = await open('approver', '#mine', 390, 844);
  ok(await p.$eval('#side', e => getComputedStyle(e).visibility) === 'hidden', 'جوال: الدرج مقفول ومخفي');
  await p.click('#menu'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement.id === 'sideClose' && document.getElementById('mainEl').inert && !document.getElementById('shade').hidden && document.getElementById('side').getAttribute('aria-modal') === 'true'), 'جوال: الدرج مفتوح بتعتيم والتركيز داخله');
  for (let i = 0; i < 14; i++) await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.getElementById('side').contains(document.activeElement)), 'جوال: التركيز محبوس داخل الدرج');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(await p.evaluate(() => document.activeElement.id === 'menu' && !document.getElementById('side').classList.contains('open')), 'جوال: Esc يقفل الدرج ويرجّع التركيز');
  await p.click('#menu'); await p.waitForTimeout(250); await p.click('#tabs a[data-v="req"]'); await p.waitForTimeout(300); ok(await p.$eval('#v-req', e => !e.hidden) && await p.$eval('#side', e => !e.classList.contains('open')), 'جوال: اختيار صفحة ينقل ويقفل الدرج');
  await p.goto(APP_URL + 'index.html#mine'); await p.waitForTimeout(400);
  const more = '#mineBody [data-g="appr"] [data-more]';
  ok(await p.$eval('#mineBody [data-g="appr"] [data-dq="reject"]', e => e.offsetParent === null) && await p.$eval('#mineBody [data-g="appr"] [data-ap1]', e => e.offsetParent !== null), 'جوال: «اعتماد» ظاهر، و«تعديل» و«رفض» داخل «⋯»');
  await p.click(more); ok(await p.$eval(more, e => e.getAttribute('aria-expanded')) === 'true' && await p.$eval('#mineBody [data-g="appr"] [data-dq="reject"]', e => e.offsetParent !== null), 'جوال: «⋯» تفتح الإجراءات الثانوية');
  await p.keyboard.press('Escape'); ok(await p.$eval(more, e => e.getAttribute('aria-expanded')) === 'false', 'جوال: Esc يقفل «⋯»');
  const small = await p.$$eval('#mineBody button, #mineBody a.btn, .top button', E => E.filter(e => e.offsetParent !== null && e.getBoundingClientRect().height < 43.5).map(e => (e.innerText || e.id).slice(0, 14) + ':' + Math.round(e.getBoundingClientRect().height)));
  ok(small.length === 0, 'جوال: أزرار مهامي والشريط العلوي بارتفاع 44 أو أكثر' + (small.length ? ' → ' + small.slice(0, 6).join(', ') : ''));
  await p.context().close();
  p = await open('admin', '#mine', 1440, 900, 'dark'); ok(await p.$eval('body', e => getComputedStyle(e).backgroundColor) === 'rgb(15, 21, 19)' && await overflow(p) === 0, 'الوضع الداكن يشتغل'); await p.context().close();

  /* ---- عزل intake.html ---- */
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'intake.html'), 'utf8');
  ok(/assets\/style\.css/.test(html) && !/ui\.css|ui\.js/.test(html), 'intake.html تحمّل style.css فقط وما تحمّل ملفات التصميم الجديد');
  ok(errs.length === 0, 'لا أخطاء JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} ناجح، ${fail} فاشل`); await b.close(); process.exit(fail ? 1 : 0);
})();
