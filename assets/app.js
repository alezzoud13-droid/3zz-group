/* أداء فريق العز — الواجهة. البيانات كلها في Supabase، وهذا الملف يعرضها ويحدّثها. */
(function () {
'use strict';
const C = window.APP_CONFIG;
const sb = supabase.createClient(C.supabaseUrl, C.supabaseKey);

/* ================= ثوابت ================= */
const ROLES = { creator: 'صانع محتوى', approver: 'الاعتماد (متعب)', shipper: 'الشحن', media: 'الميديا باير', snap: 'منسق المحتوى (زياد)', social: 'السوشيال ميديا', design: 'التصميم', owned: 'الحسابات المملوكة' };
const STEPS = [
  { k: 'nom', n: 'الترشيح', who: 'creator' },
  { k: 'appr', n: 'الاعتماد', who: 'approver' },
  { k: 'intake', n: 'العنوان', who: 'creator' },
  { k: 'ship', n: 'الشحن', who: 'shipper' },
  { k: 'video', n: 'المقطع والنشر', who: 'creator' },
  { k: 'live', n: 'التشغيل', who: 'media' }
];
const SI = Object.fromEntries(STEPS.map((s, i) => [s.k, i]));
const DEF_SLA = { nom: 3, appr: 2, intake: 3, ship: 7, video: 10, live: 2 };
const ACC_TYPES = ['مقيم عطور عربي', 'مقيم عطور أجنبي', 'صانع محتوى', 'فلوقات وترندات', 'بيعي', 'يوتيوب', 'مهتم بكرة القدم'];
const PLATS = [{ k: 'tt', n: 'تيك توك' }, { k: 'sn', n: 'سناب شات' }, { k: 'ig', n: 'انستقرام' }];
const PL = { tt: 'تيك توك', sn: 'سناب شات', ig: 'انستقرام' };
const CONTACT_CH = ['تيك توك', 'سناب شات', 'انستقرام', 'يوتيوب', 'البريد الإلكتروني', 'واتساب', 'اتصال'];
const CONTACT_RES = ['ما رد', 'رد وجاري التفاوض', 'ما اتفقنا بسبب السعر', 'رفض التعاون', 'تم الاتفاق'];
const AD_TYPES = ['منزلي', 'خارجي', 'حضوري'];
const ACQ = { draft: ['مسودة', ''], pending: ['بانتظار المراجعة', 'acc'], needs_edit: ['يحتاج تعديل', 'warn'], approved: ['معتمد: تواصل وفاوض', 'good'], rejected: ['مرفوض', 'bad'], none: ['من الحملات', ''] };
const REQ_KINDS = { design: 'تصميم', ship: 'شحن', ad: 'إطلاق إعلان', snap: 'سناب', social: 'سوشيال ميديا', quota: 'زيادة حصة ترشيح', other: 'أخرى' };
const REQ_STATUS = { new: ['جديد', 'acc'], doing: ['قيد التنفيذ', 'warn'], review: ['بانتظار المراجعة', 'acc'], done: ['منتهي', 'good'], cancelled: ['ملغي', ''] };
const CAMP_ST = { active: ['شغالة', 'good'], paused: ['متوقفة', 'warn'], ended: ['منتهية', ''] };

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
const arDig = s => String(s || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
const ph9 = s => { const d = arDig(s).replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
/* الجوال: السعودي يتحوّل لـ +966، والدولي لازم يبدأ بـ + أو 00 */
function normPhone(s) {
  let t = arDig(s).replace(/[\s\-()]/g, ''); if (!t) return '';
  if (/^00\d+$/.test(t)) t = '+' + t.slice(2);
  if (/^05\d{8}$/.test(t)) return '+966' + t.slice(1);
  if (/^5\d{8}$/.test(t)) return '+966' + t;
  if (/^9665\d{8}$/.test(t)) return '+' + t;
  if (/^\+\d{8,15}$/.test(t)) return t;
  return null;
}
const handleOf = s => { s = String(s || '').trim(); const m = s.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i); return (m ? m[1] : s.replace(/^@/, '')).replace(/[/?].*$/, '').toLowerCase(); };
const isUrl = s => !s || /^https?:\/\/\S+\.\S+/.test(s);
let toastT; function toast(m, bad) { const t = $('toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
async function copyTxt(t) { try { await navigator.clipboard.writeText(t); toast('انسخ'); } catch (e) { toast('ما قدرت أنسخ، ظلّل النص وانسخه', true); } }
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyTxt(b.dataset.copy); });
const opts = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const optsBlank = (list, sel, blank) => `<option value="">${blank || 'اختر'}</option>` + opts(list, sel);

/* ================= الحالة ================= */
const S = { user: null, me: null, members: [], camps: [], deals: [], reqs: [], infl: [], quotas: [], sla: { ...DEF_SLA }, tasks: {}, bankPub: null, bankPriv: null, view: 'mine', pStep: '' };
const mem = id => S.members.find(m => m.id === id);
const memName = id => (mem(id) || {}).name || '—';
const active = () => S.members.filter(m => m.active);
const withRole = r => active().filter(m => (m.roles || []).includes(r));
const hasRole = (id, r) => { const m = mem(id); return !!(m && ((m.roles || []).includes(r) || m.is_admin)); };
const isAdmin = () => !!(S.me && S.me.is_admin);
const isApprover = () => hasRole(S.me.id, 'approver');
const camp = id => S.camps.find(c => c.id === id) || {};
const infl = id => S.infl.find(x => x.id === id);
const creators = () => active().filter(m => (m.roles || []).includes('creator'));
const strictRole = (id, r) => ((mem(id) || {}).roles || []).includes(r);
const quotaOf = (cid, mid) => (S.quotas.find(q => q.campaign_id === cid && q.member_id === mid) || {}).quota || 0;

/* ================= المنصات ================= */
function platKeys(x) { const p = (x && (x.platform ?? x.platforms)) || ''; if (/جميع/.test(p)) return ['tt', 'sn', 'ig']; const a = []; if (/تيك/.test(p)) a.push('tt'); if (/سناب/.test(p)) a.push('sn'); if (/انست/.test(p)) a.push('ig'); return a; }
const platText = keys => keys.length === 3 ? 'جميع المنصات' : keys.map(k => PL[k]).join(' + ');
const platChecks = (pre, keys) => `<div class="plats">${PLATS.map(p => `<label class="check"><input type="checkbox" data-plat="${pre}" value="${p.k}" ${keys.includes(p.k) ? 'checked' : ''}> ${p.n}</label>`).join('')}</div>`;
const readPlats = (root, pre) => [...root.querySelectorAll(`[data-plat="${pre}"]:checked`)].map(c => c.value);

/* ================= منطق مراحل الحملة ================= */
const isClosed = d => !!(d.closed_at || d.approval === 'rejected');
const isParked = d => !isClosed(d) && d.approval === 'backup';
const hasAddress = d => !!(d.rcv_phone && d.rcv_city && d.address);
const delivered = (d, p) => !!d[p + '_at'];
const launched = (d, p) => !!d[p + '_live_at'];
const allDelivered = d => !!d.posted_at || (platKeys(d).length > 0 && platKeys(d).every(p => delivered(d, p)));
const allLaunched = d => !!d.live_at || (platKeys(d).length > 0 && platKeys(d).every(p => launched(d, p)));
const DONE = {
  nom: d => !!(d.sent_at || ['approved', 'backup', 'rejected'].includes(d.approval)),
  appr: d => d.approval === 'approved',
  intake: d => !!(d.intake_at || d.no_ship || hasAddress(d)),
  ship: d => !!(d.delivered_at || d.no_ship),
  video: allDelivered,
  live: allLaunched
};
function curStep(d) { if (isClosed(d)) return -1; if (d.approval === 'needs_edit') return 0; for (let i = 0; i < STEPS.length; i++) if (!DONE[STEPS[i].k](d)) return i; return STEPS.length; }
function firstAt(d) { return platKeys(d).map(p => d[p + '_at']).filter(Boolean).sort()[0]; }
function stepStart(d, i) { return [d.created_at, d.sent_at, d.approved_at, d.intake_at || d.approved_at, d.delivered_at || d.intake_at || d.approved_at, firstAt(d) || d.posted_at][i] || d.created_at; }
const stepAge = (d, i) => ageOf(stepStart(d, i));
function lateness(d, i) { if (i < 0 || i >= STEPS.length || isParked(d)) return ''; const a = stepAge(d, i), lim = S.sla[STEPS[i].k] ?? DEF_SLA[STEPS[i].k]; return a > lim ? 'late' : a >= lim ? 'soon' : ''; }
const draftPending = d => !!(d.draft_at && !d.video_ok_at && !allDelivered(d));
const adName = d => [camp(d.campaign_id).name, d.name, d.hook, memName(d.member_id)].map(x => String(x || '').trim()).filter(Boolean).join(' | ');
const adNameFor = (d, p) => adName(d) + ' | ' + PL[p] + (p === 'sn' ? (d.sn_user ? ' | ' + d.sn_user : '') : (d[p + '_code'] ? ' | ' + d[p + '_code'] : ''));
const intakeLink = d => location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/') + 'intake.html?t=' + d.intake_token;
const waLink = (phone, txt) => { const p = String(phone || '').replace(/\D/g, '').replace(/^0(?=5)/, '966'); return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt) : ''; };
const isContinuing = i => !!i && S.deals.some(d => d.influencer_id === i.id && allDelivered(d));

/* ================= البيانات ================= */
async function q(p) { const { data, error } = await p; if (error) { console.warn(error); toast(/row-level|لمتعب/.test(error.message) ? (error.message.includes('متعب') ? error.message : 'ما عندك صلاحية لهذي العملية') : 'تعذّر الحفظ: ' + error.message, true); return null; } return data ?? true; }
async function loadAll() {
  const [m, c, s, d, r, i, qt] = await Promise.all([
    sb.from('members').select('*').order('name'),
    sb.from('campaigns').select('*').order('created_at', { ascending: false }),
    sb.from('settings').select('*'),
    sb.from('deals').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('requests').select('*').order('created_at', { ascending: false }).limit(3000),
    sb.from('influencers').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('quotas').select('*')
  ]);
  S.members = m.data || []; S.camps = c.data || []; S.deals = d.data || []; S.reqs = r.data || []; S.infl = i.data || []; S.quotas = qt.data || [];
  for (const x of (s.data || [])) { if (x.key === 'sla') S.sla = { ...DEF_SLA, ...x.value }; if (x.key === 'daily_tasks') S.tasks = x.value || {}; if (x.key === 'bank_pub') S.bankPub = x.value; }
  S.me = S.members.find(x => x.id === S.user.id) || S.me;
}
function upsertLocal(list, row) { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.unshift(row); return row; }
async function saveDeal(id, ch) { const r = id ? await q(sb.from('deals').update(ch).eq('id', id).select().single()) : await q(sb.from('deals').insert(ch).select().single()); return r ? upsertLocal(S.deals, r) : null; }
async function saveReq(id, ch) { const r = id ? await q(sb.from('requests').update(ch).eq('id', id).select().single()) : await q(sb.from('requests').insert(ch).select().single()); return r ? upsertLocal(S.reqs, r) : null; }
async function saveInfl(id, ch) { const r = id ? await q(sb.from('influencers').update(ch).eq('id', id).select().single()) : await q(sb.from('influencers').insert(ch).select().single()); return r ? upsertLocal(S.infl, r) : null; }

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
  if (r.error) return msg(/Invalid login/.test(r.error.message) ? 'الإيميل أو كلمة المرور غلط.' : /not confirmed/i.test(r.error.message) ? 'أكّد إيميلك أول من الرابط اللي وصلك.' : r.error.message);
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
const VIEWS = ['mine', 'acq', 'camps', 'pipe', 'req', 'today', 'dash', 'setup'];
function route() {
  let v = location.hash.slice(1); if (!VIEWS.includes(v)) v = 'mine'; if ((v === 'dash' || v === 'setup') && !isAdmin()) v = 'mine';
  S.view = v; document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.v === v)); render();
}
window.addEventListener('hashchange', route);
function render() {
  updateMineCount();
  ({ mine: renderMine, acq: renderAcq, camps: renderCamps, pipe: renderPipe, req: renderReqs, today: renderToday, dash: renderDash, setup: renderSetup })[S.view]();
}
setInterval(async () => { if (!S.me || !$('ov').hidden) return; await loadAll(); render(); }, 90000);

