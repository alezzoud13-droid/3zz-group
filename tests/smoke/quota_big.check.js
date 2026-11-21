/* فحص الحصص الكبيرة (التحديث 22): بطاقات الترشيح تظهر 5 5 بزر «+ أضف بطاقات» — بالعدد لين تخلص الحصة، وبالمبلغ بدون حد عدد.
   يشتغل على قاعدة البيانات الوهمية ولا يتصل بـ Supabase.
   التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/quota.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
/* حملة الاختبار: توزيع بالعدد والمبلغ، سقف 10000، وريم حدها 4000 */
const PATCH = "(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),DB=fx.db,P=fx.personas||{};"
  + "var a=DB.campaigns[0], c=DB.campaigns[1]||DB.campaigns[0]; a.quota_mode='count'; a.target_total=1000; c.quota_mode='budget'; c.budget=2000000; window.__campA=a.id; window.__campB=c.id;"
  + "DB.deals.forEach(function(d){ if((d.campaign_id===c.id||d.campaign_id===a.id) && !d.closed_at) d.closed_at='2026-11-01T00:00:00.000Z'; });"
  + "DB.quotas.length=0;"
  + "DB.quotas.push({campaign_id:a.id,member_id:P.creator,quota:12,quota_budget:null,updated_by:P.admin,updated_at:n});"
  + "DB.quotas.push({campaign_id:c.id,member_id:P.creator,quota:0,quota_budget:1500000,updated_by:P.admin,updated_at:n});"
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
  const p = await open('creator', '#camps');
  const blank = () => p.$$eval('#cn_cards [data-card]', E => E.filter(e => !e.dataset.deal).length);
  const A = await p.evaluate(() => window.__campA), B = await p.evaluate(() => window.__campB);
  await p.evaluate(id => document.querySelector(`[data-nom="${id}"]`).click(), A); await p.waitForTimeout(400);
  ok(await blank() === 5, 'بالعدد (حصة 12): أول 5 بطاقات', String(await blank()));
  await p.click('#cn_add'); await p.waitForTimeout(200); ok(await blank() === 10, '«+ أضف» يزيد 5', String(await blank()));
  await p.click('#cn_add'); await p.waitForTimeout(200); ok(await blank() === 12 && !(await p.$('#cn_add')), 'يوقف عند الحصة (12) ويختفي الزر', String(await blank()));
  await p.fill('#cn_cards [data-card]:nth-child(12) [data-f="name"]', 'اختبار'); await p.waitForTimeout(200);
  ok(await p.$eval('#cn_cards [data-card]:nth-child(12) [data-cst]', e => e.textContent) === 'ناقص', 'البطاقة المضافة تشتغل (تتحسب ناقصة لما تنكتب)');
  await p.click('#cn_x'); await p.waitForTimeout(200);
  await p.evaluate(id => document.querySelector(`[data-nom="${id}"]`).click(), B); await p.waitForTimeout(400);
  ok(await blank() === 5 && /بدون حد عدد/.test(await p.$eval('#cn_left', e => e.textContent)), 'بالمبلغ (1,500,000): 5 بطاقات + «بدون حد عدد»');
  for (let k = 0; k < 8; k++) await p.click('#cn_add'); await p.waitForTimeout(200);
  ok(await blank() === 45, 'بالمبلغ: يقدر يضيف لعدد عالي (45 بطاقة)', String(await blank()));
  await p.screenshot({ path: '/tmp/q_big.png' });
  await b.close(); console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors'); console.log(`${pass} pass, ${fail} fail`); process.exit(fail || errs.length ? 1 : 0);
})();
