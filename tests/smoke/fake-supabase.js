/* In-memory stand-in for supabase-js (and for SheetJS) used by the smoke tests.
 * Served by smoke.js in place of the supabase-js CDN script, right after fixtures.js.
 *
 *   window.__PERSONA   who is signed in (admin | approver | creator | creator2 | shipper | media | snap | design | social | pending | anon)
 *   window.__writes    every insert/update/upsert/delete/rpc (and auth call) as {table, op, match, payload}, normalised
 *   window.__exports   every XLSX.writeFile as {file, sheets, rows, columns, digest}
 *   window.__fake      { db, idle(ms), pending, queries, errors }
 *
 * It mimics what the real database does where the UI depends on it: column defaults, updated_at/updated_by,
 * the request_events -> requests trigger, row-level visibility per role, and the four RPCs.
 * It does NOT enforce the approval/pay/quota guard triggers (the UI is expected not to attempt those writes;
 * an attempted write is recorded either way, so a regression still shows up in the log).
 */
(function () {
  'use strict';
  const FX = window.__makeFixtures(Date.now());
  const DB = FX.db;
  const persona = window.__PERSONA || 'admin';
  let sessionUser = FX.personas[persona] ? userOf(FX.personas[persona]) : null;
  function userOf(id) { const m = DB.members.find(x => x.id === id); return m ? { id: m.id, email: m.email } : null; }

  /* ---------------- helpers ---------------- */
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const nowIso = () => new Date().toISOString();
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const uid = () => sessionUser ? sessionUser.id : null;
  const me = () => DB.members.find(m => m.id === uid());
  const isMember = () => !!(me() && me().active);
  const isAdmin = () => !!(isMember() && me().is_admin);
  const hasRole = r => !!(isMember() && (me().is_admin || (me().roles || []).includes(r)));
  let seq = 0;
  const newUuid = () => `99999999-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const newToken = () => 'gen' + String(++seq).padStart(21, '0');
  const err = (message, code) => ({ message, code: code || 'XX000', details: '', hint: '' });

  /* ---------------- normalisation of the write log ---------------- */
  const RE_TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)$/;
  const RE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const RE_BLOB = /^[A-Za-z0-9_\-+/=]{80,}$/;                       // key material and other long opaque strings
  function normStr(s) {
    if (RE_TS.test(s)) return '<ts>';
    if (RE_BLOB.test(s)) return '<blob>';
    const t = today();
    let out = s.replace(RE_UUID, u => FX.labels[u.toLowerCase()] || '<uuid>');
    if (out.includes(t)) out = out.split(t).join('<today>');
    const compact = t.replace(/-/g, '');
    if (out.includes(compact)) out = out.split(compact).join('<today>');
    if (/^gen\d{21}$/.test(out)) out = '<uuid>';
    return out;
  }
  function norm(v) {
    if (v === undefined) return undefined;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return normStr(v);
    if (Array.isArray(v)) return v.map(x => { const n = norm(x); return n === undefined ? null : n; });
    if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) { const n = norm(v[k]); if (n !== undefined) o[normStr(k)] = n; } return o; }
    return String(v);
  }
  window.__writes = [];
  window.__exports = [];
  function record(table, op, match, payload, error) {
    const rec = { table, op, match: match == null ? null : norm(match), payload: payload === undefined ? null : norm(payload) };
    if (error) rec.error = error.message;
    window.__writes.push(rec);
  }

  /* ---------------- schema: defaults, keys, triggers, RLS ---------------- */
  const DEFAULTS = {
    members: () => ({ name: '', roles: [], is_admin: false, active: false, aliases: [], created_at: nowIso() }),
    settings: () => ({ updated_at: nowIso() }),
    campaigns: () => ({ id: newUuid(), product: '', active: true, created_at: nowIso(), target_total: null, status: 'active' }),
    deals: () => ({
      id: newUuid(), member_id: null, campaign_id: null, phone: '', handle: '', platform: '', city: '', acc_type: '', followers: '',
      price: null, currency: 'SAR', price_note: '', notes: '', sent_at: null, approval: 'pending', approved_by: null, approved_at: null,
      intake_token: newToken(), rcv_name: '', rcv_phone: '', rcv_city: '', address: '', short_code: '', country: 'السعودية',
      intake_at: null, no_ship: false, no_pay: false, shipped_at: null, delivered_at: null, tracking: '',
      draft_url: '', draft_at: null, rounds: 0, video_ok_at: null, video_score: null, post_url: '', tt_code: '', ig_code: '', sn_code: '',
      hook: '', posted_at: null, ad_name: '', live_at: null, paid_at: null, closed_reason: '', closed_at: null,
      created_by: uid(), created_at: nowIso(), updated_by: null, updated_at: nowIso(),
      influencer_id: null, batch_id: null, decision_reason: '', ad_type: '', planned_date: null, price_before: null,
      ship_failed_at: null, ship_note: '', sn_user: '', tt_at: null, ig_at: null, sn_at: null, tt_live_at: null, ig_live_at: null, sn_live_at: null,
      draft_note: '', draft_feedback: '', ship_company: '', pay_ok_at: null, pay_ok_by: null
    }),
    deal_bank: () => ({ created_at: nowIso() }),
    influencers: () => ({
      id: newUuid(), name_en: '', handle: '', tiktok_url: '', acc_type: '', account_status: 'استقطاب', country: '', phone: '', city: '', district: '',
      platforms: '', snap_user: '', ig_user: '', yt_url: '', nominated_by: uid(), nominated_on: today(), source: 'acq',
      acq_status: 'draft', acq_sent_at: null, acq_decided_at: null, acq_decided_by: null, acq_reason: '',
      contacts: [], had_problem: null, problem: '', contact_summary: '', price_before: null, price_after: null, currency: 'SAR', agreed_at: null,
      notes: '', created_at: nowIso(), updated_by: null, updated_at: nowIso()
    }),
    quotas: () => ({ quota: 0, updated_by: uid(), updated_at: nowIso() }),
    requests: () => ({
      id: newUuid(), kind: 'design', details: '', ref_url: '', size: '', from_member: uid(), to_member: null, due: null, status: 'new',
      result_url: '', rounds: 0, deal_id: null, created_at: nowIso(), started_at: null, done_at: null, updated_at: nowIso(),
      campaign_id: null, qty: null, last_event_at: null, last_event_by: null, last_event_type: ''
    }),
    request_events: () => ({ id: DB.request_events.reduce((m, e) => Math.max(m, e.id), 0) + 1, member_id: uid(), body: '', created_at: nowIso() }),
    request_reads: () => ({ member_id: uid(), seen_at: nowIso() }),
    daily_reports: () => ({ tasks: {}, note: '', blockers: '', updated_at: nowIso() })
  };
  const PK = { members: ['id'], settings: ['key'], campaigns: ['id'], deals: ['id'], deal_bank: ['deal_id'], influencers: ['id'], quotas: ['campaign_id', 'member_id'], requests: ['id'], request_events: ['id'], request_reads: ['request_id', 'member_id'], daily_reports: ['member_id', 'day'] };
  const TOUCH = ['deals', 'requests', 'settings', 'influencers', 'quotas'];             // audit(): updated_at := now()
  const posted = d => !!(d.tt_at || d.ig_at || d.sn_at || d.posted_at);
  /* SELECT policies after migration 007 */
  const CAN_SEE = {
    members: r => r.id === uid() || isMember(),
    settings: () => isMember(), campaigns: () => isMember(), quotas: () => isMember(), requests: () => isMember(), request_events: () => isMember(),
    deals: d => hasRole('approver') || d.member_id === uid() || (d.approval === 'approved' && hasRole('shipper')) || (d.approval === 'approved' && posted(d) && (hasRole('media') || hasRole('snap'))),
    influencers: i => hasRole('approver') || i.nominated_by === uid() || DB.deals.some(d => d.influencer_id === i.id && d.member_id === uid()),
    deal_bank: () => isAdmin(),
    request_reads: r => r.member_id === uid(),
    daily_reports: r => r.member_id === uid() || isAdmin()
  };
  /* UPDATE ... USING policies */
  const CAN_UPDATE = Object.assign({}, CAN_SEE, {
    members: () => isAdmin(), settings: () => isAdmin(), campaigns: () => isAdmin(), quotas: () => hasRole('approver'),
    influencers: i => hasRole('approver') || i.nominated_by === uid(),
    daily_reports: r => r.member_id === uid(),
    deal_bank: () => isMember()
  });
  function afterInsert(table, row) {
    if (table === 'request_events') { const r = DB.requests.find(x => x.id === row.request_id); if (r) Object.assign(r, { last_event_at: row.created_at, last_event_by: row.member_id, last_event_type: row.type }); }
  }
  function touch(table, row) { if (TOUCH.includes(table)) row.updated_at = nowIso(); if (table === 'deals' || table === 'influencers') row.updated_by = uid(); }

  /* ---------------- query builder ---------------- */
  const state = { pending: 0, last: performance.now(), queries: 0, errors: 0 };
  function run(fn) {
    state.pending++; state.queries++; state.last = performance.now();
    return new Promise(resolve => setTimeout(() => {
      let res;
      try { res = fn(); } catch (e) { res = { data: null, error: err('fake-supabase: ' + (e && e.message || e)) }; console.error('fake-supabase failure', e); }
      if (res.error) state.errors++;
      state.pending--; state.last = performance.now();
      resolve(Object.assign({ status: res.error ? 400 : 200, statusText: res.error ? 'Bad Request' : 'OK', count: null }, res));
    }, 2));
  }
  const cmp = (a, b) => (a == null && b == null) ? 0 : a == null ? 1 : b == null ? -1 : (typeof a === 'number' && typeof b === 'number') ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  const like = (v, pat, ci) => new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', ci ? 'i' : '').test(String(v == null ? '' : v));
  const FILTERS = {
    eq: (a, b) => a === b || (a != null && b != null && String(a) === String(b)),
    neq: (a, b) => !(a === b || (a != null && b != null && String(a) === String(b))),
    gt: (a, b) => a != null && cmp(a, b) > 0, gte: (a, b) => a != null && cmp(a, b) >= 0,
    lt: (a, b) => a != null && cmp(a, b) < 0, lte: (a, b) => a != null && cmp(a, b) <= 0,
    in: (a, b) => (b || []).some(x => FILTERS.eq(a, x)),
    is: (a, b) => (b === null ? a == null : a === b),
    like: (a, b) => like(a, b, false), ilike: (a, b) => like(a, b, true),
    contains: (a, b) => Array.isArray(a) && (b || []).every(x => a.includes(x))
  };
  function builder(table) {
    const st = { op: 'select', filters: [], order: [], limit: null, cols: null, one: null, payload: null, returning: false, onConflict: null };
    let promise = null;
    const b = {};
    for (const name of Object.keys(FILTERS)) b[name] = (col, val) => { st.filters.push({ name, col, val }); return b; };
    b.match = obj => { for (const k in obj) st.filters.push({ name: 'eq', col: k, val: obj[k] }); return b; };
    b.select = cols => { if (st.op === 'select') st.cols = cols || '*'; else { st.returning = true; st.cols = cols || '*'; } return b; };
    b.insert = rows => { st.op = 'insert'; st.payload = rows; return b; };
    b.update = ch => { st.op = 'update'; st.payload = ch; return b; };
    b.upsert = (rows, o) => { st.op = 'upsert'; st.payload = rows; st.onConflict = o && o.onConflict; return b; };
    b.delete = () => { st.op = 'delete'; return b; };
    b.order = (col, o) => { st.order.push({ col, asc: !(o && o.ascending === false) }); return b; };
    b.limit = n => { st.limit = n; return b; };
    b.range = (a, z) => { st.range = [a, z]; return b; };
    b.single = () => { st.one = 'single'; return b; };
    b.maybeSingle = () => { st.one = 'maybe'; return b; };
    b.abortSignal = () => b; b.throwOnError = () => b; b.returns = () => b;
    b.then = (ok, ko) => { if (!promise) promise = run(exec); return promise.then(ok, ko); };
    b.catch = ko => b.then(undefined, ko);
    b.finally = f => b.then(v => { f(); return v; }, e => { f(); throw e; });

    const matches = r => st.filters.every(f => FILTERS[f.name](r[f.col], f.val));
    const matchObj = () => { if (!st.filters.length) return null; const m = {}; for (const f of st.filters) m[f.col] = f.name === 'eq' ? f.val : { [f.name]: f.val }; return m; };
    const project = r => { if (!st.cols || st.cols === '*') return clone(r); const o = {}; for (const c of st.cols.split(',').map(s => s.trim()).filter(Boolean)) o[c] = clone(r[c]); return o; };
    function shape(rows) {
      if (st.one) {
        if (rows.length === 1) return { data: project(rows[0]), error: null };
        if (rows.length === 0 && st.one === 'maybe') return { data: null, error: null };
        return { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
      }
      return { data: rows.map(project), error: null };
    }
    function exec() {
      const T = DB[table];
      if (!T) { const e = err(`relation "public.${table}" does not exist`, '42P01'); if (st.op !== 'select') record(table, st.op, matchObj(), st.payload, e); return { data: null, error: e }; }
      const see = CAN_SEE[table] || (() => true), upd = CAN_UPDATE[table] || see;
      if (st.op === 'select') {
        let rows = T.filter(r => see(r) && matches(r));
        for (const o of st.order.slice().reverse()) rows = rows.map((r, i) => [r, i]).sort((x, y) => (o.asc ? 1 : -1) * cmp(x[0][o.col], y[0][o.col]) || x[1] - y[1]).map(x => x[0]);
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        if (st.limit != null) rows = rows.slice(0, st.limit);
        return shape(rows);
      }
      if (st.op === 'insert' || st.op === 'upsert') {
        const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(clone);
        const keys = st.onConflict ? st.onConflict.split(',').map(s => s.trim()) : PK[table] || ['id'];
        const out = [];
        for (const p of list) {
          const full = Object.assign((DEFAULTS[table] || (() => ({})))(), p);
          const cur = T.find(r => keys.every(k => r[k] != null && r[k] === full[k]));
          if (cur && st.op === 'insert') { const e = err(`duplicate key value violates unique constraint "${table}_pkey"`, '23505'); record(table, st.op, null, st.payload, e); return { data: null, error: e }; }
          if (cur) { Object.assign(cur, p); touch(table, cur); out.push(cur); }
          else { T.push(full); afterInsert(table, full); out.push(full); }
        }
        record(table, st.op, null, st.payload);
        return st.returning ? shape(out) : { data: null, error: null };
      }
      if (st.op === 'update') {
        const rows = T.filter(r => upd(r) && matches(r));
        for (const r of rows) { Object.assign(r, clone(st.payload)); touch(table, r); }
        const res = st.returning ? shape(rows) : { data: null, error: null };
        record(table, 'update', matchObj(), st.payload, res.error);
        return res;
      }
      if (st.op === 'delete') {
        const rows = T.filter(r => (isAdmin() || (table === 'requests' && r.from_member === uid())) && matches(r));
        for (const r of rows) T.splice(T.indexOf(r), 1);
        record(table, 'delete', matchObj(), null);
        return st.returning ? shape(rows) : { data: null, error: null };
      }
      return { data: null, error: err('fake-supabase: unsupported operation ' + st.op) };
    }
    return new Proxy(b, { get(t, k) { if (k in t || typeof k === 'symbol') return t[k]; throw new Error(`fake-supabase: query method .${String(k)}() is not implemented (table ${table}) — add it to tests/smoke/fake-supabase.js`); } });
  }

  /* ---------------- RPCs ---------------- */
  const digits = s => String(s || '').replace(/\D/g, '');
  const RPC = {
    infl_lookup({ p_handle, p_phone }) {
      if (!isMember()) return null;
      const h = String(p_handle || '').toLowerCase(), p = digits(p_phone);
      const i = DB.influencers.slice().sort((a, b) => cmp(a.created_at, b.created_at)).find(x => (h && String(x.handle || '').toLowerCase() === h) || (p.length >= 9 && digits(x.phone).slice(-9) === p.slice(-9)));
      if (!i) return null;
      return { id: i.id, name: i.name, owner_name: (DB.members.find(m => m.id === i.nominated_by) || {}).name || '', mine: i.nominated_by === uid() };
    },
    quota_grant({ p_campaign, p_member, p_qty }) {
      if (p_qty == null || p_qty < 1) throw err('عدد الزيادة غير صحيح', 'P0001');
      if (!(isAdmin() || hasRole('approver'))) throw err('اعتماد زيادة الحصص لمتعب أو عبدالمحسن فقط', 'P0001');
      if (p_member === uid() && !isAdmin()) throw err('زيادة حصتك يعتمدها عبدالمحسن، مو أنت', 'P0001');
      const c = DB.campaigns.find(x => x.id === p_campaign); if (c && c.target_total != null) c.target_total += p_qty;
      let q = DB.quotas.find(x => x.campaign_id === p_campaign && x.member_id === p_member);
      if (q) Object.assign(q, { quota: q.quota + p_qty, updated_by: uid(), updated_at: nowIso() });
      else { q = { campaign_id: p_campaign, member_id: p_member, quota: p_qty, updated_by: uid(), updated_at: nowIso() }; DB.quotas.push(q); }
      return q.quota;
    },
    intake_get({ p_token }) {
      const d = DB.deals.find(x => x.intake_token === p_token && x.approval === 'approved' && !x.closed_at); if (!d) return null;
      const c = DB.campaigns.find(x => x.id === d.campaign_id), bp = DB.settings.find(s => s.key === 'bank_pub');
      return { name: d.name, campaign: c ? c.name : null, done: !!d.intake_at, no_pay: d.no_pay, no_ship: d.no_ship, bank_pub: bp ? clone(bp.value) : null };
    },
    intake_submit({ p_token, p, p_cipher }) {
      const d = DB.deals.find(x => x.intake_token === p_token && x.approval === 'approved' && !x.closed_at); if (!d) return false;
      p = p || {}; const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
      Object.assign(d, { rcv_name: cut(p.rcv_name, 120), rcv_phone: cut(p.rcv_phone, 30), rcv_city: cut(p.rcv_city, 80), address: cut(p.address, 400), short_code: cut(p.short_code, 20), country: cut(p.country == null ? 'السعودية' : p.country, 60), intake_at: nowIso(), updated_at: nowIso() });
      if (p_cipher != null) { const b = DB.deal_bank.find(x => x.deal_id === d.id); if (b) Object.assign(b, { cipher: clone(p_cipher), created_at: nowIso() }); else DB.deal_bank.push({ deal_id: d.id, cipher: clone(p_cipher), created_at: nowIso() }); }
      return true;
    }
  };
  function rpc(name, args) {
    const p = run(() => {
      const fn = RPC[name];
      if (!fn) { const e = err(`Could not find the function public.${name} in the schema cache`, 'PGRST202'); record(name, 'rpc', null, args || {}, e); return { data: null, error: e }; }
      try { const data = fn(clone(args || {})); record(name, 'rpc', null, args || {}); return { data: data === undefined ? null : clone(data), error: null }; }
      catch (e) { const er = e && e.message && e.code ? e : err(String(e && e.message || e)); record(name, 'rpc', null, args || {}, er); return { data: null, error: er }; }
    });
    const b = { then: (ok, ko) => p.then(ok, ko), catch: ko => p.catch(ko), single: () => b, maybeSingle: () => b, select: () => b };
    return b;
  }

  /* ---------------- auth ---------------- */
  const authCbs = [];
  const fire = ev => authCbs.forEach(cb => { try { cb(ev, sessionUser ? { user: sessionUser } : null); } catch (e) { console.error(e); } });
  const auth = {
    async getSession() { return { data: { session: sessionUser ? { user: sessionUser, access_token: 'fake', expires_at: 4102444800 } : null }, error: null }; },
    async getUser() { return { data: { user: sessionUser }, error: null }; },
    onAuthStateChange(cb) { authCbs.push(cb); return { data: { subscription: { unsubscribe() { const i = authCbs.indexOf(cb); if (i >= 0) authCbs.splice(i, 1); } } } }; },
    async signOut() { record('auth', 'signOut', null, null); sessionUser = null; fire('SIGNED_OUT'); return { error: null }; },
    async signInWithPassword({ email, password } = {}) {
      const m = DB.members.find(x => x.email === String(email || '').toLowerCase());
      record('auth', 'signInWithPassword', null, { email });
      if (!m || !password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', status: 400 } };
      sessionUser = { id: m.id, email: m.email }; fire('SIGNED_IN');
      return { data: { user: sessionUser, session: { user: sessionUser } }, error: null };
    },
    async signUp({ email, options } = {}) { record('auth', 'signUp', null, { email, name: options && options.data && options.data.name }); return { data: { user: { id: newUuid(), email }, session: null }, error: null }; },
    async resend({ type, email } = {}) { record('auth', 'resend', null, { type, email }); return { data: {}, error: null }; }
  };

  const client = { from: builder, rpc, auth, channel() { return { on() { return this; }, subscribe() { return this; }, unsubscribe() { } }; }, removeChannel() { } };
  window.supabase = { createClient(url, key) { window.__fake.created.push({ url, key }); return client; } };
  window.__fake = {
    db: DB, fixtures: FX, created: [], state,
    idle(ms) { return state.pending === 0 && performance.now() - state.last >= (ms == null ? 100 : ms); },
    setPersona(p) { sessionUser = FX.personas[p] ? userOf(FX.personas[p]) : null; }
  };

  /* ---------------- SheetJS stub: record the export instead of downloading ---------------- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ('0000000' + (h >>> 0).toString(16)).slice(-8); }
  window.XLSX = {
    __stub: true,
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      json_to_sheet: rows => ({ __rows: Array.isArray(rows) ? rows : [] }),
      aoa_to_sheet: rows => ({ __rows: Array.isArray(rows) ? rows : [] }),
      book_append_sheet(wb, ws, name) { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    },
    writeFile(wb, file) {
      const rows = {}, columns = {}, digest = {};
      for (const n of wb.SheetNames) { const R = (wb.Sheets[n] && wb.Sheets[n].__rows) || []; rows[n] = R.length; columns[n] = R.length ? Object.keys(R[0]) : []; digest[n] = hash(JSON.stringify(norm(R.map(r => Object.keys(r).map(k => [k, r[k]]))))); }
      window.__exports.push({ file: normStr(String(file)), sheets: wb.SheetNames.slice(), rows, columns, digest });
    }
  };
})();
