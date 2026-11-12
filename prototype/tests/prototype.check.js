/* فحص النموذج المعزول: يشتغل على prototype/index.html فقط وما يلمس الموقع ولا قاعدة البيانات.
   التشغيل: python3 -m http.server 8765 (من جذر المستودع) ثم: node prototype/tests/prototype.check.js
   يحتاج Playwright مثبّت على الجهاز. */
const { chromium } = require('playwright');
const URL = process.env.PROTO_URL || 'http://localhost:8765/prototype/index.html';
const SHOTS = process.env.SHOTS_DIR || '';
let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (w, h, scheme, hash) => { const c = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme || 'light', deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: w < 900 }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL + '#' + (hash || 'mine')); await p.waitForTimeout(600); return p; };
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const shot = async (p, n) => { if (!SHOTS) return; await p.evaluate(() => document.activeElement && document.activeElement.id !== 'sideClose' && document.activeElement.blur()); await p.screenshot({ path: SHOTS + '/' + n + '.png' }); };
  const who = async (p, k) => { await p.selectOption('#who', k); await p.waitForTimeout(150); };

  /* ===== اللابتوب ===== */
  let p = await open(1440, 900);
  ok(await p.$eval('#side', e => Math.round(e.getBoundingClientRect().width)) === 232, 'الشريط الجانبي الموسّع عرضه 232');
  ok(await p.$eval('#menu', e => getComputedStyle(e).display) === 'none', 'زر القائمة مخفي على اللابتوب');
  for (const k of ['reem', 'metab', 'abdul']) { await who(p, k); ok(await overflow(p) === 0, `لابتوب: لا تمرير أفقي (${k})`); }
  await who(p, 'metab'); await shot(p, 'v2_desktop');
  await who(p, 'metab');
  ok(await p.$eval('#nav2', e => e.hidden), 'المشرف: مجموعة الإدارة مخفية (مثل الصلاحيات الحالية)');
  ok(await p.$$eval('.sechead h2', e => e.map(x => x.innerText).join('|')) === 'ابدأ من هنا|ينتظر اعتمادك|شغلك كصانع محتوى', 'المشرف: الاعتمادات قبل شغله الشخصي');
  ok(await p.$$eval('.row', R => R.every(r => r.querySelectorAll('.btn.act').length === 1 && r.querySelectorAll('[data-more]').length === 1)), 'كل مهمة لها إجراء أساسي واحد وقائمة «⋯» وحدة');
  const n0 = await p.$$eval('[data-g=appr] .row', e => e.length);
  await p.click('[data-g=appr] .row [data-more]');
  ok(await p.$eval('[data-g=appr] .row [data-more]', e => e.getAttribute('aria-expanded')) === 'true' && await p.evaluate(() => document.activeElement.getAttribute('role')) === 'menuitem', 'قائمة «⋯» تنفتح والتركيز على أول عنصر');
  await p.keyboard.press('ArrowDown'); ok(await p.evaluate(() => document.activeElement.innerText) === 'افتح حساب المؤثر ↗', 'السهم ينقل بين عناصر القائمة');
  await p.keyboard.press('Escape'); ok(await p.evaluate(() => document.activeElement.hasAttribute('data-more') && document.querySelectorAll('.pop:not([hidden])').length === 0), 'Esc يقفل القائمة ويرجّع التركيز لزرها');
  await p.click('[data-g=appr] .row .btn.act'); ok(await p.$$eval('[data-g=appr] .row', e => e.length) === n0 - 1, 'الإجراء الأساسي «اعتماد» يشيل المهمة من القائمة');
  await p.click('[data-g=appr] [data-all]'); await p.click('[data-g=appr] [data-bulk]'); ok(await p.$('[data-g=appr]') === null, 'الإجراء الجماعي للمحدد يشتغل');
  await p.click('.row .t'); ok(await p.$eval('#sheet', e => !e.hidden) && await p.evaluate(() => document.activeElement.id) === 'sx', 'عنوان المهمة يفتح لوحة التفاصيل والتركيز داخلها');
  await p.keyboard.press('Escape'); ok(await p.$eval('#sheet', e => e.hidden) && await p.evaluate(() => document.activeElement.classList.contains('t')), 'Esc يقفل اللوحة ويرجّع التركيز');
  await p.goto(URL + '#dash'); await p.waitForTimeout(200); ok(await p.$eval('#pTitle', e => e.innerText) === 'مهامي', 'غير المدير ما يفتح لوحة الأداء');
  await who(p, 'abdul'); ok(!(await p.$eval('#nav2', e => e.hidden)) && await p.$('table') !== null, 'المدير: الإدارة ظاهرة وملخص الفريق موجود');
  await who(p, 'reem'); ok(await p.$eval('#page', e => e.innerText.includes('حصصك وتقريرك')) && await p.$eval('#nav2', e => e.hidden), 'الموظف: شغله وحصته وتقريره فقط');
  for (const m of ['load', 'empty', 'err']) { await p.selectOption('#mode', m); await p.waitForTimeout(100); ok(await p.$eval('#page', (e, m) => m === 'load' ? !!e.querySelector('[aria-busy]') : !!e.querySelector('.state'), m), 'حالة الصفحة: ' + m); }
  await p.selectOption('#mode', 'data');
  await p.click('#sideMini'); await p.waitForTimeout(100);
  ok(await p.$eval('#side', e => Math.round(e.getBoundingClientRect().width)) === 64 && await p.$eval('#sideMini', e => e.getAttribute('aria-pressed')) === 'true', 'الشريط المصغّر عرضه 64');
  ok(await p.$eval('#nav1 a', e => e.title) === 'مهامي', 'المصغّر: اسم الصفحة يظهر كتلميح');
  await who(p, 'metab'); await shot(p, 'v2_desktop_mini');
  await p.reload(); await p.waitForTimeout(400); ok(await p.$eval('#app', e => e.classList.contains('mini')), 'وضع الشريط ينحفظ بعد تحديث الصفحة');
  await p.click('#sideMini'); await p.context().close();
  p = await open(1440, 900, 'dark'); ok(await overflow(p) === 0 && await p.$eval('body', e => getComputedStyle(e).backgroundColor) === 'rgb(15, 21, 19)', 'الوضع الداكن يشتغل بدون تمرير أفقي');
  await shot(p, 'v2_desktop_dark'); await p.context().close();

  /* ===== الجوال ===== */
  p = await open(390, 844);
  for (const k of ['reem', 'abdul', 'metab']) { await who(p, k); ok(await overflow(p) === 0, `جوال: لا تمرير أفقي (${k})`); }
  ok(await p.$eval('#side', e => getComputedStyle(e).visibility) === 'hidden', 'الدرج مقفول: مخفي وما ياخذ تركيز');
  await shot(p, 'v2_mobile_closed');
  const small = await p.$$eval('.page button, .page a.btn, .page select, .page input[type=search], .top button', E => E.filter(e => e.offsetParent !== null && !e.classList.contains('t') && e.getBoundingClientRect().height < 44).map(e => (e.innerText || e.id) + ':' + Math.round(e.getBoundingClientRect().height)));
  ok(small.length === 0, 'جوال: كل الأزرار وعناصر الإدخال بارتفاع 44 أو أكثر' + (small.length ? ' → ' + small.slice(0, 5).join(', ') : ''));
  ok(await p.$$eval('.ck', E => E.every(e => e.getBoundingClientRect().height >= 44 && e.getBoundingClientRect().width >= 36)), 'جوال: منطقة لمس مربع التحديد 36×44 أو أكثر');
  await p.click('#menu'); await p.waitForTimeout(350);
  ok(await p.evaluate(() => document.activeElement.id === 'sideClose' && document.getElementById('side').getAttribute('aria-modal') === 'true' && document.getElementById('mainEl').inert && !document.getElementById('shade').hidden), 'الدرج مفتوح: تعتيم، تركيز على زر الإغلاق، والمحتوى خلفه معطّل');
  ok(await p.$eval('#side', e => { const r = e.getBoundingClientRect(); return Math.round(r.right) === innerWidth && r.left > 0; }), 'الدرج ينفتح من اليمين (RTL)');
  await shot(p, 'v2_mobile_open');
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.getElementById('side').contains(document.activeElement)), 'Tab يبقى محبوس داخل الدرج');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(await p.evaluate(() => document.activeElement.id === 'menu' && !document.getElementById('side').classList.contains('open') && !document.getElementById('mainEl').inert), 'Esc يقفل الدرج ويرجّع التركيز لزر القائمة');
  await p.click('#menu'); await p.waitForTimeout(300); await p.mouse.click(20, 400); await p.waitForTimeout(300); ok(await p.$eval('#side', e => !e.classList.contains('open')), 'الضغط على التعتيم يقفل الدرج');
  await p.click('#menu'); await p.waitForTimeout(300); await p.click('#nav1 a[href="#req"]'); await p.waitForTimeout(300); ok(await p.$eval('#pTitle', e => e.innerText) === 'الطلبات' && await p.$eval('#side', e => !e.classList.contains('open')), 'اختيار صفحة من الدرج ينقل ويقفله');
  await p.context().close();
  p = await open(390, 844, 'dark'); ok(await overflow(p) === 0, 'جوال داكن: لا تمرير أفقي'); await p.context().close();
  p = await open(320, 640); ok(await overflow(p) === 0, 'أصغر جوال (320): لا تمرير أفقي'); await p.context().close();

  /* ===== التباين (AA = 4.5 للنص) ===== */
  const P = [['نص أساسي', '#17231F', '#F6F8F7'], ['نص ثانوي على الخلفية', '#55635E', '#F6F8F7'], ['نص ثانوي على سطح غائر', '#55635E', '#EDF1EF'], ['نص الشريط الجانبي', '#EAF1EE', '#1D3931'], ['زر أساسي ذهبي غامق', '#FFFFFF', '#8A6220'], ['إجراء المهمة', '#7D5819', '#F4EAD7'], ['شارة متأخر', '#B3372B', '#FBE4E1'], ['شارة آخر يوم', '#7A5600', '#FBF1D6'], ['عدّاد الشريط', '#1D3931', '#EAF1EE'],
    ['داكن: نص أساسي', '#E6ECE9', '#0F1513'], ['داكن: نص ثانوي', '#9BA8A2', '#161D1A'], ['داكن: نص ثانوي على سطح غائر', '#9BA8A2', '#1E2723'], ['داكن: زر أساسي', '#1A1408', '#D2A24C'], ['داكن: إجراء المهمة', '#E0B463', '#33280F'], ['داكن: شارة متأخر', '#EC8377', '#3D1F1B'], ['داكن: شارة آخر يوم', '#E0B445', '#382E14']];
  for (const [n, a, c] of P) ok(cr(a, c) >= 4.5, `تباين ${cr(a, c).toFixed(2)} — ${n}`);
  ok(errs.length === 0, 'لا أخطاء JavaScript' + (errs.length ? ': ' + errs[0] : ''));
  console.log(`\n${pass} ناجح، ${fail} فاشل`); await b.close(); process.exit(fail ? 1 : 0);
})();
