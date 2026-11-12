#!/usr/bin/env node
/* Characterization ("golden master") smoke tests for «أداء فريق العز».
 *
 *   node tests/smoke/smoke.js --update          record baseline.json from the app at APP_URL
 *   node tests/smoke/smoke.js                   compare the current app against baseline.json
 *   node tests/smoke/smoke.js --only <substr>   run only the checks/scenarios whose name contains <substr>
 *   node tests/smoke/smoke.js --strict-render   also FAIL on differences in the (informational) render summaries
 *   node tests/smoke/smoke.js --show            print the recorded writes/exports of every scenario that ran
 *
 *   APP_URL (default http://localhost:8801/)    where the app is served
 *   SMOKE_JOBS (default 4)                      parallel browser contexts
 *
 * The contract is the per-scenario log of database writes / RPCs / exports. See README.md.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const makeFixtures = require('./fixtures.js');

const DIR = __dirname;
const BASELINE = path.join(DIR, 'baseline.json');
const APP_URL = (process.env.APP_URL || 'http://localhost:8801/').replace(/\/?$/, '/');
const APP_HOST = new URL(APP_URL).host;
const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const STRICT_RENDER = argv.includes('--strict-render');
const SHOW = argv.includes('--show');
const ONLY = argv.includes('--only') ? String(argv[argv.indexOf('--only') + 1] || '') : null;
const JOBS = Math.max(1, Number(process.env.SMOKE_JOBS) || 4);
const FROZEN_NOW = '2026-11-11T08:00:00.000Z';        // the browser clock is pinned here (11:00 in Riyadh, a Wednesday)
const ACTION_TIMEOUT = 6000;

const FX = makeFixtures(Date.parse(FROZEN_NOW));
const { M, K, D, I, R } = FX.ids;
const inflRow = id => FX.db.influencers.find(x => x.id === id);

const FIXTURES_JS = fs.readFileSync(path.join(DIR, 'fixtures.js'), 'utf8');
const FAKE_JS = fs.readFileSync(path.join(DIR, 'fake-supabase.js'), 'utf8');
const SUPABASE_BODY = FIXTURES_JS + '\n;\n' + FAKE_JS;
const XLSX_BODY = '/* smoke: SheetJS is stubbed by fake-supabase.js */ if (!window.XLSX || !window.XLSX.__stub) throw new Error("smoke: XLSX stub missing");';
const HARNESS = crypto.createHash('sha1').update(FIXTURES_JS).update(FAKE_JS).update(FROZEN_NOW).digest('hex').slice(0, 12);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const alias = s => String(s).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, u => FX.labels[u.toLowerCase()] || u);

/* ------------------------------------------------------------------ selectors
 * Only ids and data-* attributes are allowed (classes and visible text will change in the restyle). */
const SEL_TOKEN = /^(?:#[A-Za-z_][\w-]*|\[data-[\w-]+(?:=(?:"[^"]*"|'[^']*'))?\])+$/;
function lint(sel) {
  for (const tok of sel.trim().split(/\s*>\s*|\s+/)) if (!SEL_TOKEN.test(tok)) throw new Error(`selector "${sel}" is not id/data-* only (offending part: "${tok}")`);
  return sel;
}

/* ------------------------------------------------------------------ network */
function installRoutes(context, log) {
  return context.route('**/*', route => {
    const req = route.request(), url = req.url();
    let u; try { u = new URL(url); } catch (e) { return route.abort(); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.continue();
    if (u.host === APP_HOST) return route.continue();
    const js = { status: 200, contentType: 'application/javascript; charset=utf-8' };
    if (/supabase/i.test(u.pathname) && /\.js($|\?)|supabase-js/i.test(url) && !/\.supabase\.(co|in|net)$/i.test(u.hostname)) return route.fulfill({ ...js, body: SUPABASE_BODY });
    if (/xlsx/i.test(u.pathname)) return route.fulfill({ ...js, body: XLSX_BODY });
    if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/i.test(u.hostname)) return route.abort();   // fonts are cosmetic; never leave the machine
    (/(^|\.)supabase\.(co|in|net)$/i.test(u.hostname) ? log.supabase : log.blocked).push(url);   // never let anything else out
    return route.abort();
  });
}
const NOISE = /Failed to load resource: net::ERR_|net::ERR_FAILED|net::ERR_ABORTED|net::ERR_BLOCKED/i;

/* ------------------------------------------------------------------ session */
async function openSession(browser, persona, target) {
  const context = await browser.newContext({ locale: 'ar-SA', timezoneId: 'Asia/Riyadh', viewport: { width: 1280, height: 900 } });
  const log = { pageErrors: [], consoleErrors: [], blocked: [], supabase: [] };
  await installRoutes(context, log);
  await context.addInitScript(p => { window.__PERSONA = p; }, persona);
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT);
  await page.clock.setFixedTime(new Date(FROZEN_NOW));
  page.on('pageerror', e => log.pageErrors.push(String((e && e.message) || e)));
  page.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) log.consoleErrors.push(m.text()); });
  await page.goto(APP_URL + target, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__fake, null, { timeout: ACTION_TIMEOUT }).catch(() => { throw new Error('fake-supabase.js was not loaded by the page (did the supabase-js <script> URL change?)'); });
  if (!/intake\.html/.test(target)) await page.waitForFunction(() => ['authView', 'waitView', 'appView'].some(id => { const e = document.getElementById(id); return e && !e.hidden; }));
  await settle(page);
  return { context, page, log };
}
/* wait until the fake backend has had no in-flight query and no new query for `quiet` ms */
async function settle(page, quiet = 90, timeout = 10000) {
  const t0 = Date.now(); let prev = null, since = Date.now();
  for (;;) {
    const s = await page.evaluate(() => window.__fake ? [window.__fake.state.pending, window.__fake.state.queries, window.__writes.length, window.__exports.length] : null).catch(() => null);
    const key = JSON.stringify(s);
    if (s && s[0] === 0 && key === prev) { if (Date.now() - since >= quiet) return; } else { prev = key; since = Date.now(); }
    if (Date.now() - t0 > timeout) throw new Error('backend never went quiet');
    await sleep(20);
  }
}
function problems(log) {
  const out = [];
  for (const e of log.pageErrors) out.push('pageerror: ' + e);
  for (const e of log.consoleErrors) out.push('console.error: ' + e);
  for (const u of log.supabase) out.push('the page tried to reach the REAL Supabase project (aborted): ' + u);
  return out;
}
const blockedNotes = log => [...new Set(log.blocked.map(u => { try { return new URL(u).host; } catch (e) { return u; } }))].map(h => `external host blocked by the test harness: ${h}`);

