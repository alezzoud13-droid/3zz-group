/* فحص قواعد 12 نوفمبر: (1) كشف الدفع ينزّل المحدد والمعتمد للدفع فقط. (2) ممنوع الانتقال بين المراحل والمبلغ ناقص.
   يشتغل على قاعدة البيانات الوهمية مع ترشيحين بدون مبلغ. التشغيل: APP_URL=http://localhost:8765/ node tests/smoke/rules.check.js */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const APP_URL = (process.env.APP_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
const PATCH = `(function(){var mk=window.__makeFixtures;window.__makeFixtures=function(n){var fx=mk(n),D=fx.db.deals,me=fx.personas||{};
  var a=D.filter(function(d){return d.approval==='pending'&&d.sent_at&&!d.closed_at&&d.member_id===me.creator;})[0]; if(a){a.price=null;window.__noAmtPending=a.id;}
  var b=D.filter(function(d){return d.approval==='approved'&&d.posted_at&&!d.pay_ok_at&&!d.paid_at&&!d.no_pay&&!d.closed_at;})[0]; if(b){b.price=null;window.__noAmtPay=b.id;}
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

  /* ---- المعتمد: ما يعتمد ترشيح بدون مبلغ ---- */
  let p = await open('approver', '#mine'); const id = await p.evaluate(() => window.__noAmtPending);
  ok(!!id && await p.$(`${M} [data-g="appr"] [data-ap1="${id}"]`) !== null, 'فيه ترشيح بدون مبلغ ينتظر الاعتماد');
  await reset(p); await p.click(`${M} [data-g="appr"] [data-ap1="${id}"]`); await p.waitForTimeout(400);
  ok(await nW(p) === 0 && /المبلغ/.test(await toast(p)) && await p.$(`${M} [data-g="appr"] [data-ap1="${id}"]`) !== null, 'اعتماد فردي من الصف: ممنوع بدون مبلغ، والترشيح باقي مكانه مع رسالة');
  await p.check(`${M} [data-g="appr"] [data-all]`); await p.click(`${M} [data-dobulk="appr"]`); await p.waitForTimeout(300);
  ok(await nW(p) === 0 && await dlg(p) === null && /المبلغ/.test(await toast(p)), 'اعتماد جماعي فيه ترشيح بدون مبلغ: يتوقف كله قبل التأكيد مع ذكر الاسم');
  await p.uncheck(`${M} [data-g="appr"] [data-bulk="${id}"]`); await p.click(`${M} [data-dobulk="appr"]`); await p.waitForTimeout(200);
  ok(await dlg(p) !== null, 'بعد شيل تحديد الناقص: الاعتماد الجماعي يكمل لنافذة التأكيد'); await p.click('.ov.top [data-n]');
  await p.click(`${M} [data-g="appr"] [data-open="${id}"]`); await p.waitForTimeout(300); await reset(p); await p.click('[data-act="approve"]'); await p.waitForTimeout(300);
  ok(await nW(p) === 0 && /المبلغ/.test(await toast(p)), 'اعتماد من داخل الملف: ممنوع بدون مبلغ'); await p.click('#dClose');
  const other = await p.$$eval(`${M} [data-g="appr"] [data-ap1]`, (E, id) => E.map(e => e.dataset.ap1).filter(x => x !== id)[0], id);
  await reset(p); await p.click(`${M} [data-g="appr"] [data-ap1="${other}"]`); await p.waitForTimeout(500); ok(await nW(p) === 1, 'ترشيح مبلغه مكتوب: الاعتماد يشتغل عادي');
  await p.context().close();

  /* ---- صانع المحتوى: ما يرسل ترشيح بدون مبلغ ---- */
  p = await open('creator', '#mine');
  if (await p.$(`${M} [data-g="camp_draft"] [data-open]`)) { await p.click(`${M} [data-g="camp_draft"] [data-open]`); await p.waitForTimeout(300); await p.fill('#f_price', ''); await reset(p); await p.click('[data-act="send"]'); await p.waitForTimeout(300);
    ok(await nW(p) === 0 && /المبلغ/.test(await toast(p)), 'إرسال الترشيح للاعتماد: ممنوع بدون مبلغ');
    await p.fill('#f_price', '0'); await p.click('[data-act="send"]'); await p.waitForTimeout(500); ok(await nW(p) === 1, 'المبلغ 0 (مقابل منتج) مقبول والإرسال يشتغل'); } else ok(false, 'ما لقيت مسودة ترشيح لصانع المحتوى في بيانات الاختبار');
  await p.context().close();

  /* ---- المدير: اعتماد الدفع والكشف ---- */
  p = await open('admin', '#mine'); const pid = await p.evaluate(() => window.__noAmtPay);
  ok(await p.$(`${M} [data-g="pay"] [data-payx]`) === null, 'قائمة «تنتظر موافقتك على الدفع»: ما فيها زر تنزيل الكشف (غير المعتمد ما يدخل الكشف)');
  await reset(p); await p.check(`${M} [data-g="pay"] [data-all]`); await p.click(`${M} [data-dobulk="pay"]`); await p.waitForTimeout(300);
  ok(await nW(p) === 0 && await dlg(p) === null && /المبلغ/.test(await toast(p)), 'اعتماد الدفع: ممنوع والمبلغ ناقص في أحد المحدد');
  await p.click(`${M} [data-g="pay"] [data-open="${pid}"]`); await p.waitForTimeout(300); await p.click('[data-act="payok"]'); await p.waitForTimeout(300);
  ok(await nW(p) === 0 && /المبلغ/.test(await toast(p)), 'اعتماد الدفع من داخل الملف: ممنوع بدون مبلغ'); await p.click('#dClose');
  await reset(p); await p.click(`${M} [data-g="pay_go"] [data-payx]`); await p.waitForTimeout(300);
  ok(await p.evaluate(() => window.__exports.length) === 0 && /حدّد/.test(await toast(p)), 'كشف الدفع بدون تحديد: ما ينزل شي ويطلب التحديد');
  const nGo = await p.$$eval(`${M} [data-g="pay_go"] [data-bulk]`, e => e.length); await p.check(`${M} [data-g="pay_go"] [data-bulk]`); await p.click(`${M} [data-g="pay_go"] [data-payx]`); await p.waitForTimeout(400);
  const ex = await p.evaluate(() => window.__exports[0] || null);
  ok(!!ex && Object.values(ex.rows)[0] === 2, `كشف الدفع: نزل المحدد فقط (صف واحد + الإجمالي) من ${nGo} معتمد → ` + JSON.stringify(ex && ex.rows));
  await p.context().close();

  /* ---- خطأ «مسجّل عند فلان» مع أي رابط (12 نوفمبر): الرابط المختصر ما يطابق أي حساب، وما ينحفظ يوزر «https:» ---- */
  p = await open('creator', '#acq'); await p.click('#acqNew'); await p.waitForTimeout(300);
  await p.fill('#q_name', 'حساب تجربة'); await p.selectOption('#q_type', { index: 1 }); await p.fill('#q_url', 'https://vt.tiktok.com/ZSabc123/'); await p.dispatchEvent('#q_url', 'change'); await p.waitForTimeout(400);
  ok(await p.$eval('#q_dup', e => e.innerText.trim()) === '' && await p.$eval('#q_handle', e => e.value) === '', 'رابط مختصر في الاستقطاب: ما تطلع رسالة «مسجّل عند…» وما ينعبّى يوزر غلط');
  await reset(p); await p.evaluate(() => { window.__writes.length = 0; }); await p.click('#q_send'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__writes.filter(w => w.table === 'influencers').length) === 0 && /يوزر/.test(await toast(p)), 'الاستقطاب بدون يوزر: ما ينحفظ ويطلب اليوزر');
  await p.fill('#q_url', 'https://www.tiktok.com/@new.account_9?lang=ar'); await p.dispatchEvent('#q_url', 'change'); await p.waitForTimeout(300);
  ok(await p.$eval('#q_handle', e => e.value) === 'new.account_9', 'رابط الحساب الكامل: اليوزر ينقرأ صح');
  await p.context().close();
  ok(errs.length === 0, 'لا أخطاء JavaScript' + (errs.length ? ': ' + errs[0] : ''));
  console.log(`\n${pass} ناجح، ${fail} فاشل`); await b.close(); process.exit(fail ? 1 : 0);
})();
