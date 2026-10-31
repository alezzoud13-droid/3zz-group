/* أداء فريق العز — الواجهة. البيانات كلها في Supabase، وهذا الملف يعرضها ويحدّثها. */
(function () {
'use strict';
const C = window.APP_CONFIG;
const sb = supabase.createClient(C.supabaseUrl, C.supabaseKey);

/* ================= ثوابت ================= */
const ROLES = { creator: 'صانع محتوى', approver: 'الاعتماد (متعب)', shipper: 'الشحن', media: 'الميديا باير', snap: 'منسق سناب', social: 'السوشيال ميديا', design: 'التصميم', owned: 'الحسابات المملوكة' };
const STEPS = [
  { k: 'nom', n: 'الترشيح', who: 'creator' },
  { k: 'appr', n: 'الاعتماد', who: 'approver' },
  { k: 'intake', n: 'بيانات المؤثر', who: 'creator' },
  { k: 'ship', n: 'الشحن', who: 'shipper' },
  { k: 'video', n: 'المقطع والنشر', who: 'creator' },
  { k: 'live', n: 'الإعلان', who: 'media' }
];
const SI = Object.fromEntries(STEPS.map((s, i) => [s.k, i]));
const DEF_SLA = { nom: 3, appr: 2, intake: 3, ship: 7, video: 10, live: 2 };
const PLATFORMS = ['تيك توك', 'سناب', 'انستقرام', 'تيك توك + انستقرام', 'تيك توك + سناب', 'جميع المنصات'];
const ACC_TYPES = ['بيعي', 'مقيم عطور', 'صانع محتوى', 'فلوق وترندات', 'رياضي'];
const REQ_KINDS = { design: 'تصميم', ship: 'شحن', ad: 'إطلاق إعلان', snap: 'سناب', social: 'سوشيال ميديا', other: 'أخرى' };
const REQ_STATUS = { new: ['جديد', 'acc'], doing: ['قيد التنفيذ', 'warn'], review: ['بانتظار المراجعة', 'acc'], done: ['منتهي', 'good'], cancelled: ['ملغي', ''] };

/* ================= أدوات ================= */
const $ = id => document.getElementById(id);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const nowIso = () => new Date().toISOString();
const days = (a, b) => (a && b) ? Math.round((new Date(b) - new Date(a)) / 864e5) : null;
const ageOf = a => a ? Math.max(0, Math.floor((Date.now() - new Date(a)) / 864e5)) : 0;
const dShort = s => s ? new Date(s).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short' }) : '';
const fmt = n => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (a, b) => b ? Math.round(a / b * 100) : null;
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const ph = s => { const d = String(s || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const hnd = s => String(s || '').trim().replace(/^.*(tiktok\.com\/@|instagram\.com\/|snapchat\.com\/add\/)/i, '').replace(/^@/, '').replace(/[/?].*$/, '').toLowerCase();
let toastT; function toast(m, bad) { const t = $('toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3000); }
async function copyTxt(t) { try { await navigator.clipboard.writeText(t); toast('انسخ'); } catch (e) { toast('ما قدرت أنسخ، ظلّل النص وانسخه', true); } }
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyTxt(b.dataset.copy); });

/* ================= الحالة ================= */
const S = { user: null, me: null, members: [], camps: [], deals: [], reqs: [], sla: { ...DEF_SLA }, tasks: {}, bankPub: null, bankPriv: null, view: 'mine', pStep: '' };
const mem = id => S.members.find(m => m.id === id);
const memName = id => (mem(id) || {}).name || '—';
const active = () => S.members.filter(m => m.active);
const withRole = r => active().filter(m => (m.roles || []).includes(r));
const hasRole = (id, r) => !!(mem(id) && (mem(id).roles || []).includes(r));
const isAdmin = () => !!(S.me && S.me.is_admin);
const camp = id => S.camps.find(c => c.id === id) || {};

/* ================= منطق المراحل ================= */
const isClosed = d => !!(d.closed_at || d.approval === 'rejected');
const isParked = d => !isClosed(d) && d.approval === 'backup';
const DONE = {
  nom: d => !!(d.sent_at || d.approval !== 'pending'),
  appr: d => d.approval === 'approved',
  intake: d => !!(d.intake_at || d.no_ship),
  ship: d => !!(d.delivered_at || d.no_ship),
  video: d => !!d.posted_at,
  live: d => !!d.live_at
};
function curStep(d) { if (isClosed(d)) return -1; for (let i = 0; i < STEPS.length; i++) if (!DONE[STEPS[i].k](d)) return i; return STEPS.length; }
function stepStart(d, i) { return [d.created_at, d.sent_at, d.approved_at, d.intake_at || d.approved_at, d.delivered_at || d.intake_at, d.posted_at][i] || d.created_at; }
const stepAge = (d, i) => ageOf(stepStart(d, i));
function lateness(d, i) { if (i < 0 || i >= STEPS.length || isParked(d)) return ''; const a = stepAge(d, i), lim = S.sla[STEPS[i].k] ?? DEF_SLA[STEPS[i].k]; return a > lim ? 'late' : a >= lim ? 'soon' : ''; }
const draftPending = d => !!(d.draft_at && !d.video_ok_at && !d.posted_at);
function owners(d, i) {
  if (i < 0 || i >= STEPS.length) return [];
  if (i === SI.video && draftPending(d)) return withRole('approver').map(m => m.id);
  const w = STEPS[i].who; return w === 'creator' ? [d.member_id] : withRole(w).map(m => m.id);
}
function platKeys(d) { const p = d.platform || ''; if (/جميع/.test(p)) return ['tt', 'ig', 'sn']; const a = []; if (/تيك/.test(p)) a.push('tt'); if (/انست/.test(p)) a.push('ig'); if (/سناب/.test(p)) a.push('sn'); return a.length ? a : ['tt']; }
const PL = { tt: 'تيك توك', ig: 'انستقرام', sn: 'سناب' };
const codeOf = (d, p) => ({ tt: d.tt_code, ig: d.ig_code, sn: d.sn_code }[p]);
const codesComplete = d => platKeys(d).every(p => codeOf(d, p));
const adName = d => [camp(d.campaign_id).name, d.name, d.hook, memName(d.member_id), d.tt_code || d.ig_code || d.sn_code].map(x => String(x || '').trim()).filter(Boolean).join(' | ');
const intakeLink = d => location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/') + 'intake.html?t=' + d.intake_token;
const waLink = (d, txt) => { const p = String(d.phone || '').replace(/\D/g, '').replace(/^0/, '966'); return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt) : ''; };

/* ================= البيانات ================= */
async function q(p) { const { data, error } = await p; if (error) { console.warn(error); toast(error.message.includes('row-level') ? 'ما عندك صلاحية لهذي العملية' : 'تعذّر الحفظ: ' + error.message, true); return null; } return data ?? true; }
async function loadAll() {
  const [m, c, s, d, r] = await Promise.all([
    sb.from('members').select('*').order('name'),
    sb.from('campaigns').select('*').order('name'),
    sb.from('settings').select('*'),
    sb.from('deals').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('requests').select('*').order('created_at', { ascending: false }).limit(3000)
  ]);
  S.members = m.data || []; S.camps = c.data || []; S.deals = d.data || []; S.reqs = r.data || [];
  for (const x of (s.data || [])) { if (x.key === 'sla') S.sla = { ...DEF_SLA, ...x.value }; if (x.key === 'daily_tasks') S.tasks = x.value || {}; if (x.key === 'bank_pub') S.bankPub = x.value; }
  S.me = S.members.find(x => x.id === S.user.id) || S.me;
}
async function saveDeal(id, ch) {
  const res = id ? await q(sb.from('deals').update(ch).eq('id', id).select().single()) : await q(sb.from('deals').insert(ch).select().single());
  if (!res) return null;
  const i = S.deals.findIndex(x => x.id === res.id); if (i >= 0) S.deals[i] = res; else S.deals.unshift(res);
  return res;
}
async function saveReq(id, ch) {
  const res = id ? await q(sb.from('requests').update(ch).eq('id', id).select().single()) : await q(sb.from('requests').insert(ch).select().single());
  if (!res) return null;
  const i = S.reqs.findIndex(x => x.id === res.id); if (i >= 0) S.reqs[i] = res; else S.reqs.unshift(res);
  return res;
}

/* ================= الدخول ================= */
let signUp = false;
function showAuth() { $('authView').hidden = false; $('appView').hidden = true; $('waitView').hidden = true; }
$('aSwitch').onclick = () => { signUp = !signUp; $('nameWrap').hidden = !signUp; $('aGo').textContent = signUp ? 'سجّل حساب' : 'دخول'; $('aSwitch').textContent = signUp ? 'عندك حساب؟ ادخل' : 'ما عندك حساب؟ سجّل'; $('aMsg').hidden = true; };
$('aGo').onclick = async () => {
  const email = $('aEmail').value.trim(), password = $('aPass').value, name = $('aName').value.trim();
  const msg = t => { $('aMsg').textContent = t; $('aMsg').hidden = false; };
  if (!email || password.length < 8) return msg('اكتب الإيميل، وكلمة مرور 8 أحرف أو أكثر.');
  if (signUp && !name) return msg('اكتب اسمك.');
  $('aGo').disabled = true;
  const r = signUp ? await sb.auth.signUp({ email, password, options: { data: { name } } }) : await sb.auth.signInWithPassword({ email, password });
  $('aGo').disabled = false;
  if (r.error) return msg(/Invalid login/.test(r.error.message) ? 'الإيميل أو كلمة المرور غلط.' : r.error.message);
  if (signUp && !r.data.session) return msg('أرسلنا لك رابط تأكيد على الإيميل. افتحه ثم ارجع وادخل.');
  start();
};
$('signOut').onclick = $('wOut').onclick = async () => { await sb.auth.signOut(); location.hash = ''; showAuth(); };
$('wRetry').onclick = () => start();

async function start() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showAuth();
  S.user = data.session.user;
  const { data: me } = await sb.from('members').select('*').eq('id', S.user.id).maybeSingle();
  S.me = me;
  if (!me || !me.active) { $('authView').hidden = true; $('appView').hidden = true; $('waitView').hidden = false; return; }
  $('authView').hidden = true; $('waitView').hidden = true; $('appView').hidden = false;
  try { const k = localStorage.getItem('alezz_bank_priv'); if (k && isAdmin()) S.bankPriv = JSON.parse(k); } catch (e) { }
  await loadAll();
  $('whoName').textContent = S.me.name || S.me.email;
  document.querySelectorAll('.adm').forEach(e => e.hidden = !isAdmin());
  route();
}

/* ================= التنقل ================= */
const VIEWS = ['mine', 'pipe', 'req', 'today', 'dash', 'setup'];
function route() {
  let v = location.hash.slice(1); if (!VIEWS.includes(v)) v = 'mine'; if ((v === 'dash' || v === 'setup') && !isAdmin()) v = 'mine';
  S.view = v; document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === v)); render();
}
window.addEventListener('hashchange', route);
function render() {
  updateMineCount();
  ({ mine: renderMine, pipe: renderPipe, req: renderReqs, today: renderToday, dash: renderDash, setup: renderSetup })[S.view]();
}
setInterval(async () => { if (!S.me || !$('ov').hidden) return; await loadAll(); render(); }, 90000);