/* ------------------------------------------------------------------ scenario toolkit */
class T {
  constructor(page) { this.page = page; }
  loc(sel) { return this.page.locator(lint(sel)); }
  /* every failure names the control it was operating, with fixture ids shown as their aliases */
  async _do(what, sel, fn) { try { return await fn(this.loc(sel)); } catch (e) { throw new Error(`${what} ${alias(sel)} — ${firstLine(e)}`); } }
  click(sel) { return this._do('click', sel, l => l.click()); }
  clickFirst(sel) { return this._do('click', sel, l => l.first().click()); }
  fill(sel, v) { return this._do('fill', sel, l => l.fill(String(v))); }
  check(sel) { return this._do('check', sel, l => l.check()); }
  uncheck(sel) { return this._do('uncheck', sel, l => l.uncheck()); }
  select(sel, value) { return this._do('select', sel, l => l.selectOption(value)); }
  selectIndex(sel, index) { return this._do('select', sel, l => l.selectOption({ index })); }
  /* leave a field so its `change` handler runs before the next click (some handlers insert content and shift the layout) */
  async blur(sel) { await this._do('blur', sel, l => l.blur()); await settle(this.page); }
  /* tick the checkbox whose .value is `value` among the ones matched by `sel` (platform boxes have no id / data-value) */
  async checkValue(sel, value) {
    await this._do('find', sel, l => l.first().waitFor({ state: 'attached' }));
    const i = await this.loc(sel).evaluateAll((els, v) => els.findIndex(e => e.value === v), value);
    if (i < 0) throw new Error(`no element with value "${value}" among ${alias(sel)}`);
    await this._do(`check value=${value} of`, sel, l => l.nth(i).check());
  }
  /* open collapsed <details> ancestors so a control inside them can be operated */
  async reveal(sel) {
    await this._do('find', sel, l => l.first().waitFor({ state: 'attached' }));
    await this.loc(sel).first().evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS' && !p.open) p.open = true; });
  }
  async visible(id) { await this.page.waitForFunction(i => { const e = document.getElementById(i); return !!e && !e.hidden && e.getClientRects().length > 0; }, id).catch(() => { throw new Error(`#${id} never became visible`); }); }
  async go(hash) { await this.page.evaluate(h => { location.hash = h; }, hash); await this.visible('v-' + hash.replace('#', '')); await settle(this.page); }
  async hideToast() { await this.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); }
  /* run an action that MUST reach the backend with at least one write/RPC */
  async write(fn) {
    const n = await this.page.evaluate(() => window.__writes.length);
    await fn();
    await this.page.waitForFunction(k => window.__writes.length > k, n).catch(() => { throw new Error('expected a database write, none happened'); });
    await settle(this.page); await this.hideToast();
  }
  /* run an action that MUST produce an Excel export */
  async exported(fn) {
    const n = await this.page.evaluate(() => window.__exports.length);
    await fn();
    await this.page.waitForFunction(k => window.__exports.length > k, n).catch(() => { throw new Error('expected an Excel export, none happened'); });
    await settle(this.page); await this.hideToast();
  }
  /* run an action that is not required to write (validation errors, cancels, navigation) */
  async quiet(fn) { await fn(); await settle(this.page, 150); await this.hideToast(); }
  async confirm() { await this.click('[data-y]'); }
  async cancel() { await this.click('[data-n]'); }
  /* «انشحن» و«وصل» داخل الملف صاروا بنافذة تأكيد في التصميم الجديد (قرار 12 نوفمبر). النسخة القديمة تحفظ مباشرة. الحفظ نفسه لازم يطابق الأساس في الحالتين. */
  async confirmIfAsked() { await settle(this.page, 150); if (await this.page.$('[data-y]')) await this.click('[data-y]'); }
  async reason(text) { await this.fill('#rsn', text); await this.click('[data-y]'); }
}

/* ------------------------------------------------------------------ Part A: render checks */
const PERSONAS = ['admin', 'approver', 'creator', 'shipper', 'media', 'snap'];
const ROUTES = ['mine', 'acq', 'camps', 'pipe', 'req', 'today', 'dash', 'setup'];
function summarize(rootId) {
  const root = rootId ? document.getElementById(rootId) : document.body;
  const vis = el => !!(el && !el.hidden && el.getClientRects().length);
  const n = (el, s) => el.querySelectorAll(s).length;
  const ids = {};
  root.querySelectorAll('[id]').forEach(el => {
    if (!el.children.length) return;
    const o = { kids: el.children.length }; const c = { tr: n(el, 'tr'), table: n(el, 'table'), button: n(el, 'button'), field: n(el, 'input,select,textarea') };
    for (const k in c) if (c[k]) o[k] = c[k]; if (!vis(el)) o.hidden = true; ids[el.id] = o;
  });
  const data = {};
  root.querySelectorAll('*').forEach(el => { for (const a of el.attributes) if (a.name.startsWith('data-')) data[a.name] = (data[a.name] || 0) + 1; });
  const groups = [...root.querySelectorAll('[data-g]')].map(g => g.dataset.g + '=' + g.querySelectorAll('[data-open],[data-openinfl],[data-req],[data-nom]').length);
  const txt = id => { const e = document.getElementById(id); return e && !e.hidden ? e.textContent.trim() : ''; };
  const out = { ids, data };
  if (groups.length) out.groups = groups;
  if (document.getElementById('tabs')) out.shell = { tabs: [...document.querySelectorAll('#tabs [data-v]')].filter(vis).map(a => a.dataset.v), mineCnt: txt('mineCnt'), reqCnt: txt('reqCnt') };
  return out;
}
function renderChecks() {
  const list = [];
  for (const p of PERSONAS) for (const r of ROUTES) {
    const admin = p === 'admin', view = (r === 'dash' || r === 'setup') && !admin ? 'mine' : r;
    list.push({ name: `render:${p}#${r}`, persona: p, target: '#' + r, expect: 'v-' + view, others: ROUTES.filter(x => x !== view).map(x => 'v-' + x).concat('authView', 'waitView') });
  }
  list.push({ name: 'render:anon(login)', persona: 'anon', target: '', expect: 'authView', others: ['appView', 'waitView'] });
  list.push({ name: 'render:pending(wait)', persona: 'pending', target: '', expect: 'waitView', others: ['appView', 'authView'] });
  list.push({ name: 'render:admin#mine(team)', persona: 'admin', target: '#mine', expect: 'v-mine', others: [], prep: async t => { await t.select('#mineAs', 'team'); await settle(t.page); } });
  list.push({ name: 'render:intake(valid)', persona: 'anon', target: `intake.html?t=${tokenOf(D.approved_noaddr)}`, expect: 'form', others: [], whole: true });
  list.push({ name: 'render:intake(bad-token)', persona: 'anon', target: 'intake.html?t=nope', expect: 'box', others: ['form'], whole: true });
  return list;
}
const tokenOf = id => FX.db.deals.find(d => d.id === id).intake_token;
async function runRender(browser, c) {
  const s = await openSession(browser, c.persona, c.target);
  const errs = [];
  let summary = null;
  try {
    const t = new T(s.page);
    if (c.prep) await c.prep(t);
    const st = await s.page.evaluate(({ expect, others }) => {
      const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && e.getClientRects().length > 0; };
      const e = document.getElementById(expect);
      return { ok: vis(expect), text: e ? e.innerText.trim().length : 0, kids: e ? e.querySelectorAll('*').length : 0, leaked: others.filter(vis) };
    }, { expect: c.expect, others: c.others });
    if (!st.ok) errs.push(`#${c.expect} is not visible`);
    else if (!st.text || !st.kids) errs.push(`#${c.expect} is visible but empty`);
    if (st.leaked.length) errs.push('should be hidden but visible: ' + st.leaked.map(x => '#' + x).join(', '));
    summary = await s.page.evaluate(summarize, c.whole ? null : c.expect);
    const w = await s.page.evaluate(() => window.__writes.filter(x => x.op !== 'rpc').length);
    if (w) errs.push(`rendering wrote to the database (${w} writes)`);
  } catch (e) { errs.push(firstLine(e)); }
  errs.push(...problems(s.log));
  const notes = blockedNotes(s.log);
  await s.context.close();
  return { name: c.name, errs, notes, summary };
}

