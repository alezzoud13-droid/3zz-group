/* فحص التحديث 22 في الواجهة: توزيع الحصص بالعدد أو بالمبلغ، وحد الصرف لكل موظف.
   يشتغل على قاعدة البيانات الوهمية ولا يتصل بـ Supabase.
   التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/quota.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
/* حملة الاختبار: توزيع بالعدد والمبلغ، سقف 10000، وريم حدها 4000 */
const PATCH = "(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),DB=fx.db,P=fx.personas||{};"
  + "var c=DB.campaigns[1]||DB.campaigns[0]; c.quota_mode='both'; c.budget=10000; c.target_total=20; window.__campB=c.id;"
  + "DB.deals.forEach(function(d){ if(d.campaign_id===c.id && !d.closed_at) d.closed_at='2026-11-01T00:00:00.000Z'; });"
  + "DB.quotas.length=0;"
  + "DB.quotas.push({campaign_id:c.id,member_id:P.creator,quota:5,quota_budget:4000,updated_by:P.admin,updated_at:n});"
  + "DB.quotas.push({campaign_id:c.id,member_id:P.creator2,quota:5,quota_budget:3000,updated_by:P.admin,updated_at:n});"
  + "return fx;};})();";
const BODY = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\n;\n' + PATCH + '\n;\n' + fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' → ' + x : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (persona, hash) => {
    const c = await b.newContext({ viewport: { width: 1400, height: 950 } });
    await c.route('**/*', r => {
      const u = r.request().url();
      if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: BODY });
      if (/xlsx/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      if (u.startsWith(APP_URL)) return r.continue();
      return r.abort();
    });
    await c.addInitScript(p => { window.__PERSONA = p; }, persona);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(persona + ': ' + e.message));
    await p.clock.setFixedTime(new Date('2026-11-11T08:00:00.000Z'));
    await p.goto(APP_URL + 'index.html' + hash);
    await p.waitForFunction(() => !document.getElementById('appView').hidden, null, { timeout: 15000 });
    await p.waitForTimeout(500); return p;
  };
  const writes = p => p.evaluate(() => window.__writes.map(w => ({ t: w.table, op: w.op, p: w.payload })));
  const reset = p => p.evaluate(() => { window.__writes.length = 0; });
  const toast = p => p.$eval('#toast', e => e.hidden ? '' : e.innerText).catch(() => '');

  /* ===== عبدالمحسن: جدول الحصص ===== */
  let p = await open('admin', '#camps'); const C = await p.evaluate(() => window.__campB);
  const box = '#cList [data-camp="' + C + '"]';
  ok(await p.$(box + ' [data-qb]') !== null, 'جدول الحصص فيه خانة حصة الصرف');
  const th = await p.$$eval(box + ' thead th', E => E.map(e => e.innerText).join('|'));
  ok(th.includes('حصة الصرف') && th.includes('صرف شغّال') && th.includes('الحصة (عدد)'), 'أعمدة العدد والمبلغ والصرف كلها ظاهرة', th);
  const qbs = await p.$$(box + ' [data-qb]');
  await qbs[1].fill('7000'); await reset(p); await p.click(box + ' [data-qsave]'); await p.waitForTimeout(400);
  ok((await writes(p)).length === 0 && /سقف الحملة/.test(await toast(p)), 'توزيع يتجاوز سقف الحملة: ما ينحفظ ويطلع تحذير');
  await qbs[1].fill('6000'); await reset(p); await p.click(box + ' [data-qsave]'); await p.waitForTimeout(500);
  const w = (await writes(p)).find(x => x.t === 'quotas');
  ok(!!w && Array.isArray(w.p) && w.p.some(r => Number(r.quota_budget) === 6000), 'التوزيع داخل السقف ينحفظ ومعه حصة الصرف');
  await p.click(box + ' [data-qeven]'); await p.waitForTimeout(300);
  const even = await p.$$eval(box + ' [data-qb]', E => E.map(e => +e.value));
  ok(even.reduce((s, x) => s + x, 0) === 10000, 'وزّع بالتساوي: مجموع حصص الصرف = سقف الحملة', even.join(' + '));
  /* حملة على الوضع القديم (بالعدد فقط): ما يظهر فيها شي عن المبلغ */
  const A = await p.evaluate(() => { const c = (window.__fake.db.campaigns || []).find(x => x.id !== window.__campB); return c && c.id; });
  if (A) { const ab = '#cList [data-camp="' + A + '"]';
    const athA = await p.$$eval(ab + ' thead th', E => E.map(e => e.innerText).join('|')).catch(() => '');
    ok(await p.$(ab + ' [data-qb]') === null && !/حصة الصرف|صرف شغّال/.test(athA), 'حملة «بالعدد فقط»: جدولها ما تغيّر', athA); }
  else ok(false, 'ما لقيت حملة ثانية للمقارنة');
  await p.context().close();

  /* ===== صانع المحتوى: الحد يظهر ويمنع التجاوز ===== */
  p = await open('creator', '#camps');
  const btn = '#cList [data-camp="' + C + '"] [data-nom]';
  const btxt = (await p.$eval(btn, e => e.innerText)).replace(/\s+/g, ' ');
  ok(/ريال/.test(btxt), 'زر «رشّح» يعرض حد الصرف', btxt);
  if (A) { const abtn = '#cList [data-camp="' + A + '"] [data-nom]';
    const at = await p.$eval(abtn, e => e.innerText).catch(() => '');
    ok(!!at && !/ريال/.test(at), 'حملة «بالعدد فقط»: زر الترشيح بالعدد زي قبل', at.replace(/\s+/g, ' ')); }
  await p.click(btn); await p.waitForTimeout(600);
  const head = await p.$eval('#ov .modal', e => e.innerText);
  ok(/حدك في الصرف/.test(head) && /4,000/.test(head), 'نموذج الترشيح يعرض الحد والصرف والباقي');
  const fill = async (n, price) => {
    const c = '#cn_cards [data-card="' + n + '"]';
    await p.check(c + ' input[data-plat][value="tt"]'); await p.fill(c + ' [data-f="url"]', 'https://www.tiktok.com/@qb_test_' + n);
    await p.fill(c + ' [data-f="phone"]', '05500000' + String(n).padStart(2, '0')); await p.fill(c + ' [data-f="name_en"]', 'Mu ' + n);
    await p.fill(c + ' [data-f="name"]', 'مؤثر ' + n);
    await p.selectOption(c + ' [data-f="acc_type"]', { index: 1 });
    await p.fill(c + ' [data-f="price"]', String(price));
    const pb = await p.$(c + ' [data-f="price_before"]'); if (pb) await pb.fill(String(price + 100));
    await p.check(c + ' [data-plat="c' + n + '"][value="tt"]');
  };
  await fill(1, 3000); await fill(2, 2000);
  await reset(p); await p.click('#cn_send'); await p.waitForTimeout(800);
  ok((await writes(p)).filter(x => x.t === 'deals').length === 0 && /حدك/.test(await toast(p)), 'إرسال مجموعه 5000 وحدها 4000: ينرفض قبل أي حفظ', await toast(p));
  await p.fill('#cn_cards [data-card="2"] [data-f="price"]', '900');
  await reset(p); await p.click('#cn_send'); await p.waitForTimeout(1200);
  const sent = (await writes(p)).filter(x => x.t === 'deals');
  ok(sent.length >= 2, 'إرسال مجموعه 3900 داخل الحد: ينحفظ', sent.length + ' عملية حفظ');
  await p.context().close();

  /* ===== طلب الزيادة بالعدد والمبلغ ===== */
  p = await open('creator', '#camps');
  await p.click(btn); await p.waitForTimeout(600); await p.click('#cn_more'); await p.waitForTimeout(400);
  ok(await p.$('#rq_b') !== null && await p.$('#rq_n') !== null, 'طلب الزيادة يسأل عن العدد والمبلغ');
  await p.fill('#rq_n', '1'); await p.fill('#rq_b', '1500'); await reset(p);
  await p.click('.ov.top [data-y]'); await p.waitForTimeout(400);
  ok((await writes(p)).filter(x => x.t === 'requests').length === 0 && /السبب/.test(await toast(p)), 'الطلب بدون سبب: ما ينرسل');
  await p.fill('#rq_w', 'عندي حسابين أسعارهم أعلى'); await reset(p); await p.click('.ov.top [data-y]'); await p.waitForTimeout(600);
  const rq = (await writes(p)).find(x => x.t === 'requests');
  ok(!!rq && rq.p.qty === 1 && Number(rq.p.qty_budget) === 1500, 'الطلب ينحفظ بالعدد والمبلغ', rq ? rq.p.title : 'ما انحفظ');
  await p.context().close();

  ok(errs.length === 0, 'لا أخطاء JavaScript', errs[0] || '');
  console.log('\n' + pass + ' ناجح، ' + fail + ' فاشل');
  await b.close(); process.exit(fail ? 1 : 0);
})();