/* ================= مودال ================= */
function modal(html, init, small) { const ov = $('ov'); ov.innerHTML = `<div class="modal${small ? ' small' : ''}" role="dialog" aria-modal="true">${html}</div>`; ov.hidden = false; ov.onclick = e => { if (e.target === ov) closeModal(); }; if (init) init(ov); }
function closeModal() { $('ov').hidden = true; $('ov').innerHTML = ''; render(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ov').hidden) closeModal(); });
function confirmBox(msg, yes) { return new Promise(r => { const box = document.createElement('div'); box.className = 'ov'; box.style.zIndex = 70; box.innerHTML = `<div class="modal small"><h3>تأكيد</h3><p style="margin:0">${esc(msg)}</p><div class="row"><button class="btn primary" type="button" data-y>${esc(yes || 'نعم')}</button><button class="btn" type="button" data-n>إلغاء</button></div></div>`; document.body.appendChild(box); box.querySelector('[data-y]').onclick = () => { box.remove(); r(true); }; box.querySelector('[data-n]').onclick = () => { box.remove(); r(false); }; }); }

/* ================= مهامي ================= */
const QL = {
  nom: 'كمّل الترشيح وأرسله للاعتماد', appr: 'ترشيحات تنتظر اعتمادك', intake: 'أرسل رابط البيانات للمؤثر وتابعه',
  ship_send: 'جاهزة للشحن', ship_wait: 'في الطريق: سجّل الوصول', video: 'نسّق المقطع وارفع المسودة', video_fix: 'مسودات رجعت للتعديل',
  draft: 'مسودات تنتظر اعتمادك', post: 'معتمدة: سجّل النشر والأكواد', live: 'جاهزة لإطلاق الإعلان', pay: 'تنتظر الدفع',
  req_in: 'طلبات عليك', req_review: 'طلبات سلّموها لك: راجعها', members: 'حسابات جديدة تنتظر التفعيل', park: 'احتياط'
};
const QO = ['members', 'appr', 'draft', 'req_review', 'video_fix', 'ship_send', 'ship_wait', 'live', 'req_in', 'nom', 'intake', 'video', 'post', 'pay', 'park'];
const BULK = {
  appr: ['اعتماد', () => ({ approval: 'approved', approved_at: nowIso(), approved_by: S.me.id })],
  ship_send: ['تم الشحن اليوم', () => ({ shipped_at: nowIso() })],
  ship_wait: ['وصلت اليوم', () => ({ delivered_at: nowIso() })],
  live: ['انطلق الإعلان', d => ({ live_at: nowIso(), ad_name: d.ad_name || adName(d) })],
  pay: ['تم الدفع', () => ({ paid_at: nowIso() })]
};
function queuesFor(id) {
  const G = {}; const add = (k, x) => (G[k] = G[k] || []).push(x);
  for (const d of S.deals) {
    if (isClosed(d)) continue; const i = curStep(d);
    if (isParked(d)) { if (d.member_id === id || hasRole(id, 'approver')) add('park', { d, i }); continue; }
    if (id === 'admin') { if (d.posted_at && !d.paid_at && !d.no_pay) add('pay', { d, i }); continue; }
    if (i >= STEPS.length || !owners(d, i).includes(id)) continue;
    const k = STEPS[i].k;
    if (k === 'ship') add(d.shipped_at ? 'ship_wait' : 'ship_send', { d, i });
    else if (k === 'video') { if (draftPending(d)) add('draft', { d, i }); else if (d.video_ok_at) add('post', { d, i }); else add(d.rounds > 0 ? 'video_fix' : 'video', { d, i }); }
    else add(k, { d, i });
  }
  for (const r of S.reqs) {
    if (r.status === 'done' || r.status === 'cancelled') continue;
    if (r.to_member === id && (r.status === 'new' || r.status === 'doing')) add('req_in', { r });
    if (r.from_member === id && r.status === 'review') add('req_review', { r });
  }
  if (id === 'admin') S.members.filter(m => !m.active).forEach(m => add('members', { m }));
  for (const k in G) G[k].sort((a, b) => (a.d && b.d) ? stepAge(b.d, b.i) - stepAge(a.d, a.i) : 0);
  return G;
}
function countFor(id) { const G = queuesFor(id); return Object.entries(G).filter(([k]) => k !== 'park').reduce((a, [, v]) => a + v.length, 0); }
function updateMineCount() { if (!S.me) return; const n = countFor(S.me.id) + (isAdmin() ? countFor('admin') : 0); $('mineCnt').hidden = !n; $('mineCnt').textContent = n; }
function dealRow(x, bulk) {
  const { d, i } = x; const late = lateness(d, i); const age = stepAge(d, i);
  const sub = [camp(d.campaign_id).name || 'بدون حملة', d.member_id !== S.me.id ? memName(d.member_id) : '', i === SI.video && d.video_ok_at ? platKeys(d).filter(p => !codeOf(d, p)).map(p => 'ناقص كود ' + PL[p]).join('، ') : '', d.price ? fmt(d.price) + ' ' + (d.currency || '') : ''].filter(Boolean).join(' · ');
  return `<div class="qrow ${late}">${bulk ? `<input type="checkbox" data-bulk="${d.id}" aria-label="تحديد">` : '<span></span>'}<div><div class="t">${esc(d.name)}</div><div class="sub">${esc(sub)}</div></div><div class="acts row" style="gap:6px;flex-wrap:nowrap"><span class="pill ${late === 'late' ? 'bad' : late === 'soon' ? 'warn' : ''}">${age} يوم</span><button class="btn sm" data-open="${d.id}" type="button">افتح</button></div></div>`;
}
function reqRow(r) {
  const late = r.due && r.due < today() ? 'late' : r.due === today() ? 'soon' : '';
  return `<div class="qrow ${late}"><span></span><div><div class="t">${esc(r.title)}</div><div class="sub">${esc([REQ_KINDS[r.kind], 'من ' + memName(r.from_member), 'إلى ' + memName(r.to_member), r.due ? 'الموعد ' + r.due : ''].filter(Boolean).join(' · '))}</div></div><div class="acts row" style="gap:6px"><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span><button class="btn sm" data-req="${r.id}" type="button">افتح</button></div></div>`;
}
function renderMine() {
  const as = $('mineAs'); let id = S.me.id;
  if (isAdmin()) { const v = as.value || S.me.id; as.innerHTML = `<option value="${S.me.id}">أنا</option><option value="team">ملخص الفريق</option>` + active().filter(m => m.id !== S.me.id).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join(''); as.value = [...as.options].some(o => o.value === v) ? v : S.me.id; id = as.value; }
  if (id === 'team') return renderTeam();
  const G = queuesFor(id); if (id === S.me.id && isAdmin()) { const A = queuesFor('admin'); for (const k in A) G[k] = (G[k] || []).concat(A[k]); }
  const total = Object.entries(G).filter(([k]) => k !== 'park').reduce((a, [, v]) => a + v.length, 0);
  $('mineTitle').textContent = id === S.me.id ? 'مهامي' : 'مهام ' + memName(id);
  $('mineSub').textContent = total ? `${total} شي ينتظر خطوة. الأحمر تجاوز المدة.` : 'ما عندك شي معلّق.';
  $('mineBody').innerHTML = QO.filter(k => G[k] && G[k].length).map(k => {
    const L = G[k], b = BULK[k]; const lateN = L.filter(x => x.d && lateness(x.d, x.i) === 'late').length;
    const rows = k === 'members' ? L.map(({ m }) => `<div class="qrow"><span></span><div><div class="t">${esc(m.name || m.email)}</div><div class="sub">${esc(m.email)}</div></div><div class="acts"><a class="btn sm" href="#setup">فعّله من الإعدادات</a></div></div>`).join('')
      : (k === 'req_in' || k === 'req_review') ? L.map(x => reqRow(x.r)).join('') : L.map(x => dealRow(x, !!b)).join('');
    return `<div class="panel" data-g="${k}"><div class="qhead"><h3>${QL[k]}</h3><span class="num">${L.length}</span>${lateN ? `<span class="pill bad">${lateN} متأخر</span>` : ''}${b ? `<span style="margin-inline-start:auto" class="row"><label class="check small"><input type="checkbox" data-all> الكل</label><button class="btn sm primary" data-dobulk="${k}" type="button">${b[0]} للمحدد</button></span>` : ''}</div>${k === 'park' ? `<details><summary class="small muted" style="cursor:pointer">اعرض القائمة</summary><div style="display:grid;gap:8px;margin-top:8px">${rows}</div></details>` : `<div style="display:grid;gap:8px">${rows}</div>`}</div>`;
  }).join('') || '<div class="empty">ما عندك شي معلّق الحين. ابدأ ترشيح جديد من «+ ترشيح» أو اطلب شي من زميل من «+ طلب».</div>';
}
function renderTeam() {
  $('mineTitle').textContent = 'ملخص الفريق'; $('mineSub').textContent = 'كم شي ينتظر كل شخص، وكم منه متأخر.';
  const rows = active().map(m => { const G = queuesFor(m.id); let n = 0, l = 0; for (const k in G) { if (k === 'park') continue; n += G[k].length; l += G[k].filter(x => (x.d && lateness(x.d, x.i) === 'late') || (x.r && x.r.due && x.r.due < today())).length; } return { m, n, l }; }).sort((a, b) => b.l - a.l || b.n - a.n);
  $('mineBody').innerHTML = `<div class="tw"><table><thead><tr><th>الشخص</th><th>الدور</th><th class="num">ينتظر</th><th class="num">متأخر</th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-as="${x.m.id}"><td>${esc(x.m.name)}</td><td class="small muted">${esc((x.m.roles || []).map(r => ROLES[r]).join(' + '))}</td><td class="num">${x.n}</td><td class="num">${x.l ? `<span class="pill bad">${x.l}</span>` : '<span class="pill good">0</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
$('mineAs').addEventListener('change', renderMine);
$('mineBody').addEventListener('click', async e => {
  const o = e.target.closest('[data-open]'); if (o) return openDeal(o.dataset.open);
  const rq = e.target.closest('[data-req]'); if (rq) return openReq(rq.dataset.req);
  const as = e.target.closest('[data-as]'); if (as) { $('mineAs').value = as.dataset.as; return renderMine(); }
  const all = e.target.closest('[data-all]'); if (all) { all.closest('[data-g]').querySelectorAll('[data-bulk]').forEach(c => c.checked = all.checked); return; }
  const b = e.target.closest('[data-dobulk]'); if (b) {
    const k = b.dataset.dobulk; const ids = [...b.closest('[data-g]').querySelectorAll('[data-bulk]:checked')].map(c => c.dataset.bulk);
    if (!ids.length) return toast('حدّد ملف واحد على الأقل', true);
    if (!await confirmBox(`${BULK[k][0]}: ${ids.length} ملف؟`, 'تأكيد')) return;
    b.disabled = true; let ok = 0; for (const id of ids) { const d = S.deals.find(x => x.id === id); if (d && await saveDeal(id, BULK[k][1](d))) ok++; }
    toast(`تحدّث ${ok} ملف`); render();
  }
});

/* ================= ترشيح جديد ================= */
function opts(list, sel) { return list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join(''); }
function campOpts(sel) { return '<option value="">اختر الحملة</option>' + S.camps.filter(c => c.active || c.id === sel).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join(''); }
function history(phone, handle, exceptId) {
  const p = ph(phone), h = hnd(handle); if (!p && !h) return [];
  return S.deals.filter(d => d.id !== exceptId && ((p && ph(d.phone) === p) || (h && h.length > 2 && hnd(d.handle) === h)));
}
function historyNote(list) {
  if (!list.length) return '';
  const posted = list.filter(d => d.posted_at).length, prices = list.map(d => d.price).filter(Boolean);
  return `<div class="dup">تعاملنا معه قبل ${list.length} مرة: نزّل ${posted}، ${list.filter(isClosed).length} مغلقة. آخر سعر ${prices.length ? fmt(prices[0]) : '—'}. آخر صانع: ${esc(memName(list[0].member_id))}.</div>`;
}
$('newDeal').onclick = () => {
  const creatorOpts = active().filter(m => hasRole(m.id, 'creator')).map(m => `<option value="${m.id}" ${m.id === S.me.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  modal(`<h2>ترشيح جديد</h2>
  <div class="grid2">
   <div class="field"><label for="nName">اسم المؤثر *</label><input type="text" id="nName"></div>
   <div class="field"><label for="nHandle">اليوزر أو رابط الحساب</label><input type="text" id="nHandle" dir="ltr"></div>
   <div class="field"><label for="nPhone">الجوال</label><input type="tel" id="nPhone" dir="ltr"></div>
   <div class="field"><label for="nPlat">المنصة</label><select id="nPlat">${opts(PLATFORMS)}</select></div>
   <div class="field"><label for="nType">نوع الحساب</label><select id="nType">${opts(ACC_TYPES)}</select></div>
   <div class="field"><label for="nCity">المدينة</label><input type="text" id="nCity"></div>
   <div class="field"><label for="nFol">المتابعين</label><input type="text" id="nFol"></div>
   <div class="field"><label for="nPrice">السعر المتفق (0 = مقابل منتج)</label><input type="number" id="nPrice" min="0"></div>
   <div class="field"><label for="nCur">العملة</label><select id="nCur"><option>SAR</option><option>AED</option><option>USD</option></select></div>
   <div class="field"><label for="nCamp">الحملة *</label><select id="nCamp">${campOpts()}</select></div>
   ${isAdmin() || hasRole(S.me.id, 'approver') ? `<div class="field"><label for="nMem">صانع المحتوى</label><select id="nMem">${creatorOpts}</select></div>` : ''}
  </div>
  <div id="nDup"></div>
  <div class="field"><label for="nNotes">ملاحظات</label><textarea id="nNotes"></textarea></div>
  <label class="check"><input type="checkbox" id="nSend" checked> أرسله لمتعب للاعتماد الحين</label>
  <div class="row"><button class="btn primary" id="nSave" type="button">حفظ</button><button class="btn" id="nCancel" type="button">إلغاء</button></div>`, ov => {
    const chk = () => { $('nDup').innerHTML = historyNote(history($('nPhone').value, $('nHandle').value)); };
    $('nPhone').addEventListener('input', chk); $('nHandle').addEventListener('input', chk);
    $('nCancel').onclick = closeModal;
    $('nSave').onclick = async () => {
      const name = $('nName').value.trim(); if (!name) return toast('اكتب اسم المؤثر', true); if (!$('nCamp').value) return toast('اختر الحملة', true);
      const pr = $('nPrice').value;
      const r = await saveDeal(null, { name, handle: $('nHandle').value.trim(), phone: $('nPhone').value.trim(), platform: $('nPlat').value, acc_type: $('nType').value, city: $('nCity').value.trim(), followers: $('nFol').value.trim(), price: pr === '' ? null : Number(pr), currency: $('nCur').value, campaign_id: $('nCamp').value, member_id: $('nMem') ? $('nMem').value : S.me.id, notes: $('nNotes').value.trim(), sent_at: $('nSend').checked ? nowIso() : null });
      if (r) { toast('انحفظ الترشيح'); closeModal(); }
    };
  });
};

/* ================= ملف المؤثر ================= */
function openDeal(id) {
  const d = S.deals.find(x => x.id === id); if (!d) return;
  const i = curStep(d), me = S.me.id, adm = isAdmin(), appr = hasRole(me, 'approver') || adm, mine = d.member_id === me || adm;
  const stepper = `<div class="stepper">${STEPS.map((s, j) => `<div class="st ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}"><b></b><span>${s.n}</span></div>`).join('')}</div>`;
  const sec = (j, body, meta) => `<details class="sec ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}" ${j === i ? 'open' : ''}><summary><span class="idx">${j + 1}</span><span class="ttl">${STEPS[j].n}</span><span class="meta">${meta || ''}</span></summary><div class="body">${body}</div></details>`;
  const v = (k) => esc(d[k] ?? '');
  const hist = history(d.phone, d.handle, d.id);
  const link = intakeLink(d);
  const waIntake = waLink(d, `هلا ${d.name}، نورتنا 🌹 عبّ بياناتك للشحن والتحويل من هذا الرابط: ${link}`);
  const ad = d.ad_name || adName(d);
  modal(`<div class="row between"><div><h2>${esc(d.name)}</h2><div class="muted small">${esc([camp(d.campaign_id).name, memName(d.member_id), d.platform, d.handle].filter(Boolean).join(' · '))}</div></div><button class="btn" id="dClose" type="button">إغلاق</button></div>
  ${stepper}${historyNote(hist)}
  ${isClosed(d) ? `<div class="dup">مغلق: ${esc(d.closed_reason || 'مرفوض')}</div>` : ''}
  ${sec(0, `<div class="grid2">
     <div class="field"><label for="f_name">الاسم</label><input type="text" id="f_name" value="${v('name')}"></div>
     <div class="field"><label for="f_handle">اليوزر</label><input type="text" id="f_handle" dir="ltr" value="${v('handle')}"></div>
     <div class="field"><label for="f_phone">الجوال</label><input type="tel" id="f_phone" dir="ltr" value="${v('phone')}"></div>
     <div class="field"><label for="f_platform">المنصة</label><select id="f_platform">${opts(PLATFORMS, d.platform)}</select></div>
     <div class="field"><label for="f_acc_type">نوع الحساب</label><select id="f_acc_type">${opts(ACC_TYPES, d.acc_type)}</select></div>
     <div class="field"><label for="f_city">المدينة</label><input type="text" id="f_city" value="${v('city')}"></div>
     <div class="field"><label for="f_price">السعر</label><input type="number" id="f_price" value="${v('price')}"></div>
     <div class="field"><label for="f_campaign_id">الحملة</label><select id="f_campaign_id">${campOpts(d.campaign_id)}</select></div>
   </div><div class="field"><label for="f_notes">ملاحظات</label><textarea id="f_notes">${v('notes')}</textarea></div>
   <div class="row"><button class="btn" data-act="save0" type="button">حفظ التعديلات</button>${!d.sent_at && d.approval === 'pending' ? '<button class="btn primary" data-act="send" type="button">أرسل للاعتماد</button>' : ''}</div>`, d.sent_at ? 'أُرسل ' + dShort(d.sent_at) : 'مسودة')}
  ${sec(1, appr ? `<div class="row"><button class="btn good" data-act="approve" type="button">اعتماد</button><button class="btn" data-act="backup" type="button">احتياط</button><button class="btn danger" data-act="reject" type="button">رفض</button></div>` : `<div class="muted">بانتظار ${esc(withRole('approver').map(m => m.name).join('، ') || 'المعتمد')}.</div>`, d.approval === 'approved' ? 'معتمد ' + dShort(d.approved_at) : d.approval === 'backup' ? 'احتياط' : d.approval === 'rejected' ? 'مرفوض' : '')}
  ${sec(2, `<div class="muted small">أرسل الرابط للمؤثر، وهو يعبّي عنوانه وحسابه البنكي بنفسه. البنك يتشفّر على جهازه، وما يشوفه إلا عبدالمحسن.</div>
   <div class="copybox"><code>${esc(link)}</code><button class="btn sm" data-copy="${esc(link)}" type="button">نسخ</button></div>
   <div class="row">${waIntake ? `<a class="btn primary" href="${esc(waIntake)}" target="_blank" rel="noopener">إرسال واتساب</a>` : ''}<label class="check small"><input type="checkbox" id="f_no_ship" ${d.no_ship ? 'checked' : ''}> ما يحتاج شحن</label><label class="check small"><input type="checkbox" id="f_no_pay" ${d.no_pay ? 'checked' : ''}> ما يحتاج دفع (مقابل منتج)</label><button class="btn sm" data-act="flags" type="button">حفظ</button></div>
   ${d.intake_at ? `<div class="grid2 small"><div><b>المستلم:</b> ${v('rcv_name')} · <span dir="ltr">${v('rcv_phone')}</span></div><div><b>العنوان:</b> ${v('rcv_city')} · ${v('address')} · ${v('short_code')}</div></div>` : ''}
   ${adm ? '<div id="bankBox"></div>' : ''}`, d.intake_at ? 'عبّاها ' + dShort(d.intake_at) : '')}
  ${sec(3, `<div class="grid2"><div class="field"><label for="f_tracking">رقم التتبع</label><input type="text" id="f_tracking" dir="ltr" value="${v('tracking')}"></div></div>
   <div class="row"><button class="btn" data-act="shipped" type="button">${d.shipped_at ? 'انشحن ' + dShort(d.shipped_at) : 'تم الشحن اليوم'}</button><button class="btn good" data-act="delivered" type="button">${d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : 'وصل اليوم'}</button></div>`, d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : d.shipped_at ? 'في الطريق' : '')}
  ${sec(4, `<div class="grid2"><div class="field"><label for="f_draft_url">رابط المسودة</label><input type="url" id="f_draft_url" dir="ltr" value="${v('draft_url')}"></div>
     <div class="field"><label for="f_hook">الهوك أو الفكرة</label><input type="text" id="f_hook" value="${v('hook')}"></div></div>
   <div class="row">${mine && !draftPending(d) && !d.video_ok_at ? '<button class="btn primary" data-act="draft" type="button">أرسل المسودة لمتعب</button>' : ''}
     ${appr && draftPending(d) ? '<button class="btn good" data-act="vok" type="button">اعتماد المقطع</button><button class="btn danger" data-act="vfix" type="button">يرجع للتعديل</button>' : ''}
     ${d.rounds ? `<span class="pill warn">${d.rounds} جولة تعديل</span>` : ''}${d.video_ok_at ? '<span class="pill good">المقطع معتمد</span>' : ''}</div>
   <div class="grid2"><div class="field"><label for="f_post_url">رابط المقطع المنشور</label><input type="url" id="f_post_url" dir="ltr" value="${v('post_url')}"></div>
     <div class="field"><label for="f_tt_code">كود تيك توك (Spark)</label><input type="text" id="f_tt_code" dir="ltr" value="${v('tt_code')}"></div>
     <div class="field"><label for="f_ig_code">كود انستقرام</label><input type="text" id="f_ig_code" dir="ltr" value="${v('ig_code')}"></div>
     <div class="field"><label for="f_sn_code">كود أو رابط سناب</label><input type="text" id="f_sn_code" dir="ltr" value="${v('sn_code')}"></div></div>
   <div class="row"><button class="btn" data-act="save4" type="button">حفظ</button>${!d.posted_at ? '<button class="btn good" data-act="posted" type="button">نزل المقطع</button>' : '<span class="pill good">نزل ' + dShort(d.posted_at) + '</span>'}</div>`, d.posted_at ? (codesComplete(d) ? 'أكواد كاملة' : 'ناقص أكواد') : draftPending(d) ? 'عند متعب' : '')}
  ${sec(5, `<div class="muted small">التسمية الموحدة للإعلان تتجهز تلقائياً. انسخها للمنصة.</div><div class="copybox"><code>${esc(ad)}</code><button class="btn sm" data-copy="${esc(ad)}" type="button">نسخ</button></div>
   <div class="row"><button class="btn good" data-act="live" type="button">${d.live_at ? 'انطلق ' + dShort(d.live_at) : 'انطلق الإعلان اليوم'}</button></div>`, d.live_at ? 'انطلق ' + dShort(d.live_at) : '')}
  <div class="row between">${adm ? `<div class="row"><button class="btn sm" data-act="paid" type="button">${d.paid_at ? 'دُفع ' + dShort(d.paid_at) : 'تم الدفع'}</button></div>` : '<span></span>'}
   ${!isClosed(d) ? '<button class="btn sm danger" data-act="close" type="button">إغلاق الملف (لم يرد / ألغي)</button>' : '<button class="btn sm" data-act="reopen" type="button">إعادة فتح</button>'}</div>`, ov => {
    $('dClose').onclick = closeModal;
    if (adm) renderBank(d);
    const val = k => { const e = $('f_' + k); return e.type === 'checkbox' ? e.checked : e.type === 'number' ? (e.value === '' ? null : Number(e.value)) : e.value.trim(); };
    const pick = ks => Object.fromEntries(ks.map(k => [k, val(k)]));
    const A = {
      save0: () => pick(['name', 'handle', 'phone', 'platform', 'acc_type', 'city', 'price', 'campaign_id', 'notes']),
      send: () => ({ ...pick(['name', 'handle', 'phone', 'platform', 'acc_type', 'city', 'price', 'campaign_id', 'notes']), sent_at: nowIso() }),
      approve: () => ({ approval: 'approved', approved_at: nowIso(), approved_by: S.me.id }),
      backup: () => ({ approval: 'backup' }),
      reject: () => ({ approval: 'rejected', closed_at: nowIso(), closed_reason: 'مرفوض' }),
      flags: () => pick(['no_ship', 'no_pay']),
      shipped: () => ({ tracking: val('tracking'), shipped_at: d.shipped_at || nowIso() }),
      delivered: () => ({ tracking: val('tracking'), shipped_at: d.shipped_at || nowIso(), delivered_at: d.delivered_at || nowIso() }),
      draft: () => { if (!val('draft_url')) { toast('حط رابط المسودة', true); return null; } return { ...pick(['draft_url', 'hook']), draft_at: nowIso() }; },
      vok: () => ({ video_ok_at: nowIso() }),
      vfix: () => ({ draft_at: null, rounds: (d.rounds || 0) + 1 }),
      save4: () => pick(['draft_url', 'hook', 'post_url', 'tt_code', 'ig_code', 'sn_code']),
      posted: () => { const c = pick(['post_url', 'tt_code', 'ig_code', 'sn_code', 'hook']); if (!c.post_url && !c.tt_code && !c.ig_code && !c.sn_code) { toast('حط رابط المقطع أو كود واحد على الأقل', true); return null; } return { ...c, posted_at: nowIso(), video_ok_at: d.video_ok_at || nowIso() }; },
      live: () => ({ live_at: d.live_at || nowIso(), ad_name: ad }),
      paid: () => ({ paid_at: d.paid_at ? null : nowIso() }),
      close: () => ({ closed_at: nowIso(), closed_reason: 'لم يرد / ألغي' }),
      reopen: () => ({ closed_at: null, closed_reason: '', approval: d.approval === 'rejected' ? 'pending' : d.approval })
    };
    ov.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const ch = A[b.dataset.act](); if (!ch) return;
      if (['reject', 'close'].includes(b.dataset.act) && !await confirmBox('تأكيد إغلاق الملف؟', 'إغلاق')) return;
      b.disabled = true; const r = await saveDeal(d.id, ch); b.disabled = false;
      if (r) { toast('انحفظ'); openDeal(d.id); }
    });
  });
}

/* ================= البيانات البنكية (تشفير) ================= */
const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function bankDecrypt(e) {
  const priv = await crypto.subtle.importKey('jwk', S.bankPriv, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, ub64(e.ek));
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(e.iv) }, k, ub64(e.ct))));
}
async function renderBank(d) {
  const box = $('bankBox'); if (!box) return;
  const { data } = await sb.from('deal_bank').select('cipher').eq('deal_id', d.id).maybeSingle();
  if (!data) { box.innerHTML = '<div class="muted small">ما فيه بيانات بنكية مسجّلة.</div>'; return; }
  if (!S.bankPriv) { box.innerHTML = '<div class="note">فيه بيانات بنكية مشفّرة. حمّل ملف المفتاح الخاص من «الإعدادات» عشان تشوفها.</div>'; return; }
  try { const b = await bankDecrypt(data.cipher); box.innerHTML = `<div class="note"><b>الحساب البنكي:</b> ${esc(b.holder)} · ${esc(b.bank)} · <span dir="ltr">${esc(b.iban)}</span> <button class="btn sm" data-copy="${esc(b.iban)}" type="button">نسخ الآيبان</button></div>`; }
  catch (e) { box.innerHTML = '<div class="dup">ما قدرت أفك التشفير. تأكد إن ملف المفتاح هو نفس اللي انسوّى مع الإعدادات.</div>'; }
}