/* ------------------------------------------------------------------ Part B: scenarios */
const A = (name, persona, start, run, opt) => Object.assign({ name, persona, start, run }, opt);
const mine = '#mineBody';
const SCENARIOS = [
  /* ---------- approver: campaign nominations ---------- */
  A('approver_bulk_approve_selected_nominations', 'approver', '#mine', async t => {
    await t.check(`${mine} [data-bulk="${D.pending1}"]`);
    await t.check(`${mine} [data-bulk="${D.pending2}"]`);
    await t.click(`${mine} [data-dobulk="appr"]`);
    await t.write(() => t.confirm());
  }),
  A('approver_bulk_approve_all_after_cancel', 'approver', '#mine', async t => {
    await t.quiet(() => t.click(`${mine} [data-dobulk="appr"]`));                   // nothing ticked: toast only
    await t.check(`${mine} [data-g="appr"] [data-all]`);
    await t.click(`${mine} [data-dobulk="appr"]`);
    await t.quiet(() => t.cancel());                                                // cancel the confirm dialog: no write
    await t.click(`${mine} [data-dobulk="appr"]`);
    await t.write(() => t.confirm());
  }),
  A('approver_reject_and_send_back_for_edit', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-g="appr"] [data-dq="reject"][data-id="${D.pending3}"]`);   // داخل قائمتها: المهمة المتأخرة تظهر كمان في «ابدأ من هنا"
    await t.write(() => t.reason('المحتوى ما يناسب'));
    await t.click(`${mine} [data-g="appr"] [data-dq="needs_edit"][data-id="${D.pending4}"]`);
    await t.quiet(() => t.confirm());                                               // reason is mandatory: no write
    await t.write(() => t.reason('عدّل السعر وأعد الإرسال'));
  }),
  A('approver_deal_modal_backup_approve_reject', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-g="appr"] [data-open="${D.pending1}"]`);
    await t.write(() => t.click('[data-act="backup"]'));
    await t.write(() => t.click('[data-act="approve"]'));
    await t.click('#dClose');
    await t.click(`${mine} [data-g="appr"] [data-open="${D.pending3}"]`);
    await t.click('[data-act="reject"]');
    await t.write(() => t.reason('مرفوض من داخل الملف'));
    await t.click('#dClose');
    await t.click(`${mine} [data-open="${D.pending4}"]`);
    await t.click('[data-act="needs_edit"]');
    await t.write(() => t.reason('يحتاج تعديل من داخل الملف'));
  }),
  /* ---------- approver: acquisition ---------- */
  A('approver_acquisition_approve_and_send_back', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-openinfl="${I.acq_pending}"]`);
    await t.write(() => t.click('[data-a="approve"]'));
    await t.click('#f_x');
    await t.click(`${mine} [data-openinfl="${I.acq_pending2}"]`);
    await t.click('[data-a="needs_edit"]');
    await t.write(() => t.reason('صحّح رابط الحساب'));
  }),
  /* KNOWN BUG in production (recorded as-is): "رفض" in the influencer file writes acq_status "reject" (not "rejected"),
   * then re-rendering the file throws because ACQ["reject"] is undefined. */
  A('approver_acquisition_reject_KNOWN_BUG', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-openinfl="${I.acq_pending3}"]`);
    await t.click('[data-a="reject"]');
    await t.write(() => t.reason('حساب غير مناسب'));
  }, { knownPageError: /Cannot read properties of undefined \(reading '0'\)/ }),
  /* ---------- approver: raw video ---------- */
  A('approver_raw_video_approve_and_return', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-g="draft"] [data-open="${D.draft_pending1}"]`);
    await t.write(() => t.click('[data-act="vok"]'));
    await t.click('#dClose');
    await t.click(`${mine} [data-g="draft"] [data-open="${D.draft_pending2}"]`);
    await t.click('[data-act="vfix"]');
    await t.write(() => t.reason('الصوت ضعيف، أعد التسجيل'));
  }),
  /* ---------- payment ---------- */
  A('admin_bulk_pay_approve', 'admin', '#mine', async t => {
    await t.check(`${mine} [data-g="pay"] [data-all]`);
    await t.click(`${mine} [data-dobulk="pay"]`);
    await t.write(() => t.confirm());
  }),
  A('approver_pay_go_bulk_paid', 'approver', '#mine', async t => {
    await t.check(`${mine} [data-g="pay_go"] [data-all]`);
    await t.click(`${mine} [data-dobulk="pay_go"]`);
    await t.write(() => t.confirm());
  }),
  A('admin_deal_modal_payok_paid_undo', 'admin', '#mine', async t => {
    await t.click(`${mine} [data-g="pay"] [data-open="${D.launched_wait_pay}"]`);
    await t.write(() => t.click('[data-act="payok"]'));
    await t.write(() => t.click('[data-act="paid"]'));
    await t.write(() => t.click('[data-act="paid"]'));                            // admin can undo
  }),
  A('approver_deal_modal_paid', 'approver', '#mine', async t => {
    await t.click(`${mine} [data-g="pay_go"] [data-open="${D.pay_ok1}"]`);
    await t.write(() => t.click('[data-act="paid"]'));
  }),
  /* ---------- shipping ---------- */
  A('shipper_bulk_shipped', 'shipper', '#mine', async t => {
    await t.check(`${mine} [data-g="ship_send"] [data-all]`);
    await t.click(`${mine} [data-dobulk="ship_send"]`);
    await t.write(() => t.confirm());
  }),
  A('shipper_bulk_delivered', 'shipper', '#mine', async t => {
    await t.check(`${mine} [data-bulk="${D.shipped1}"]`);
    await t.check(`${mine} [data-bulk="${D.shipped2}"]`);
    await t.click(`${mine} [data-dobulk="ship_wait"]`);
    await t.write(() => t.confirm());
  }),
  A('shipper_deal_modal_shipped_failed_delivered', 'shipper', '#mine', async t => {
    await t.click(`${mine} [data-g="ship_send"] [data-open="${D.ready_ship1}"]`);
    await t.fill('#f_ship_company', 'أرامكس');
    await t.fill('#f_tracking', 'TRK-SMOKE-1');
    await t.write(async () => { await t.click('[data-act="shipped"]'); await t.confirmIfAsked(); });
    await t.quiet(() => t.click('[data-act="failed"]'));                          // needs a note: no write
    await t.fill('#f_ship_note', 'العنوان ناقص');
    await t.write(() => t.click('[data-act="failed"]'));
    await t.write(async () => { await t.click('[data-act="delivered"]'); await t.confirmIfAsked(); });
  }),
  A('shipper_deal_modal_delivered_directly', 'shipper', '#mine', async t => {
    await t.click(`${mine} [data-g="ship_fail"] [data-open="${D.ship_failed}"]`);
    await t.write(async () => { await t.click('[data-act="delivered"]'); await t.confirmIfAsked(); });
  }),
  /* ---------- launch ---------- */
  A('media_launch_from_mine', 'media', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-launch="tt"][data-id="${D.posted_wait_launch}"]`));
    await t.write(() => t.click(`${mine} [data-launch="sn"][data-id="${D.posted_wait_launch}"]`));   // last platform: live_at + ad_name
  }),
  A('media_launch_in_deal_modal', 'media', '#mine', async t => {
    await t.click(`${mine} [data-open="${D.partly_posted}"]`);
    await t.write(() => t.click('[data-act="lv_tt"]'));
  }),
  A('snap_launch_from_mine', 'snap', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="snap_follow"] [data-launch="tt"][data-id="${D.partly_posted}"]`));
  }),
  /* ---------- creator: acquisition ---------- */
  A('creator_acquisition_draft_then_send', 'creator', '#acq', async t => {
    await t.click('#acqNew');
    await t.selectIndex('#q_type', 3);
    await t.fill('#q_name', 'مؤثر استقطاب جديد');
    await t.fill('#q_url', 'https://www.tiktok.com/@smoke_new_acq');
    await t.write(() => t.click('#q_draft'));
    await t.write(() => t.click('[data-a="send"]'));                               // now inside the influencer file
  }),
  A('creator_acquisition_send_with_duplicate_checks', 'creator', '#mine', async t => {
    await t.click('#newDeal'); await t.click('#chAcq');
    await t.quiet(() => t.click('#q_send'));                                       // empty form: validation only
    await t.selectIndex('#q_type', 1);
    await t.fill('#q_name', 'مؤثر مكرر');
    await t.fill('#q_url', inflRow(I.acq_draft).tiktok_url);                       // already one of my own files
    await t.blur('#q_url');                                                        // the duplicate notice is inserted on blur and moves the buttons
    await t.click('#q_send');
    await t.quiet(() => t.cancel());                                               // "already exists" dialog -> cancel
    await t.fill('#q_url', inflRow(I.acq_pending2).tiktok_url);                    // registered by a colleague (invisible to me) ...
    await t.fill('#q_handle', inflRow(I.acq_pending2).handle);
    await t.write(() => t.blur('#q_handle'));                                      // ... so the form asks infl_lookup
    await t.write(() => t.click('#q_send'));                                       // and saving is blocked by infl_lookup (no insert)
    await t.fill('#q_url', 'https://www.tiktok.com/@smoke_direct_send');
    await t.fill('#q_handle', 'smoke_direct_send');
    await t.write(() => t.blur('#q_handle'));
    await t.write(() => t.click('#q_send'));
  }),
  A('creator_acquisition_fix_and_resend', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="acq_fix"] [data-openinfl="${I.acq_needs_edit}"]`);
    await t.fill('#i_name_en', 'Smoke Fixed');
    await t.write(() => t.click('[data-a="save1"]'));
    await t.write(() => t.click('[data-a="send"]'));
  }),
  A('creator_acquisition_contact_and_agree', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="acq_contact"] [data-openinfl="${I.acq_approved}"]`);
    await t.click('[data-a="addc"]');
    await t.selectIndex('[data-ci="1"] [data-c="channel"]', 2);
    await t.selectIndex('[data-ci="1"] [data-c="result"]', 6);
    await t.click('[data-a="addc"]');                                              // a third attempt, filled then removed again
    await t.selectIndex('[data-ci="2"] [data-c="channel"]', 1);
    await t.click('[data-cdel="2"]');
    await t.fill('#i_contact_summary', 'اتفقنا بعد محاولتين');
    await t.fill('#i_price_before', '3000');
    await t.write(() => t.click('[data-a="save2"]'));
    await t.quiet(() => t.click('[data-a="agree"]'));                              // phone is mandatory for "agreed"
    await t.fill('#i_phone', '0551112233');
    await t.fill('#i_city', 'الرياض');
    await t.fill('#i_district', 'حي الاختبار – RRRD9999');
    await t.fill('#i_price_after', '2500');
    await t.write(() => t.click('[data-a="agree"]'));
  }),
  /* ---------- creator: campaign nominations ---------- */
  A('creator_campaign_nomination_draft_then_send', 'creator', '#camps', async t => {
    await t.click(`#cList [data-nom="${K.beta}"]`);
    const c = '[data-card="2"]';
    await t.fill(`${c} [data-f="url"]`, 'https://www.tiktok.com/@smoke_new_nominee');
    await t.fill(`${c} [data-f="name"]`, 'مرشح جديد');
    await t.selectIndex(`${c} [data-f="acc_type"]`, 3);
    await t.fill(`${c} [data-f="price"]`, '750');
    await t.selectIndex(`${c} [data-f="ad_type"]`, 1);
    await t.checkValue(`${c} [data-plat="c2"]`, 'tt');
    await t.checkValue(`${c} [data-plat="c2"]`, 'sn');
    await t.fill(`${c} [data-f="sn_user"]`, 'smoke_nominee_snap');
    await t.reveal(`${c} [data-f="phone"]`);                                       // "extra details" is a collapsed <details> (its <summary> has no id/data-*)
    await t.fill(`${c} [data-f="phone"]`, '0557776655');
    await t.fill(`${c} [data-f="city"]`, 'الرياض');
    await t.fill(`${c} [data-f="district"]`, 'حي الترشيح – RRRD7777');
    await t.fill(`${c} [data-f="planned_date"]`, '2030-02-01');
    await t.fill(`${c} [data-f="hook"]`, 'هوك الترشيح');
    await t.write(() => t.click('#cn_draft'));
    await t.write(() => t.click('#cn_send'));
  }),
  A('creator_nominate_agreed_influencer_to_campaign', 'creator', '#acq', async t => {
    await t.click(`#aList [data-openinfl="${I.acq_agreed}"]`);
    await t.click('[data-a="tocamp"]');
    await t.select('#cn_c', K.alpha);
    await t.click('#cn_go');
    await t.write(() => t.click('#cn_send'));                                      // card 1 = returned-for-edit deal, card 2 = prefilled from the file
  }),
  A('creator_delete_draft_nomination', 'creator', '#camps', async t => {
    await t.click(`#cList [data-nom="${K.beta}"]`);
    await t.click('[data-card="1"] [data-rm]');
    await t.write(() => t.confirm());
  }),
  A('creator_deal_draft_save_then_send', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="camp_draft"] [data-open="${D.draft}"]`);
    await t.fill('#f_hook', 'هوك جديد');
    await t.fill('#f_notes', 'ملاحظة على الترشيح');
    await t.write(() => t.click('[data-act="save0"]'));
    await t.write(() => t.click('[data-act="send"]'));
  }),
  A('creator_deal_fix_and_resend', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="camp_fix"] [data-open="${D.needs_edit}"]`);
    await t.fill('#f_price', '900');
    await t.write(() => t.click('[data-act="send"]'));
  }),
  A('creator_quota_request', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="camp_quota"] [data-nom="${K.alpha}"]`);
    await t.click('#cn_more');
    await t.fill('#rq_n', '3');
    await t.fill('#rq_w', 'عندي ثلاث حسابات جاهزة');
    await t.write(() => t.confirm());
  }),
  /* ---------- creator: address, raw video, posting, closing ---------- */
  A('creator_save_flags_and_address', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="intake"] [data-open="${D.approved_noaddr}"]`);
    await t.check('#f_no_pay');
    await t.write(() => t.click('[data-act="flags"]'));
    await t.fill('#f_rcv_phone', '12');
    await t.quiet(() => t.click('[data-act="addr"]'));                             // invalid phone: no write
    await t.fill('#f_rcv_name', 'مستلم الاختبار');
    await t.fill('#f_rcv_phone', '0551234567');
    await t.fill('#f_rcv_city', 'الرياض');
    await t.fill('#f_address', 'حي الاختبار – RRRD1234');
    await t.write(() => t.click('[data-act="addr"]'));
  }),
  A('creator_send_raw_video', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="video"] [data-open="${D.delivered}"]`);
    await t.quiet(() => t.click('[data-act="draft"]'));                            // no link: no write
    await t.fill('#f_draft_url', 'https://drive.example.test/new-raw');
    await t.fill('#f_draft_note', 'أول نسخة من المقطع');
    await t.write(() => t.click('[data-act="draft"]'));
    await t.click('#dClose');
    await t.click(`${mine} [data-g="video_fix"] [data-open="${D.video_fix}"]`);
    await t.fill('#f_draft_url', 'https://drive.example.test/raw-v2');
    await t.write(() => t.click('[data-act="draft"]'));
  }),
  A('creator_register_posting_per_platform', 'creator', '#mine', async t => {
    await t.click(`${mine} [data-g="post"] [data-open="${D.video_ok}"]`);
    await t.quiet(() => t.click('[data-act="dl_tt"]'));                            // code is mandatory
    await t.fill('#f_tt_code', '#SPARK-NEW');
    await t.fill('#f_post_url', 'https://www.tiktok.com/@smoke/video/42');
    await t.write(() => t.click('[data-act="dl_tt"]'));
    await t.fill('#f_tt_code', '#SPARK-EDITED');
    await t.write(() => t.click('[data-act="code_tt"]'));
    await t.fill('#f_sn_user', 'smoke_snap_user');
    await t.write(() => t.click('[data-act="dl_sn"]'));                            // last platform: posted_at
  }),
  A('creator_close_file', 'creator', '#pipe', async t => {
    await t.click(`#pList [data-open="${D.shipped1}"]`);
    await t.click('[data-act="close"]');
    await t.quiet(() => t.cancel());
    await t.click('[data-act="close"]');
    await t.write(() => t.confirm());
  }),
  A('admin_reopen_closed_and_rejected', 'admin', '#pipe', async t => {
    await t.check('#pClosed');
    await t.click(`#pList [data-open="${D.closed}"]`);
    await t.write(() => t.click('[data-act="reopen"]'));
    await t.click('#dClose');
    await t.click(`#pList [data-open="${D.rejected}"]`);
    await t.write(() => t.click('[data-act="reopen"]'));
  }),
  A('admin_approves_approver_own_work', 'admin', '#mine', async t => {
    await t.check(`${mine} [data-bulk="${D.pending_ap}"]`);
    await t.click(`${mine} [data-dobulk="appr"]`);
    await t.write(() => t.confirm());
    await t.click(`${mine} [data-g="draft"] [data-open="${D.draft_pending_ap}"]`);
    await t.write(() => t.click('[data-act="vok"]'));
    await t.click('#dClose');
    await t.click(`${mine} [data-g="acq_review"] [data-openinfl="${I.acq_pending_ap}"]`);
    await t.write(() => t.click('[data-a="approve"]'));
  }),
  /* ---------- requests ---------- */
  A('creator_request_create', 'creator', '#req', async t => {
    await t.click('#newReq');
    await t.quiet(() => t.click('#rSave'));                                        // empty: validation only
    await t.select('#rKind', 'ship');
    await t.fill('#rTitle', 'شحنة عينات تجريبية');
    await t.fill('#rDue', '2030-01-15');
    await t.fill('#rSize', 'كرتون صغير');
    await t.fill('#rRef', 'https://example.test/ref');
    await t.fill('#rDet', 'اشحن ثلاث عينات للعنوان المرفق');
    await t.write(() => t.click('#rSave'));
  }),
  A('shipper_request_start_and_deliver', 'shipper', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="req_in"] [data-req="${R.new_ship}"]`));   // opening marks it read
    await t.write(() => t.click('[data-q="doing"]'));
    await t.quiet(() => t.click('[data-q="review"]'));                             // needs a delivery note
    await t.fill('#qRes', 'انشحنت: بوليصة SMK-77');
    await t.write(() => t.click('[data-q="review"]'));
  }),
  A('shipper_request_redeliver_after_fix', 'shipper', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="req_fix"] [data-req="${R.fix_ship}"]`));
    await t.fill('#qRes', 'أعدت الشحن للعنوان الصحيح');
    await t.write(() => t.click('[data-q="review"]'));
  }),
  A('creator_request_approve_and_return_for_fix', 'creator', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="req_review"] [data-req="${R.review_ad}"]`));
    await t.write(() => t.click('[data-q="done"]'));
    await t.click('#qClose');
    await t.write(() => t.click(`${mine} [data-g="req_review"] [data-req="${R.review_snap}"]`));
    await t.click('[data-q="fix"]');
    await t.write(() => t.reason('الموعد غلط، عدّله'));
  }),
  A('creator_request_comment_edit_cancel', 'creator', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="req_new"] [data-req="${R.doing_ad}"]`));
    await t.quiet(() => t.click('[data-q="msg"]'));                                // empty reply
    await t.fill('#qMsg', 'الميزانية 500 ريال');
    await t.write(() => t.click('[data-q="msg"]'));
    await t.click('[data-q="edit"]');
    await t.fill('#rTitle', 'إطلاق إعلان (معدّل)');
    await t.write(() => t.click('#rSave'));
    await t.click('[data-q="cancel"]');
    await t.write(() => t.confirm());
  }),
  A('creator_request_reopen_done', 'creator', '#req', async t => {
    await t.check('#rDone');
    await t.write(() => t.click(`#rList [data-req="${R.done_design}"]`));
    await t.click('[data-q="reopen"]');
    await t.write(() => t.reason('المقاس غلط'));
  }),
  A('approver_quota_request_approve', 'approver', '#mine', async t => {
    await t.write(() => t.click(`${mine} [data-g="quota_req"] [data-req="${R.quota}"]`));
    await t.write(() => t.click('[data-q="qok"]'));
  }),
  A('admin_quota_request_reject', 'admin', '#mine', async t => {
    await t.write(() => t.clickFirst(`${mine} [data-g="quota_req"] [data-req="${R.quota_ap}"]`));   // listed twice for the admin in the pristine app
    await t.click('[data-q="qno"]');
    await t.write(() => t.reason('الحملة مكتملة'));
  }),
  /* ---------- daily report ---------- */
  A('shipper_daily_report_save', 'shipper', '#today', async t => {
    await t.check('[data-t="shipper_1"]');
    await t.fill('#tNote', 'جهزت شحنات خارج النظام');
    await t.fill('#tBlock', 'شركة الشحن متأخرة');
    await t.write(() => t.click('#tSave'));
    await t.check('[data-t="shipper_0"]');
    await t.write(() => t.click('#tSave'));                                        // second save = upsert on the same day
  }),
  /* ---------- admin: campaigns, quotas, settings ---------- */
  A('admin_quotas_save', 'admin', '#camps', async t => {
    const box = `[data-camp="${K.beta}"]`;
    await t.fill(`${box} [data-q="${M.creator}"]`, '99');
    await t.quiet(() => t.click(`${box} [data-qsave]`));                           // over the campaign target: blocked client-side
    await t.fill(`${box} [data-q="${M.creator}"]`, '4');
    await t.write(() => t.click(`${box} [data-qsave]`));
    await t.quiet(() => t.click(`${box} [data-qeven]`));                           // fills the inputs only
    await t.write(() => t.click(`${box} [data-qsave]`));
  }),
  A('approver_quotas_save', 'approver', '#camps', async t => {
    const box = `[data-camp="${K.alpha}"]`;
    await t.fill(`${box} [data-q="${M.creator2}"]`, '8');
    await t.write(() => t.click(`${box} [data-qsave]`));
  }),
  A('admin_campaign_create', 'admin', '#camps', async t => {
    await t.click('#campAdd');
    await t.quiet(() => t.confirm());                                              // name is mandatory
    await t.fill('#nc_n', 'حملة تجريبية جديدة');
    await t.fill('#nc_p', 'منتج تجريبي');
    await t.fill('#nc_t', '15');
    await t.write(() => t.confirm());
  }),
  A('admin_campaign_edit', 'admin', '#camps', async t => {
    const box = `[data-camp="${K.beta}"]`;
    await t.reveal(`${box} [data-k="name"]`);                                      // the settings live in a collapsed <details> whose <summary> has no id/data-*
    await t.fill(`${box} [data-k="name"]`, 'حملة باء (معدّلة)');
    await t.fill(`${box} [data-k="product"]`, 'بكج باء 2');
    await t.fill(`${box} [data-k="target_total"]`, '12');
    await t.select(`${box} [data-k="status"]`, 'paused');
    await t.write(() => t.click(`${box} [data-csave]`));
  }),
  A('admin_sla_save', 'admin', '#setup', async t => {
    await t.fill('#sla_appr', '3');
    await t.fill('#sla_ship', '5');
    await t.write(() => t.click('#sSlaSave'));
  }),
  A('admin_member_activate_and_roles', 'admin', '#setup', async t => {
    const row = `[data-m="${M.pending}"]`;
    await t.fill(`${row} [data-k="name"]`, 'عضو مفعّل');
    await t.check(`${row} [data-k="active"]`);
    await t.check(`${row} [data-role="creator"]`);
    await t.check(`${row} [data-role="design"]`);
    await t.write(() => t.click(`${row} [data-msave]`));
    const sh = `[data-m="${M.shipper}"]`;
    await t.uncheck(`${sh} [data-role="shipper"]`);
    await t.check(`${sh} [data-role="media"]`);
    await t.check(`${sh} [data-k="is_admin"]`);
    await t.write(() => t.click(`${sh} [data-msave]`));
  }),
  A('admin_kpi_settings_save', 'admin', '#setup', async t => {
    await t.fill('#kp_med', '1500');
    await t.fill(`[data-cap="${M.creator}"]`, '40');
    await t.fill(`[data-cap="${M.creator2}"]`, '80');
    await t.write(() => t.click('#sKpiSave'));
  }),
  A('admin_daily_tasks_save', 'admin', '#setup', async t => {
    await t.fill('#tk_design', 'مراجعة الطلبات\nتسليم التصاميم');
    await t.fill('#tk_media', '');
    await t.write(() => t.click('#sTasksSave'));
  }),
  A('admin_bank_keys_generate', 'admin', '#setup', async t => {
    await t.write(() => t.click('#bankGen'));
  }),
  /* ---------- Excel exports ---------- */
  A('admin_export_dashboard_xlsx', 'admin', '#dash', async t => {
    await t.exported(() => t.click('#dXlsx'));
    await t.select('#dPeriod', 'all');
    await t.select('#kMonth', '2026-10');
    await t.exported(() => t.click('#dXlsx'));
  }),
  A('shipper_export_shipping_sheets', 'shipper', '#mine', async t => {
    await t.exported(() => t.click(`${mine} [data-g="ship_send"] [data-shipx]`));
    await t.exported(() => t.click(`${mine} [data-g="ship_send"] [data-salx]`));
  }),
  A('admin_export_pay_sheet', 'admin', '#mine', async t => {
    /* من 12 نوفمبر: الكشف ينزل من «معتمدة للدفع» فقط، وللمحدد فقط */
    await t.quiet(() => t.click(`${mine} [data-g="pay_go"] [data-payx]`));                  // بدون تحديد: ما ينزل شي
    await t.check(`${mine} [data-g="pay_go"] [data-all]`);
    await t.exported(() => t.click(`${mine} [data-g="pay_go"] [data-payx]`));
  }),
  A('snap_export_tracker_sheet', 'snap', '#mine', async t => {
    await t.exported(() => t.click(`${mine} [data-g="snap_follow"] [data-ziadx]`));
  }),
  /* ---------- public intake page ---------- */
  A('intake_submit_address', 'anon', `intake.html?t=${tokenOf(D.approved_noaddr)}`, async t => {
    await t.visible('form');
    await t.quiet(() => t.click('#send'));                                         // empty: validation only
    await t.fill('#rcv_name', 'مستلم من الرابط');
    await t.fill('#rcv_phone', '0559998877');
    await t.fill('#rcv_city', 'جدة');
    await t.fill('#address', 'حي الرابط، شارع الاختبار');
    await t.fill('#short_code', 'JJJD4321');
    await t.write(() => t.click('#send'));
  }),
  A('intake_resubmit_already_filled', 'anon', `intake.html?t=${tokenOf(D.ready_ship2)}`, async t => {
    await t.visible('form');
    await t.fill('#rcv_name', 'مستلم معدّل');
    await t.fill('#rcv_phone', '+971501234567');
    await t.fill('#country', 'الإمارات');
    await t.fill('#rcv_city', 'دبي');
    await t.fill('#address', 'حي معدّل');
    await t.write(() => t.click('#send'));
  }),
  A('intake_bad_token', 'anon', 'intake.html?t=not-a-token', async t => { await t.quiet(async () => { }); }),
  /* ---------- auth ---------- */
  A('auth_sign_in_then_out', 'anon', '', async t => {
    await t.visible('authView');
    await t.quiet(() => t.click('#aGo'));                                          // empty: validation only
    await t.fill('#aEmail', 'nobody@smoke.test'); await t.fill('#aPass', 'wrong-password');
    await t.write(() => t.click('#aGo'));
    await t.fill('#aEmail', 'creator@smoke.test'); await t.fill('#aPass', 'smoke-password');
    await t.write(() => t.click('#aGo'));
    await t.visible('appView'); await t.visible('v-mine');
    await t.write(() => t.click('#signOut'));
    await t.visible('authView');
  }),
  A('auth_sign_up_and_resend', 'anon', '', async t => {
    await t.click('#aSwitch');
    await t.fill('#aName', 'مسجّل جديد'); await t.fill('#aEmail', 'new@smoke.test'); await t.fill('#aPass', 'smoke-password');
    await t.write(() => t.click('#aGo'));
    await t.write(() => t.click('#aResend'));
  }),
  /* ---------- read-only interactions: must not write anything ---------- */
  A('readonly_admin_browsing', 'admin', '#mine', async t => {
    await t.quiet(() => t.select('#mineAs', 'team'));
    await t.quiet(() => t.click(`${mine} [data-as="${M.creator}"]`));
    await t.quiet(() => t.select('#mineAs', M.admin));
    await t.click('#howBtn'); await t.click('#howX');
    await t.go('#pipe');
    await t.quiet(() => t.click('#board [data-col="ship"]'));
    await t.quiet(() => t.fill('#pQ', 'smoke'));
    await t.quiet(() => t.check('#pLate'));
    await t.quiet(() => t.select('#pMem', M.creator2));
    await t.go('#acq');
    await t.quiet(() => t.select('#aSt', 'pending'));
    await t.quiet(() => t.click(`#aList [data-openinfl="${I.acq_pending}"]`));
    await t.click('#f_x');
    await t.go('#camps');
    await t.quiet(() => t.check('#cEnded'));
    await t.go('#req');
    await t.quiet(() => t.select('#rScope', 'all'));
    await t.quiet(() => t.check('#rDone'));
    await t.go('#dash');
    await t.quiet(() => t.select('#dPeriod', 'last'));
    await t.quiet(() => t.click(`#kCard [data-kpi="${M.creator}"]`));
    await t.click('#kX');
    await t.go('#today');
    await t.quiet(() => t.fill('#tDate', '2026-11-10'));
  })
];

