/* فحص 21 نوفمبر (بكج الشتاء): الأرقام صافية — المنسحب ينخصم من «معتمد» والمبالغ والشحن، والبديل هو اللي ينحسب،
   والترشيح الجديد ينربط تلقائياً بالانسحاب اللي بدون بديل، والرفض بسبب «كملي البيانات» يقترح «يحتاج تعديل».
   التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/net.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const PATCH = `(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),D=fx.db.deals,me=fx.personas||{};
  D.forEach(function(d){d.wd_req_at=null;d.wd_ok_at=null;d.replaces_id=null;d.wd_cause=null;});
  var c=fx.db.campaigns.filter(function(c){return (c.status||'active')==='active';})[0]; c.budget=1000000; window.__cid=c.id;
  var A=D.filter(function(d){return d.campaign_id===c.id&&d.member_id===me.creator&&d.approval==='approved'&&!d.closed_at;});
  var w=A[0]; w.price=7500; w.shipped_at=w.shipped_at||'2026-11-09T08:00:00.000Z'; w.delivered_at=null; w.wd_req_at='2026-11-10T08:00:00.000Z'; w.wd_req_by=me.creator; w.wd_reason='تم استبداله من قبلكم';
  w.wd_ok_at='2026-11-10T09:00:00.000Z'; w.wd_ok_by=me.approver; w.closed_at='2026-11-10T09:00:00.000Z'; w.closed_reason='انسحب من الحملة: تم استبداله من قبلكم'; window.__wdId=w.id;
  var r=D.filter(function(d){return d.approval==='pending'&&d.sent_at&&!d.closed_at;})[0]; if(r){window.__rej=r.id;}
  fx.db.quotas.forEach(function(q){if(q.campaign_id===c.id&&q.member_id===me.creator)q.quota=Math.max(q.quota||0,A.length+3);});
  return fx;};})();`;
const BODY = fs.readFileSync(path.join(__dirname, 'fixtures.js'), 'utf8') + '\n;\n' + PATCH + '\n;\n' + fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, n, v) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (v !== undefined ? ' → ' + v : '')); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (persona, hash) => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await c.route('**/*', r => { const u = r.request().url(); if (/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: BODY }); if (/xlsx/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }); if (u.startsWith(APP_URL)) return r.continue(); return r.abort(); });
    await c.addInitScript(p => { window.__PERSONA = p; }, persona);
    const p = await c.newPage(); p.on('pageerror', e => errs.push(persona + ': ' + e.message)); await p.clock.setFixedTime(new Date('2026-11-11T08:00:00.000Z'));
    await p.goto(APP_URL + 'index.html' + hash); await p.waitForFunction(() => !document.getElementById('appView').hidden, null, { timeout: 15000 }); await p.waitForTimeout(500); return p; };
  const tile = (p, cid, label) => p.evaluate(([cid, label]) => { const el = [...document.querySelectorAll(`[data-camp="${cid}"] .tile`)].find(t => t.querySelector('.l').innerText.trim() === label); return el ? el.querySelector('.v').innerText.trim() : null; }, [cid, label]);
  const num = s => Number(String(s || '').replace(/[^\d.-]/g, ''));

  /* عبدالمحسن: كرت الحملة صافي */
  let p = await open('admin', '#camps'); const cid = await p.evaluate(() => window.__cid);
  const exp = await p.evaluate(cid => { const D = window.__fake.db.deals.filter(d => d.campaign_id === cid); const A = D.filter(d => d.approval === 'approved'), N = A.filter(d => !d.closed_at);
    return { gross: A.length, net: N.length, spend: N.reduce((s, d) => s + (Number(d.price) || 0), 0), grossSpend: A.reduce((s, d) => s + (Number(d.price) || 0), 0), ship: N.filter(d => !d.delivered_at && !d.no_ship).length }; }, cid);
  ok(exp.gross === exp.net + 1, 'الفكسشر: فيه ملف معتمد منسحب', JSON.stringify(exp));
  ok(num(await tile(p, cid, 'معتمد')) === exp.net, '«معتمد» صافي (ما يحسب المنسحب)', await tile(p, cid, 'معتمد'));
  ok(num(await tile(p, cid, 'مبالغ المعتمدين')) === exp.spend, '«مبالغ المعتمدين» صافية (بدون 7,500 المنسحب)', await tile(p, cid, 'مبالغ المعتمدين'));
  ok(num(await tile(p, cid, 'المتبقي من السقف')) === 1000000 - exp.spend, '«المتبقي من السقف» من الصافي', await tile(p, cid, 'المتبقي من السقف'));
  ok(num(await tile(p, cid, 'قيد الشحن')) === exp.ship, '«قيد الشحن» ما يحسب المنسحب', await tile(p, cid, 'قيد الشحن'));
  ok(num(await tile(p, cid, 'منسحب (انخصم من الأرقام)')) === 1, 'كرت «منسحب» يطلع 1', await tile(p, cid, 'منسحب (انخصم من الأرقام)'));
  const row = await p.evaluate(cid => { const t = document.querySelector(`[data-camp="${cid}"] table`); const h = [...t.querySelectorAll('thead th')].map(x => x.innerText.trim()); return { h, rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.innerText.trim())) }; }, cid);
  const iW = row.h.indexOf('منسحب'); ok(iW > 0 && row.rows.some(r => /^1/.test(r[iW]) && /بدون بديل/.test(r[iW])), 'جدول الحملة: عمود «منسحب» مع تنبيه «بدون بديل»', row.rows.map(r => r[iW]).join(','));
  await p.screenshot({ path: '/tmp/net_admin_camps.png', fullPage: false });
  await p.goto(p.url().split('#')[0] + '#dash'); await p.waitForTimeout(600);
  const dashH = await p.$$eval('#dCreators thead th', th => th.map(x => x.innerText.trim()));
  ok(dashH.includes('انسحب') && dashH.includes('نسبة الانسحاب عليه'), 'لوحة الأداء: أعمدة «انسحب» و«نسبة الانسحاب عليه»', dashH.slice(-3).join('|'));
  await p.context().close();

  /* صانع المحتوى: الترشيح الجديد ينربط تلقائياً بالانسحاب */
  p = await open('creator', '#camps');
  await p.click(`[data-camp="${cid}"] [data-nom]`); await p.waitForTimeout(500);
  ok(await p.evaluate(() => /انسحاب بدون بديل/.test((document.querySelector('.ov') || {}).innerText || '')), 'نافذة الترشيح تنبّه إن الترشيح بيكون بديل');
  await p.evaluate(() => { window.__writes.length = 0; });
  const card = '.ov [data-card]:not([data-deal]), .ov [data-card][data-deal=""]';
  const c1 = (await p.$$(card))[0];
  await c1.$eval('[data-f="url"]', e => { e.value = 'https://www.tiktok.com/@newrepl'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await c1.$eval('[data-f="name"]', e => { e.value = 'بديل جديد'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await c1.$eval('[data-f="acc_type"]', e => { e.selectedIndex = 1; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await c1.$eval('[data-f="price_before"]', e => { e.value = '600'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await c1.$eval('[data-f="price"]', e => { e.value = '500'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await c1.$$eval('input[type=checkbox]', xs => { if (xs[0]) { xs[0].checked = true; xs[0].dispatchEvent(new Event('change', { bubbles: true })); } });
  await c1.$eval('[data-f="name_en"]', e => { e.value = 'New Repl'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await c1.$eval('[data-f="phone"]', e => { e.value = '0558887777'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.click('#cn_draft'); await p.waitForTimeout(700);
  const wdId = await p.evaluate(() => window.__wdId);
  const got = await p.evaluate(() => window.__fake.db.deals.filter(d => d.name === 'بديل جديد').map(d => d.replaces_id));
  ok(got.length === 1 && got[0] === wdId, 'الترشيح الجديد انربط تلقائياً كبديل عن المنسحب', JSON.stringify(got));
  await p.context().close();

  /* المعتمد: رفض بسبب «كملي البيانات» يقترح «يحتاج تعديل» */
  p = await open('approver', '#mine'); const rej = await p.evaluate(() => window.__rej);
  if (rej) { await p.evaluate(id => window.__writes.length = 0, rej);
    const opened = await p.evaluate(id => { const b = document.querySelector(`[data-open="${id}"]`); if (b) { b.click(); return true; } return false; }, rej);
    if (!opened) { await p.goto(p.url().split('#')[0] + '#pipe'); await p.waitForTimeout(500); await p.evaluate(id => { const b = document.querySelector(`[data-open="${id}"]`); if (b) b.click(); }, rej); }
    await p.waitForTimeout(400);
    if (await p.$('[data-act="reject"]')) { await p.click('[data-act="reject"]'); await p.waitForSelector('.ov.top #rsn'); await p.fill('.ov.top #rsn', 'كملي البيانات'); await p.click('.ov.top [data-y]'); await p.waitForTimeout(300);
      ok(await p.evaluate(() => /يحتاج تعديل مو رفض/.test((document.querySelector('.ov.top') || {}).innerText || '')), 'رفض بسبب «كملي البيانات»: يقترح «يحتاج تعديل»');
      await p.click('.ov.top [data-y]'); await p.waitForTimeout(400);
      const w = await p.evaluate(() => window.__writes.filter(w => w.table === 'deals').slice(-1)[0]);
      ok(w && w.payload && w.payload.approval === 'needs_edit', 'بعد الموافقة: انحفظ «يحتاج تعديل» بدل «مرفوض»', w && w.payload && w.payload.approval);
    } else ok(false, 'زر الرفض ما ظهر للمعتمد'); }
  else ok(false, 'ما فيه ترشيح ينتظر الاعتماد في الفكسشر');
  await p.context().close();

  await b.close(); console.log(errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors'); console.log(`${pass} pass, ${fail} fail`); process.exit(fail || errs.length ? 1 : 0);
})();