/* ================= خط الإنتاج ================= */
function fillSel(id, list, all) { const s = $(id), v = s.value; s.innerHTML = `<option value="">${all}</option>` + list.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); if ([...s.options].some(o => o.value === v)) s.value = v; }
function stepPill(d) { const i = curStep(d); if (i < 0) return `<span class="pill bad">مغلق</span>`; if (isParked(d)) return '<span class="pill acc">احتياط</span>'; if (i >= STEPS.length) return '<span class="pill good">اكتمل</span>'; const l = lateness(d, i); return `<span class="pill ${l === 'late' ? 'bad' : l === 'soon' ? 'warn' : ''}">${STEPS[i].n}${i === SI.video && draftPending(d) ? ' (عند متعب)' : ''}</span>`; }
function renderPipe() {
  const open = S.deals.filter(d => !isClosed(d) && !isParked(d));
  $('board').innerHTML = STEPS.map((s, i) => { const L = open.filter(d => curStep(d) === i), late = L.filter(d => lateness(d, i) === 'late').length; return `<button class="col${S.pStep === s.k ? ' on' : ''}" data-col="${s.k}" type="button"><span class="k">${i + 1}</span><span class="nm">${s.n}</span><span class="n">${L.length}</span><span class="small" style="color:var(--bad)">${late ? late + ' متأخر' : '&nbsp;'}</span></button>`; }).join('')
    + `<button class="col${S.pStep === 'done' ? ' on' : ''}" data-col="done" type="button"><span class="k">✓</span><span class="nm">اكتمل</span><span class="n">${open.filter(d => curStep(d) === STEPS.length).length}</span><span class="small">&nbsp;</span></button>`;
  fillSel('pMem', active().filter(m => hasRole(m.id, 'creator')).map(m => [m.id, m.name]), 'الكل');
  fillSel('pCamp', S.camps.map(c => [c.id, c.name]), 'الكل');
  const qq = $('pQ').value.trim().toLowerCase(), pm = $('pMem').value, pc = $('pCamp').value, late = $('pLate').checked, cl = $('pClosed').checked;
  const L = S.deals.filter(d => { const i = curStep(d);
    if (!cl && isClosed(d)) return false; if (pm && d.member_id !== pm) return false; if (pc && d.campaign_id !== pc) return false;
    if (S.pStep === 'done' ? i !== STEPS.length : S.pStep && i !== SI[S.pStep]) return false;
    if (late && lateness(d, i) !== 'late') return false;
    if (qq && ![d.name, d.phone, d.handle, d.tt_code, d.ig_code, d.sn_code].some(x => String(x || '').toLowerCase().includes(qq))) return false; return true; });
  $('pList').innerHTML = L.length ? `<div class="tw"><table><thead><tr><th>المؤثر</th><th>الحملة</th><th>صانع المحتوى</th><th>المرحلة</th><th class="num">أيام فيها</th><th class="num">السعر</th><th>آخر تحديث</th></tr></thead><tbody>${L.slice(0, 400).map(d => { const i = curStep(d); return `<tr class="click" data-open="${d.id}"><td>${esc(d.name)}</td><td>${esc(camp(d.campaign_id).name || '')}</td><td>${esc(memName(d.member_id))}</td><td>${stepPill(d)}</td><td class="num">${i >= 0 && i < STEPS.length ? stepAge(d, i) : ''}</td><td class="num">${d.price != null ? fmt(d.price) : ''}</td><td class="small muted">${dShort(d.updated_at)}</td></tr>`; }).join('')}</tbody></table></div>${L.length > 400 ? '<div class="muted small">يعرض أول 400. استخدم البحث للتصفية.</div>' : ''}` : '<div class="empty">ما فيه ملفات بهذي التصفية.</div>';
}
$('board').addEventListener('click', e => { const c = e.target.closest('[data-col]'); if (!c) return; S.pStep = S.pStep === c.dataset.col ? '' : c.dataset.col; renderPipe(); });
['pQ', 'pMem', 'pCamp', 'pLate', 'pClosed'].forEach(id => $(id).addEventListener('input', renderPipe));
$('pList').addEventListener('click', e => { const r = e.target.closest('[data-open]'); if (r) openDeal(r.dataset.open); });