async function runScenario(browser, sc) {
  const s = await openSession(browser, sc.persona, sc.start);
  const errs = [];
  let out = { writes: [], exports: [] };
  try {
    await sc.run(new T(s.page));
  } catch (e) { errs.push('step failed: ' + firstLine(e)); }
  try {
    await settle(s.page).catch(() => { });
    out = await s.page.evaluate(() => { const r = { writes: window.__writes.slice(), exports: window.__exports.slice() }; window.__writes.length = 0; window.__exports.length = 0; return r; });
  } catch (e) { errs.push('could not read the write log: ' + firstLine(e)); }
  /* a scenario may declare ONE known production bug (a page error that the pristine app already throws); anything else fails */
  const notes = [];
  if (sc.knownPageError) {
    const known = s.log.pageErrors.filter(e => sc.knownPageError.test(e));
    s.log.pageErrors = s.log.pageErrors.filter(e => !sc.knownPageError.test(e));
    notes.push(known.length ? `known production bug reproduced (allowed): pageerror "${known[0]}"` : 'the known production bug declared for this scenario did NOT reproduce (fixed?)');
  }
  errs.push(...problems(s.log));
  notes.push(...blockedNotes(s.log));
  await s.context.close();
  return { name: sc.name, errs, notes, writes: out.writes, exports: out.exports };
}