/* ================= مودال ================= */
function modal(html, init, small) { const ov = $('ov'); ov.innerHTML = `<div class="modal${small ? ' small' : ''}" role="dialog" aria-modal="true">${html}</div>`; ov.hidden = false; ov.scrollTop = 0; ov.onclick = e => { if (e.target === ov) closeModal(); }; if (init) init(ov.firstElementChild); }
function closeModal() { $('ov').hidden = true; $('ov').innerHTML = ''; render(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ov').hidden && !document.querySelector('.ov.top')) closeModal(); });
function dialog(html, onOk) {
  return new Promise(r => { const box = document.createElement('div'); box.className = 'ov top'; box.style.zIndex = 70;
    box.innerHTML = `<div class="modal small">${html}<div class="row"><button class="btn primary" type="button" data-y>تأكيد</button><button class="btn" type="button" data-n>إلغاء</button></div></div>`;
    document.body.appendChild(box); const f = box.querySelector('input,textarea,select'); if (f) f.focus();
    box.querySelector('[data-y]').onclick = () => { const v = onOk ? onOk(box) : true; if (v === false) return; box.remove(); r(v); };
    box.querySelector('[data-n]').onclick = () => { box.remove(); r(null); }; });
}
const confirmBox = msg => dialog(`<h3>تأكيد</h3><p style="margin:0">${esc(msg)}</p>`);
const reasonBox = (title, required) => dialog(`<h3>${esc(title)}</h3><div class="field"><label for="rsn">السبب${required ? ' (إلزامي)' : ''}</label><textarea id="rsn"></textarea></div>`, box => { const v = box.querySelector('#rsn').value.trim(); if (required && !v) { toast('اكتب السبب', true); return false; } return v || ' '; });

/* ================= زر + ترشيح ================= */
$('newDeal').onclick = () => modal(`<h2>ترشيح جديد</h2><div class="chooser">
  <button type="button" id="chAcq"><b>استقطاب جديد</b><span class="muted small">حساب جديد تبي نتعامل معه. تسجّل بياناته، يعتمده متعب، وبعدها تتواصل وتفاوض.</span></button>
  <button type="button" id="chCamp"><b>ترشيح للحملة</b><span class="muted small">ترشّح حساباتك المطلوبة لحملة معيّنة دفعة وحدة، وترسلها لمتعب.</span></button></div>
  <button class="btn" id="chX" type="button">إلغاء</button>`, () => { $('chAcq').onclick = () => openAcqNew(); $('chCamp').onclick = () => openCampNom(); $('chX').onclick = closeModal; }, true);
$('acqNew').onclick = () => openAcqNew();

/* ================= الاستقطاب: تسجيل جديد ================= */
function dupInfl(handle, url, phone, exceptId) {
  const h = handleOf(handle || url), p = ph9(phone);
  return S.infl.filter(x => x.id !== exceptId && ((h && h.length > 2 && handleOf(x.handle || x.tiktok_url) === h) || (p && ph9(x.phone) === p)));
}
function inflHistory(i) {
  if (!i) return '';
  const D = S.deals.filter(d => d.influencer_id === i.id); const posted = D.filter(allDelivered);
  return `<div class="dup">هذا الحساب موجود عندنا (${esc(i.name)}${i.handle ? ' @' + esc(i.handle) : ''}): رشّحه ${esc(memName(i.nominated_by))}، حالته «${esc((ACQ[i.acq_status] || ['—'])[0])}»، ودخل ${D.length} حملة ونزّل في ${posted.length}. ${D[0] && D[0].price != null ? 'آخر مبلغ ' + fmt(D[0].price) + '.' : ''} <button class="btn sm" data-openinfl="${i.id}" type="button">افتح ملفه</button></div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-openinfl]'); if (b) openInfl(b.dataset.openinfl); });
function openAcqNew() {
  const canDate = isAdmin() || isApprover();
  modal(`<h2>استقطاب جديد</h2><div class="muted small">المرحلة الأولى: بيانات الحساب. بعد ما يعتمده متعب تنفتح لك مرحلة التواصل والتفاوض في نفس الملف.</div>
  <div class="grid2">
   <div class="field"><label for="q_date">تاريخ الترشيح</label><input type="date" id="q_date" value="${today()}" ${canDate ? '' : 'disabled'}></div>
   <div class="field"><label>المرشِّح</label><input type="text" value="${esc(S.me.name)}" disabled></div>
   <div class="field"><label for="q_status">حالة الحساب</label><select id="q_status"><option>استقطاب</option><option>مستمر</option></select></div>
   <div class="field"><label for="q_type">نوع الحساب *</label><select id="q_type">${optsBlank(ACC_TYPES)}</select></div>
   <div class="field"><label for="q_name">اسم المعلن *</label><input type="text" id="q_name"></div>
   <div class="field"><label for="q_url">رابط حساب تيك توك *</label><input type="url" id="q_url" dir="ltr" placeholder="https://www.tiktok.com/@..."></div>
   <div class="field"><label for="q_handle">يوزر تيك توك (بدون @)</label><input type="text" id="q_handle" dir="ltr"></div>
  </div>
  <div id="q_dup"></div>
  <div class="row"><button class="btn primary" id="q_send" type="button">إرسال الترشيح للمراجعة</button><button class="btn" id="q_draft" type="button">حفظ كمسودة</button><button class="btn" id="q_x" type="button">إلغاء</button></div>`, root => {
    const chk = () => { if (!$('q_handle').value && $('q_url').value) $('q_handle').value = handleOf($('q_url').value); const d = dupInfl($('q_handle').value, $('q_url').value); $('q_dup').innerHTML = d.length ? inflHistory(d[0]) : ''; if (d.length && isContinuing(d[0])) $('q_status').value = 'مستمر'; };
    $('q_url').addEventListener('change', chk); $('q_handle').addEventListener('change', chk);
    $('q_x').onclick = closeModal;
    const save = async send => {
      const name = $('q_name').value.trim(), url = $('q_url').value.trim(), handle = handleOf($('q_handle').value || url), type = $('q_type').value;
      if (!name || !url || !type) return toast('عبّ الاسم ونوع الحساب ورابط تيك توك', true);
      if (!isUrl(url)) return toast('رابط الحساب مو صحيح', true);
      const dup = dupInfl(handle, url); if (dup.length && !await confirmBox('الحساب هذا موجود عندنا. تبي تسجّله مرة ثانية؟ الأفضل تفتح ملفه الموجود.')) return;
      root.querySelectorAll('button').forEach(b => b.disabled = true);
      const r = await saveInfl(null, { name, tiktok_url: url, handle, acc_type: type, account_status: $('q_status').value, nominated_on: $('q_date').value || today(), nominated_by: S.me.id, source: 'acq', acq_status: send ? 'pending' : 'draft', acq_sent_at: send ? nowIso() : null });
      root.querySelectorAll('button').forEach(b => b.disabled = false);
      if (r) { toast(send ? 'انرسل لمتعب للمراجعة' : 'انحفظ كمسودة'); openInfl(r.id); }
    };
    $('q_send').onclick = () => save(true); $('q_draft').onclick = () => save(false);
  });
}

/* ================= ملف المؤثر ================= */
function contactRow(c, i) {
  return `<div class="contact" data-ci="${i}"><span class="pill">${i + 1}</span>
   <div class="field"><label>الوسيلة</label><select data-c="channel">${optsBlank(CONTACT_CH, c.channel)}</select></div>
   <div class="field"><label>التاريخ</label><input type="date" data-c="date" value="${esc(c.date || today())}"></div>
   <div class="field"><label>النتيجة</label><select data-c="result">${optsBlank(CONTACT_RES, c.result)}</select></div>
   <button class="btn sm danger" data-cdel="${i}" type="button" aria-label="حذف المحاولة">×</button></div>`;
}
function openInfl(id) {
  const i = infl(id); if (!i) return;
  const me = S.me.id, owner = i.nominated_by === me || isAdmin(), appr = isApprover();
  const st = i.acq_status, editable1 = owner && ['draft', 'needs_edit'].includes(st) || isAdmin();
  const open2 = st === 'approved' || st === 'none';
  const keys = platKeys(i); const D = S.deals.filter(d => d.influencer_id === i.id);
  const contacts = Array.isArray(i.contacts) ? i.contacts.slice() : [];
  const v = k => esc(i[k] ?? '');
  const diff = (i.price_before != null && i.price_after != null) ? i.price_before - i.price_after : null;
  modal(`<div class="row between"><div><h2>${esc(i.name)}</h2><div class="muted small">${esc([i.acc_type, i.account_status, i.handle ? '@' + i.handle : '', 'رشّحه ' + memName(i.nominated_by) + ' ' + (i.nominated_on || '')].filter(Boolean).join(' · '))}</div></div>
   <div class="row"><span class="pill ${(ACQ[st] || ['', ''])[1]}">${i.agreed_at ? 'تم الاتفاق' : (ACQ[st] || [st])[0]}</span><button class="btn" id="f_x" type="button">إغلاق</button></div></div>
  ${(st === 'needs_edit' || st === 'rejected') && i.acq_reason.trim() ? `<div class="dup"><b>${st === 'rejected' ? 'سبب الرفض' : 'المطلوب تعديله'}:</b> ${esc(i.acq_reason)}</div>` : ''}

  <details class="sec ${st === 'draft' || st === 'needs_edit' ? 'c' : 'd'}" ${st === 'draft' || st === 'needs_edit' ? 'open' : ''}><summary><span class="idx">1</span><span class="ttl">بيانات الترشيح</span><span class="meta">${i.acq_sent_at ? 'أُرسل ' + dShort(i.acq_sent_at) : ''}</span></summary><div class="body">
   <div class="grid2" ${editable1 ? '' : 'inert'}>
    <div class="field"><label for="i_name">اسم المعلن</label><input type="text" id="i_name" value="${v('name')}"></div>
    <div class="field"><label for="i_name_en">الاسم بالإنجليزي</label><input type="text" id="i_name_en" dir="ltr" value="${v('name_en')}"></div>
    <div class="field"><label for="i_acc_type">نوع الحساب</label><select id="i_acc_type">${optsBlank(ACC_TYPES, i.acc_type)}</select></div>
    <div class="field"><label for="i_account_status">حالة الحساب</label><select id="i_account_status">${opts(['استقطاب', 'مستمر'], i.account_status)}</select></div>
    <div class="field"><label for="i_tiktok_url">رابط حساب تيك توك</label><input type="url" id="i_tiktok_url" dir="ltr" value="${v('tiktok_url')}"></div>
    <div class="field"><label for="i_handle">يوزر تيك توك</label><input type="text" id="i_handle" dir="ltr" value="${v('handle')}"></div>
   </div>
   ${editable1 && st !== 'approved' && st !== 'none' ? `<div class="row"><button class="btn primary" data-a="send" type="button">${st === 'needs_edit' ? 'أعد الإرسال للمراجعة' : 'إرسال الترشيح للمراجعة'}</button><button class="btn" data-a="save1" type="button">حفظ</button></div>` : editable1 ? '<div class="row"><button class="btn" data-a="save1" type="button">حفظ</button></div>' : ''}
  </div></details>

  ${st !== 'none' ? `<details class="sec ${st === 'approved' ? 'd' : st === 'pending' ? 'c' : ''}" ${st === 'pending' ? 'open' : ''}><summary><span class="idx">2</span><span class="ttl">اعتماد متعب</span><span class="meta">${i.acq_decided_at ? dShort(i.acq_decided_at) + ' · ' + esc(memName(i.acq_decided_by)) : ''}</span></summary><div class="body">
   ${appr && st === 'pending' ? `<div class="row"><button class="btn good" data-a="approve" type="button">اعتماد</button><button class="btn" data-a="needs_edit" type="button">يحتاج تعديل</button><button class="btn danger" data-a="reject" type="button">رفض</button></div>`
     : st === 'pending' ? `<div class="muted">بانتظار ${esc(withRole('approver').map(m => m.name).join('، ') || 'متعب')}.</div>` : st === 'draft' ? '<div class="muted">ما انرسل للمراجعة للحين.</div>' : `<div class="muted">${esc(ACQ[st][0])}</div>`}
  </div></details>` : ''}

  <details class="sec ${open2 ? (i.agreed_at ? 'd' : 'c') : ''}" ${open2 && !i.agreed_at ? 'open' : ''}><summary><span class="idx">3</span><span class="ttl">التواصل والتفاوض</span><span class="meta">${i.agreed_at ? 'تم الاتفاق ' + dShort(i.agreed_at) : contacts.length ? contacts.length + ' محاولة' : ''}</span></summary><div class="body">
   ${open2 ? '' : '<div class="lockmsg">هذي المرحلة متاحة بعد اعتماد الترشيح.</div>'}
   <div class="${open2 ? '' : 'locked'}" style="display:grid;gap:12px" ${open2 && owner ? '' : open2 ? 'inert' : 'inert'}>
    <h3>محاولات التواصل</h3><div id="i_contacts" style="display:grid;gap:8px">${contacts.map(contactRow).join('') || '<div class="muted small">ما فيه محاولات مسجّلة.</div>'}</div>
    <div><button class="btn sm" data-a="addc" type="button">+ محاولة تواصل</button></div>
    <div class="field"><label>هل واجهت مشكلة أثناء التواصل أو التفاوض؟</label><div class="row">
      <label class="check"><input type="radio" name="i_prob" value="no" ${i.had_problem === false ? 'checked' : ''}> لا</label>
      <label class="check"><input type="radio" name="i_prob" value="yes" ${i.had_problem ? 'checked' : ''}> نعم</label></div></div>
    <div class="field" id="i_prob_w" ${i.had_problem ? '' : 'hidden'}><label for="i_problem">اكتب تفاصيل المشكلة *</label><textarea id="i_problem">${v('problem')}</textarea></div>
    <div class="field"><label for="i_contact_summary">ملخص التواصل (اختياري)</label><textarea id="i_contact_summary">${v('contact_summary')}</textarea></div>
    <h3>منصات التنزيل والحسابات</h3>
    ${platChecks('i', keys)}
    <div class="grid2">
     <div class="field" data-for="sn" ${keys.includes('sn') ? '' : 'hidden'}><label for="i_snap_user">يوزر سناب شات</label><input type="text" id="i_snap_user" dir="ltr" value="${v('snap_user')}"></div>
     <div class="field" data-for="ig" ${keys.includes('ig') ? '' : 'hidden'}><label for="i_ig_user">رابط أو يوزر انستقرام</label><input type="text" id="i_ig_user" dir="ltr" value="${v('ig_user')}"></div>
    </div>
    <h3>بيانات التواصل والعنوان</h3>
    <div class="grid2">
     <div class="field"><label for="i_phone">رقم الجوال *</label><input type="tel" id="i_phone" dir="ltr" value="${v('phone')}" placeholder="05xxxxxxxx أو +971..."></div>
     <div class="field"><label for="i_country">الدولة</label><input type="text" id="i_country" list="dlCountries" value="${v('country')}"></div>
     <div class="field"><label for="i_city">المدينة</label><input type="text" id="i_city" list="dlCities" value="${v('city')}"></div>
     <div class="field"><label for="i_district">الحي مع الرمز المختصر</label><input type="text" id="i_district" value="${v('district')}" placeholder="المونسية – RRRD1234"></div>
    </div>
    <h3>التفاوض</h3>
    <div class="grid3">
     <div class="field"><label for="i_price_before">السعر قبل التفاوض</label><input type="number" min="0" step="0.01" id="i_price_before" value="${v('price_before')}"></div>
     <div class="field"><label for="i_price_after">السعر بعد التفاوض</label><input type="number" min="0" step="0.01" id="i_price_after" value="${v('price_after')}"></div>
     <div class="field"><label for="i_currency">العملة</label><select id="i_currency">${opts(['SAR', 'AED', 'KWD', 'USD'], i.currency || 'SAR')}</select></div>
    </div>
    <div class="muted small" id="i_diff">${diff != null ? `وفّرنا ${fmt(diff)} ${esc(i.currency || 'SAR')} (${pct(diff, i.price_before)}٪)` : ''}</div>
    ${owner && open2 ? `<div class="row"><button class="btn" data-a="save2" type="button">حفظ</button>${!i.agreed_at ? '<button class="btn good" data-a="agree" type="button">تم الاتفاق</button>' : ''}</div>` : ''}
   </div>
  </div></details>

  <details class="sec" ${i.agreed_at || D.length ? 'open' : ''}><summary><span class="idx">4</span><span class="ttl">الحملات</span><span class="meta">${D.length} حملة</span></summary><div class="body">
   ${D.length ? `<div class="tw"><table><thead><tr><th>الحملة</th><th>المرحلة</th><th class="num">المبلغ</th><th>التاريخ</th></tr></thead><tbody>${D.map(d => `<tr class="click" data-opendeal="${d.id}"><td>${esc(camp(d.campaign_id).name || '')}</td><td>${stepPill(d)}</td><td class="num">${d.price != null ? fmt(d.price) : ''}</td><td class="small muted">${dShort(d.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted small">ما دخل أي حملة للحين.</div>'}
   ${open2 ? '<div><button class="btn primary" data-a="tocamp" type="button">رشّحه لحملة</button></div>' : ''}
  </div></details>`, root => {
    $('f_x').onclick = closeModal;
    const syncPlat = () => { const k = readPlats(root, 'i'); root.querySelectorAll('[data-for]').forEach(e => e.hidden = !k.includes(e.dataset.for)); };
    root.querySelectorAll('[data-plat="i"]').forEach(c => c.addEventListener('change', syncPlat));
    root.querySelectorAll('[name=i_prob]').forEach(r => r.addEventListener('change', () => $('i_prob_w').hidden = root.querySelector('[name=i_prob]:checked').value !== 'yes'));
    const upd = () => { const b = Number($('i_price_before').value), a = Number($('i_price_after').value); $('i_diff').textContent = $('i_price_before').value && $('i_price_after').value ? `وفّرنا ${fmt(b - a)} ${$('i_currency').value} (${pct(b - a, b)}٪)` : ''; };
    ['i_price_before', 'i_price_after', 'i_currency'].forEach(x => $(x).addEventListener('input', upd));
    const readContacts = () => [...root.querySelectorAll('[data-ci]')].map(r => ({ channel: r.querySelector('[data-c=channel]').value, date: r.querySelector('[data-c=date]').value, result: r.querySelector('[data-c=result]').value })).filter(c => c.channel || c.result);
    const stage1 = () => ({ name: $('i_name').value.trim(), name_en: $('i_name_en').value.trim(), acc_type: $('i_acc_type').value, account_status: $('i_account_status').value, tiktok_url: $('i_tiktok_url').value.trim(), handle: handleOf($('i_handle').value || $('i_tiktok_url').value) });
    const stage2 = strict => {
      const prob = root.querySelector('[name=i_prob]:checked'); const k = readPlats(root, 'i');
      const phone = normPhone($('i_phone').value);
      if ($('i_phone').value.trim() && phone === null) { toast('رقم الجوال مو صحيح. السعودي يبدأ بـ 05، والدولي بـ + ومفتاح الدولة', true); return null; }
      if (strict && !phone) { toast('رقم الجوال إلزامي', true); return null; }
      if (prob && prob.value === 'yes' && !$('i_problem').value.trim()) { toast('اكتب تفاصيل المشكلة', true); return null; }
      const pb = $('i_price_before').value, pa = $('i_price_after').value;
      return { contacts: readContacts(), had_problem: prob ? prob.value === 'yes' : null, problem: prob && prob.value === 'yes' ? $('i_problem').value.trim() : '', contact_summary: $('i_contact_summary').value.trim(),
        platforms: platText(k), snap_user: k.includes('sn') ? $('i_snap_user').value.trim() : i.snap_user, ig_user: k.includes('ig') ? $('i_ig_user').value.trim() : i.ig_user,
        phone: phone || '', country: $('i_country').value.trim(), city: $('i_city').value.trim(), district: $('i_district').value.trim(),
        price_before: pb === '' ? null : Number(pb), price_after: pa === '' ? null : Number(pa), currency: $('i_currency').value };
    };
    root.addEventListener('click', async e => {
      const cd = e.target.closest('[data-cdel]'); if (cd) { cd.closest('[data-ci]').remove(); return; }
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; let ch = null;
      if (a === 'addc') { const box = $('i_contacts'); if (!box.querySelector('[data-ci]')) box.innerHTML = ''; box.insertAdjacentHTML('beforeend', contactRow({}, box.querySelectorAll('[data-ci]').length)); return; }
      if (a === 'tocamp') return openCampNom(null, i.id);
      if (a === 'save1') ch = stage1();
      if (a === 'send') { ch = stage1(); if (!ch.name || !ch.acc_type || !ch.tiktok_url) return toast('عبّ الاسم ونوع الحساب ورابط تيك توك', true); Object.assign(ch, { acq_status: 'pending', acq_sent_at: nowIso(), acq_reason: '' }); }
      if (a === 'approve') ch = { acq_status: 'approved', acq_decided_at: nowIso(), acq_decided_by: me, acq_reason: '' };
      if (a === 'needs_edit' || a === 'reject') { const r = await reasonBox(a === 'reject' ? 'سبب الرفض' : 'وش المطلوب يتعدّل؟', a === 'needs_edit'); if (r == null) return; ch = { acq_status: a, acq_decided_at: nowIso(), acq_decided_by: me, acq_reason: r.trim() }; }
      if (a === 'save2') { ch = stage2(false); if (!ch) return; }
      if (a === 'agree') { ch = stage2(true); if (!ch) return; if (ch.price_after == null) return toast('اكتب السعر بعد التفاوض', true); ch.agreed_at = nowIso(); }
      if (!ch) return; b.disabled = true; const r = await saveInfl(i.id, ch); b.disabled = false;
      if (r) { toast(a === 'agree' ? 'تم الاتفاق. تقدر الحين ترشّحه لحملة' : 'انحفظ'); openInfl(i.id); }
    });
    root.addEventListener('click', e => { const r = e.target.closest('[data-opendeal]'); if (r) openDeal(r.dataset.opendeal); });
  });
}

/* ================= صفحة الاستقطاب ================= */
function acqState(i) { return i.agreed_at ? 'agreed' : i.acq_status; }
function renderAcq() {
  const fill = (id, list, all) => { const s = $(id), v = s.value; s.innerHTML = `<option value="">${all}</option>` + list.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(''); if ([...s.options].some(o => o.value === v)) s.value = v; };
  fill('aMem', active().map(m => [m.id, m.name]), 'الكل'); fill('aType', ACC_TYPES.map(t => [t, t]), 'الكل');
  const qq = $('aQ').value.trim().toLowerCase(), st = $('aSt').value, mm = $('aMem').value, tp = $('aType').value;
  const L = S.infl.filter(i => (!st || acqState(i) === st) && (!mm || i.nominated_by === mm) && (!tp || i.acc_type === tp) && (!qq || [i.name, i.name_en, i.handle, i.tiktok_url, i.phone].some(x => String(x || '').toLowerCase().includes(qq))));
  $('aList').innerHTML = L.length ? `<div class="tw"><table><thead><tr><th>المعلن</th><th>النوع</th><th>الحالة</th><th>المرشِّح</th><th>التاريخ</th><th class="num">محاولات</th><th class="num">قبل</th><th class="num">بعد</th><th class="num">حملات</th></tr></thead><tbody>${L.slice(0, 500).map(i => { const s = acqState(i); return `<tr class="click" data-openinfl="${i.id}"><td>${esc(i.name)}<small class="muted" dir="ltr" style="display:block">${i.handle ? '@' + esc(i.handle) : ''}</small></td><td class="small">${esc(i.acc_type)}</td><td><span class="pill ${s === 'agreed' ? 'good' : (ACQ[s] || ['', ''])[1]}">${s === 'agreed' ? 'تم الاتفاق' : (ACQ[s] || [s])[0]}</span></td><td>${esc(memName(i.nominated_by))}</td><td class="small muted">${esc(i.nominated_on || '')}</td><td class="num">${(i.contacts || []).length || ''}</td><td class="num">${i.price_before != null ? fmt(i.price_before) : ''}</td><td class="num">${i.price_after != null ? fmt(i.price_after) : ''}</td><td class="num">${S.deals.filter(d => d.influencer_id === i.id).length || ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">ما فيه حسابات بهذي التصفية. ابدأ من «+ استقطاب جديد».</div>';
}
['aQ', 'aSt', 'aMem', 'aType'].forEach(id => $(id).addEventListener('input', renderAcq));

/* ================= ترشيح للحملة (دفعة) ================= */
function campStats(cid, mid) {
  const D = S.deals.filter(d => d.campaign_id === cid && (!mid || d.member_id === mid));
  const used = D.filter(d => !d.closed_at && d.approval !== 'rejected').length;
  return { used, all: D, drafts: D.filter(d => !d.sent_at && d.approval === 'pending' && !d.closed_at), sent: D.filter(d => d.sent_at || d.approval !== 'pending'), approved: D.filter(d => d.approval === 'approved'), rejected: D.filter(d => d.approval === 'rejected'), fix: D.filter(d => d.approval === 'needs_edit'), pending: D.filter(d => d.sent_at && d.approval === 'pending') };
}
function nomCard(n, d, pre) {
  const i = d ? infl(d.influencer_id) : pre ? infl(pre) : null;
  const src = d || {};
  const val = (k, ik) => esc(src[k] ?? (i ? i[ik || k] ?? '' : ''));
  const keys = d ? platKeys(d) : platKeys(i || {});
  return `<div class="card" data-card="${n}" data-deal="${d ? d.id : ''}" data-infl="${i ? i.id : ''}">
   <div class="hd"><b>الترشيح ${n}</b><span class="pill" data-cst></span>${d && d.approval === 'needs_edit' ? `<span class="pill warn">يحتاج تعديل: ${esc(d.decision_reason)}</span>` : ''}${i ? `<span class="pill acc">${esc(i.name)} موجود عندنا</span>` : ''}</div>
   <div class="grid2">
    <div class="field"><label>رابط حساب تيك توك *</label><input type="url" data-f="url" dir="ltr" value="${val('_url', 'tiktok_url')}" placeholder="https://www.tiktok.com/@..."></div>
    <div class="field"><label>اسم المعلن *</label><input type="text" data-f="name" value="${val('name')}"></div>
    <div class="field"><label>نوع المحتوى *</label><select data-f="acc_type">${optsBlank(ACC_TYPES, src.acc_type || (i && i.acc_type))}</select></div>
    <div class="field"><label>المبلغ *</label><input type="number" min="0" data-f="price" value="${val('price', 'price_after')}" placeholder="0 = مقابل منتج"></div>
    <div class="field"><label>نوع الإعلان</label><select data-f="ad_type">${optsBlank(AD_TYPES, src.ad_type)}</select></div>
    <div class="field"><label>حالة الحساب</label><select data-f="status">${opts(['استقطاب', 'مستمر'], isContinuing(i) ? 'مستمر' : (i && i.account_status) || 'استقطاب')}</select></div>
   </div>
   <div class="field"><label>منصة التنزيل *</label>${platChecks('c' + n, keys)}</div>
   <div class="grid2">
    <div class="field" data-for="sn" ${keys.includes('sn') ? '' : 'hidden'}><label>يوزر سناب شات</label><input type="text" data-f="sn_user" dir="ltr" value="${val('sn_user', 'snap_user')}"></div>
    <div class="field" data-for="ig" ${keys.includes('ig') ? '' : 'hidden'}><label>رابط أو يوزر انستقرام</label><input type="text" data-f="ig_user" dir="ltr" value="${esc(i ? i.ig_user : '')}"></div>
   </div>
   <details><summary class="small" style="cursor:pointer;color:var(--accent)">بيانات إضافية (العنوان، الاسم بالإنجليزي، تاريخ النشر، الهوك)</summary><div class="grid2" style="margin-top:10px">
    <div class="field"><label>الاسم بالإنجليزي</label><input type="text" data-f="name_en" dir="ltr" value="${esc(i ? i.name_en : '')}"></div>
    <div class="field"><label>رقم الجوال</label><input type="tel" data-f="phone" dir="ltr" value="${val('rcv_phone', 'phone')}"></div>
    <div class="field"><label>الدولة</label><input type="text" data-f="country" list="dlCountries" value="${val('country')}"></div>
    <div class="field"><label>المدينة</label><input type="text" data-f="city" list="dlCities" value="${val('rcv_city', 'city')}"></div>
    <div class="field"><label>الحي مع الرمز المختصر</label><input type="text" data-f="district" value="${val('address', 'district')}"></div>
    <div class="field"><label>تاريخ النشر المتوقع</label><input type="date" data-f="planned_date" value="${esc(src.planned_date || '')}"></div>
    <div class="field"><label>هوك الفيديو</label><input type="text" data-f="hook" value="${esc(src.hook || '')}"></div>
   </div><div class="muted small">إذا عبّيت الجوال والمدينة والحي، يروح لصقر للشحن مباشرة بعد الاعتماد. وإذا تركتها، ترسل للمؤثر رابط يعبّيها بنفسه.</div></details>
   ${d ? '<div><button class="btn sm danger" data-rm type="button">حذف هذا الترشيح</button></div>' : ''}
  </div>`;
}
function openCampNom(cid, preInfl) {
  const live = S.camps.filter(c => c.status === 'active' && c.active !== false);
  if (!cid) {
    if (!live.length) return modal('<h2>ترشيح للحملة</h2><div class="empty">ما فيه حملات شغالة. عبدالمحسن يضيفها من «الحملات».</div><button class="btn" type="button" onclick="document.getElementById(\'ov\').hidden=true">إغلاق</button>', null, true);
    if (live.length === 1) return openCampNom(live[0].id, preInfl);
    return modal(`<h2>ترشيح للحملة</h2><div class="field"><label for="cn_c">اختر الحملة</label><select id="cn_c">${live.map(c => `<option value="${c.id}">${esc(c.name)} — حصتك ${quotaOf(c.id, S.me.id)}</option>`).join('')}</select></div><div class="row"><button class="btn primary" id="cn_go" type="button">متابعة</button><button class="btn" id="cn_x" type="button">إلغاء</button></div>`, () => { $('cn_go').onclick = () => openCampNom($('cn_c').value, preInfl); $('cn_x').onclick = closeModal; }, true);
  }
  const c = camp(cid), me = S.me.id, quota = quotaOf(cid, me), st = campStats(cid, me);
  const fixes = st.fix, drafts = st.drafts, sentN = st.sent.length - fixes.length - st.rejected.length;
  const free = Math.max(0, quota - st.used);
  let n = 0; const cards = [];
  fixes.forEach(d => cards.push(nomCard(++n, d))); drafts.forEach(d => cards.push(nomCard(++n, d)));
  for (let k = 0; k < free; k++) cards.push(nomCard(++n, null, k === 0 ? preInfl : null));
  modal(`<div class="row between"><div><h2>ترشيح لحملة «${esc(c.name)}»</h2><div class="muted small">حصتك ${quota} · أرسلت ${sentN} · ${fixes.length ? fixes.length + ' ترجع للتعديل · ' : ''}الباقي ${Math.max(0, quota - sentN)}</div></div><button class="btn" id="cn_x" type="button">إغلاق</button></div>
   ${!quota ? '<div class="dup">ما عندك حصة في هذي الحملة. اطلب من متعب يحدد لك عدد، أو استخدم «طلب ترشيحات إضافية».</div>' : ''}
   ${!cards.length && quota ? '<div class="note">خلّصت حصتك في هذي الحملة. إذا تبي ترشّح أكثر، اطلب زيادة من متعب.</div>' : ''}
   <div id="cn_cards" style="display:grid;gap:12px">${cards.join('')}</div>
   <div class="panel" style="position:sticky;bottom:0"><div class="row between"><b id="cn_count"></b>
    <div class="row"><button class="btn" id="cn_more" type="button">طلب ترشيحات إضافية</button>${cards.length ? '<button class="btn" id="cn_draft" type="button">حفظ كمسودة</button><button class="btn primary" id="cn_send" type="button">إرسال الترشيحات إلى متعب</button>' : ''}</div></div></div>`, root => {
    $('cn_x').onclick = closeModal;
    const cardEls = () => [...root.querySelectorAll('[data-card]')];
    const f = (el, k) => { const x = el.querySelector(`[data-f="${k}"]`); return x ? x.value.trim() : ''; };
    const isEmpty = el => !f(el, 'url') && !f(el, 'name');
    const isDone = el => f(el, 'url') && f(el, 'name') && f(el, 'acc_type') && f(el, 'price') !== '' && readPlats(el, 'c' + el.dataset.card).length;
    const count = () => { let ok = 0; cardEls().forEach(el => { const d = isDone(el); el.classList.toggle('ok', !!d); el.classList.toggle('part', !d && !isEmpty(el)); el.querySelector('[data-cst]').textContent = d ? 'مكتمل' : isEmpty(el) ? 'فاضي' : 'ناقص'; if (d) ok++; }); $('cn_count').textContent = `مكتمل ${ok} من ${cardEls().length}`; };
    root.addEventListener('input', count); root.addEventListener('change', e => { const p = e.target.closest('[data-plat]'); if (p) { const el = p.closest('[data-card]'); const k = readPlats(el, 'c' + el.dataset.card); el.querySelectorAll('[data-for]').forEach(x => x.hidden = !k.includes(x.dataset.for)); } count(); });
    root.querySelectorAll('[data-f=url]').forEach(inp => inp.addEventListener('change', () => { const el = inp.closest('[data-card]'); const dup = dupInfl(handleOf(inp.value), inp.value); if (dup.length && !el.dataset.infl) { const i = dup[0]; el.dataset.infl = i.id; const set = (k, v) => { const x = el.querySelector(`[data-f="${k}"]`); if (x && !x.value && v) x.value = v; }; set('name', i.name); set('acc_type', i.acc_type); set('phone', i.phone); set('city', i.city); set('district', i.district); set('country', i.country); set('sn_user', i.snap_user); set('ig_user', i.ig_user); set('name_en', i.name_en); if (i.price_after != null) set('price', String(i.price_after)); if (isContinuing(i)) el.querySelector('[data-f=status]').value = 'مستمر'; toast('الحساب موجود عندنا، سحبت بياناته'); count(); } }));
    root.addEventListener('click', async e => { const rm = e.target.closest('[data-rm]'); if (!rm) return; const el = rm.closest('[data-card]'); if (!await confirmBox('تحذف هذا الترشيح؟')) return; const r = await q(sb.from('deals').update({ closed_at: nowIso(), closed_reason: 'حذفه الموظف قبل الإرسال' }).eq('id', el.dataset.deal).select().single()); if (r) { upsertLocal(S.deals, r); openCampNom(cid); } });
    count();
    $('cn_more').onclick = () => requestQuota(cid);
    let busy = false;
    const saveAll = async send => {
      if (busy) return; busy = true; root.querySelectorAll('#cn_draft,#cn_send').forEach(b => b.disabled = true);
      const batch = crypto.randomUUID(); let saved = 0, sent = 0, bad = 0;
      for (const el of cardEls()) {
        if (isEmpty(el)) continue; const done = isDone(el);
        const keys = readPlats(el, 'c' + el.dataset.card); const rawPhone = f(el, 'phone'); const phone = normPhone(rawPhone);
        if (rawPhone && phone === null) { bad++; el.classList.add('part'); continue; }
        const url = f(el, 'url'); if (!isUrl(url)) { bad++; continue; }
        // ملف المؤثر: نستخدم الموجود أو ننشئ جديد
        let iid = el.dataset.infl; const handle = handleOf(url);
        if (!iid) { const dup = dupInfl(handle, url, phone); if (dup.length) iid = dup[0].id; }
        const inflData = { name: f(el, 'name'), name_en: f(el, 'name_en'), tiktok_url: url, handle, acc_type: f(el, 'acc_type'), phone: phone || '', country: f(el, 'country'), city: f(el, 'city'), district: f(el, 'district'), snap_user: f(el, 'sn_user'), ig_user: f(el, 'ig_user'), platforms: platText(keys), account_status: f(el, 'status') };
        if (iid) { const cur = infl(iid); const fillEmpty = {}; for (const k in inflData) if (inflData[k] && !cur[k]) fillEmpty[k] = inflData[k]; if (Object.keys(fillEmpty).length) await saveInfl(iid, fillEmpty); }
        else { const r = await saveInfl(null, { ...inflData, nominated_by: me, source: 'campaign', acq_status: 'none' }); if (!r) { bad++; continue; } iid = r.id; el.dataset.infl = iid; }
        const price = f(el, 'price');
        const dealData = { influencer_id: iid, campaign_id: cid, member_id: el.dataset.deal ? undefined : me, name: inflData.name, handle, phone: phone || '', platform: platText(keys), acc_type: inflData.acc_type, city: inflData.city, price: price === '' ? null : Number(price), ad_type: f(el, 'ad_type'), planned_date: f(el, 'planned_date') || null, hook: f(el, 'hook'), sn_user: inflData.snap_user, country: inflData.country, rcv_name: inflData.name, rcv_phone: phone || '', rcv_city: inflData.city, address: inflData.district };
        Object.keys(dealData).forEach(k => dealData[k] === undefined && delete dealData[k]);
        if (send && done) Object.assign(dealData, { sent_at: nowIso(), batch_id: batch, approval: 'pending', decision_reason: '' });
        const r = await saveDeal(el.dataset.deal || null, dealData); if (!r) { bad++; continue; } el.dataset.deal = r.id; saved++; if (send && done) sent++;
      }
      busy = false; root.querySelectorAll('#cn_draft,#cn_send').forEach(b => b.disabled = false);
      if (bad) toast(`${bad} ترشيح فيه خطأ في الرابط أو الجوال، صححه وأعد المحاولة`, true);
      else toast(send ? `انرسل ${sent} ترشيح لمتعب${saved > sent ? '، و' + (saved - sent) + ' انحفظت مسودة لأنها ناقصة' : ''}` : `انحفظ ${saved} كمسودة`);
      if (!bad) { if (send && sent) closeModal(); else openCampNom(cid); }
    };
    if ($('cn_draft')) { $('cn_draft').onclick = () => saveAll(false); $('cn_send').onclick = () => saveAll(true); }
  });
}
async function requestQuota(cid) {
  const c = camp(cid); const ap = withRole('approver').filter(m => !m.is_admin || (m.roles || []).includes('approver'))[0];
  const qty = await dialog(`<h3>طلب ترشيحات إضافية — ${esc(c.name)}</h3><div class="field"><label for="rq_n">كم ترشيح زيادة؟</label><input type="number" min="1" id="rq_n" value="2"></div><div class="field"><label for="rq_w">السبب</label><textarea id="rq_w"></textarea></div>`, box => { const n = Number(box.querySelector('#rq_n').value); if (!n || n < 1) { toast('اكتب العدد', true); return false; } return { n, w: box.querySelector('#rq_w').value.trim() }; });
  if (!qty) return;
  const r = await saveReq(null, { kind: 'quota', campaign_id: cid, qty: qty.n, title: `زيادة ${qty.n} ترشيح في حملة ${c.name}`, details: qty.w, to_member: ap ? ap.id : null, from_member: S.me.id });
  if (r) toast('انرسل الطلب لمتعب');
}

/* ================= صفحة الحملات ================= */
function renderCamps() {
  const showEnded = $('cEnded').checked, me = S.me.id, ap = isApprover(), adm = isAdmin();
  const L = S.camps.filter(c => showEnded || c.status !== 'ended');
  $('cList').innerHTML = L.map(c => {
    const st = campStats(c.id); const D = st.all.filter(d => !d.closed_at || d.approval === 'rejected');
    const shipping = st.approved.filter(d => !d.delivered_at && !d.no_ship).length, deliv = st.approved.filter(d => d.delivered_at).length, posted = st.approved.filter(allDelivered).length;
    const spend = st.approved.reduce((s, d) => s + (Number(d.price) || 0), 0);
    const quotaSum = S.quotas.filter(q => q.campaign_id === c.id).reduce((s, q) => s + q.quota, 0);
    const target = c.target_total || 0; const myQ = quotaOf(c.id, me), myS = campStats(c.id, me);
    const people = creators();
    return `<div class="panel" data-camp="${c.id}">
     <div class="row between"><div class="row"><h2>${esc(c.name)}</h2><span class="pill ${CAMP_ST[c.status || 'active'][1]}">${CAMP_ST[c.status || 'active'][0]}</span>${c.product ? `<span class="muted small">${esc(c.product)}</span>` : ''}</div>
      ${c.status === 'active' && hasRole(me, 'creator') ? `<button class="btn primary" data-nom="${c.id}" type="button">رشّح (حصتك ${myQ}، باقي ${Math.max(0, myQ - myS.used)})</button>` : ''}</div>
     <div class="tiles">
      <div class="tile"><span class="l">المطلوب</span><span class="v">${target || '—'}</span></div>
      <div class="tile"><span class="l">موزّع على الموظفين</span><span class="v">${quotaSum}</span></div>
      <div class="tile"><span class="l">انرسل لمتعب</span><span class="v">${st.sent.length}</span></div>
      <div class="tile"><span class="l">معتمد</span><span class="v">${st.approved.length}</span></div>
      <div class="tile"><span class="l">قيد الشحن</span><span class="v">${shipping}</span></div>
      <div class="tile"><span class="l">استلموا</span><span class="v">${deliv}</span></div>
      <div class="tile"><span class="l">نشروا</span><span class="v">${posted}</span></div>
      <div class="tile"><span class="l">مبالغ المعتمدين</span><span class="v">${fmt(spend)}</span></div>
     </div>
     ${target ? `<div class="row small"><span class="muted">التقدم نحو المطلوب (المعتمد)</span><div class="prog" style="flex:1"><i style="width:${Math.min(100, pct(st.approved.length, target))}%"></i></div><b>${pct(st.approved.length, target)}٪</b></div>` : ''}
     ${adm ? `<details><summary class="small" style="cursor:pointer;color:var(--accent)">إعدادات الحملة (عبدالمحسن)</summary><div class="grid3" style="margin-top:10px">
       <div class="field"><label>الاسم</label><input type="text" data-k="name" value="${esc(c.name)}"></div>
       <div class="field"><label>المنتج</label><input type="text" data-k="product" value="${esc(c.product)}"></div>
       <div class="field"><label>العدد المطلوب</label><input type="number" min="0" data-k="target_total" value="${c.target_total ?? ''}"></div>
       <div class="field"><label>الحالة</label><select data-k="status">${Object.entries(CAMP_ST).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      </div><button class="btn sm primary" data-csave type="button">حفظ</button></details>` : ''}
     <div class="tw"><table><thead><tr><th>الموظف</th><th class="num">الحصة</th><th class="num">أرسل</th><th class="num">معتمد</th><th class="num">مرفوض</th><th class="num">يحتاج تعديل</th><th class="num">ينتظر متعب</th></tr></thead><tbody>${people.map(m => { const s = campStats(c.id, m.id); return `<tr><td>${esc(m.name)}</td><td class="num">${ap ? `<input type="number" min="0" data-q="${m.id}" value="${quotaOf(c.id, m.id)}" style="width:80px;min-height:32px">` : quotaOf(c.id, m.id)}</td><td class="num">${s.sent.length}</td><td class="num">${s.approved.length}</td><td class="num">${s.rejected.length || ''}</td><td class="num">${s.fix.length || ''}</td><td class="num">${s.pending.length || ''}</td></tr>`; }).join('')}</tbody></table></div>
     ${ap ? `<div class="row"><button class="btn sm primary" data-qsave type="button">حفظ الحصص</button><button class="btn sm" data-qeven type="button">وزّع المطلوب بالتساوي</button><span class="muted small">مجموع الحصص ${quotaSum}${target ? ' من ' + target : ''}</span></div>` : ''}
    </div>`;
  }).join('') || '<div class="empty">ما فيه حملات. عبدالمحسن يضيفها من «+ حملة».</div>';
}
$('cEnded').addEventListener('input', renderCamps);
$('campAdd').onclick = async () => { const r = await dialog(`<h3>حملة جديدة</h3><div class="field"><label for="nc_n">اسم الحملة</label><input type="text" id="nc_n"></div><div class="field"><label for="nc_p">المنتج</label><input type="text" id="nc_p"></div><div class="field"><label for="nc_t">العدد المطلوب من الترشيحات</label><input type="number" min="0" id="nc_t"></div>`, box => { const n = box.querySelector('#nc_n').value.trim(); if (!n) { toast('اكتب اسم الحملة', true); return false; } return { name: n, product: box.querySelector('#nc_p').value.trim(), target_total: Number(box.querySelector('#nc_t').value) || null, status: 'active', active: true }; }); if (!r) return; const c = await q(sb.from('campaigns').insert(r).select().single()); if (c) { S.camps.unshift(c); toast('انضافت الحملة. متعب يوزّع الحصص'); renderCamps(); } };
$('cList').addEventListener('click', async e => {
  const nb = e.target.closest('[data-nom]'); if (nb) return openCampNom(nb.dataset.nom);
  const box = e.target.closest('[data-camp]'); if (!box) return; const cid = box.dataset.camp;
  if (e.target.closest('[data-csave]')) { const ch = {}; box.querySelectorAll('[data-k]').forEach(x => ch[x.dataset.k] = x.type === 'number' ? (x.value === '' ? null : Number(x.value)) : x.value.trim()); ch.active = ch.status !== 'ended'; const r = await q(sb.from('campaigns').update(ch).eq('id', cid).select().single()); if (r) { upsertLocal(S.camps, r); toast('انحفظ'); renderCamps(); } }
  if (e.target.closest('[data-qeven]')) { const t = camp(cid).target_total; const inputs = [...box.querySelectorAll('[data-q]')]; if (!t) return toast('عبدالمحسن ما حدد العدد المطلوب للحملة', true); const base = Math.floor(t / inputs.length), extra = t % inputs.length; inputs.forEach((x, k) => x.value = base + (k < extra ? 1 : 0)); toast('وزّعت بالتساوي، راجعها واضغط حفظ'); }
  if (e.target.closest('[data-qsave]')) { const rows = [...box.querySelectorAll('[data-q]')].map(x => ({ campaign_id: cid, member_id: x.dataset.q, quota: Number(x.value) || 0, updated_by: S.me.id })); const r = await q(sb.from('quotas').upsert(rows).select()); if (r) { r.forEach(x => { const k = S.quotas.findIndex(y => y.campaign_id === x.campaign_id && y.member_id === x.member_id); if (k >= 0) S.quotas[k] = x; else S.quotas.push(x); }); toast('انحفظت الحصص'); renderCamps(); } }
});

/* ================= مهامي ================= */
const QL = {
  members: 'حسابات جديدة تنتظر التفعيل', acq_review: 'استقطاب ينتظر اعتمادك', appr: 'ترشيحات حملات تنتظر اعتمادك', quota_req: 'طلبات زيادة حصة',
  acq_fix: 'استقطاب رجع لك للتعديل', camp_fix: 'ترشيحات حملات رجعت للتعديل', acq_draft: 'استقطاب محفوظ كمسودة', camp_draft: 'ترشيحات حملات محفوظة كمسودة', camp_quota: 'حصص ترشيح ما خلصت',
  acq_contact: 'معتمد: تواصل وفاوض', intake: 'معتمد: كمّل العنوان أو أرسل الرابط للمؤثر', ship_send: 'جاهزة للشحن', ship_wait: 'في الطريق: سجّل الوصول', ship_fail: 'تعذّر التسليم: تابعها',
  video: 'وصله المنتج: نسّق المقطع', video_fix: 'مسودات رجعت للتعديل', draft: 'مسودات مقاطع تنتظر اعتمادك', post: 'سجّل النزول والكود لكل منصة',
  launch: 'نزل: شغّل الإعلان', snap_follow: 'محتوى نزل: سلّمه للميديا باير وتابع التشغيل', req_in: 'طلبات عليك', req_review: 'طلبات سلّموها لك: راجعها', pay: 'تنتظر الدفع', park: 'احتياط'
};
const QO = ['members', 'acq_review', 'appr', 'quota_req', 'draft', 'req_review', 'acq_fix', 'camp_fix', 'video_fix', 'ship_fail', 'ship_send', 'ship_wait', 'launch', 'snap_follow', 'req_in', 'camp_quota', 'acq_draft', 'camp_draft', 'acq_contact', 'intake', 'video', 'post', 'pay', 'park'];
const BULK = {
  appr: ['اعتماد', () => ({ approval: 'approved', approved_at: nowIso(), approved_by: S.me.id, decision_reason: '' })],
  ship_send: ['تم الشحن اليوم', () => ({ shipped_at: nowIso() })],
  ship_wait: ['وصلت اليوم', () => ({ delivered_at: nowIso() })],
  pay: ['تم الدفع', () => ({ paid_at: nowIso() })]
};
function queuesFor(id) {
  const G = {}; const add = (k, x) => (G[k] = G[k] || []).push(x);
  const isAp = id !== 'admin' && strictRole(id, 'approver');
  for (const i of S.infl) {
    if (id === 'admin') continue;
    if (i.acq_status === 'pending' && isAp) add('acq_review', { i });
    if (i.nominated_by === id) { if (i.acq_status === 'needs_edit') add('acq_fix', { i }); if (i.acq_status === 'draft') add('acq_draft', { i }); if (i.acq_status === 'approved' && !i.agreed_at) add('acq_contact', { i }); }
  }
  for (const d of S.deals) {
    if (d.closed_at) continue;
    if (id === 'admin') { if (allDelivered(d) && !d.paid_at && !d.no_pay && d.approval === 'approved') add('pay', { d, i: SI.video }); continue; }
    if (d.approval === 'rejected') continue;
    if (d.member_id === id && d.approval === 'needs_edit') { add('camp_fix', { d, i: 0 }); continue; }
    if (d.member_id === id && !d.sent_at && d.approval === 'pending') { add('camp_draft', { d, i: 0 }); continue; }
    if (isParked(d)) { if (d.member_id === id || isAp) add('park', { d, i: SI.appr }); continue; }
    const i = curStep(d);
    // التشغيل لكل منصة مستقل: أول ما تنزل منصة تروح للميديا باير
    if (d.approval === 'approved') for (const p of platKeys(d)) if (delivered(d, p) && !launched(d, p)) { if (strictRole(id, 'media')) add('launch', { d, i: SI.live, p }); if (strictRole(id, 'snap')) add('snap_follow', { d, i: SI.live, p }); }
    if (i < 0 || i >= STEPS.length) continue;
    const k = STEPS[i].k;
    if (k === 'appr') { if (isAp) add('appr', { d, i }); continue; }
    if (k === 'ship') { if (strictRole(id, 'shipper')) add(d.ship_failed_at ? 'ship_fail' : d.shipped_at ? 'ship_wait' : 'ship_send', { d, i }); continue; }
    if (k === 'live') continue;
    if (k === 'video') { if (draftPending(d)) { if (isAp) add('draft', { d, i }); } else if (d.member_id === id) add(d.video_ok_at || platKeys(d).some(p => delivered(d, p)) ? 'post' : (d.rounds > 0 ? 'video_fix' : 'video'), { d, i }); continue; }
    if (d.member_id === id) add(k, { d, i });
  }
  if (id !== 'admin' && strictRole(id, 'creator')) for (const c of S.camps.filter(c => c.status === 'active')) { const qn = quotaOf(c.id, id); const s = campStats(c.id, id); if (qn > s.used) add('camp_quota', { c, left: qn - s.used }); }
  for (const r of S.reqs) {
    if (r.status === 'done' || r.status === 'cancelled') continue;
    if (r.kind === 'quota') { if (r.to_member === id || (isAp && !r.to_member)) add('quota_req', { r }); continue; }
    if (r.to_member === id && (r.status === 'new' || r.status === 'doing')) add('req_in', { r });
    if (r.from_member === id && r.status === 'review') add('req_review', { r });
  }
  if (id === 'admin') S.members.filter(m => !m.active).forEach(m => add('members', { m }));
  for (const k in G) G[k].sort((a, b) => (a.d && b.d) ? stepAge(b.d, b.i) - stepAge(a.d, a.i) : 0);
  return G;
}
function countFor(id) { const G = queuesFor(id); return Object.entries(G).filter(([k]) => !['park', 'camp_quota', 'acq_contact'].includes(k)).reduce((a, [, v]) => a + v.length, 0); }
function updateMineCount() { if (!S.me) return; const n = countFor(S.me.id) + (isAdmin() ? countFor('admin') : 0); $('mineCnt').hidden = !n; $('mineCnt').textContent = n; }
function dealRow(x, bulk, k) {
  const { d, i, p } = x; const late = lateness(d, i); const age = p ? ageOf(d[p + '_at']) : stepAge(d, i);
  const miss = k === 'post' ? platKeys(d).filter(q => !delivered(d, q)).map(q => 'باقي ' + PL[q]).join('، ') : '';
  const sub = [camp(d.campaign_id).name || 'بدون حملة', d.member_id !== S.me.id ? memName(d.member_id) : '', p ? PL[p] + (p === 'sn' ? (d.sn_user ? ' · ' + d.sn_user : '') : (d[p + '_code'] ? ' · ' + d[p + '_code'] : '')) : platText(platKeys(d)), miss, d.decision_reason && d.decision_reason.trim() && k === 'camp_fix' ? 'المطلوب: ' + d.decision_reason : '', d.price != null ? fmt(d.price) + ' ' + (d.currency || '') : ''].filter(Boolean).join(' · ');
  const apprBtns = k === 'appr' ? `<button class="btn sm danger" data-dq="reject" data-id="${d.id}" type="button">رفض</button><button class="btn sm" data-dq="needs_edit" data-id="${d.id}" type="button">تعديل</button>` : '';
  const launchBtn = (k === 'launch' || k === 'snap_follow') ? `<button class="btn sm good" data-launch="${p}" data-id="${d.id}" type="button">انطلق</button>` : '';
  return `<div class="qrow ${late}">${bulk ? `<input type="checkbox" data-bulk="${d.id}" aria-label="تحديد">` : '<span></span>'}<div><div class="t">${esc(d.name)}</div><div class="sub">${esc(sub)}</div></div><div class="acts row" style="gap:6px;flex-wrap:nowrap">${apprBtns}${launchBtn}<span class="pill ${late === 'late' ? 'bad' : late === 'soon' ? 'warn' : ''}">${age} يوم</span><button class="btn sm" data-open="${d.id}" type="button">افتح</button></div></div>`;
}
function inflRow(i) { return `<div class="qrow"><span></span><div><div class="t">${esc(i.name)}</div><div class="sub">${esc([i.acc_type, i.handle ? '@' + i.handle : '', 'رشّحه ' + memName(i.nominated_by), i.acq_reason && i.acq_reason.trim() ? 'المطلوب: ' + i.acq_reason : ''].filter(Boolean).join(' · '))}</div></div><div class="acts row" style="gap:6px"><span class="pill">${ageOf(i.acq_sent_at || i.created_at)} يوم</span><button class="btn sm" data-openinfl="${i.id}" type="button">افتح</button></div></div>`; }
function reqRow(r) {
  const late = r.due && r.due < today() ? 'late' : r.due === today() ? 'soon' : '';
  return `<div class="qrow ${late}"><span></span><div><div class="t">${esc(r.title)}</div><div class="sub">${esc([REQ_KINDS[r.kind], 'من ' + memName(r.from_member), r.to_member ? 'إلى ' + memName(r.to_member) : '', r.due ? 'الموعد ' + r.due : ''].filter(Boolean).join(' · '))}</div></div><div class="acts row" style="gap:6px"><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span><button class="btn sm" data-req="${r.id}" type="button">افتح</button></div></div>`;
}
function renderMine() {
  const as = $('mineAs'); let id = S.me.id;
  if (isAdmin()) { const v = as.value || S.me.id; as.innerHTML = `<option value="${S.me.id}">أنا</option><option value="team">ملخص الفريق</option>` + active().filter(m => m.id !== S.me.id).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join(''); as.value = [...as.options].some(o => o.value === v) ? v : S.me.id; id = as.value; }
  if (id === 'team') return renderTeam();
  const G = queuesFor(id); if (id === S.me.id && isAdmin()) { const A = queuesFor('admin'); for (const k in A) G[k] = (G[k] || []).concat(A[k]); }
  const total = Object.entries(G).filter(([k]) => !['park', 'camp_quota', 'acq_contact'].includes(k)).reduce((a, [, v]) => a + v.length, 0);
  $('mineTitle').textContent = id === S.me.id ? 'مهامي' : 'مهام ' + memName(id);
  $('mineSub').textContent = total ? `${total} شي ينتظر خطوة. الأحمر تجاوز المدة.` : 'ما عندك شي معلّق.';
  $('mineBody').innerHTML = QO.filter(k => G[k] && G[k].length).map(k => {
    const L = G[k], b = BULK[k]; const lateN = L.filter(x => x.d && lateness(x.d, x.i) === 'late').length;
    let rows;
    if (k === 'members') rows = L.map(({ m }) => `<div class="qrow"><span></span><div><div class="t">${esc(m.name || m.email)}</div><div class="sub">${esc(m.email)}</div></div><div class="acts"><a class="btn sm" href="#setup">فعّله من الإعدادات</a></div></div>`).join('');
    else if (k === 'camp_quota') rows = L.map(({ c, left }) => `<div class="qrow"><span></span><div><div class="t">${esc(c.name)}</div><div class="sub">باقي لك ${left} ترشيح</div></div><div class="acts"><button class="btn sm primary" data-nom="${c.id}" type="button">رشّح</button></div></div>`).join('');
    else if (L[0].i && L[0].i.acq_status !== undefined && !L[0].d) rows = L.map(x => inflRow(x.i)).join('');
    else if (L[0].r) rows = L.map(x => reqRow(x.r)).join('');
    else if (k === 'appr') { const byB = {}; L.forEach(x => (byB[(x.d.batch_id || x.d.id)] = byB[(x.d.batch_id || x.d.id)] || []).push(x)); rows = Object.values(byB).map(g => `<div class="note"><b>${esc(camp(g[0].d.campaign_id).name)}</b> · من ${esc(memName(g[0].d.member_id))} · ${g.length} ترشيح · أُرسلت ${dShort(g[0].d.sent_at)}</div>` + g.map(x => dealRow(x, true, k)).join('')).join(''); }
    else rows = L.map(x => dealRow(x, !!b, k)).join('');
    return `<div class="panel" data-g="${k}"><div class="qhead"><h3>${QL[k]}</h3><span class="num">${L.length}</span>${lateN ? `<span class="pill bad">${lateN} متأخر</span>` : ''}${b ? `<span style="margin-inline-start:auto" class="row"><label class="check small"><input type="checkbox" data-all> الكل</label><button class="btn sm primary" data-dobulk="${k}" type="button">${b[0]} للمحدد</button></span>` : ''}</div>${k === 'park' ? `<details><summary class="small muted" style="cursor:pointer">اعرض القائمة</summary><div style="display:grid;gap:8px;margin-top:8px">${rows}</div></details>` : `<div style="display:grid;gap:8px">${rows}</div>`}</div>`;
  }).join('') || '<div class="empty">ما عندك شي معلّق الحين. ابدأ من «+ ترشيح» أو اطلب شي من زميل من «+ طلب».</div>';
}
function renderTeam() {
  $('mineTitle').textContent = 'ملخص الفريق'; $('mineSub').textContent = 'كم شي ينتظر كل شخص، وكم منه متأخر.';
  const rows = active().map(m => { const G = queuesFor(m.id); let n = 0, l = 0; for (const k in G) { if (['park', 'camp_quota', 'acq_contact'].includes(k)) continue; n += G[k].length; l += G[k].filter(x => (x.d && lateness(x.d, x.i) === 'late') || (x.r && x.r.due && x.r.due < today())).length; } return { m, n, l }; }).sort((a, b) => b.l - a.l || b.n - a.n);
  $('mineBody').innerHTML = `<div class="tw"><table><thead><tr><th>الشخص</th><th>الدور</th><th class="num">ينتظر</th><th class="num">متأخر</th></tr></thead><tbody>${rows.map(x => `<tr class="click" data-as="${x.m.id}"><td>${esc(x.m.name)}</td><td class="small muted">${esc((x.m.roles || []).map(r => ROLES[r]).join(' + '))}</td><td class="num">${x.n}</td><td class="num">${x.l ? `<span class="pill bad">${x.l}</span>` : '<span class="pill good">0</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
$('mineAs').addEventListener('change', renderMine);
async function launchPlat(d, p) { const ch = { [p + '_live_at']: nowIso() }; const after = { ...d, ...ch }; if (allLaunched(after)) Object.assign(ch, { live_at: nowIso(), ad_name: d.ad_name || adName(d) }); return saveDeal(d.id, ch); }
async function decideDeal(d, kind) {
  const r = await reasonBox(kind === 'reject' ? 'سبب الرفض' : 'وش المطلوب يتعدّل؟', kind === 'needs_edit'); if (r == null) return null;
  return saveDeal(d.id, kind === 'reject' ? { approval: 'rejected', decision_reason: r.trim(), approved_by: S.me.id, approved_at: null, closed_reason: 'رفضه متعب' } : { approval: 'needs_edit', decision_reason: r.trim(), approved_by: S.me.id, sent_at: null });
}
$('mineBody').addEventListener('click', async e => {
  const o = e.target.closest('[data-open]'); if (o) return openDeal(o.dataset.open);
  const rq = e.target.closest('[data-req]'); if (rq) return openReq(rq.dataset.req);
  const nb = e.target.closest('[data-nom]'); if (nb) return openCampNom(nb.dataset.nom);
  const as = e.target.closest('[data-as]'); if (as) { $('mineAs').value = as.dataset.as; return renderMine(); }
  const dq = e.target.closest('[data-dq]'); if (dq) { const d = S.deals.find(x => x.id === dq.dataset.id); if (d && await decideDeal(d, dq.dataset.dq)) { toast('انحفظ القرار'); render(); } return; }
  const ln = e.target.closest('[data-launch]'); if (ln) { const d = S.deals.find(x => x.id === ln.dataset.id); ln.disabled = true; if (d && await launchPlat(d, ln.dataset.launch)) { toast('انسجّل التشغيل'); render(); } return; }
  const all = e.target.closest('[data-all]'); if (all) { all.closest('[data-g]').querySelectorAll('[data-bulk]').forEach(c => c.checked = all.checked); return; }
  const b = e.target.closest('[data-dobulk]'); if (b) {
    const k = b.dataset.dobulk; const ids = [...b.closest('[data-g]').querySelectorAll('[data-bulk]:checked')].map(c => c.dataset.bulk);
    if (!ids.length) return toast('حدّد ملف واحد على الأقل', true);
    if (!await confirmBox(`${BULK[k][0]}: ${ids.length} ملف؟`)) return;
    b.disabled = true; let ok = 0; for (const id of ids) { const d = S.deals.find(x => x.id === id); if (d && await saveDeal(id, BULK[k][1](d))) ok++; }
    toast(`تحدّث ${ok} ملف`); render();
  }
});

/* ================= ملف المشاركة في الحملة ================= */
function stepPill(d) { const i = curStep(d); if (d.approval === 'rejected') return '<span class="pill bad">مرفوض</span>'; if (i < 0) return `<span class="pill bad">مغلق</span>`; if (d.approval === 'needs_edit') return '<span class="pill warn">يحتاج تعديل</span>'; if (!d.sent_at && d.approval === 'pending') return '<span class="pill">مسودة</span>'; if (isParked(d)) return '<span class="pill acc">احتياط</span>'; if (i >= STEPS.length) return '<span class="pill good">اكتمل</span>'; const l = lateness(d, i); return `<span class="pill ${l === 'late' ? 'bad' : l === 'soon' ? 'warn' : ''}">${STEPS[i].n}${i === SI.video && draftPending(d) ? ' (عند متعب)' : ''}${d.ship_failed_at && !d.delivered_at ? ' (تعذّر)' : ''}</span>`; }
function openDeal(id) {
  const d = S.deals.find(x => x.id === id); if (!d) return;
  const i = curStep(d), me = S.me.id, adm = isAdmin(), appr = isApprover(), mine = d.member_id === me || adm;
  const ship = hasRole(me, 'shipper'), media = hasRole(me, 'media') || hasRole(me, 'snap');
  const keys = platKeys(d); const I = infl(d.influencer_id);
  const stepper = `<div class="stepper">${STEPS.map((s, j) => `<div class="st ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}"><b></b><span>${s.n}</span></div>`).join('')}</div>`;
  const sec = (j, body, meta) => `<details class="sec ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}" ${j === i ? 'open' : ''}><summary><span class="idx">${j + 1}</span><span class="ttl">${STEPS[j].n}</span><span class="meta">${meta || ''}</span></summary><div class="body">${body}</div></details>`;
  const v = k => esc(d[k] ?? '');
  const link = intakeLink(d);
  const waIntake = waLink(d.phone || d.rcv_phone, `هلا ${d.name}، نورتنا 🌹 عبّ بياناتك للشحن والتحويل من هذا الرابط: ${link}`);
  const platCard = p => `<div class="card ${delivered(d, p) ? 'ok' : ''}"><div class="hd"><b>${PL[p]}</b>${delivered(d, p) ? `<span class="pill good">نزل ${dShort(d[p + '_at'])}</span>` : '<span class="pill">ما نزل</span>'}${launched(d, p) ? `<span class="pill good">انطلق ${dShort(d[p + '_live_at'])}</span>` : ''}</div>
     <div class="grid2">${p === 'sn' ? `<div class="field"><label>يوزر سناب شات *</label><input type="text" id="f_sn_user" dir="ltr" value="${v('sn_user')}"></div><div class="field"><label>رابط أو كود سناب (اختياري)</label><input type="text" id="f_sn_code" dir="ltr" value="${v('sn_code')}"></div>`
       : `<div class="field"><label>كود ${PL[p]} ${p === 'tt' ? '(Spark Code)' : ''} *</label><input type="text" id="f_${p}_code" dir="ltr" value="${v(p + '_code')}"></div>`}</div>
     <div class="row">${mine && !delivered(d, p) ? `<button class="btn good sm" data-act="dl_${p}" type="button">نزل على ${PL[p]} اليوم</button>` : ''}${mine && delivered(d, p) ? `<button class="btn sm" data-act="code_${p}" type="button">حفظ التعديل</button>` : ''}${media && delivered(d, p) && !launched(d, p) ? `<button class="btn sm primary" data-act="lv_${p}" type="button">انطلق الإعلان</button>` : ''}
       ${delivered(d, p) ? `<div class="copybox" style="flex:1"><code>${esc(adNameFor(d, p))}</code><button class="btn sm" data-copy="${esc(adNameFor(d, p))}" type="button">نسخ التسمية</button></div>` : ''}</div></div>`;
  modal(`<div class="row between"><div><h2>${esc(d.name)}</h2><div class="muted small">${esc([camp(d.campaign_id).name, memName(d.member_id), platText(keys), d.ad_type, d.handle ? '@' + d.handle : ''].filter(Boolean).join(' · '))}</div></div><div class="row">${I ? `<button class="btn sm" data-openinfl="${I.id}" type="button">ملف المؤثر</button>` : ''}<button class="btn" id="dClose" type="button">إغلاق</button></div></div>
  ${stepper}
  ${d.decision_reason && d.decision_reason.trim() && ['needs_edit', 'rejected'].includes(d.approval) ? `<div class="dup"><b>${d.approval === 'rejected' ? 'سبب الرفض' : 'المطلوب تعديله'}:</b> ${esc(d.decision_reason)}</div>` : ''}
  ${d.closed_at && d.approval !== 'rejected' ? `<div class="dup">مغلق: ${esc(d.closed_reason)}</div>` : ''}
  ${sec(0, `<div class="grid2" ${mine && (d.approval !== 'approved' || adm) ? '' : 'inert'}>
     <div class="field"><label for="f_name">الاسم</label><input type="text" id="f_name" value="${v('name')}"></div>
     <div class="field"><label for="f_acc_type">نوع المحتوى</label><select id="f_acc_type">${optsBlank(ACC_TYPES, d.acc_type)}</select></div>
     <div class="field"><label for="f_price">المبلغ</label><input type="number" id="f_price" value="${v('price')}"></div>
     <div class="field"><label for="f_ad_type">نوع الإعلان</label><select id="f_ad_type">${optsBlank(AD_TYPES, d.ad_type)}</select></div>
     <div class="field"><label for="f_planned_date">تاريخ النشر المتوقع</label><input type="date" id="f_planned_date" value="${v('planned_date')}"></div>
     <div class="field"><label for="f_hook">هوك الفيديو</label><input type="text" id="f_hook" value="${v('hook')}"></div>
   </div>${platChecks('d', keys)}
   <div class="field"><label for="f_notes">ملاحظات</label><textarea id="f_notes">${v('notes')}</textarea></div>
   ${mine ? `<div class="row"><button class="btn" data-act="save0" type="button">حفظ</button>${(!d.sent_at && d.approval === 'pending') || d.approval === 'needs_edit' ? `<button class="btn primary" data-act="send" type="button">${d.approval === 'needs_edit' ? 'أعد الإرسال لمتعب' : 'أرسل لمتعب'}</button>` : ''}</div>` : ''}`, d.sent_at ? 'أُرسل ' + dShort(d.sent_at) : 'مسودة')}
  ${sec(1, appr && (d.approval === 'pending' && d.sent_at || d.approval === 'backup') ? `<div class="row"><button class="btn good" data-act="approve" type="button">اعتماد</button><button class="btn" data-act="needs_edit" type="button">يحتاج تعديل</button><button class="btn" data-act="backup" type="button">احتياط</button><button class="btn danger" data-act="reject" type="button">رفض</button></div>` : `<div class="muted">${d.approval === 'approved' ? 'معتمد من ' + esc(memName(d.approved_by)) : d.approval === 'pending' ? 'بانتظار ' + esc(withRole('approver').map(m => m.name).join('، ') || 'متعب') : esc(d.approval)}</div>`, d.approval === 'approved' ? 'معتمد ' + dShort(d.approved_at) : '')}
  ${sec(2, `<div class="muted small">طريقتين: تكتب العنوان بنفسك، أو ترسل الرابط للمؤثر يعبّيه هو ومعه حسابه البنكي.</div>
   <div class="grid2" ${mine || ship ? '' : 'inert'}>
    <div class="field"><label for="f_rcv_name">اسم المستلم</label><input type="text" id="f_rcv_name" value="${v('rcv_name')}"></div>
    <div class="field"><label for="f_rcv_phone">جوال المستلم</label><input type="tel" id="f_rcv_phone" dir="ltr" value="${v('rcv_phone')}"></div>
    <div class="field"><label for="f_country">الدولة</label><input type="text" id="f_country" list="dlCountries" value="${v('country')}"></div>
    <div class="field"><label for="f_rcv_city">المدينة</label><input type="text" id="f_rcv_city" list="dlCities" value="${v('rcv_city')}"></div>
    <div class="field"><label for="f_address">الحي مع الرمز المختصر</label><input type="text" id="f_address" value="${v('address')}"></div>
   </div>
   <div class="row">${mine || ship ? '<button class="btn" data-act="addr" type="button">حفظ العنوان</button>' : ''}<label class="check small"><input type="checkbox" id="f_no_ship" ${d.no_ship ? 'checked' : ''}> ما يحتاج شحن</label><label class="check small"><input type="checkbox" id="f_no_pay" ${d.no_pay ? 'checked' : ''}> ما يحتاج دفع</label><button class="btn sm" data-act="flags" type="button">حفظ</button></div>
   <div class="copybox"><code>${esc(link)}</code><button class="btn sm" data-copy="${esc(link)}" type="button">نسخ رابط المؤثر</button></div>
   ${waIntake ? `<div><a class="btn sm primary" href="${esc(waIntake)}" target="_blank" rel="noopener">أرسل الرابط واتساب</a></div>` : ''}
   ${d.intake_at ? `<div class="small">عبّاها المؤثر بنفسه ${dShort(d.intake_at)}</div>` : ''}${adm ? '<div id="bankBox"></div>' : ''}`, hasAddress(d) ? 'العنوان جاهز' : d.intake_at ? 'عبّاها المؤثر' : '')}
  ${sec(3, `<div class="grid2"><div class="field"><label for="f_tracking">رقم التتبع</label><input type="text" id="f_tracking" dir="ltr" value="${v('tracking')}"></div><div class="field"><label for="f_ship_note">ملاحظة الشحن</label><input type="text" id="f_ship_note" value="${v('ship_note')}"></div></div>
   ${ship || adm ? `<div class="row"><button class="btn" data-act="shipped" type="button">${d.shipped_at ? 'انشحن ' + dShort(d.shipped_at) : 'انشحن اليوم'}</button><button class="btn good" data-act="delivered" type="button">${d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : 'وصل اليوم'}</button><button class="btn danger" data-act="failed" type="button">${d.ship_failed_at ? 'تعذّر ' + dShort(d.ship_failed_at) : 'تعذّر التسليم'}</button></div>` : `<div class="muted small">${d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : d.shipped_at ? 'انشحن ' + dShort(d.shipped_at) : 'عند صقر'}</div>`}`, d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : d.ship_failed_at ? 'تعذّر' : d.shipped_at ? 'في الطريق' : '')}
  ${sec(4, `<div class="grid2"><div class="field"><label for="f_draft_url">رابط المسودة (إذا متعب يراجع قبل النشر)</label><input type="url" id="f_draft_url" dir="ltr" value="${v('draft_url')}"></div><div class="field"><label for="f_post_url">رابط المقطع على تيك توك</label><input type="url" id="f_post_url" dir="ltr" value="${v('post_url')}"></div></div>
   <div class="row">${mine && !draftPending(d) && !d.video_ok_at && !allDelivered(d) ? '<button class="btn sm" data-act="draft" type="button">أرسل المسودة لمتعب</button>' : ''}${appr && draftPending(d) ? '<button class="btn sm good" data-act="vok" type="button">اعتماد المقطع</button><button class="btn sm danger" data-act="vfix" type="button">يرجع للتعديل</button>' : ''}${d.rounds ? `<span class="pill warn">${d.rounds} جولة تعديل</span>` : ''}${d.video_ok_at ? '<span class="pill good">المقطع معتمد</span>' : ''}</div>
   <div class="muted small">كل منصة لها تسليم مستقل. أول ما تنزل منصة، تروح للميديا باير يشغّلها، حتى لو الباقي ما نزل.</div>
   <div style="display:grid;gap:10px">${keys.map(platCard).join('') || '<div class="muted">حدّد منصة التنزيل في المرحلة 1.</div>'}</div>`, allDelivered(d) ? 'نزل على كل المنصات' : keys.filter(p => delivered(d, p)).map(p => PL[p]).join('، '))}
  ${sec(5, `<div class="muted small">التشغيل لكل منصة من بطاقتها فوق. هنا الملخص.</div><div class="row">${keys.map(p => `<span class="pill ${launched(d, p) ? 'good' : delivered(d, p) ? 'warn' : ''}">${PL[p]}: ${launched(d, p) ? 'انطلق' : delivered(d, p) ? 'ينتظر التشغيل' : 'ما نزل'}</span>`).join('')}</div>`, allLaunched(d) ? 'انطلق كله' : '')}
  <div class="row between">${adm ? `<button class="btn sm" data-act="paid" type="button">${d.paid_at ? 'دُفع ' + dShort(d.paid_at) : 'تم الدفع'}</button>` : '<span></span>'}
   ${!isClosed(d) ? (mine ? '<button class="btn sm danger" data-act="close" type="button">إغلاق الملف (ما رد / ألغي)</button>' : '') : (adm || appr ? '<button class="btn sm" data-act="reopen" type="button">إعادة فتح</button>' : '')}</div>`, root => {
    $('dClose').onclick = closeModal;
    if (adm) renderBank(d);
    const val = k => { const e = $('f_' + k); return e.type === 'checkbox' ? e.checked : e.type === 'number' ? (e.value === '' ? null : Number(e.value)) : e.value.trim(); };
    const pick = ks => Object.fromEntries(ks.map(k => [k, val(k)]));
    const base = () => ({ ...pick(['name', 'acc_type', 'price', 'ad_type', 'hook', 'notes']), planned_date: val('planned_date') || null, platform: platText(readPlats(root, 'd')) });
    const dl = p => { const ch = { [p + '_at']: nowIso() }; if (p === 'sn') { ch.sn_user = val('sn_user'); ch.sn_code = val('sn_code'); if (!ch.sn_user) { toast('اكتب يوزر سناب', true); return null; } } else { ch[p + '_code'] = val(p + '_code'); if (!ch[p + '_code']) { toast('اكتب الكود', true); return null; } } if (p === 'tt' && val('post_url')) ch.post_url = val('post_url'); if (allDelivered({ ...d, ...ch })) Object.assign(ch, { posted_at: nowIso(), video_ok_at: d.video_ok_at || nowIso() }); return ch; };
    const A = {
      save0: base,
      send: () => { const b = base(); if (!b.platform) { toast('حدّد منصة التنزيل', true); return null; } return { ...b, sent_at: nowIso(), approval: 'pending', decision_reason: '' }; },
      approve: () => ({ approval: 'approved', approved_at: nowIso(), approved_by: me, decision_reason: '' }),
      backup: () => ({ approval: 'backup' }),
      addr: () => { const p = normPhone(val('rcv_phone')); if (val('rcv_phone') && p === null) { toast('رقم الجوال مو صحيح', true); return null; } return { ...pick(['rcv_name', 'rcv_city', 'address', 'country']), rcv_phone: p || '' }; },
      flags: () => pick(['no_ship', 'no_pay']),
      shipped: () => ({ tracking: val('tracking'), ship_note: val('ship_note'), shipped_at: d.shipped_at || nowIso(), ship_failed_at: null }),
      delivered: () => ({ tracking: val('tracking'), ship_note: val('ship_note'), shipped_at: d.shipped_at || nowIso(), delivered_at: d.delivered_at || nowIso(), ship_failed_at: null }),
      failed: () => { if (!val('ship_note')) { toast('اكتب سبب تعذّر التسليم في «ملاحظة الشحن»', true); return null; } return { ship_note: val('ship_note'), ship_failed_at: nowIso() }; },
      draft: () => { if (!val('draft_url')) { toast('حط رابط المسودة', true); return null; } return { draft_url: val('draft_url'), draft_at: nowIso() }; },
      vok: () => ({ video_ok_at: nowIso() }),
      vfix: () => ({ draft_at: null, rounds: (d.rounds || 0) + 1 }),
      paid: () => ({ paid_at: d.paid_at ? null : nowIso() }),
      close: () => ({ closed_at: nowIso(), closed_reason: 'ما رد / ألغي' }),
      reopen: () => ({ closed_at: null, closed_reason: '', approval: d.approval === 'rejected' ? 'pending' : d.approval, sent_at: d.approval === 'rejected' ? null : d.sent_at })
    };
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; let ch;
      if (a === 'reject' || a === 'needs_edit') { b.disabled = true; const r = await decideDeal(d, a); b.disabled = false; if (r) { toast('انحفظ القرار'); openDeal(d.id); } return; }
      if (a.startsWith('lv_')) { b.disabled = true; if (await launchPlat(d, a.slice(3))) { toast('انسجّل التشغيل'); openDeal(d.id); } return; }
      if (a.startsWith('dl_')) ch = dl(a.slice(3));
      else if (a.startsWith('code_')) { const p = a.slice(5); ch = p === 'sn' ? { sn_user: val('sn_user'), sn_code: val('sn_code') } : { [p + '_code']: val(p + '_code') }; }
      else ch = A[a]();
      if (!ch) return;
      if (a === 'close' && !await confirmBox('تأكيد إغلاق الملف؟')) return;
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
  catch (e) { box.innerHTML = '<div class="dup">ما قدرت أفك التشفير. تأكد إن ملف المفتاح هو نفسه.</div>'; }
}

/* ================= خط الإنتاج ================= */
function fillSel(id, list, all) { const s = $(id), v = s.value; s.innerHTML = `<option value="">${all}</option>` + list.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(''); if ([...s.options].some(o => o.value === v)) s.value = v; }
const inPipe = d => d.sent_at || d.approval !== 'pending';
function renderPipe() {
  const open = S.deals.filter(d => inPipe(d) && !isClosed(d) && !isParked(d) && d.approval !== 'needs_edit');
  $('board').innerHTML = STEPS.map((s, i) => { const L = open.filter(d => curStep(d) === i), late = L.filter(d => lateness(d, i) === 'late').length; return `<button class="col${S.pStep === s.k ? ' on' : ''}" data-col="${s.k}" type="button"><span class="k">${i + 1}</span><span class="nm">${s.n}</span><span class="n">${L.length}</span><span class="small" style="color:var(--bad)">${late ? late + ' متأخر' : '&nbsp;'}</span></button>`; }).join('')
    + `<button class="col${S.pStep === 'done' ? ' on' : ''}" data-col="done" type="button"><span class="k">✓</span><span class="nm">اكتمل</span><span class="n">${open.filter(d => curStep(d) === STEPS.length).length}</span><span class="small">&nbsp;</span></button>`;
  fillSel('pMem', creators().map(m => [m.id, m.name]), 'الكل');
  fillSel('pCamp', S.camps.map(c => [c.id, c.name]), 'الكل');
  const qq = $('pQ').value.trim().toLowerCase(), pm = $('pMem').value, pc = $('pCamp').value, late = $('pLate').checked, cl = $('pClosed').checked;
  const L = S.deals.filter(d => { const i = curStep(d);
    if (!inPipe(d)) return false; if (!cl && isClosed(d)) return false; if (pm && d.member_id !== pm) return false; if (pc && d.campaign_id !== pc) return false;
    if (S.pStep === 'done' ? i !== STEPS.length : S.pStep && i !== SI[S.pStep]) return false;
    if (late && lateness(d, i) !== 'late') return false;
    if (qq && ![d.name, d.phone, d.handle, d.tt_code, d.ig_code, d.sn_code, d.sn_user].some(x => String(x || '').toLowerCase().includes(qq))) return false; return true; });
  $('pList').innerHTML = L.length ? `<div class="tw"><table><thead><tr><th>المؤثر</th><th>الحملة</th><th>صانع المحتوى</th><th>المنصات</th><th>المرحلة</th><th class="num">أيام فيها</th><th class="num">المبلغ</th><th>آخر تحديث</th></tr></thead><tbody>${L.slice(0, 400).map(d => { const i = curStep(d); return `<tr class="click" data-open="${d.id}"><td>${esc(d.name)}</td><td>${esc(camp(d.campaign_id).name || '')}</td><td>${esc(memName(d.member_id))}</td><td class="small">${platKeys(d).map(p => `<span class="pill ${launched(d, p) ? 'good' : delivered(d, p) ? 'warn' : ''}">${PL[p]}</span>`).join(' ')}</td><td>${stepPill(d)}</td><td class="num">${i >= 0 && i < STEPS.length ? stepAge(d, i) : ''}</td><td class="num">${d.price != null ? fmt(d.price) : ''}</td><td class="small muted">${dShort(d.updated_at)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">ما فيه ملفات بهذي التصفية.</div>';
}
$('board').addEventListener('click', e => { const c = e.target.closest('[data-col]'); if (!c) return; S.pStep = S.pStep === c.dataset.col ? '' : c.dataset.col; renderPipe(); });
['pQ', 'pMem', 'pCamp', 'pLate', 'pClosed'].forEach(id => $(id).addEventListener('input', renderPipe));
$('pList').addEventListener('click', e => { const r = e.target.closest('[data-open]'); if (r) openDeal(r.dataset.open); });

/* ================= الطلبات ================= */
function memOpts(sel) { return active().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} — ${esc((m.roles || []).map(r => ROLES[r]).join('، '))}</option>`).join(''); }
$('newReq').onclick = () => {
  const designer = withRole('design').find(m => (m.roles || []).includes('design'));
  modal(`<h2>طلب جديد</h2><div class="grid2">
   <div class="field"><label for="rKind">النوع</label><select id="rKind">${Object.entries(REQ_KINDS).filter(([k]) => k !== 'quota').map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
   <div class="field"><label for="rTo">مطلوب من</label><select id="rTo">${memOpts(designer && designer.id)}</select></div>
   <div class="field"><label for="rTitle">العنوان *</label><input type="text" id="rTitle" placeholder="مثال: بنر هيرش سيطرة للمتجر"></div>
   <div class="field"><label for="rDue">الموعد</label><input type="date" id="rDue" min="${today()}"></div>
   <div class="field"><label for="rSize">المقاس أو المنصة</label><input type="text" id="rSize" placeholder="مثال: 1080×1920 ستوري"></div>
   <div class="field"><label for="rRef">رابط مرجع</label><input type="url" id="rRef" dir="ltr"></div></div>
   <div class="field"><label for="rDet">التفاصيل</label><textarea id="rDet"></textarea></div>
   <div class="row"><button class="btn primary" id="rSave" type="button">إرسال الطلب</button><button class="btn" id="rCancel" type="button">إلغاء</button></div>`, () => {
    const kind = $('rKind'); kind.onchange = () => { const map = { design: 'design', ship: 'shipper', ad: 'media', snap: 'snap', social: 'social' }; const m = active().find(x => (x.roles || []).includes(map[kind.value] || '')); if (m) $('rTo').value = m.id; };
    $('rCancel').onclick = closeModal;
    $('rSave').onclick = async () => { const title = $('rTitle').value.trim(); if (!title) return toast('اكتب عنوان الطلب', true); $('rSave').disabled = true;
      const r = await saveReq(null, { kind: kind.value, to_member: $('rTo').value, title, due: $('rDue').value || null, size: $('rSize').value.trim(), ref_url: $('rRef').value.trim(), details: $('rDet').value.trim(), from_member: S.me.id });
      if (r) { toast('انرسل الطلب'); closeModal(); } else $('rSave').disabled = false; };
  });
};
function renderReqs() {
  const sc = $('rScope').value, dn = $('rDone').checked, me = S.me.id;
  const L = S.reqs.filter(r => (sc === 'all' || (sc === 'to' ? (r.to_member === me || (r.kind === 'quota' && isApprover())) : r.from_member === me)) && (dn || !['done', 'cancelled'].includes(r.status)));
  $('rList').innerHTML = L.length ? `<div style="display:grid;gap:8px">${L.map(reqRow).join('')}</div>` : '<div class="empty">ما فيه طلبات هنا.</div>';
}
['rScope', 'rDone'].forEach(id => $(id).addEventListener('input', renderReqs));
$('rList').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (b) openReq(b.dataset.req); });
const RES_HINT = { design: 'حط رابط التصميم (درايف أو كانفا) وأي ملاحظة.', ad: 'اكتب اسم الإعلان أو الحملة في مدير الإعلانات، والمنصة، ووقت التشغيل. ولو عندك رابط حطه.', snap: 'اكتب وش سوّيت (مثلاً: تواصلت مع المشهور واتفقنا على موعد النشر) وحط الرابط لو فيه.', ship: 'اكتب رقم الشحنة أو شركة الشحن وأي ملاحظة.', social: 'حط رابط المنشور أو المحتوى وأي ملاحظة.', other: 'اكتب وش سوّيت، وحط رابط لو فيه (ملف، صورة، منشور).' };
const links = s => ((s || '').match(/https?:\/\/[^\s<>"']+/g) || []);
function openReq(id) {
  const r = S.reqs.find(x => x.id === id); if (!r) return; const me = S.me.id, isTo = r.to_member === me || isAdmin(), isFrom = r.from_member === me || isAdmin();
  const quota = r.kind === 'quota', canQ = quota && isApprover() && !['done', 'cancelled'].includes(r.status);
  modal(`<div class="row between"><div><h2>${esc(r.title)}</h2><div class="muted small">${esc(REQ_KINDS[r.kind])} · من ${esc(memName(r.from_member))}${r.to_member ? ' إلى ' + esc(memName(r.to_member)) : ''} · ${r.due ? 'الموعد ' + r.due : 'بدون موعد'}</div></div><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span></div>
   ${r.details ? `<div class="note" style="white-space:pre-wrap">${esc(r.details)}</div>` : ''}
   ${quota ? `<div class="small">الحصة الحالية: ${quotaOf(r.campaign_id, r.from_member)} · المطلوب زيادة: ${r.qty}</div>` : `
   <div class="small">${r.size ? 'المقاس: ' + esc(r.size) + ' · ' : ''}${r.ref_url ? `<a href="${esc(r.ref_url)}" target="_blank" rel="noopener">المرجع</a>` : ''}${r.rounds ? ` · <span class="pill warn">${r.rounds} جولة تعديل</span>` : ''}</div>
   ${isTo && ['new', 'doing'].includes(r.status) ? `<div class="field"><label for="qRes">وش سلّمت؟</label><textarea id="qRes" placeholder="${esc(RES_HINT[r.kind] || RES_HINT.other)}">${esc(r.result_url)}</textarea><div class="muted small">${esc(RES_HINT[r.kind] || RES_HINT.other)}</div></div>` : r.result_url ? `<div class="field"><label>التسليم</label><div class="note" style="white-space:pre-wrap">${esc(r.result_url)}</div></div>` : ''}
   ${links(r.result_url).map((u, n) => `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">افتح الرابط${links(r.result_url).length > 1 ? ' ' + (n + 1) : ''}</a>`).join(' ')}`}
   <div class="row">
    ${canQ ? '<button class="btn good" data-q="qok" type="button">موافقة وزيادة الحصة</button><button class="btn danger" data-q="qno" type="button">رفض</button>' : ''}
    ${!quota && isTo && r.status === 'new' ? '<button class="btn" data-q="doing" type="button">بدأت فيه</button>' : ''}
    ${!quota && isTo && ['new', 'doing'].includes(r.status) ? '<button class="btn primary" data-q="review" type="button">سلّمت، أرسل للمراجعة</button>' : ''}
    ${!quota && isFrom && r.status === 'review' ? '<button class="btn good" data-q="done" type="button">اعتماد التسليم</button><button class="btn danger" data-q="fix" type="button">يرجع للتعديل</button>' : ''}
    ${isFrom && !['done', 'cancelled'].includes(r.status) ? '<button class="btn sm" data-q="cancel" type="button">إلغاء الطلب</button>' : ''}
    <button class="btn" id="qClose" type="button">إغلاق</button></div>`, root => {
    $('qClose').onclick = closeModal;
    root.addEventListener('click', async e => { const b = e.target.closest('[data-q]'); if (!b) return; const k = b.dataset.q; b.disabled = true;
      if (k === 'qok') { const cur = quotaOf(r.campaign_id, r.from_member); const up = await q(sb.from('quotas').upsert({ campaign_id: r.campaign_id, member_id: r.from_member, quota: cur + (r.qty || 0), updated_by: me }).select().single()); if (!up) { b.disabled = false; return; } const kq = S.quotas.findIndex(y => y.campaign_id === up.campaign_id && y.member_id === up.member_id); if (kq >= 0) S.quotas[kq] = up; else S.quotas.push(up); if (await saveReq(r.id, { status: 'done', done_at: nowIso(), result_url: '' })) { toast(`زادت الحصة إلى ${up.quota}`); openReq(r.id); } return; }
      if (k === 'qno') { const why = await reasonBox('سبب الرفض', false); if (why == null) { b.disabled = false; return; } if (await saveReq(r.id, { status: 'cancelled', details: (r.details ? r.details + '\n' : '') + 'رد متعب: ' + why.trim() })) { toast('انرفض الطلب'); openReq(r.id); } return; }
      const ch = { doing: { status: 'doing', started_at: nowIso() }, review: { status: 'review', result_url: ($('qRes') || {}).value ? $('qRes').value.trim() : '', started_at: r.started_at || nowIso() }, done: { status: 'done', done_at: nowIso() }, fix: { status: 'doing', rounds: (r.rounds || 0) + 1 }, cancel: { status: 'cancelled' } }[k];
      if (k === 'fix') { const why = await reasonBox('وش المطلوب تعديله؟', false); if (why == null || !why.trim()) { b.disabled = false; return; } ch.details = (r.details ? r.details + '\n' : '') + 'تعديل ' + ((r.rounds || 0) + 1) + ': ' + why.trim(); }
      if (k === 'review' && !ch.result_url) { b.disabled = false; return toast('اكتب وش سلّمت في خانة «وش سلّمت؟»', true); }
      if (await saveReq(r.id, ch)) { toast('انحفظ'); openReq(r.id); } else b.disabled = false; });
  });
}

/* ================= تقرير اليوم ================= */
$('tDate').value = today(); $('tDate').addEventListener('change', renderToday);
async function renderToday() {
  const day = $('tDate').value || today(), me = S.me.id;
  const on = t => t && t.slice(0, 10) === day;
  const acts = [];
  for (const i of S.infl) { if (i.nominated_by === me && on(i.created_at) && i.source === 'acq') acts.push('سجّل استقطاب ' + i.name); if (i.nominated_by === me && on(i.agreed_at)) acts.push('اتفق مع ' + i.name); if (i.acq_decided_by === me && on(i.acq_decided_at)) acts.push('قرّر في استقطاب ' + i.name); }
  for (const d of S.deals) {
    if (d.member_id === me && on(d.sent_at)) acts.push('رشّح ' + d.name + ' لحملة ' + (camp(d.campaign_id).name || ''));
    if (d.approved_by === me && on(d.approved_at)) acts.push('اعتمد ' + d.name);
    for (const p of PLATS) { if (d.member_id === me && on(d[p.k + '_at'])) acts.push('نزل ' + d.name + ' على ' + p.n); if (hasRole(me, 'media') && on(d[p.k + '_live_at'])) acts.push('شغّل إعلان ' + d.name + ' على ' + p.n); }
    if ((mem(me).roles || []).includes('shipper') && on(d.shipped_at)) acts.push('شحن ' + d.name);
  }
  for (const r of S.reqs) { if (r.to_member === me && on(r.done_at)) acts.push('سلّم طلب: ' + r.title); }
  $('tAuto').innerHTML = acts.length ? `<ul style="margin:0;padding-inline-start:18px">${acts.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<div class="muted small">ما فيه شي مسجّل في هذا اليوم.</div>';
  const { data } = await sb.from('daily_reports').select('*').eq('member_id', me).eq('day', day).maybeSingle();
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
function period() { const v = $('dPeriod').value, n = new Date(); if (v === 'month') return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(+n + 864e5)]; if (v === 'last') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 1)]; if (v === '30') return [new Date(Date.now() - 30 * 864e5), new Date(+n + 864e5)]; return [new Date(2000, 0, 1), new Date(+n + 864e5)]; }
$('dPeriod').addEventListener('input', renderDash);
function renderDash() {
  const [a, b] = period(); const inP = t => t && new Date(t) >= a && new Date(t) < b;
  $('dSub').textContent = `من ${ymd(a)} إلى ${ymd(new Date(+b - 864e5))}`;
  const D = S.deals.filter(inPipe); const open = D.filter(d => !isClosed(d) && !isParked(d) && d.approval !== 'needs_edit');
  const saved = S.infl.filter(i => inP(i.agreed_at) && i.price_before != null && i.price_after != null).reduce((s, i) => s + (i.price_before - i.price_after), 0);
  const T = [['استقطاب جديد', S.infl.filter(i => i.source === 'acq' && inP(i.created_at)).length], ['تم الاتفاق', S.infl.filter(i => inP(i.agreed_at)).length], ['وفّرنا بالتفاوض', saved], ['ترشيح للحملات', D.filter(d => inP(d.sent_at)).length], ['اعتماد', D.filter(d => inP(d.approved_at)).length], ['وصل المنتج', D.filter(d => inP(d.delivered_at)).length], ['نزل على منصة', D.reduce((s, d) => s + platKeys(d).filter(p => inP(d[p + '_at'])).length, 0)], ['متأخر الحين', open.filter(d => lateness(d, curStep(d)) === 'late').length]];
  $('dTiles').innerHTML = T.map(([l, v]) => `<div class="tile"><span class="l">${l}</span><span class="v">${fmt(v)}</span></div>`).join('');
  const endAt = (d, i) => [d.sent_at, d.approved_at, d.intake_at || (hasAddress(d) ? d.approved_at : null), d.delivered_at, d.posted_at, d.live_at][i];
  $('dSteps').innerHTML = `<table><thead><tr><th>المرحلة</th><th>المسؤول</th><th class="num">مفتوح</th><th class="num">متأخر</th><th class="num">خلصت بالفترة</th><th class="num">وسيط الأيام</th><th class="num">المدة المسموحة</th></tr></thead><tbody>${STEPS.map((s, i) => { const L = open.filter(d => curStep(d) === i); const fin = D.filter(d => inP(endAt(d, i))); const md = median(fin.map(d => days(stepStart(d, i), endAt(d, i)))); return `<tr><td>${s.n}</td><td class="small muted">${esc(s.who === 'creator' ? 'صانع المحتوى' : withRole(s.who).filter(m => (m.roles || []).includes(s.who)).map(m => m.name).join('، ') || ROLES[s.who])}</td><td class="num">${L.length}</td><td class="num">${L.filter(d => lateness(d, i) === 'late').length || ''}</td><td class="num">${fin.length}</td><td class="num">${md == null ? '—' : fmt(md)}</td><td class="num">${S.sla[s.k]}</td></tr>`; }).join('')}</tbody></table>`;
  const pl = v => v == null ? '—' : `<span class="pill ${v >= 90 ? 'good' : v >= 70 ? 'warn' : 'bad'}">${v}٪</span>`;
  const acq = active().map(m => { const L = S.infl.filter(i => i.nominated_by === m.id && i.source === 'acq'); const reg = L.filter(i => inP(i.created_at)); const sent = L.filter(i => inP(i.acq_sent_at)); const dec = L.filter(i => inP(i.acq_decided_at)); const ok = dec.filter(i => i.acq_status === 'approved'); const rej = dec.filter(i => i.acq_status === 'rejected'); const cont = L.filter(i => (i.contacts || []).some(c => inP(c.date))); const ag = L.filter(i => inP(i.agreed_at)); const sv = ag.reduce((s, i) => s + ((i.price_before ?? 0) - (i.price_after ?? 0)), 0); return { m, reg: reg.length, sent: sent.length, ok: ok.length, rej: rej.length, rate: pct(ok.length, ok.length + rej.length), cont: cont.length, ag: ag.length, sv }; }).filter(x => x.reg || x.sent || x.ok || x.rej || x.ag);
  $('dAcq').innerHTML = `<table><thead><tr><th>الموظف</th><th class="num">سجّل</th><th class="num">أرسل للمراجعة</th><th class="num">معتمد</th><th class="num">مرفوض</th><th class="num">نسبة القبول</th><th class="num">تواصل مع</th><th class="num">تم الاتفاق</th><th class="num">وفّرنا</th></tr></thead><tbody>${acq.map(x => `<tr><td>${esc(x.m.name)}</td><td class="num">${x.reg}</td><td class="num">${x.sent}</td><td class="num">${x.ok}</td><td class="num">${x.rej || ''}</td><td class="num">${pl(x.rate)}</td><td class="num">${x.cont}</td><td class="num">${x.ag}</td><td class="num">${fmt(x.sv)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">ما فيه استقطاب في هذي الفترة.</td></tr>'}</tbody></table>`;
  const LH = 24, hrs = (x, y) => (new Date(y) - new Date(x)) / 36e5, fh = v => v == null ? '—' : v < 1 ? 'أقل من ساعة' : fmt(Math.round(v)) + ' س';
  const lrows = PLATS.map(({ k, n }) => { const A = S.deals.filter(d => d.approval === 'approved' && platKeys(d).includes(k));
    const dl = A.filter(d => inP(d[k + '_at'])), lv = A.filter(d => inP(d[k + '_live_at']) && d[k + '_at']);
    const wait = A.filter(d => d[k + '_at'] && !d[k + '_live_at']), late = wait.filter(d => hrs(d[k + '_at'], Date.now()) > LH);
    const H = lv.map(d => hrs(d[k + '_at'], d[k + '_live_at'])); const ok = H.filter(h => h <= LH).length;
    return { n, dl: dl.length, lv: lv.length, wait: wait.length, late: late.length, md: median(H), rate: H.length ? Math.round(ok / H.length * 100) : null, H, ok }; });
  const allH = lrows.flatMap(r => r.H), allOk = lrows.reduce((s, r) => s + r.ok, 0);
  lrows.push({ n: 'الكل', dl: lrows.reduce((s, r) => s + r.dl, 0), lv: lrows.reduce((s, r) => s + r.lv, 0), wait: lrows.reduce((s, r) => s + r.wait, 0), late: lrows.reduce((s, r) => s + r.late, 0), md: median(allH), rate: allH.length ? Math.round(allOk / allH.length * 100) : null, tot: true });
  $('dLaunch').innerHTML = `<table><thead><tr><th>المنصة</th><th class="num">نزل</th><th class="num">انطلق</th><th class="num">ينتظر الحين</th><th class="num">متأخر</th><th class="num">وسيط الساعات</th><th class="num">خلال 24 ساعة</th></tr></thead><tbody>${lrows.map(r => `<tr${r.tot ? ' style="font-weight:700"' : ''}><td>${r.n}</td><td class="num">${r.dl}</td><td class="num">${r.lv}</td><td class="num">${r.wait}</td><td class="num">${r.late ? `<span class="pill bad">${r.late}</span>` : '0'}</td><td class="num">${fh(r.md)}</td><td class="num">${pl(r.rate)}</td></tr>`).join('')}</tbody></table>`;
  const cr = creators().map(m => { const L = D.filter(d => d.member_id === m.id); const sent = L.filter(d => inP(d.sent_at)).length; const dec = L.filter(d => inP(d.approved_at) || (d.approval === 'rejected' && inP(d.updated_at))); const ok = dec.filter(d => d.approval === 'approved').length, rej = dec.filter(d => d.approval === 'rejected').length; const del = L.filter(d => inP(d.delivered_at)); const posted = L.filter(d => inP(d.posted_at)); const doneOfDel = del.filter(allDelivered).length; const md = median(posted.map(d => days(d.delivered_at, firstAt(d) || d.posted_at))); const late = open.filter(d => d.member_id === m.id && STEPS[curStep(d)] && STEPS[curStep(d)].who === 'creator' && lateness(d, curStep(d)) === 'late').length; const spend = L.filter(d => inP(d.approved_at)).reduce((s, d) => s + (Number(d.price) || 0), 0); return { m, sent, ok, rej, acc: pct(ok, ok + rej), del: del.length, posted: posted.length, rate: pct(doneOfDel, del.length), md, late, spend }; });
  $('dCreators').innerHTML = `<table><thead><tr><th>الصانع</th><th class="num">رشّح للحملات</th><th class="num">معتمد</th><th class="num">مرفوض</th><th class="num">نسبة القبول</th><th class="num">وصلهم</th><th class="num">نزل كامل</th><th class="num">الإنجاز</th><th class="num">أيام للنشر</th><th class="num">متأخر عنده</th><th class="num">مبالغ المعتمد</th></tr></thead><tbody>${cr.map(x => `<tr><td>${esc(x.m.name)}</td><td class="num">${x.sent}</td><td class="num">${x.ok}</td><td class="num">${x.rej || ''}</td><td class="num">${pl(x.acc)}</td><td class="num">${x.del}</td><td class="num">${x.posted}</td><td class="num">${pl(x.rate)}</td><td class="num">${x.md == null ? '—' : fmt(x.md)}</td><td class="num">${x.late || ''}</td><td class="num">${fmt(x.spend)}</td></tr>`).join('')}</tbody></table>`;
  const byTo = {}; for (const r of S.reqs) { if (!r.to_member || r.kind === 'quota') continue; const o = byTo[r.to_member] = byTo[r.to_member] || { n: 0, done: 0, ontime: 0, due: 0, rounds: [], open: 0, late: 0 }; if (inP(r.created_at)) o.n++; if (inP(r.done_at)) { o.done++; o.rounds.push(r.rounds || 0); if (r.due) { o.due++; if (r.done_at.slice(0, 10) <= r.due) o.ontime++; } } if (!['done', 'cancelled'].includes(r.status)) { o.open++; if (r.due && r.due < today()) o.late++; } }
  $('dReqs').innerHTML = `<table><thead><tr><th>المسؤول</th><th class="num">طلبات جديدة</th><th class="num">سلّمها</th><th class="num">في الموعد</th><th class="num">متوسط جولات التعديل</th><th class="num">مفتوحة</th><th class="num">متأخرة</th></tr></thead><tbody>${Object.entries(byTo).map(([id, o]) => `<tr><td>${esc(memName(id))}</td><td class="num">${o.n}</td><td class="num">${o.done}</td><td class="num">${pl(pct(o.ontime, o.due))}</td><td class="num">${o.rounds.length ? fmt(o.rounds.reduce((s, x) => s + x, 0) / o.rounds.length) : '—'}</td><td class="num">${o.open}</td><td class="num">${o.late || ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">ما فيه طلبات للحين.</td></tr>'}</tbody></table>`;
}
$('dXlsx').onclick = () => {
  const dt = t => t ? String(t).slice(0, 10) : '';
  const deals = S.deals.map(d => ({ 'المؤثر': d.name, 'اليوزر': d.handle, 'الجوال': d.phone, 'الحملة': camp(d.campaign_id).name || '', 'صانع المحتوى': memName(d.member_id), 'نوع المحتوى': d.acc_type, 'نوع الإعلان': d.ad_type, 'المنصات': platText(platKeys(d)), 'المبلغ': d.price, 'العملة': d.currency, 'المرحلة': d.approval === 'rejected' ? 'مرفوض' : d.approval === 'needs_edit' ? 'يحتاج تعديل' : !inPipe(d) ? 'مسودة' : isClosed(d) ? 'مغلق' : (STEPS[curStep(d)] || { n: 'اكتمل' }).n, 'سبب القرار': d.decision_reason, 'الإرسال لمتعب': dt(d.sent_at), 'الاعتماد': dt(d.approved_at), 'المدينة': d.rcv_city, 'الحي والرمز': d.address, 'الشحن': dt(d.shipped_at), 'الوصول': dt(d.delivered_at), 'تعذّر التسليم': dt(d.ship_failed_at), 'نزل تيك توك': dt(d.tt_at), 'كود تيك توك': d.tt_code, 'نزل سناب': dt(d.sn_at), 'يوزر سناب': d.sn_user, 'نزل انستقرام': dt(d.ig_at), 'كود انستقرام': d.ig_code, 'تشغيل تيك توك': dt(d.tt_live_at), 'تشغيل سناب': dt(d.sn_live_at), 'تشغيل انستقرام': dt(d.ig_live_at), 'الهوك': d.hook, 'الدفع': dt(d.paid_at) }));
  const infls = S.infl.map(i => ({ 'المعلن': i.name, 'بالإنجليزي': i.name_en, 'اليوزر': i.handle, 'رابط تيك توك': i.tiktok_url, 'نوع الحساب': i.acc_type, 'حالة الحساب': i.account_status, 'المرشِّح': memName(i.nominated_by), 'تاريخ الترشيح': i.nominated_on, 'المصدر': i.source === 'acq' ? 'استقطاب' : i.source === 'campaign' ? 'حملة' : 'مستورد', 'حالة الاستقطاب': (ACQ[i.acq_status] || [i.acq_status])[0], 'سبب القرار': i.acq_reason, 'محاولات التواصل': (i.contacts || []).length, 'آخر نتيجة': ((i.contacts || []).slice(-1)[0] || {}).result || '', 'واجه مشكلة': i.had_problem == null ? '' : i.had_problem ? 'نعم' : 'لا', 'المشكلة': i.problem, 'المنصات': i.platforms, 'سناب': i.snap_user, 'انستقرام': i.ig_user, 'الجوال': i.phone, 'الدولة': i.country, 'المدينة': i.city, 'الحي والرمز': i.district, 'قبل التفاوض': i.price_before, 'بعد التفاوض': i.price_after, 'العملة': i.currency, 'تم الاتفاق': dt(i.agreed_at) }));
  const reqs = S.reqs.map(r => ({ 'النوع': REQ_KINDS[r.kind], 'العنوان': r.title, 'من': memName(r.from_member), 'إلى': memName(r.to_member), 'الموعد': r.due, 'الحالة': REQ_STATUS[r.status][0], 'جولات التعديل': r.rounds, 'تاريخ الطلب': dt(r.created_at), 'تاريخ التسليم': dt(r.done_at), 'التسليم': r.result_url }));
  const camps = S.camps.map(c => { const s = campStats(c.id); return { 'الحملة': c.name, 'الحالة': CAMP_ST[c.status || 'active'][0], 'المطلوب': c.target_total, 'موزّع': S.quotas.filter(q => q.campaign_id === c.id).reduce((x, q) => x + q.quota, 0), 'انرسل': s.sent.length, 'معتمد': s.approved.length, 'مرفوض': s.rejected.length, 'استلموا': s.approved.filter(d => d.delivered_at).length, 'نشروا': s.approved.filter(allDelivered).length }; });
  const wb = XLSX.utils.book_new(); const add = (rows, n) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, n); };
  add(camps, 'الحملات'); add(deals, 'ترشيحات الحملات'); add(infls, 'المؤثرين والاستقطاب'); add(reqs, 'الطلبات'); XLSX.writeFile(wb, `أداء فريق العز ${today()}.xlsx`);
};

/* ================= الإعدادات ================= */
function renderSetup() {
  $('sMembers').innerHTML = `<table><thead><tr><th>الاسم</th><th>الإيميل</th><th>الأدوار</th><th>مفعّل</th><th>مدير</th><th></th></tr></thead><tbody>${S.members.map(m => `<tr data-m="${m.id}"><td><input type="text" data-k="name" value="${esc(m.name)}" style="min-width:140px"></td><td class="small" dir="ltr">${esc(m.email)}</td><td style="white-space:normal;min-width:260px">${Object.entries(ROLES).map(([k, n]) => `<label class="check small" style="display:inline-flex;min-height:28px;margin-inline-end:8px"><input type="checkbox" data-role="${k}" ${(m.roles || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('')}</td><td><input type="checkbox" data-k="active" ${m.active ? 'checked' : ''} aria-label="مفعّل"></td><td><input type="checkbox" data-k="is_admin" ${m.is_admin ? 'checked' : ''} ${m.id === S.me.id ? 'disabled' : ''} aria-label="مدير"></td><td><button class="btn sm primary" data-msave type="button">حفظ</button></td></tr>`).join('')}</tbody></table>`;
  $('sSla').innerHTML = STEPS.map(s => `<div class="field"><label for="sla_${s.k}">${s.n}</label><input type="number" min="0" id="sla_${s.k}" value="${S.sla[s.k]}"></div>`).join('');
  $('sTasks').innerHTML = Object.entries(ROLES).filter(([k]) => k !== 'creator').map(([k, n]) => `<div class="field"><label for="tk_${k}">${n}</label><textarea id="tk_${k}">${esc((S.tasks[k] || []).join('\n'))}</textarea></div>`).join('');
  $('sBank').innerHTML = S.bankPub ? `<div class="muted small">التشفير شغال. المفتاح العام محفوظ، والمؤثرين يقدرون يعبّون حساباتهم البنكية.</div>
     <div class="row"><span class="pill ${S.bankPriv ? 'good' : 'warn'}">${S.bankPriv ? 'مفتاحك الخاص محمّل على هذا الجهاز' : 'مفتاحك الخاص مو محمّل على هذا الجهاز'}</span><label class="btn sm">تحميل ملف المفتاح الخاص<input type="file" id="bankFile" accept=".json" hidden></label>${S.bankPriv ? '<button class="btn sm" id="bankForget" type="button">إزالة المفتاح من هذا الجهاز</button>' : ''}</div>`
    : `<div class="note">ما فيه تشفير للحين. اضغط الزر: يتولّد مفتاحين، العام ينحفظ في النظام، والخاص ينزل عندك كملف. احفظه في مكان آمن، لأنه الطريقة الوحيدة لقراءة الحسابات البنكية.</div><button class="btn primary" id="bankGen" type="button">إنشاء مفاتيح التشفير</button>`;
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
$('sSlaSave').onclick = async () => { const v = Object.fromEntries(STEPS.map(s => [s.k, Number($('sla_' + s.k).value) || 0])); if (await q(sb.from('settings').upsert({ key: 'sla', value: v }))) { S.sla = v; toast('انحفظت المدد'); } };
$('sTasksSave').onclick = async () => { const v = {}; Object.keys(ROLES).filter(k => k !== 'creator').forEach(k => { const L = $('tk_' + k).value.split('\n').map(s => s.trim()).filter(Boolean); if (L.length) v[k] = L; }); if (await q(sb.from('settings').upsert({ key: 'daily_tasks', value: v }))) { S.tasks = v; toast('انحفظت القوائم'); } };

/* ================= التشغيل ================= */
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showAuth(); });
start();
})();