/* ================= الطلبات ================= */
function memOpts(sel) { return active().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} — ${esc((m.roles || []).map(r => ROLES[r]).join('، '))}</option>`).join(''); }
$('newReq').onclick = () => {
  const designer = withRole('design')[0];
  modal(`<h2>طلب جديد</h2><div class="grid2">
   <div class="field"><label for="rKind">النوع</label><select id="rKind">${Object.entries(REQ_KINDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
   <div class="field"><label for="rTo">مطلوب من</label><select id="rTo">${memOpts(designer && designer.id)}</select></div>
   <div class="field"><label for="rTitle">العنوان *</label><input type="text" id="rTitle" placeholder="مثال: بنر هيرش سيطرة للمتجر"></div>
   <div class="field"><label for="rDue">الموعد</label><input type="date" id="rDue" min="${today()}"></div>
   <div class="field"><label for="rSize">المقاس أو المنصة</label><input type="text" id="rSize" placeholder="مثال: 1080×1920 ستوري"></div>
   <div class="field"><label for="rRef">رابط مرجع</label><input type="url" id="rRef" dir="ltr"></div></div>
   <div class="field"><label for="rDet">التفاصيل</label><textarea id="rDet"></textarea></div>
   <div class="row"><button class="btn primary" id="rSave" type="button">إرسال الطلب</button><button class="btn" id="rCancel" type="button">إلغاء</button></div>`, () => {
    const kind = $('rKind'); kind.onchange = () => { const map = { design: 'design', ship: 'shipper', ad: 'media', snap: 'snap', social: 'social' }; const m = withRole(map[kind.value] || '')[0]; if (m) $('rTo').value = m.id; };
    $('rCancel').onclick = closeModal;
    $('rSave').onclick = async () => { const title = $('rTitle').value.trim(); if (!title) return toast('اكتب عنوان الطلب', true);
      const r = await saveReq(null, { kind: kind.value, to_member: $('rTo').value, title, due: $('rDue').value || null, size: $('rSize').value.trim(), ref_url: $('rRef').value.trim(), details: $('rDet').value.trim(), from_member: S.me.id });
      if (r) { toast('انرسل الطلب'); closeModal(); } };
  });
};
function renderReqs() {
  const sc = $('rScope').value, dn = $('rDone').checked, me = S.me.id;
  const L = S.reqs.filter(r => (sc === 'all' || (sc === 'to' ? r.to_member === me : r.from_member === me)) && (dn || !['done', 'cancelled'].includes(r.status)));
  $('rList').innerHTML = L.length ? `<div style="display:grid;gap:8px">${L.map(reqRow).join('')}</div>` : '<div class="empty">ما فيه طلبات هنا.</div>';
}
['rScope', 'rDone'].forEach(id => $(id).addEventListener('input', renderReqs));
$('rList').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (b) openReq(b.dataset.req); });
function openReq(id) {
  const r = S.reqs.find(x => x.id === id); if (!r) return; const me = S.me.id, isTo = r.to_member === me || isAdmin(), isFrom = r.from_member === me || isAdmin();
  modal(`<div class="row between"><div><h2>${esc(r.title)}</h2><div class="muted small">${esc(REQ_KINDS[r.kind])} · من ${esc(memName(r.from_member))} إلى ${esc(memName(r.to_member))} · ${r.due ? 'الموعد ' + r.due : 'بدون موعد'}</div></div><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span></div>
   ${r.details ? `<div class="note" style="white-space:pre-wrap">${esc(r.details)}</div>` : ''}
   <div class="small">${r.size ? 'المقاس: ' + esc(r.size) + ' · ' : ''}${r.ref_url ? `<a href="${esc(r.ref_url)}" target="_blank" rel="noopener">المرجع</a>` : ''}${r.rounds ? ` · <span class="pill warn">${r.rounds} جولة تعديل</span>` : ''}</div>
   <div class="field"><label for="qRes">رابط التسليم</label><input type="url" id="qRes" dir="ltr" value="${esc(r.result_url)}" ${isTo ? '' : 'disabled'}></div>
   ${r.result_url ? `<a class="btn sm" href="${esc(r.result_url)}" target="_blank" rel="noopener">افتح التسليم</a>` : ''}
   <div class="row">
    ${isTo && r.status === 'new' ? '<button class="btn" data-q="doing" type="button">بدأت فيه</button>' : ''}
    ${isTo && ['new', 'doing'].includes(r.status) ? '<button class="btn primary" data-q="review" type="button">سلّمت، أرسل للمراجعة</button>' : ''}
    ${isFrom && r.status === 'review' ? '<button class="btn good" data-q="done" type="button">اعتماد التسليم</button><button class="btn danger" data-q="fix" type="button">يرجع للتعديل</button>' : ''}
    ${isFrom && !['done', 'cancelled'].includes(r.status) ? '<button class="btn sm" data-q="cancel" type="button">إلغاء الطلب</button>' : ''}
    <button class="btn" id="qClose" type="button">إغلاق</button></div>`, ov => {
    $('qClose').onclick = closeModal;
    ov.addEventListener('click', async e => { const b = e.target.closest('[data-q]'); if (!b) return; const k = b.dataset.q;
      const ch = { doing: { status: 'doing', started_at: nowIso() }, review: { status: 'review', result_url: $('qRes').value.trim(), started_at: r.started_at || nowIso() }, done: { status: 'done', done_at: nowIso() }, fix: { status: 'doing', rounds: (r.rounds || 0) + 1 }, cancel: { status: 'cancelled' } }[k];
      if (k === 'review' && !ch.result_url) return toast('حط رابط التسليم', true);
      if (await saveReq(r.id, ch)) { toast('انحفظ'); openReq(r.id); } });
  });
}

/* ================= تقرير اليوم ================= */
$('tDate').value = today(); $('tDate').addEventListener('change', renderToday);
let todayRec = null;
async function renderToday() {
  const day = $('tDate').value || today(), me = S.me.id;
  const on = t => t && t.slice(0, 10) === day;
  const acts = [];
  for (const d of S.deals) {
    if (d.member_id === me && on(d.created_at)) acts.push('رشّح ' + d.name);
    if (d.approved_by === me && on(d.approved_at)) acts.push('اعتمد ' + d.name);
    if (d.member_id === me && on(d.posted_at)) acts.push('نزل مقطع ' + d.name);
    if (hasRole(me, 'shipper') && on(d.shipped_at)) acts.push('شحن ' + d.name);
    if (hasRole(me, 'media') && on(d.live_at)) acts.push('أطلق إعلان ' + d.name);
  }
  for (const r of S.reqs) { if (r.to_member === me && on(r.done_at)) acts.push('سلّم طلب: ' + r.title); }
  $('tAuto').innerHTML = acts.length ? `<ul style="margin:0;padding-inline-start:18px">${acts.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<div class="muted small">ما فيه شي مسجّل في هذا اليوم.</div>';
  const { data } = await sb.from('daily_reports').select('*').eq('member_id', me).eq('day', day).maybeSingle(); todayRec = data;
  const list = (S.me.roles || []).flatMap(r => (S.tasks[r] || []).map((t, i) => ({ id: r + '_' + i, t })));
  $('tTasks').innerHTML = list.length ? '<h3>مهامي اليومية</h3>' + list.map(x => `<label class="task ${data && data.tasks[x.id] ? 'done' : ''}"><input type="checkbox" data-t="${x.id}" ${data && data.tasks[x.id] ? 'checked' : ''}> ${esc(x.t)}</label>`).join('') : '';
  $('tNote').value = data ? data.note : ''; $('tBlock').value = data ? data.blockers : '';
  $('tState').textContent = data ? 'آخر حفظ ' + new Date(data.updated_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'ما انحفظ للحين';
}
$('tSave').onclick = async () => {
  const tasks = {}; document.querySelectorAll('[data-t]').forEach(c => { if (c.checked) tasks[c.dataset.t] = true; });
  const r = await q(sb.from('daily_reports').upsert({ member_id: S.me.id, day: $('tDate').value || today(), tasks, note: $('tNote').value.trim(), blockers: $('tBlock').value.trim(), updated_at: nowIso() }));
  if (r) { toast('انحفظ التقرير'); renderToday(); }
};

/* ================= لوحة الأداء ================= */
function period() { const v = $('dPeriod').value, n = new Date(); if (v === 'month') return [new Date(n.getFullYear(), n.getMonth(), 1), n]; if (v === 'last') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 1)]; if (v === '30') return [new Date(Date.now() - 30 * 864e5), n]; return [new Date(2000, 0, 1), n]; }
$('dPeriod').addEventListener('input', renderDash);
function renderDash() {
  const [a, b] = period(); const inP = t => t && new Date(t) >= a && new Date(t) < b;
  $('dSub').textContent = `من ${ymd(a)} إلى ${ymd(b)}`;
  const D = S.deals; const open = D.filter(d => !isClosed(d) && !isParked(d));
  const T = [['ترشيح جديد', D.filter(d => inP(d.created_at)).length], ['اعتماد', D.filter(d => inP(d.approved_at)).length], ['وصل المنتج', D.filter(d => inP(d.delivered_at)).length], ['مقطع نزل', D.filter(d => inP(d.posted_at)).length], ['إعلان انطلق', D.filter(d => inP(d.live_at)).length], ['متأخر الحين', open.filter(d => lateness(d, curStep(d)) === 'late').length]];
  $('dTiles').innerHTML = T.map(([l, v]) => `<div class="tile"><span class="l">${l}</span><span class="v">${fmt(v)}</span></div>`).join('');
  const endAt = (d, i) => [d.sent_at, d.approved_at, d.intake_at, d.delivered_at, d.posted_at, d.live_at][i];
  $('dSteps').innerHTML = `<table><thead><tr><th>المرحلة</th><th>المسؤول</th><th class="num">مفتوح</th><th class="num">متأخر</th><th class="num">خلصت بالفترة</th><th class="num">وسيط الأيام</th><th class="num">المدة المسموحة</th></tr></thead><tbody>${STEPS.map((s, i) => { const L = open.filter(d => curStep(d) === i); const fin = D.filter(d => inP(endAt(d, i))); const md = median(fin.map(d => days(stepStart(d, i), endAt(d, i)))); return `<tr><td>${s.n}</td><td class="small muted">${esc(s.who === 'creator' ? 'صانع المحتوى' : withRole(s.who).map(m => m.name).join('، ') || ROLES[s.who])}</td><td class="num">${L.length}</td><td class="num">${L.filter(d => lateness(d, i) === 'late').length || ''}</td><td class="num">${fin.length}</td><td class="num">${md == null ? '—' : fmt(md)}</td><td class="num">${S.sla[s.k]}</td></tr>`; }).join('')}</tbody></table>`;
  const cr = active().filter(m => hasRole(m.id, 'creator')).map(m => { const L = D.filter(d => d.member_id === m.id); const noms = L.filter(d => inP(d.created_at)).length, appr = L.filter(d => inP(d.approved_at)).length; const del = L.filter(d => inP(d.delivered_at)); const posted = L.filter(d => inP(d.posted_at)); const doneOfDel = del.filter(d => d.posted_at).length; const full = posted.filter(codesComplete).length; const md = median(posted.map(d => days(d.delivered_at, d.posted_at))); const late = open.filter(d => d.member_id === m.id && STEPS[curStep(d)] && STEPS[curStep(d)].who === 'creator' && lateness(d, curStep(d)) === 'late').length; const spend = posted.reduce((s, d) => s + (Number(d.price) || 0), 0); return { m, noms, appr, del: del.length, posted: posted.length, rate: pct(doneOfDel, del.length), full: pct(full, posted.length), md, late, spend }; }).sort((x, y) => y.posted - x.posted);
  const pl = v => v == null ? '—' : `<span class="pill ${v >= 95 ? 'good' : v >= 85 ? 'warn' : 'bad'}">${v}٪</span>`;
  $('dCreators').innerHTML = `<table><thead><tr><th>الصانع</th><th class="num">ترشيحات</th><th class="num">اعتماد</th><th class="num">وصلهم</th><th class="num">نزل</th><th class="num">الإنجاز</th><th class="num">أكواد كاملة</th><th class="num">أيام للنشر</th><th class="num">متأخر عنده</th><th class="num">الصرف</th></tr></thead><tbody>${cr.map(x => `<tr><td>${esc(x.m.name)}</td><td class="num">${x.noms}</td><td class="num">${x.appr}</td><td class="num">${x.del}</td><td class="num">${x.posted}</td><td class="num">${pl(x.rate)}</td><td class="num">${pl(x.full)}</td><td class="num">${x.md == null ? '—' : fmt(x.md)}</td><td class="num">${x.late || ''}</td><td class="num">${fmt(x.spend)}</td></tr>`).join('')}</tbody></table>`;
  const byTo = {}; for (const r of S.reqs) { if (!r.to_member) continue; const o = byTo[r.to_member] = byTo[r.to_member] || { n: 0, done: 0, ontime: 0, due: 0, rounds: [], open: 0, late: 0 }; if (inP(r.created_at)) o.n++; if (inP(r.done_at)) { o.done++; o.rounds.push(r.rounds || 0); if (r.due) { o.due++; if (r.done_at.slice(0, 10) <= r.due) o.ontime++; } } if (!['done', 'cancelled'].includes(r.status)) { o.open++; if (r.due && r.due < today()) o.late++; } }
  $('dReqs').innerHTML = `<table><thead><tr><th>المسؤول</th><th class="num">طلبات جديدة</th><th class="num">سلّمها</th><th class="num">في الموعد</th><th class="num">متوسط جولات التعديل</th><th class="num">مفتوحة</th><th class="num">متأخرة</th></tr></thead><tbody>${Object.entries(byTo).map(([id, o]) => `<tr><td>${esc(memName(id))}</td><td class="num">${o.n}</td><td class="num">${o.done}</td><td class="num">${pl(pct(o.ontime, o.due))}</td><td class="num">${o.rounds.length ? fmt(o.rounds.reduce((s, x) => s + x, 0) / o.rounds.length) : '—'}</td><td class="num">${o.open}</td><td class="num">${o.late || ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">ما فيه طلبات للحين.</td></tr>'}</tbody></table>`;
}
$('dXlsx').onclick = () => {
  const dt = t => t ? t.slice(0, 10) : '';
  const deals = S.deals.map(d => ({ 'المؤثر': d.name, 'اليوزر': d.handle, 'الجوال': d.phone, 'المنصة': d.platform, 'نوع الحساب': d.acc_type, 'المدينة': d.city, 'الحملة': camp(d.campaign_id).name || '', 'صانع المحتوى': memName(d.member_id), 'السعر': d.price, 'العملة': d.currency, 'المرحلة': isClosed(d) ? 'مغلق' : isParked(d) ? 'احتياط' : (STEPS[curStep(d)] || { n: 'اكتمل' }).n, 'تاريخ الترشيح': dt(d.created_at), 'تاريخ الاعتماد': dt(d.approved_at), 'عبّى بياناته': dt(d.intake_at), 'الشحن': dt(d.shipped_at), 'الوصول': dt(d.delivered_at), 'جولات التعديل': d.rounds, 'النشر': dt(d.posted_at), 'كود تيك توك': d.tt_code, 'كود انستقرام': d.ig_code, 'كود سناب': d.sn_code, 'رابط المقطع': d.post_url, 'الهوك': d.hook, 'اسم الإعلان': d.ad_name, 'إطلاق الإعلان': dt(d.live_at), 'الدفع': dt(d.paid_at), 'ملاحظات': d.notes }));
  const reqs = S.reqs.map(r => ({ 'النوع': REQ_KINDS[r.kind], 'العنوان': r.title, 'من': memName(r.from_member), 'إلى': memName(r.to_member), 'الموعد': r.due, 'الحالة': REQ_STATUS[r.status][0], 'جولات التعديل': r.rounds, 'تاريخ الطلب': dt(r.created_at), 'تاريخ التسليم': dt(r.done_at), 'رابط التسليم': r.result_url }));
  const wb = XLSX.utils.book_new(); const add = (rows, n) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, n); };
  add(deals, 'المؤثرين'); add(reqs, 'الطلبات'); XLSX.writeFile(wb, `أداء فريق العز ${today()}.xlsx`);
};