/* ------------------------------------------------------------------ diff + baseline io */
const firstLine = e => process.env.SMOKE_DEBUG ? String((e && e.stack) || e) : String((e && e.message) || e).split('\n')[0].slice(0, 300);
const one = o => JSON.stringify(o);
function lcsDiff(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push(['=', a[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]); }
  while (i < n) out.push(['-', a[i++]]); while (j < m) out.push(['+', b[j++]]);
  return out;
}
function diffList(label, exp, act) {
  const a = (exp || []).map(one), b = (act || []).map(one);
  if (a.length === b.length && a.every((x, k) => x === b[k])) return [];
  const lines = [`${label}: baseline has ${a.length}, current run has ${b.length}`]; let ia = 0, ib = 0;
  for (const [op, s] of lcsDiff(a, b)) {
    if (op === '=') { ia++; ib++; } else if (op === '-') lines.push(`  - baseline #${++ia}: ${s}`); else lines.push(`  + current  #${++ib}: ${s}`);
  }
  return lines;
}
function flatten(o, pre, out) { for (const k of Object.keys(o || {})) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, pre + k + '.', out); else out[pre + k] = one(v); } return out; }
function diffSummary(exp, act) {
  const a = flatten(exp, '', {}), b = flatten(act, '', {}), lines = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) if (a[k] !== b[k]) lines.push(`  ${k}: ${a[k] === undefined ? '(absent)' : a[k]} -> ${b[k] === undefined ? '(absent)' : b[k]}`);
  return lines;
}
function saveBaseline(data) {
  const L = ['{', `  "meta": ${one(data.meta)},`, '  "render": {'];
  const rk = Object.keys(data.render);
  rk.forEach((k, i) => L.push(`    ${one(k)}: ${one(data.render[k])}${i < rk.length - 1 ? ',' : ''}`));
  L.push('  },', '  "scenarios": {');
  const sk = Object.keys(data.scenarios);
  sk.forEach((k, i) => {
    const s = data.scenarios[k];
    L.push(`    ${one(k)}: {`, '      "writes": [');
    s.writes.forEach((w, j) => L.push(`        ${one(w)}${j < s.writes.length - 1 ? ',' : ''}`));
    L.push('      ],', '      "exports": [');
    s.exports.forEach((w, j) => L.push(`        ${one(w)}${j < s.exports.length - 1 ? ',' : ''}`));
    L.push('      ]', `    }${i < sk.length - 1 ? ',' : ''}`);
  });
  L.push('  }', '}', '');
  fs.writeFileSync(BASELINE, L.join('\n'));
}
async function pool(items, worker) {
  const res = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, items.length) }, async () => { for (;;) { const i = next++; if (i >= items.length) return; res[i] = await worker(items[i]); } }));
  return res;
}

/* ------------------------------------------------------------------ main */
(async () => {
  const t0 = Date.now();
  const pick = list => ONLY ? list.filter(x => x.name.includes(ONLY)) : list;
  const checks = pick(renderChecks()), scenarios = pick(SCENARIOS);
  if (!checks.length && !scenarios.length) { console.error(`nothing matches --only "${ONLY}"`); process.exit(2); }
  let base = null;
  if (fs.existsSync(BASELINE)) { try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { console.error('baseline.json is not valid JSON: ' + e.message); process.exit(2); } }
  if (!UPDATE && !base) { console.error('baseline.json not found. Record it first from the known-good app:  node tests/smoke/smoke.js --update'); process.exit(2); }

  console.log(`smoke: ${UPDATE ? 'UPDATE baseline from' : 'compare'} ${APP_URL}  (clock pinned at ${FROZEN_NOW}, ${JOBS} parallel)${ONLY ? `  --only "${ONLY}"` : ''}`);
  if (!UPDATE && base.meta && base.meta.harness !== HARNESS) console.log('  note: fixtures.js / fake-supabase.js changed since the baseline was recorded; differences may come from the harness, not the app.');
  const browser = await chromium.launch();
  let failed = 0, renderDiffs = 0;
  const say = (ok, name, extra) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

  console.log(`\nPart A — render (${checks.length} checks)`);
  const rres = await pool(checks, c => runRender(browser, c).catch(e => ({ name: c.name, errs: ['crashed: ' + firstLine(e)], summary: null })));
  for (const r of rres) {
    const info = !UPDATE && !r.errs.length && base && base.render[r.name] && r.summary ? diffSummary(base.render[r.name], r.summary) : [];
    const strictFail = STRICT_RENDER && info.length > 0;
    const ok = !r.errs.length && !strictFail; if (!ok) failed++;
    say(ok, r.name, info.length ? `(render summary differs in ${info.length} place${info.length > 1 ? 's' : ''}${STRICT_RENDER ? '' : ' — informational'})` : '');
    r.errs.forEach(e => console.log('        ' + e));
    (r.notes || []).forEach(e => console.log('        note: ' + e));
    if (info.length) { renderDiffs++; info.slice(0, 12).forEach(l => console.log('      ' + l)); if (info.length > 12) console.log(`        … ${info.length - 12} more`); }
  }

  console.log(`\nPart B — actions (${scenarios.length} scenarios)`);
  const sres = await pool(scenarios, s => runScenario(browser, s).catch(e => ({ name: s.name, errs: ['crashed: ' + firstLine(e)], writes: [], exports: [] })));
  for (const r of sres) {
    let lines = [];
    if (!UPDATE) {
      const b = base.scenarios[r.name];
      if (!b) lines.push('no baseline for this scenario (run --update against the known-good app)');
      else lines = diffList('writes', b.writes, r.writes).concat(diffList('exports', b.exports, r.exports));
    }
    const ok = !r.errs.length && !lines.length; if (!ok) failed++;
    say(ok, r.name, `(${r.writes.length} writes${r.exports.length ? ', ' + r.exports.length + ' exports' : ''})`);
    r.errs.forEach(e => console.log('        ' + e));
    (r.notes || []).forEach(e => console.log('        note: ' + e));
    lines.forEach(l => console.log('      ' + l));
    if (SHOW) { r.writes.forEach((w, k) => console.log(`        write #${k + 1}: ${one(w)}`)); r.exports.forEach((w, k) => console.log(`        export #${k + 1}: ${one(w)}`)); }
  }
  await browser.close();

  if (UPDATE) {
    if (failed) { console.log(`\n${failed} check(s) failed — baseline NOT written.`); process.exit(1); }
    const data = ONLY && base ? base : { meta: {}, render: {}, scenarios: {} };
    data.meta = { harness: HARNESS, frozenNow: FROZEN_NOW, note: 'recorded by smoke.js --update; the per-scenario writes/exports are the contract, render summaries are informational' };
    for (const r of rres) data.render[r.name] = r.summary;
    for (const r of sres) data.scenarios[r.name] = { writes: r.writes, exports: r.exports };
    saveBaseline(data);
    console.log(`\nbaseline.json written: ${Object.keys(data.render).length} render summaries, ${Object.keys(data.scenarios).length} scenarios, ${Object.values(data.scenarios).reduce((n, s) => n + s.writes.length, 0)} recorded writes.`);
  } else if (!ONLY) {
    const missing = Object.keys(base.scenarios).filter(k => !SCENARIOS.some(s => s.name === k));
    if (missing.length) console.log(`\nnote: baseline has scenarios that no longer exist: ${missing.join(', ')}`);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${failed ? 'FAILED' : 'OK'}: ${rres.length - rres.filter(r => r.errs.length).length}/${rres.length} render checks clean, ${sres.length} scenarios, ${failed} failure(s)${renderDiffs && !UPDATE ? `, ${renderDiffs} informational render difference(s)` : ''} — ${secs}s`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