/* ================= الإعدادات ================= */
function renderSetup() {
  $('sMembers').innerHTML = `<table><thead><tr><th>الاسم</th><th>الإيميل</th><th>الأدوار</th><th>مفعّل</th><th>مدير</th><th></th></tr></thead><tbody>${S.members.map(m => `<tr data-m="${m.id}"><td><input type="text" data-k="name" value="${esc(m.name)}" style="min-width:140px"></td><td class="small" dir="ltr">${esc(m.email)}</td><td style="white-space:normal;min-width:260px">${Object.entries(ROLES).map(([k, n]) => `<label class="check small" style="display:inline-flex;min-height:28px;margin-inline-end:8px"><input type="checkbox" data-role="${k}" ${(m.roles || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('')}</td><td><input type="checkbox" data-k="active" ${m.active ? 'checked' : ''} aria-label="مفعّل"></td><td><input type="checkbox" data-k="is_admin" ${m.is_admin ? 'checked' : ''} ${m.id === S.me.id ? 'disabled' : ''} aria-label="مدير"></td><td><button class="btn sm primary" data-msave type="button">حفظ</button></td></tr>`).join('')}</tbody></table>`;
  $('sCamps').innerHTML = S.camps.map(c => `<div class="row" data-c="${c.id}"><input type="text" data-k="name" value="${esc(c.name)}" style="flex:2 1 200px"><input type="text" data-k="product" value="${esc(c.product)}" placeholder="المنتج" style="flex:1 1 150px"><label class="check small"><input type="checkbox" data-k="active" ${c.active ? 'checked' : ''}> شغالة</label><button class="btn sm" data-csave type="button">حفظ</button></div>`).join('');
  $('sSla').innerHTML = STEPS.map(s => `<div class="field"><label for="sla_${s.k}">${s.n}</label><input type="number" min="0" id="sla_${s.k}" value="${S.sla[s.k]}"></div>`).join('');
  $('sTasks').innerHTML = Object.entries(ROLES).filter(([k]) => k !== 'creator').map(([k, n]) => `<div class="field"><label for="tk_${k}">${n}</label><textarea id="tk_${k}">${esc((S.tasks[k] || []).join('\n'))}</textarea></div>`).join('');
  $('sBank').innerHTML = S.bankPub ? `<div class="muted small">التشفير شغال. المفتاح العام محفوظ، والمؤثرين يقدرون يعبّون حساباتهم البنكية.</div>
     <div class="row"><span class="pill ${S.bankPriv ? 'good' : 'warn'}">${S.bankPriv ? 'مفتاحك الخاص محمّل على هذا الجهاز' : 'مفتاحك الخاص مو محمّل على هذا الجهاز'}</span><label class="btn sm">تحميل ملف المفتاح الخاص<input type="file" id="bankFile" accept=".json" hidden></label>${S.bankPriv ? '<button class="btn sm" id="bankForget" type="button">إزالة المفتاح من هذا الجهاز</button>' : ''}</div>`
    : `<div class="note">ما فيه تشفير للحين. اضغط الزر: يتولّد مفتاحين، العام ينحفظ في النظام، والخاص ينزل عندك كملف. احفظ الملف في مكان آمن (مثل مجلد «نظام فريق العز»)، لأنه الطريقة الوحيدة لقراءة الحسابات البنكية. إذا ضاع، ما أحد يقدر يفك البيانات.</div><button class="btn primary" id="bankGen" type="button">إنشاء مفاتيح التشفير</button>`;
  const f = $('bankFile'); if (f) f.onchange = async () => { try { const k = JSON.parse(await f.files[0].text()); S.bankPriv = k; try { localStorage.setItem('alezz_bank_priv', JSON.stringify(k)); } catch (e) { } toast('انحمّل المفتاح'); renderSetup(); } catch (e) { toast('الملف مو صحيح', true); } };
  const fg = $('bankForget'); if (fg) fg.onclick = () => { S.bankPriv = null; try { localStorage.removeItem('alezz_bank_priv'); } catch (e) { } renderSetup(); };
  const g = $('bankGen'); if (g) g.onclick = async () => {
    const kp = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const pub = await crypto.subtle.exportKey('jwk', kp.publicKey), priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(priv)], { type: 'application/json' })); a.download = 'مفتاح البنك الخاص - العز.json'; a.click();
    if (await q(sb.from('settings').upsert({ key: 'bank_pub', value: pub }))) { S.bankPub = pub; S.bankPriv = priv; try { localStorage.setItem('alezz_bank_priv', JSON.stringify(priv)); } catch (e) { } toast('انحفظ المفتاح العام، والخاص نزل عندك'); renderSetup(); }
  };
}
$('sMembers').addEventListener('click', async e => { const b = e.target.closest('[data-msave]'); if (!b) return; const tr = b.closest('[data-m]');
  const ch = { name: tr.querySelector('[data-k=name]').value.trim(), active: tr.querySelector('[data-k=active]').checked, is_admin: tr.querySelector('[data-k=is_admin]').checked, roles: [...tr.querySelectorAll('[data-role]:checked')].map(c => c.dataset.role) };
  if (await q(sb.from('members').update(ch).eq('id', tr.dataset.m))) { Object.assign(mem(tr.dataset.m), ch); toast('انحفظ'); } });
$('sCamps').addEventListener('click', async e => { const b = e.target.closest('[data-csave]'); if (!b) return; const r = b.closest('[data-c]');
  const ch = { name: r.querySelector('[data-k=name]').value.trim(), product: r.querySelector('[data-k=product]').value.trim(), active: r.querySelector('[data-k=active]').checked };
  if (await q(sb.from('campaigns').update(ch).eq('id', r.dataset.c))) { Object.assign(S.camps.find(c => c.id === r.dataset.c), ch); toast('انحفظ'); } });
$('sCampAdd').onclick = async () => { const r = await q(sb.from('campaigns').insert({ name: 'حملة جديدة ' + today() + ' ' + Math.random().toString(36).slice(2, 5) }).select().single()); if (r) { S.camps.push(r); renderSetup(); } };
$('sSlaSave').onclick = async () => { const v = Object.fromEntries(STEPS.map(s => [s.k, Number($('sla_' + s.k).value) || 0])); if (await q(sb.from('settings').upsert({ key: 'sla', value: v }))) { S.sla = v; toast('انحفظت المدد'); } };
$('sTasksSave').onclick = async () => { const v = {}; Object.keys(ROLES).filter(k => k !== 'creator').forEach(k => { const L = $('tk_' + k).value.split('\n').map(s => s.trim()).filter(Boolean); if (L.length) v[k] = L; }); if (await q(sb.from('settings').upsert({ key: 'daily_tasks', value: v }))) { S.tasks = v; toast('انحفظت القوائم'); } };

/* ================= التشغيل ================= */
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showAuth(); });
start();
})();
