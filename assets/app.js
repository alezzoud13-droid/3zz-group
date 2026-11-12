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
/* وش بعد كل مرحلة؟ يظهر داخل البطاقة وفي «كيف يمشي الشغل؟» */
const NEXT = {
  nom: 'بعد الإرسال تروح للاعتماد، وأول ما ينقرر يرجع لك الرد في «مهامي».',
  appr: 'بعد الاعتماد ترجع لصانع المحتوى: يكمّل عنوان الشحن أو يرسل رابط البيانات للمؤثر.',
  intake: 'أول ما يكتمل العنوان (جوال + مدينة + حي) تنتقل تلقائياً للشحن عند صقر في «مهامي» حقته.',
  ship: 'بعد تسجيل «وصلت» ترجع لصانع المحتوى في «مهامي»: يصوّر ويرسل المقطع الخام للمراجعة.',
  video: 'المقطع الخام يروح للاعتماد، وبعد اعتماده تنفتح خانات النزول والكود لكل منصة — وكل منصة تنزل تروح للميديا باير ولزياد تلقائياً.',
  live: 'بعد تشغيل كل المنصات يكتمل الملف ويدخل مرحلة الدفع: موافقة عبدالمحسن، ثم كشف متعب للمالية.'
};
const DEF_SLA = { nom: 3, appr: 2, intake: 3, ship: 7, video: 10, live: 2 };
const ACC_TYPES = ['مقيم عطور عربي', 'مقيم عطور أجنبي', 'صانع محتوى', 'فلوقات وترندات', 'بيعي', 'يوتيوب', 'مهتم بكرة القدم'];
const PLATS = [{ k: 'tt', n: 'تيك توك' }, { k: 'sn', n: 'سناب شات' }, { k: 'ig', n: 'انستقرام' }];
const PL = { tt: 'تيك توك', sn: 'سناب شات', ig: 'انستقرام' };
const CONTACT_CH = ['تيك توك', 'سناب شات', 'انستقرام', 'يوتيوب', 'البريد الإلكتروني', 'واتساب', 'اتصال'];
const CONTACT_RES = ['تم التواصل', 'ما رد', 'رد وجاري التفاوض', 'ما اتفقنا بسبب السعر', 'رفض التعاون', 'تم الاتفاق'];
const AD_TYPES = ['منزلي', 'خارجي', 'حضوري'];
const SHIP_COS = ['سمسا', 'أرامكس', 'سبل', 'ناقل', 'ريدبوكس', 'جي تي', 'DHL', 'مندوب'];
const ACQ = { draft: ['مسودة', ''], pending: ['بانتظار المراجعة', 'acc'], needs_edit: ['يحتاج تعديل', 'warn'], approved: ['معتمد: تواصل وفاوض', 'good'], rejected: ['مرفوض', 'bad'], none: ['من الحملات', ''] };
const REQ_KINDS = { design: 'تصميم', ship: 'شحن', ad: 'إطلاق إعلان', snap: 'سناب', social: 'سوشيال ميديا', quota: 'زيادة حصة ترشيح', other: 'أخرى' };
const REQ_STATUS = { new: ['جديد', 'acc'], doing: ['قيد التنفيذ', 'warn'], review: ['بانتظار المراجعة', 'acc'], fix: ['يحتاج تعديل', 'bad'], done: ['منتهي', 'good'], cancelled: ['ملغي', ''] };
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
const TZ = 'Asia/Riyadh', LOC = 'ar-SA-u-ca-gregory-nu-latn';
const dShort = s => !s ? '' : String(s).length <= 10 ? new Date(s + 'T12:00:00').toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric' }) : new Date(s).toLocaleString(LOC, { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dtFull = t => t ? new Date(t).toLocaleString(LOC, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
const dtX = t => t ? new Date(t).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 19) : '';
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
const handleOf = s => {
  s = String(s || '').trim();
  const m = s.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i) || s.match(/instagram\.com\/(?!p\/|reel\/|reels\/|stories\/|explore\/)([A-Za-z0-9._]+)/i) || s.match(/snapchat\.com\/(?:add|@)\/?@?([A-Za-z0-9._-]+)/i);
  if (m) return m[1].toLowerCase();
  if (/^https?:/i.test(s) || /[\/\s:?]/.test(s) || /\.(com|net|org|me|co)$/i.test(s)) return '';   // رابط مختصر أو رابط ما فيه يوزر
  return s.replace(/^@/, '').toLowerCase();
};
const shortLink = u => /vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com\/t\//i.test(String(u || ''));
const isUrl = s => !s || /^https?:\/\/\S+\.\S+/.test(s);
const CONTACT = 'ولو تكررت، تواصل مع عبدالمحسن.';
function friendly(err) {
  const m = String((err && (err.message || err.error_description || err.msg)) || err || '');
  if (/متعب|عبدالمحسن|مجموع الحصص/.test(m)) return m;
  if (/failed to fetch|networkerror|network request|load failed|timeout/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'فيه مشكلة في الاتصال بالإنترنت. تأكد من النت وجرّب مرة ثانية.';
  if (/jwt|expired|session|refresh token|not authenticated/i.test(m)) return 'انتهت جلستك. سجّل دخول من جديد.';
  if (/row-level|permission|not allowed|unauthorized|forbidden/i.test(m)) return 'ما عندك صلاحية لهذي الخطوة. إذا تحتاجها تواصل مع عبدالمحسن.';
  if (/rate limit|too many|429/i.test(m)) return 'محاولات كثيرة ورا بعض. انتظر دقيقة وجرّب مرة ثانية.';
  if (/duplicate|already exists|unique/i.test(m)) return 'هذا الشي مسجّل من قبل. ابحث عنه بدل ما تضيفه مرة ثانية.';
  if (/already registered/i.test(m)) return 'هذا الإيميل مسجّل من قبل. ادخل بكلمة المرور بدل التسجيل.';
  return 'ما قدرنا نكمّل هذي الخطوة. حدّث الصفحة وجرّب مرة ثانية. ' + CONTACT;
}
let toastT; function toast(m, bad) { const t = $('toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, Math.max(3200, Math.min(10000, String(m).length * 60))); }
async function copyTxt(t) { try { await navigator.clipboard.writeText(t); toast('انسخ'); } catch (e) { toast('ما قدرت أنسخ، ظلّل النص وانسخه', true); } }
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyTxt(b.dataset.copy); });
const opts = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const optsBlank = (list, sel, blank) => `<option value="">${blank || 'اختر'}</option>` + opts(list, sel);

/* ================= الحالة ================= */
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
const S = { reads: {}, notified: {}, lastPoll: null, user: null, me: null, members: [], camps: [], deals: [], reqs: [], infl: [], quotas: [], sla: { ...DEF_SLA }, tasks: {}, kpi: {}, bankPub: null, bankPriv: null, view: 'mine', pStep: '' };
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
/* من يعتمد شغل هذا الشخص؟ فصل المهام: شغل المعتمد نفسه يعتمده الأدمن */
const adminName = () => (S.members.find(m => m.is_admin && m.active) || {}).name || 'عبدالمحسن';
const apprNames = () => withRole('approver').filter(m => !m.is_admin).map(m => m.name).join('، ') || 'متعب';
const apprFor = mid => strictRole(mid, 'approver') ? adminName() : apprNames();
const stepWho = s => s.who === 'creator' ? 'صانع المحتوى' : s.who === 'approver' ? apprNames() : withRole(s.who).filter(m => !m.is_admin).map(m => m.name).join('، ') || ROLES[s.who];

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
const waLink = (phone, txt) => { let p = String(phone || '').replace(/\D/g, '').replace(/^00/, '').replace(/^0(?=5)/, '966'); if (/^5\d{8}$/.test(p)) p = '966' + p; if (p.length < 9) p = ''; return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt) : ''; };
const safeUrl = u => /^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : '';
/* روابط حسابات المؤثر (تيك توك، سناب، انستقرام، يوتيوب) تنفتح في تبويب جديد */
function acctUrls(d, I) {
  d = d || {}; I = I || {}; const out = [], h = d.handle || I.handle, clean = x => String(x || '').trim().replace(/^@/, '');
  const tt = safeUrl(I.tiktok_url) || (h ? 'https://www.tiktok.com/@' + encodeURIComponent(h) : ''); if (tt) out.push(['تيك توك', tt]);
  const sn = clean(d.sn_user || I.snap_user); if (sn) out.push(['سناب شات', safeUrl(sn) || 'https://www.snapchat.com/add/' + encodeURIComponent(sn)]);
  const ig = clean(I.ig_user); if (ig) out.push(['انستقرام', safeUrl(ig) || 'https://www.instagram.com/' + encodeURIComponent(ig)]);
  if (safeUrl(I.yt_url)) out.push(['يوتيوب', safeUrl(I.yt_url)]);
  return out;
}
const acctLinks = (d, I) => acctUrls(d, I).map(([n, u]) => `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">افتح ${n} ↗</a>`).join('');
const isContinuing = i => !!i && S.deals.some(d => d.influencer_id === i.id && allDelivered(d));

/* ================= البيانات ================= */
async function q(p) { const { data, error } = await p; if (error) { console.warn(error); toast(friendly(error), true); return null; } return data ?? true; }
async function loadAll() {
  const [m, c, s, d, r, i, qt, rd] = await Promise.all([
    sb.from('members').select('*').order('name'),
    sb.from('campaigns').select('*').order('created_at', { ascending: false }),
    sb.from('settings').select('*'),
    sb.from('deals').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('requests').select('*').order('created_at', { ascending: false }).limit(3000),
    sb.from('influencers').select('*').order('created_at', { ascending: false }).limit(10000),
    sb.from('quotas').select('*'),
    sb.from('request_reads').select('request_id,seen_at')
  ]);
  S.members = m.data || []; S.camps = c.data || []; S.deals = d.data || []; S.reqs = r.data || []; S.infl = i.data || []; S.quotas = qt.data || []; S.reads = {}; for (const x of (rd.data || [])) S.reads[x.request_id] = x.seen_at; for (const x of S.reqs) if (!(x.id in S.notified)) S.notified[x.id] = x.last_event_at; if (!S.lastPoll) S.lastPoll = nowIso();
  for (const x of (s.data || [])) { if (x.key === 'sla') S.sla = { ...DEF_SLA, ...x.value }; if (x.key === 'daily_tasks') S.tasks = x.value || {}; if (x.key === 'kpi') S.kpi = x.value || {}; if (x.key === 'bank_pub') S.bankPub = x.value; }
  S.me = S.members.find(x => x.id === S.user.id) || S.me;
}
function upsertLocal(list, row) { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.unshift(row); return row; }
async function saveDeal(id, ch) { const r = id ? await q(sb.from('deals').update(ch).eq('id', id).select().single()) : await q(sb.from('deals').insert(ch).select().single()); return r ? upsertLocal(S.deals, r) : null; }
async function saveReq(id, ch) { const r = id ? await q(sb.from('requests').update(ch).eq('id', id).select().single()) : await q(sb.from('requests').insert(ch).select().single()); return r ? upsertLocal(S.reqs, r) : null; }
async function saveInfl(id, ch) { const r = id ? await q(sb.from('influencers').update(ch).eq('id', id).select().single()) : await q(sb.from('influencers').insert(ch).select().single()); return r ? upsertLocal(S.infl, r) : null; }

/* ================= الدخول ================= */
let signUp = false;
function showAuth() { $('authView').hidden = false; $('appView').hidden = true; $('waitView').hidden = true; if (S.authNotice) { $('aMsg').textContent = S.authNotice; $('aMsg').hidden = false; $('aResend').hidden = false; S.authNotice = null; } }
$('aSwitch').onclick = () => { signUp = !signUp; $('nameWrap').hidden = !signUp; $('aGo').textContent = signUp ? 'سجّل حساب' : 'دخول'; $('aSwitch').textContent = signUp ? 'عندك حساب؟ ادخل' : 'ما عندك حساب؟ سجّل'; $('aMsg').hidden = true; };
$('aGo').onclick = async () => {
  const email = $('aEmail').value.trim(), password = $('aPass').value, name = $('aName').value.trim();
  const msg = t => { $('aMsg').textContent = t; $('aMsg').hidden = false; };
  if (!email || password.length < 8) return msg('اكتب الإيميل، وكلمة مرور 8 أحرف أو أكثر.');
  if (signUp && !name) return msg('اكتب اسمك.');
  $('aGo').disabled = true;
  const r = signUp ? await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: APP_URL } }) : await sb.auth.signInWithPassword({ email, password });
  $('aGo').disabled = false;
  if (r.error) { if (/not confirmed/i.test(r.error.message)) { $('aResend').hidden = false; return msg('حسابك ما تأكد للحين. افتح رابط التأكيد اللي وصلك على الإيميل (شيّك على الرسائل المزعجة)، أو اضغط «أرسل رابط التأكيد مرة ثانية».'); } return msg(/Invalid login/.test(r.error.message) ? 'الإيميل أو كلمة المرور غلط. تأكد منهم وجرّب مرة ثانية.' : friendly(r.error)); }
  if (signUp && !r.data.session) { $('aResend').hidden = false; return msg('تم التسجيل. أرسلنا لك رابط تأكيد على الإيميل: افتحه من نفس الجهاز، وبيرجعك للموقع. إذا ما وصلك خلال دقيقتين شيّك على الرسائل المزعجة، أو اضغط «أرسل رابط التأكيد مرة ثانية».'); }
  start();
};
$('signOut').onclick = $('wOut').onclick = async () => { await sb.auth.signOut(); location.hash = ''; showAuth(); };
$('wRetry').onclick = () => start();
$('aResend').onclick = async () => { const email = $('aEmail').value.trim(); const m = $('aMsg'); if (!email) { m.textContent = 'اكتب إيميلك فوق أول.'; m.hidden = false; return; }
  $('aResend').disabled = true; const r = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: APP_URL } }); $('aResend').disabled = false;
  m.textContent = r.error ? friendly(r.error) : 'أرسلنا رابط تأكيد جديد. افتحه من نفس الجهاز خلال ساعة.'; m.hidden = false; };
/* رسائل رابط التأكيد: لو الرابط انتهى أو انستخدم، نوضح للشخص وش يسوي بدل صفحة خطأ */
(function authUrlNotice() {
  const raw = (location.hash || '').replace(/^#/, '') + '&' + (location.search || '').replace(/^\?/, '');
  const p = new URLSearchParams(raw); const code = p.get('error_code') || p.get('error');
  if (code) {
    const txt = /otp_expired|expired/i.test(code + (p.get('error_description') || '')) ? 'رابط التأكيد انتهى أو انفتح قبل. لا تشيل هم: ادخل بإيميلك وكلمة المرور، ولو طلب منك تأكيد اضغط «أرسل رابط التأكيد مرة ثانية».' : 'ما قدرنا نكمّل تأكيد الحساب من الرابط. ادخل بإيميلك وكلمة المرور، ' + CONTACT;
    S.authNotice = txt; history.replaceState(null, '', APP_URL);
  } else if (/access_token|type=signup|type=recovery/.test(raw)) S.justConfirmed = true;
})();

async function start() { try { await startInner(); } catch (e) { console.warn(e); $('authView').hidden = true; $('appView').hidden = true; $('waitView').hidden = false; $('waitTitle').textContent = 'ما قدرنا نفتح الموقع'; $('waitText').textContent = friendly(e); } }
async function startInner() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showAuth();
  S.user = data.session.user;
  const { data: me } = await sb.from('members').select('*').eq('id', S.user.id).maybeSingle();
  S.me = me;
  if (S.justConfirmed || /access_token/.test(location.hash)) { S.justConfirmed = false; history.replaceState(null, '', APP_URL); }
  if (!me || !me.active) { $('authView').hidden = true; $('appView').hidden = true; $('waitView').hidden = false; $('waitTitle').textContent = 'حسابك بانتظار التفعيل'; $('waitText').textContent = 'تم تأكيد إيميلك وتسجيلك بنجاح. عبدالمحسن يفعّل حسابك ويحدد دورك، وبعدها تقدر تشتغل. ارجع بعد شوي واضغط «تحقّق مرة ثانية».'; return; }
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
  <button type="button" id="chAcq"><b>استقطاب جديد</b><span class="muted small">حساب جديد تبي نتعامل معه. تسجّل بياناته، يعتمده ${esc(apprFor(S.me.id))}، وبعدها تتواصل وتفاوض.</span></button>
  <button type="button" id="chCamp"><b>ترشيح للحملة</b><span class="muted small">ترشّح حساباتك المطلوبة لحملة معيّنة دفعة وحدة، وترسلها للاعتماد (${esc(apprFor(S.me.id))}).</span></button></div>
  <button class="btn" id="chX" type="button">إلغاء</button>`, () => { $('chAcq').onclick = () => openAcqNew(); $('chCamp').onclick = () => openCampNom(); $('chX').onclick = closeModal; }, true);
$('acqNew').onclick = () => openAcqNew();
/* دليل سريع داخل الموقع: القاعدة الذهبية + المراحل + دور المستخدم الحالي */
$('howBtn').onclick = () => {
  const roles = (S.me && S.me.roles) || [];
  const R = [];
  if (roles.includes('creator')) R.push(['صانع المحتوى (دورك)', 'تبدأ من «+ ترشيح»: استقطاب جديد أو ترشيح لحملة. التواصل والتفاوض تسجّله في ملف المؤثر من تبويب «الاستقطاب». وكل اللي يحتاج خطوة منك — تعديل، منتج وصل، مقطع انعتمد — يطلع لك في «مهامي» تلقائياً.']);
  if (roles.includes('approver')) R.push(['الاعتماد (دورك)', 'كل اللي ينتظر قرارك يجيك في «مهامي»: استقطابات، ترشيحات حملات، مقاطع خام، طلبات زيادة حصة، وكشوف الدفع المعتمدة. وشغلك أنت الشخصي يعتمده عبدالمحسن (فصل مهام).']);
  if (roles.includes('shipper')) R.push(['الشحن (دورك)', 'الجاهز للشحن يجيك في «مهامي» تحت «جاهزة للشحن»: نزّل «كشف سلاسل Excel» وارفعه لشركة الشحن دفعة وحدة، وعلّم «انشحن» و«وصلت» بالمجموعة. المتعذر تابعه من «تعذّر التسليم».']);
  if (roles.includes('media')) R.push(['الميديا باير (دورك)', 'كل منصة نزل عليها محتوى تجيك في «مهامي» تحت «نزل: شغّل الإعلان» — شغّل واضغط «انطلق».']);
  if (roles.includes('snap')) R.push(['منسق المحتوى (دورك)', 'كل محتوى نزل يجيك في «مهامي»، ومنه تنزّل «شيت التشغيل Excel» وتلصقه في Content Tracker — الكود والتسميات يولدها الشيت نفسه.']);
  if (roles.includes('design') || roles.includes('social') || roles.includes('owned')) R.push(['الطلبات (دورك)', 'شغلك يجيك من «+ طلب»: الطلب يوصلك في «مهامي» و«الطلبات»، تسلّم من نفس الطلب، والتعديلات ترجع لك بإشعار.']);
  if (isAdmin()) R.push(['عبدالمحسن', 'اعتماد شغل متعب، موافقات الدفع، تفعيل الحسابات الجديدة، وزيادة «العدد المطلوب» للحملات — كلها في «مهامي». والمتابعة من «لوحة الأداء».']);
  modal(`<div class="row between"><h2>كيف يمشي الشغل؟</h2><button class="btn" id="howX" type="button">إغلاق</button></div>
   <div class="note"><b>القاعدة الذهبية:</b> كل شي ينتظر خطوة منك يجيك في تبويب <b>«مهامي»</b> — افتحه أول ما تدخل. العداد الأحمر = عدد اللي ينتظرك. وأول ما تخلّص خطوتك، النظام ينقل الملف للشخص التالي بنفسه: ما فيه تسليم يدوي ولا واتساب.</div>
   <h3>مراحل الحملة: المسؤول، ووين تروح بعده</h3>
   <div class="tw"><table><thead><tr><th>#</th><th>المرحلة</th><th>المسؤول</th><th>إذا خلصت، وش يصير؟</th></tr></thead><tbody>
   ${STEPS.map((s, j) => `<tr><td>${j + 1}</td><td>${s.n}</td><td>${esc(stepWho(s))}</td><td class="small muted">${NEXT[s.k]}</td></tr>`).join('')}</tbody></table></div>
   ${R.map(([t, x]) => `<div class="card"><div class="hd"><b>${t}</b></div><div class="small">${x}</div></div>`).join('')}
   <div class="note small">وداخل كل ملف، المرحلة المفتوحة فيها سطر «وش بعد؟» يقول لك وين بتروح خطوتك بالضبط.</div>`, root => { root.querySelector('#howX').onclick = closeModal; }, true);
};

/* ================= الاستقطاب: تسجيل جديد ================= */
function dupInfl(handle, url, phone, exceptId) {
  const h = handleOf(handle || url), p = ph9(phone);
  return S.infl.filter(x => x.id !== exceptId && ((h && h.length > 2 && handleOf(x.handle || x.tiktok_url) === h) || (p && ph9(x.phone) === p)));
}
/* الحساب عند زميل؟ الموظف ما يشوف ملفات غيره، فنسأل قاعدة البيانات: ترجع الاسم وصاحب الترشيح فقط */
const seesAll = () => isAdmin() || isApprover();
async function takenBy(handle, phone) {
  if (seesAll() || (!handle && !phone)) return null;
  try { const { data, error } = await sb.rpc('infl_lookup', { p_handle: handle || '', p_phone: phone || '' }); if (error || !data || data.mine) return null; return data; } catch (e) { return null; }
}
const takenMsg = t => `الحساب «${t.name}» مسجّل عند ${t.owner_name || 'زميل'}. ما ينسجّل مرتين، وإذا تحتاجه راجع ${apprFor(S.me.id)}.`;
function inflHistory(i) {
  if (!i) return '';
  const D = S.deals.filter(d => d.influencer_id === i.id); const posted = D.filter(allDelivered);
  return `<div class="dup">هذا الحساب موجود عندنا (${esc(i.name)}${i.handle ? ' @' + esc(i.handle) : ''}): رشّحه ${esc(memName(i.nominated_by))}، حالته «${esc((ACQ[i.acq_status] || ['—'])[0])}»، ودخل ${D.length} حملة ونزّل في ${posted.length}. ${D[0] && D[0].price != null ? 'آخر مبلغ ' + fmt(D[0].price) + '.' : ''} <button class="btn sm" data-openinfl="${i.id}" type="button">افتح ملفه</button></div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-openinfl]'); if (b) openInfl(b.dataset.openinfl); });
function openAcqNew() {
  const canDate = isAdmin() || isApprover();
  modal(`<h2>استقطاب جديد</h2><div class="muted small">المرحلة الأولى: بيانات الحساب. بعد ما يعتمده ${esc(apprFor(S.me.id))} تنفتح لك مرحلة التواصل والتفاوض في نفس الملف.</div>
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
    const chk = () => { if (!$('q_handle').value && $('q_url').value) $('q_handle').value = handleOf($('q_url').value); const d = dupInfl($('q_handle').value, $('q_url').value); $('q_dup').innerHTML = d.length ? inflHistory(d[0]) : ''; if (d.length && isContinuing(d[0])) $('q_status').value = 'مستمر'; if (!d.length) takenBy(handleOf($('q_handle').value || $('q_url').value)).then(t => { if (t && $('q_dup')) $('q_dup').innerHTML = `<div class="dup">${esc(takenMsg(t))}</div>`; }); };
    $('q_url').addEventListener('change', chk); $('q_handle').addEventListener('change', chk);
    $('q_x').onclick = closeModal;
    const save = async send => {
      const name = $('q_name').value.trim(), url = $('q_url').value.trim(), handle = handleOf($('q_handle').value || url), type = $('q_type').value;
      if (!name || !url || !type) return toast('عبّ الاسم ونوع الحساب ورابط تيك توك', true);
      if (!isUrl(url)) return toast('رابط الحساب مو صحيح', true);
      if (!handle) return toast('اكتب يوزر الحساب في خانة «يوزر تيك توك». الرابط المختصر ما ينقرأ منه اليوزر، واليوزر هو اللي نعرف به الحساب', true);
      const dup = dupInfl(handle, url); if (dup.length && !await confirmBox('الحساب هذا موجود عندنا. تبي تسجّله مرة ثانية؟ الأفضل تفتح ملفه الموجود.')) return;
      if (!dup.length) { const t = await takenBy(handle); if (t) return toast(takenMsg(t), true); }
      root.querySelectorAll('button').forEach(b => b.disabled = true);
      const r = await saveInfl(null, { name, tiktok_url: url, handle, acc_type: type, account_status: $('q_status').value, nominated_on: $('q_date').value || today(), nominated_by: S.me.id, source: 'acq', acq_status: send ? 'pending' : 'draft', acq_sent_at: send ? nowIso() : null });
      root.querySelectorAll('button').forEach(b => b.disabled = false);
      if (r) { toast(send ? 'انرسل للمراجعة عند ' + apprFor(S.me.id) : 'انحفظ كمسودة'); openInfl(r.id); }
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
  const me = S.me.id, owner = i.nominated_by === me || isAdmin(), appr = isApprover() && (i.nominated_by !== me || isAdmin());
  const st = i.acq_status, editable1 = owner && ['draft', 'needs_edit'].includes(st) || isAdmin();
  const open2 = st === 'approved' || st === 'none';
  const keys = platKeys(i); const D = S.deals.filter(d => d.influencer_id === i.id);
  const contacts = Array.isArray(i.contacts) ? i.contacts.slice() : [];
  const v = k => esc(i[k] ?? '');
  const diff = (i.price_before != null && i.price_after != null) ? i.price_before - i.price_after : null;
  modal(`<div class="row between"><div><h2>${esc(i.name)}</h2><div class="muted small">${esc([i.acc_type, i.account_status, i.handle ? '@' + i.handle : '', 'رشّحه ' + memName(i.nominated_by) + ' ' + (i.nominated_on || '')].filter(Boolean).join(' · '))}</div></div>
   <div class="row"><span class="pill ${(ACQ[st] || ['', ''])[1]}">${i.agreed_at ? 'تم الاتفاق' : (ACQ[st] || [st])[0]}</span><button class="btn" id="f_x" type="button">إغلاق</button></div></div>
  ${acctLinks(null, i) ? `<div class="row">${acctLinks(null, i)}</div>` : ''}
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
   ${editable1 && st !== 'approved' && st !== 'none' ? `<div class="note small"><b>وش بعد؟</b> بعد الإرسال يراجعه ${esc(apprFor(i.nominated_by))}، وأول ما يُعتمد تنفتح لك مرحلة «التواصل والتفاوض» في نفس هذا الملف.</div><div class="row"><button class="btn primary" data-a="send" type="button">${st === 'needs_edit' ? 'أعد الإرسال للمراجعة' : 'إرسال الترشيح للمراجعة'}</button><button class="btn" data-a="save1" type="button">حفظ</button></div>` : editable1 ? '<div class="row"><button class="btn" data-a="save1" type="button">حفظ</button></div>' : ''}
  </div></details>

  ${st !== 'none' ? `<details class="sec ${st === 'approved' ? 'd' : st === 'pending' ? 'c' : ''}" ${st === 'pending' ? 'open' : ''}><summary><span class="idx">2</span><span class="ttl">الاعتماد (${esc(apprFor(i.nominated_by))})</span><span class="meta">${i.acq_decided_at ? dShort(i.acq_decided_at) + ' · ' + esc(memName(i.acq_decided_by)) : ''}</span></summary><div class="body">
   ${appr && st === 'pending' ? `<div class="row"><button class="btn good" data-a="approve" type="button">اعتماد</button><button class="btn" data-a="needs_edit" type="button">يحتاج تعديل</button><button class="btn danger" data-a="reject" type="button">رفض</button></div>`
     : st === 'pending' ? `<div class="muted">بانتظار ${esc(apprFor(i.nominated_by))}.</div>` : st === 'draft' ? '<div class="muted">ما انرسل للمراجعة للحين.</div>' : `<div class="muted">${esc(ACQ[st][0])}</div>`}
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
    ${owner && open2 ? `<div class="note small"><b>وش بعد؟</b> سجّل كل محاولة تواصل أول بأول. وأول ما تتفقون على السعر النهائي: «تم الاتفاق» ثم «رشّحه لحملة» — هناك يعتمد السعر ويدخل خط الإنتاج.</div><div class="row"><button class="btn" data-a="save2" type="button">حفظ</button>${!i.agreed_at ? '<button class="btn good" data-a="agree" type="button">تم الاتفاق</button>' : ''}</div>` : ''}
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
      if (r) {
        const IM = {
          send: `انرسل للمراجعة ✓ — بيظهر عند ${apprFor(i.nominated_by)} في «مهامي»، وأول ما يقرر يوصلك الرد في «مهامي» حقتك`,
          approve: 'انعتمد ✓ — رجع لصاحبه في «مهامي» تحت «معتمد: تواصل وفاوض»',
          needs_edit: 'رجع لصاحبه مع المطلوب تعديله في «مهامي» حقته',
          reject: 'انرفض — بيوصل صاحبه السبب في ملف الحساب',
          agree: 'تم الاتفاق ✓ — باقي خطوة: اضغط «رشّحه لحملة» عشان يدخل خط الإنتاج ويروح للاعتماد',
          save2: 'انحفظ — سجّل كل محاولة تواصل أول بأول، هي اللي تطلع في تقييمك'
        };
        toast(IM[a] || 'انحفظ'); openInfl(i.id);
      }
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
   ${!quota ? `<div class="dup">ما عندك حصة في هذي الحملة. اطلب من ${esc(apprFor(S.me.id))} يحدد لك عدد، أو استخدم «طلب ترشيحات إضافية».</div>` : ''}
   ${!cards.length && quota ? `<div class="note">خلّصت حصتك في هذي الحملة. إذا تبي ترشّح أكثر، اطلب زيادة من ${esc(apprFor(S.me.id))}.</div>` : ''}
   <div id="cn_cards" style="display:grid;gap:12px">${cards.join('')}</div>
   <div class="panel" style="position:sticky;bottom:0"><div class="row between"><b id="cn_count"></b>
    <div class="row"><button class="btn" id="cn_more" type="button">طلب ترشيحات إضافية</button>${cards.length ? '<button class="btn" id="cn_draft" type="button">حفظ كمسودة</button><button class="btn primary" id="cn_send" type="button">إرسال الترشيحات للاعتماد</button>' : ''}</div></div></div>`, root => {
    $('cn_x').onclick = closeModal;
    const cardEls = () => [...root.querySelectorAll('[data-card]')];
    const f = (el, k) => { const x = el.querySelector(`[data-f="${k}"]`); return x ? x.value.trim() : ''; };
    const isEmpty = el => !f(el, 'url') && !f(el, 'name');
    const isDone = el => f(el, 'url') && f(el, 'name') && f(el, 'acc_type') && f(el, 'price') !== '' && readPlats(el, 'c' + el.dataset.card).length;
    const count = () => { let ok = 0; cardEls().forEach(el => { const d = isDone(el); el.classList.toggle('ok', !!d); el.classList.toggle('part', !d && !isEmpty(el)); el.querySelector('[data-cst]').textContent = d ? 'مكتمل' : isEmpty(el) ? 'فاضي' : 'ناقص'; if (d) ok++; }); $('cn_count').textContent = `مكتمل ${ok} من ${cardEls().length}`; };
    root.addEventListener('input', count); root.addEventListener('change', e => { const p = e.target.closest('[data-plat]'); if (p) { const el = p.closest('[data-card]'); const k = readPlats(el, 'c' + el.dataset.card); el.querySelectorAll('[data-for]').forEach(x => x.hidden = !k.includes(x.dataset.for)); } count(); });
    root.querySelectorAll('[data-f=url]').forEach(inp => inp.addEventListener('change', () => { const el = inp.closest('[data-card]'); const dup = dupInfl(handleOf(inp.value), inp.value); if (dup.length && !el.dataset.infl) { const i = dup[0]; el.dataset.infl = i.id; const set = (k, v) => { const x = el.querySelector(`[data-f="${k}"]`); if (x && !x.value && v) x.value = v; }; set('name', i.name); set('acc_type', i.acc_type); set('phone', i.phone); set('city', i.city); set('district', i.district); set('country', i.country); set('sn_user', i.snap_user); set('ig_user', i.ig_user); set('name_en', i.name_en); if (i.price_after != null) set('price', String(i.price_after)); if (isContinuing(i)) el.querySelector('[data-f=status]').value = 'مستمر'; toast('الحساب موجود عندنا، سحبت بياناته'); count(); } else if (!dup.length) takenBy(handleOf(inp.value)).then(t => { let w = el.querySelector('[data-taken]'); if (!w) { w = document.createElement('div'); w.dataset.taken = '1'; w.className = 'dup'; el.querySelector('.hd').after(w); } w.hidden = !t; w.textContent = t ? takenMsg(t) : ''; }); }));
    root.addEventListener('click', async e => { const rm = e.target.closest('[data-rm]'); if (!rm) return; const el = rm.closest('[data-card]'); if (!await confirmBox('تحذف هذا الترشيح؟')) return; const r = await q(sb.from('deals').update({ closed_at: nowIso(), closed_reason: 'حذفه الموظف قبل الإرسال' }).eq('id', el.dataset.deal).select().single()); if (r) { upsertLocal(S.deals, r); openCampNom(cid); } });
    count();
    $('cn_more').onclick = () => requestQuota(cid);
    let busy = false;
    const saveAll = async send => {
      if (busy) return; busy = true; root.querySelectorAll('#cn_draft,#cn_send').forEach(b => b.disabled = true);
      const batch = crypto.randomUUID(); let saved = 0, sent = 0, bad = 0; const taken = [], why = [];
      for (const el of cardEls()) {
        if (isEmpty(el)) continue; const done = isDone(el);
        const keys = readPlats(el, 'c' + el.dataset.card); const rawPhone = f(el, 'phone'); const phone = normPhone(rawPhone);
        if (rawPhone && phone === null) { bad++; el.classList.add('part'); why.push(`الترشيح ${el.dataset.card}: رقم الجوال مو صحيح (السعودي يبدأ بـ 05، والدولي بـ + ومفتاح الدولة)`); continue; }
        const url = f(el, 'url'); if (!isUrl(url)) { bad++; el.classList.add('part'); why.push(`الترشيح ${el.dataset.card}: رابط الحساب مو صحيح (لازم يبدأ بـ https)`); continue; }
        if (shortLink(url)) { bad++; el.classList.add('part'); why.push(`الترشيح ${el.dataset.card}: الرابط المختصر ما ينقرأ منه اليوزر. افتح الحساب وانسخ رابطه الكامل (tiktok.com/@اليوزر)`); continue; }
        // ملف المؤثر: نستخدم الموجود أو ننشئ جديد
        let iid = el.dataset.infl; const handle = handleOf(url);
        if (!iid) { const dup = dupInfl(handle, url, phone); if (dup.length) iid = dup[0].id; }
        if (!iid) { const t = await takenBy(handle, phone); if (t) { taken.push(takenMsg(t)); el.classList.add('part'); continue; } }
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
      if (taken.length) toast(taken.join(' '), true);
      else if (bad) toast(why.length ? why.join(' · ') : `${bad} ترشيح ما انحفظ. حدّث الصفحة وجرّب مرة ثانية`, true);
      else toast(send ? `انرسل ${sent} ترشيح للاعتماد عند ${apprFor(S.me.id)}${saved > sent ? '، و' + (saved - sent) + ' انحفظت مسودة لأنها ناقصة' : ''}` : `انحفظ ${saved} كمسودة`);
      if (!bad && !taken.length) { if (send && sent) closeModal(); else openCampNom(cid); }
    };
    if ($('cn_draft')) { $('cn_draft').onclick = () => saveAll(false); $('cn_send').onclick = () => saveAll(true); }
  });
}
async function requestQuota(cid) {
  const c = camp(cid); const ap = isApprover() && !isAdmin() ? S.members.find(m => m.is_admin && m.active) : withRole('approver').filter(m => !m.is_admin || (m.roles || []).includes('approver'))[0];
  const qty = await dialog(`<h3>طلب ترشيحات إضافية — ${esc(c.name)}</h3><div class="field"><label for="rq_n">كم ترشيح زيادة؟</label><input type="number" min="1" id="rq_n" value="2"></div><div class="field"><label for="rq_w">السبب</label><textarea id="rq_w"></textarea></div>`, box => { const n = Number(box.querySelector('#rq_n').value); if (!n || n < 1) { toast('اكتب العدد', true); return false; } return { n, w: box.querySelector('#rq_w').value.trim() }; });
  if (!qty) return;
  const r = await saveReq(null, { kind: 'quota', campaign_id: cid, qty: qty.n, title: `زيادة ${qty.n} ترشيح في حملة ${c.name}`, details: qty.w, to_member: ap ? ap.id : null, from_member: S.me.id });
  if (r) toast('انرسل الطلب لـ' + (ap ? ap.name : apprNames()));
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
    const people = ap || adm ? creators() : creators().filter(m => m.id === me);
    return `<div class="panel" data-camp="${c.id}">
     <div class="row between"><div class="row"><h2>${esc(c.name)}</h2><span class="pill ${CAMP_ST[c.status || 'active'][1]}">${CAMP_ST[c.status || 'active'][0]}</span>${c.product ? `<span class="muted small">${esc(c.product)}</span>` : ''}</div>
      ${c.status === 'active' && hasRole(me, 'creator') ? `<button class="btn primary" data-nom="${c.id}" type="button">رشّح (حصتك ${myQ}، باقي ${Math.max(0, myQ - myS.used)})</button>` : ''}</div>
     <div class="tiles">
      <div class="tile"><span class="l">المطلوب</span><span class="v">${target || '—'}</span></div>
      <div class="tile"><span class="l">موزّع على الموظفين</span><span class="v">${quotaSum}</span></div>
      <div class="tile"><span class="l">انرسل للاعتماد</span><span class="v">${st.sent.length}</span></div>
      <div class="tile"><span class="l">معتمد</span><span class="v">${st.approved.length}</span></div>
      <div class="tile"><span class="l">قيد الشحن</span><span class="v">${shipping}</span></div>
      <div class="tile"><span class="l">استلموا</span><span class="v">${deliv}</span></div>
      <div class="tile"><span class="l">نشروا</span><span class="v">${posted}</span></div>
      <div class="tile"><span class="l">مبالغ المعتمدين</span><span class="v">${fmt(spend)}</span></div>
     </div>
     ${target ? `<div class="row small"><span class="muted">التقدم نحو المطلوب (المعتمد)</span><div class="prog" style="flex:1"><i style="width:${Math.min(100, pct(st.approved.length, target))}%"></i></div><b>${pct(st.approved.length, target)}٪</b></div>` : ''}
     ${ap || adm ? '' : '<div class="muted small">أرقام الترشيح والاعتماد والشحن والنشر هنا لترشيحاتك أنت فقط.</div>'}
     ${adm ? `<details><summary class="small" style="cursor:pointer;color:var(--accent)">إعدادات الحملة (عبدالمحسن)</summary><div class="grid3" style="margin-top:10px">
       <div class="field"><label>الاسم</label><input type="text" data-k="name" value="${esc(c.name)}"></div>
       <div class="field"><label>المنتج</label><input type="text" data-k="product" value="${esc(c.product)}"></div>
       <div class="field"><label>العدد المطلوب</label><input type="number" min="0" data-k="target_total" value="${c.target_total ?? ''}"></div>
       <div class="field"><label>الحالة</label><select data-k="status">${Object.entries(CAMP_ST).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      </div><button class="btn sm primary" data-csave type="button">حفظ</button></details>` : ''}
     <div class="tw"><table><thead><tr><th>الموظف</th><th class="num">الحصة</th><th class="num">أرسل</th><th class="num">معتمد</th><th class="num">مرفوض</th><th class="num">يحتاج تعديل</th><th class="num">ينتظر الاعتماد</th></tr></thead><tbody>${people.map(m => { const s = campStats(c.id, m.id); return `<tr><td>${esc(m.name)}</td><td class="num">${ap && (m.id !== me || adm) ? `<input type="number" min="0" data-q="${m.id}" value="${quotaOf(c.id, m.id)}" style="width:80px;min-height:32px">` : quotaOf(c.id, m.id) + (ap && m.id === me ? ' <span class="muted small">(يحددها عبدالمحسن)</span>' : '')}</td><td class="num">${s.sent.length}</td><td class="num">${s.approved.length}</td><td class="num">${s.rejected.length || ''}</td><td class="num">${s.fix.length || ''}</td><td class="num">${s.pending.length || ''}</td></tr>`; }).join('')}</tbody></table></div>
     ${ap ? `<div class="row"><button class="btn sm primary" data-qsave type="button">حفظ الحصص</button><button class="btn sm" data-qeven type="button">وزّع المطلوب بالتساوي</button><span class="muted small">مجموع الحصص ${quotaSum}${target ? ' من ' + target : ''}</span></div>` : ''}
    </div>`;
  }).join('') || '<div class="empty">ما فيه حملات. عبدالمحسن يضيفها من «+ حملة».</div>';
}
$('cEnded').addEventListener('input', renderCamps);
$('campAdd').onclick = async () => { const r = await dialog(`<h3>حملة جديدة</h3><div class="field"><label for="nc_n">اسم الحملة</label><input type="text" id="nc_n"></div><div class="field"><label for="nc_p">المنتج</label><input type="text" id="nc_p"></div><div class="field"><label for="nc_t">العدد المطلوب من الترشيحات</label><input type="number" min="0" id="nc_t"></div>`, box => { const n = box.querySelector('#nc_n').value.trim(); if (!n) { toast('اكتب اسم الحملة', true); return false; } return { name: n, product: box.querySelector('#nc_p').value.trim(), target_total: Number(box.querySelector('#nc_t').value) || null, status: 'active', active: true }; }); if (!r) return; const c = await q(sb.from('campaigns').insert(r).select().single()); if (c) { S.camps.unshift(c); toast('انضافت الحملة. ' + apprNames() + ' يوزّع الحصص'); renderCamps(); } };
$('cList').addEventListener('click', async e => {
  const nb = e.target.closest('[data-nom]'); if (nb) return openCampNom(nb.dataset.nom);
  const box = e.target.closest('[data-camp]'); if (!box) return; const cid = box.dataset.camp;
  if (e.target.closest('[data-csave]')) { const ch = {}; box.querySelectorAll('[data-k]').forEach(x => ch[x.dataset.k] = x.type === 'number' ? (x.value === '' ? null : Number(x.value)) : x.value.trim()); ch.active = ch.status !== 'ended'; const r = await q(sb.from('campaigns').update(ch).eq('id', cid).select().single()); if (r) { upsertLocal(S.camps, r); toast('انحفظ'); renderCamps(); } }
  if (e.target.closest('[data-qeven]')) { const t = camp(cid).target_total; const inputs = [...box.querySelectorAll('[data-q]')]; if (!t) return toast('عبدالمحسن ما حدد العدد المطلوب للحملة', true); const base = Math.floor(t / inputs.length), extra = t % inputs.length; inputs.forEach((x, k) => x.value = base + (k < extra ? 1 : 0)); toast('وزّعت بالتساوي، راجعها واضغط حفظ'); }
  if (e.target.closest('[data-qsave]')) { const rows = [...box.querySelectorAll('[data-q]')].map(x => ({ campaign_id: cid, member_id: x.dataset.q, quota: Number(x.value) || 0, updated_by: S.me.id }));
    const tgt = camp(cid).target_total; const others = S.quotas.filter(y => y.campaign_id === cid && !rows.some(x => x.member_id === y.member_id)).reduce((s, y) => s + y.quota, 0); const sum = others + rows.reduce((s, x) => s + x.quota, 0);
    if (tgt && sum > tgt) return toast(`مجموع الحصص بيصير ${sum} والعدد المطلوب للحملة ${tgt}. ما ينوزع أكثر من اللي حدده عبدالمحسن — اعتمد طلب زيادة ترشيح أو زد «العدد المطلوب» أولاً.`, true);
    const r = await q(sb.from('quotas').upsert(rows).select()); if (r) { r.forEach(x => { const k = S.quotas.findIndex(y => y.campaign_id === x.campaign_id && y.member_id === x.member_id); if (k >= 0) S.quotas[k] = x; else S.quotas.push(x); }); toast('انحفظت الحصص'); renderCamps(); } }
});

/* ================= مهامي ================= */
const QL = {
  members: 'حسابات جديدة تنتظر التفعيل', acq_review: 'استقطاب ينتظر اعتمادك', appr: 'ترشيحات حملات تنتظر اعتمادك', quota_req: 'طلبات زيادة حصة',
  acq_fix: 'استقطاب رجع لك للتعديل', camp_fix: 'ترشيحات حملات رجعت للتعديل', acq_draft: 'استقطاب محفوظ كمسودة', camp_draft: 'ترشيحات حملات محفوظة كمسودة', camp_quota: 'حصص ترشيح ما خلصت',
  acq_contact: 'معتمد: تواصل وفاوض', intake: 'معتمد: كمّل العنوان أو أرسل الرابط للمؤثر', ship_send: 'جاهزة للشحن', ship_wait: 'في الطريق: سجّل الوصول', ship_fail: 'تعذّر التسليم: تابعها',
  video: 'وصله المنتج: أرسل المقطع الخام للمراجعة', video_fix: 'مقاطع رجعت لك للتعديل', draft: 'مقاطع خام تنتظر اعتمادك', post: 'المقطع معتمد: سجّل النزول والكود لكل منصة',
  launch: 'نزل: شغّل الإعلان', snap_follow: 'محتوى نزل: سلّمه للميديا باير وتابع التشغيل', req_in: 'طلبات عليك', req_fix: 'طلبات رجعت لك للتعديل', req_new: 'تحديثات جديدة على طلباتك (ردود، تعديلات، تسليمات)', req_review: 'طلبات سلّموها لك: راجعها', pay: 'تنتظر موافقتك على الدفع', pay_go: 'معتمدة للدفع: نزّل كشف الدفع وأرسله للمالية، وبعد التحويل علّم «تم الدفع»', park: 'احتياط'
};
const QO = ['members', 'req_new', 'req_fix', 'acq_review', 'appr', 'quota_req', 'draft', 'req_review', 'acq_fix', 'camp_fix', 'video_fix', 'ship_fail', 'ship_send', 'ship_wait', 'launch', 'snap_follow', 'req_in', 'camp_quota', 'acq_draft', 'camp_draft', 'acq_contact', 'intake', 'video', 'post', 'pay', 'pay_go', 'park'];
const BULK = {
  appr: ['اعتماد', () => ({ approval: 'approved', approved_at: nowIso(), approved_by: S.me.id, decision_reason: '' })],
  ship_send: ['تم الشحن اليوم', () => ({ shipped_at: nowIso() })],
  ship_wait: ['وصلت اليوم', () => ({ delivered_at: nowIso() })],
  pay: ['اعتماد الدفع', () => ({ pay_ok_at: nowIso(), pay_ok_by: S.me.id })],
  pay_go: ['تم الدفع', () => ({ paid_at: nowIso() })]
};
function queuesFor(id) {
  const G = {}; const add = (k, x) => (G[k] = G[k] || []).push(x);
  const isAp = id !== 'admin' && strictRole(id, 'approver');
  const apOwn = mid => strictRole(mid, 'approver');   // شغل المعتمد نفسه يعتمده الأدمن (فصل المهام)
  for (const i of S.infl) {
    if (id === 'admin') { if (i.acq_status === 'pending' && apOwn(i.nominated_by)) add('acq_review', { i }); continue; }
    if (i.acq_status === 'pending' && isAp && i.nominated_by !== id) add('acq_review', { i });
    if (i.nominated_by === id) { if (i.acq_status === 'needs_edit') add('acq_fix', { i }); if (i.acq_status === 'draft') add('acq_draft', { i }); if (i.acq_status === 'approved' && !i.agreed_at) add('acq_contact', { i }); }
  }
  for (const d of S.deals) {
    if (d.closed_at) continue;
    if (id === 'admin') { if (allDelivered(d) && !d.paid_at && !d.no_pay && d.approval === 'approved') add(d.pay_ok_at ? 'pay_go' : 'pay', { d, i: SI.video }); if (apOwn(d.member_id) && d.sent_at && !isParked(d)) { const j = curStep(d); if (j >= 0 && j < STEPS.length && STEPS[j].k === 'appr') add('appr', { d, i: j }); else if (j >= 0 && j < STEPS.length && STEPS[j].k === 'video' && draftPending(d)) add('draft', { d, i: j }); } continue; }
    if (d.approval === 'rejected') continue;
    if (isAp && allDelivered(d) && d.pay_ok_at && !d.paid_at && !d.no_pay && d.approval === 'approved') add('pay_go', { d, i: SI.video });
    if (d.member_id === id && d.approval === 'needs_edit') { add('camp_fix', { d, i: 0 }); continue; }
    if (d.member_id === id && !d.sent_at && d.approval === 'pending') { add('camp_draft', { d, i: 0 }); continue; }
    if (isParked(d)) { if (d.member_id === id || isAp) add('park', { d, i: SI.appr }); continue; }
    const i = curStep(d);
    // التشغيل لكل منصة مستقل: أول ما تنزل منصة تروح للميديا باير
    if (d.approval === 'approved') for (const p of platKeys(d)) if (delivered(d, p) && !launched(d, p)) { if (strictRole(id, 'media')) add('launch', { d, i: SI.live, p }); if (strictRole(id, 'snap')) add('snap_follow', { d, i: SI.live, p }); }
    if (i < 0 || i >= STEPS.length) continue;
    const k = STEPS[i].k;
    if (k === 'appr') { if (isAp && d.member_id !== id) add('appr', { d, i }); continue; }
    if (k === 'ship') { if (strictRole(id, 'shipper')) add(d.ship_failed_at ? 'ship_fail' : d.shipped_at ? 'ship_wait' : 'ship_send', { d, i }); continue; }
    if (k === 'live') continue;
    if (k === 'video') { if (draftPending(d)) { if (isAp && d.member_id !== id) add('draft', { d, i }); } else if (d.member_id === id) add(d.video_ok_at || platKeys(d).some(p => delivered(d, p)) ? 'post' : (d.rounds > 0 ? 'video_fix' : 'video'), { d, i }); continue; }
    if (d.member_id === id) add(k, { d, i });
  }
  if (id !== 'admin' && strictRole(id, 'creator')) for (const c of S.camps.filter(c => c.status === 'active')) { const qn = quotaOf(c.id, id); const s = campStats(c.id, id); if (qn > s.used) add('camp_quota', { c, left: qn - s.used }); }
  for (const r of S.reqs) {
    if (id === S.me.id && unread(r)) add('req_new', { r });
    if (r.status === 'done' || r.status === 'cancelled') continue;
    if (r.kind === 'quota') { if ((r.to_member === id && r.from_member !== id) || (id === 'admin' && apOwn(r.from_member)) || (isAp && !r.to_member && r.from_member !== id)) add('quota_req', { r }); continue; }
    if (r.to_member === id && (r.status === 'new' || r.status === 'doing')) add('req_in', { r });
    if (r.to_member === id && r.status === 'fix') add('req_fix', { r });
    if (r.from_member === id && r.status === 'review') add('req_review', { r });
  }
  if (id === 'admin') S.members.filter(m => !m.active).forEach(m => add('members', { m }));
  for (const k in G) G[k].sort((a, b) => (a.d && b.d) ? stepAge(b.d, b.i) - stepAge(a.d, a.i) : 0);
  return G;
}
function countFor(id) { const G = queuesFor(id); return Object.entries(G).filter(([k]) => !['park', 'camp_quota', 'acq_contact', 'req_new'].includes(k)).reduce((a, [, v]) => a + v.length, 0); }
function updateMineCount() { if (!S.me) return; const n = countFor(S.me.id) + (isAdmin() ? countFor('admin') : 0); $('mineCnt').hidden = !n; $('mineCnt').textContent = n; const u = S.reqs.filter(unread).length; $('reqCnt').hidden = !u; $('reqCnt').textContent = u; document.title = (u ? `(${u}) ` : '') + 'أداء فريق العز'; }
function dealRow(x, bulk, k) {
  const { d, i, p } = x; const late = lateness(d, i); const age = p ? ageOf(d[p + '_at']) : stepAge(d, i);
  const miss = k === 'post' ? platKeys(d).filter(q => !delivered(d, q)).map(q => 'باقي ' + PL[q]).join('، ') : '';
  const sub = [camp(d.campaign_id).name || 'بدون حملة', d.member_id !== S.me.id ? memName(d.member_id) : '', p ? PL[p] + (p === 'sn' ? (d.sn_user ? ' · ' + d.sn_user : '') : (d[p + '_code'] ? ' · ' + d[p + '_code'] : '')) : platText(platKeys(d)), miss, d.decision_reason && d.decision_reason.trim() && k === 'camp_fix' ? 'المطلوب: ' + d.decision_reason : '', k === 'video_fix' && (d.draft_feedback || '').trim() ? 'المطلوب: ' + d.draft_feedback : '', d.price != null ? fmt(d.price) + ' ' + (d.currency || '') : ''].filter(Boolean).join(' · ');
  const apprBtns = k === 'appr' ? `<button class="btn sm" data-dq="needs_edit" data-id="${d.id}" type="button">تعديل</button><button class="btn sm danger" data-dq="reject" data-id="${d.id}" type="button">رفض</button>` : '';
  const au = (k === 'appr' || k === 'draft') ? acctUrls(d, infl(d.influencer_id))[0] : null; const acctBtn = au ? `<a class="btn sm" href="${esc(au[1])}" target="_blank" rel="noopener">الحساب ↗</a>` : '';
  const isLaunch = k === 'launch' || k === 'snap_follow', openBtn = `<button class="btn sm" data-open="${d.id}" type="button">افتح</button>`;
  /* الإجراء الأساسي: الاعتماد الفردي مباشر، «انطلق» مباشر، والباقي يفتح الملف على خطوته */
  const go = k === 'appr' ? `<button class="btn sm go" data-ap1="${d.id}" type="button">اعتماد</button>`
    : isLaunch ? `<button class="btn sm go" data-launch="${p}" data-id="${d.id}" type="button">انطلق</button>`
    : `<button class="btn sm go" data-open="${d.id}" type="button">${GO_LABEL[k] || 'افتح'}</button>`;
  const more = acctBtn + apprBtns + (k === 'appr' || isLaunch ? openBtn : '');
  const ageTag = late === 'late' ? `<span class="pill bad">متأخر · ${dayWord(age)}</span>` : late === 'soon' ? '<span class="pill warn">آخر يوم في المدة</span>' : `<span class="age">${dayWord(age)}</span>`;
  return `<div class="qrow ${late}">${bulk ? `<input type="checkbox" data-bulk="${d.id}" aria-label="تحديد ${esc(d.name)}">` : '<span></span>'}<div><div class="t">${esc(d.name)}</div><div class="sub">${esc(sub)}</div></div><div class="acts">${ageTag}${go}${moreWrap(more, d.name)}</div></div>`;
}
/* البيانات الإلزامية قبل ما ينتقل الملف من مرحلة لمرحلة: المبلغ (0 = مقابل منتج) ومنصة التنزيل.
   اعتماد الاستقطاب مستثنى لأن ما فيه خانة مبلغ في تلك المرحلة. */
const needs = d => { const m = []; if (d.price == null || d.price === '' || isNaN(Number(d.price))) m.push('المبلغ'); if (!platKeys(d).length) m.push('منصة التنزيل'); return m; };
const GO_LABEL = { camp_fix: 'عدّل الترشيح', camp_draft: 'كمّل الترشيح', intake: 'كمّل العنوان', video: 'أرسل المقطع الخام', video_fix: 'أعد إرسال المقطع', draft: 'راجع المقطع', post: 'سجّل النزول', ship_fail: 'تابع التسليم' };
const dayWord = n => n <= 0 ? 'اليوم' : n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوم';
const moreWrap = (html, name) => html ? `<span class="morew"><button class="btn sm icon" data-more type="button" aria-haspopup="true" aria-expanded="false" aria-label="إجراءات أخرى: ${esc(name)}">⋯</button><span class="more">${html}</span></span>` : '';
function inflRow(i) { return `<div class="qrow"><span></span><div><div class="t">${esc(i.name)}</div><div class="sub">${esc([i.acc_type, i.handle ? '@' + i.handle : '', 'رشّحه ' + memName(i.nominated_by), i.acq_reason && i.acq_reason.trim() ? 'المطلوب: ' + i.acq_reason : ''].filter(Boolean).join(' · '))}</div></div><div class="acts"><span class="age">${dayWord(ageOf(i.acq_sent_at || i.created_at))}</span><button class="btn sm go" data-openinfl="${i.id}" type="button">افتح</button>${moreWrap(acctUrls(null, i)[0] ? `<a class="btn sm" href="${esc(acctUrls(null, i)[0][1])}" target="_blank" rel="noopener">الحساب ↗</a>` : '', i.name)}</div></div>`; }
function renderMine() {
  const as = $('mineAs'); let id = S.me.id;
  if (isAdmin()) { const v = as.value || S.me.id; as.innerHTML = `<option value="${S.me.id}">أنا</option><option value="team">ملخص الفريق</option>` + active().filter(m => m.id !== S.me.id).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join(''); as.value = [...as.options].some(o => o.value === v) ? v : S.me.id; id = as.value; }
  if (id === 'team') return renderTeam();
  const G = queuesFor(id); if (id === S.me.id && isAdmin()) { const A = queuesFor('admin'); for (const k in A) G[k] = (G[k] || []).concat(A[k]); }
  const total = Object.entries(G).filter(([k]) => !['park', 'camp_quota', 'acq_contact', 'req_new'].includes(k)).reduce((a, [, v]) => a + v.length, 0);
  $('mineTitle').textContent = id === S.me.id ? 'مهامي' : 'مهام ' + memName(id);
  $('mineSub').textContent = total ? `${total} شي ينتظر خطوة. الأحمر تجاوز المدة.` : 'ما عندك شي معلّق.';
  /* عرض فقط: نفس القوائم ونفس العدّ، مرتبة في أقسام، مع تصفية بالمتأخر وآخر يوم */
  const isLate = x => (x.d && lateness(x.d, x.i) === 'late') || (x.r && x.r.due && x.r.due < today()), isSoon = x => !!(x.d && lateness(x.d, x.i) === 'soon');
  const counted = QO.filter(k => G[k] && !['park', 'camp_quota', 'acq_contact', 'req_new'].includes(k)).flatMap(k => G[k].map(x => ({ ...x, k })));
  const nLate = counted.filter(isLate).length, nSoon = counted.filter(isSoon).length, f = ['late', 'soon'].includes(S.mineF) ? S.mineF : 'all';
  const keep = x => f === 'all' || (f === 'late' ? isLate(x) : isSoon(x));
  const stat = (key, n, label, cls) => `<button class="mstat ${cls}" type="button" data-mf="${key}" aria-pressed="${f === key}"><b>${n}</b>${label}</button>`;
  const bar = total ? `<div class="mbar" role="group" aria-label="ملخص المهام">${stat('all', total, 'تنتظر خطوة', '')}${stat('late', nLate, 'متأخرة', nLate ? 'bad' : '')}${stat('soon', nSoon, 'آخر يوم', nSoon ? 'warn' : '')}</div>` : '';
  const top = f === 'all' ? counted.filter(x => x.d && lateness(x.d, x.i) === 'late').sort((a, b) => stepAge(b.d, b.i) - stepAge(a.d, a.i)).slice(0, 3) : [];
  const start = top.length ? `<h3 class="msec">ابدأ من هنا<small>الأكثر تأخيراً أول. نفس المهام موجودة في قوائمها تحت</small></h3><div class="panel" data-top><div style="display:grid;gap:8px">${top.map(x => dealRow(x, false, x.k)).join('')}</div></div>` : '';
  const SEC = [['يحتاج قرارك', ['members', 'acq_review', 'appr', 'quota_req', 'draft', 'pay', 'req_review']], ['رجع لك للتعديل', ['req_fix', 'acq_fix', 'camp_fix', 'video_fix', 'ship_fail']], ['شغلك الحين', null], ['مسودات وحصص واحتياط', ['camp_quota', 'acq_draft', 'camp_draft', 'park']]];
  const secOf = k => { const i = SEC.findIndex(([, ks]) => ks && ks.includes(k)); return i < 0 ? 2 : i; };
  let lastSec = -1;
  $('mineBody').innerHTML = bar + start + (QO.filter(k => G[k] && G[k].some(keep)).sort((a, b) => secOf(a) - secOf(b)).map(k => {
    const L = G[k].filter(keep), b = BULK[k]; const lateN = L.filter(x => x.d && lateness(x.d, x.i) === 'late').length;
    const head = secOf(k) !== lastSec ? `<h3 class="msec">${SEC[lastSec = secOf(k)][0]}</h3>` : '';
    const xb = `${k.startsWith('ship_') ? '<button class="btn sm" data-shipx type="button">تنزيل كشف الشحن Excel</button><button class="btn sm" data-salx type="button">كشف سلاسل Excel</button>' : ''}${k === 'pay_go' ? '<button class="btn sm" data-payx type="button">تنزيل كشف الدفع للمحدد Excel</button>' : ''}${k === 'snap_follow' ? '<button class="btn sm" data-ziadx type="button">تنزيل شيت التشغيل Excel</button>' : ''}`;
    let rows;
    if (k === 'members') rows = L.map(({ m }) => `<div class="qrow"><span></span><div><div class="t">${esc(m.name || m.email)}</div><div class="sub">${esc(m.email)}</div></div><div class="acts"><a class="btn sm" href="#setup">فعّله من الإعدادات</a></div></div>`).join('');
    else if (k === 'camp_quota') rows = L.map(({ c, left }) => `<div class="qrow"><span></span><div><div class="t">${esc(c.name)}</div><div class="sub">باقي لك ${left} ترشيح</div></div><div class="acts"><button class="btn sm primary" data-nom="${c.id}" type="button">رشّح</button></div></div>`).join('');
    else if (L[0].i && L[0].i.acq_status !== undefined && !L[0].d) rows = L.map(x => inflRow(x.i)).join('');
    else if (L[0].r) rows = L.map(x => reqRow(x.r)).join('');
    else if (k === 'appr') { const byB = {}; L.forEach(x => (byB[(x.d.batch_id || x.d.id)] = byB[(x.d.batch_id || x.d.id)] || []).push(x)); rows = Object.values(byB).map(g => `<div class="note"><b>${esc(camp(g[0].d.campaign_id).name)}</b> · من ${esc(memName(g[0].d.member_id))} · ${g.length} ترشيح · أُرسلت ${dShort(g[0].d.sent_at)}</div>` + g.map(x => dealRow(x, true, k)).join('')).join(''); }
    else rows = L.map(x => dealRow(x, !!b, k)).join('');
    return head + `<div class="panel" data-g="${k}"><div class="qhead"><h3>${QL[k]}</h3><span class="num">${L.length}</span>${lateN ? `<span class="pill bad">${lateN} متأخر</span>` : ''}${b || xb ? `<span style="margin-inline-start:auto" class="row">${xb}${b ? `<label class="check small"><input type="checkbox" data-all> الكل</label><button class="btn sm primary" data-dobulk="${k}" type="button">${b[0]} للمحدد</button>` : ''}</span>` : ''}</div>${k === 'park' ? `<details><summary class="small muted" style="cursor:pointer">اعرض القائمة</summary><div style="display:grid;gap:8px;margin-top:8px">${rows}</div></details>` : `<div style="display:grid;gap:8px">${rows}</div>`}</div>`;
  }).join('') || (f === 'all' ? '<div class="empty">ما عندك شي معلّق الحين. ابدأ من «+ ترشيح» أو اطلب شي من زميل من «+ طلب».</div>' : '<div class="empty">ما فيه مهام بهذي التصفية. اضغط «تنتظر خطوة» عشان ترجع كل مهامك.</div>'));
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
  return saveDeal(d.id, kind === 'reject' ? { approval: 'rejected', decision_reason: r.trim(), approved_by: S.me.id, approved_at: null, closed_reason: 'رفضه ' + memName(S.me.id) } : { approval: 'needs_edit', decision_reason: r.trim(), approved_by: S.me.id, sent_at: null });
}
$('mineBody').addEventListener('click', async e => {
  const o = e.target.closest('[data-open]'); if (o) return openDeal(o.dataset.open);
  const rq = e.target.closest('[data-req]'); if (rq) return openReq(rq.dataset.req);
  const nb = e.target.closest('[data-nom]'); if (nb) return openCampNom(nb.dataset.nom);
  const as = e.target.closest('[data-as]'); if (as) { $('mineAs').value = as.dataset.as; return renderMine(); }
  const mf = e.target.closest('[data-mf]'); if (mf) { S.mineF = S.mineF === mf.dataset.mf ? 'all' : mf.dataset.mf; return renderMine(); }
  const a1 = e.target.closest('[data-ap1]'); if (a1) { if (a1.disabled) return; const d = S.deals.find(x => x.id === a1.dataset.ap1); if (!d) return;
    const miss = needs(d); if (miss.length) return toast(`ما ينعتمد وهو ناقص: ${miss.join('، ')}. رجّعه بـ«تعديل»`, true);
    const lbl = a1.textContent; a1.disabled = true; a1.setAttribute('aria-busy', 'true'); a1.textContent = 'جاري الحفظ…';
    const r = await saveDeal(d.id, BULK.appr[1](d));
    if (r) { toast('تم اعتماد ' + d.name); render(); } else if (document.contains(a1)) { a1.disabled = false; a1.removeAttribute('aria-busy'); a1.textContent = lbl; }
    return; }
  const dq = e.target.closest('[data-dq]'); if (dq) { const d = S.deals.find(x => x.id === dq.dataset.id); if (d && await decideDeal(d, dq.dataset.dq)) { toast('انحفظ القرار'); render(); } return; }
  const ln = e.target.closest('[data-launch]'); if (ln) { const d = S.deals.find(x => x.id === ln.dataset.id); ln.disabled = true; if (d && await launchPlat(d, ln.dataset.launch)) { toast('انسجّل التشغيل'); render(); } return; }
  const all = e.target.closest('[data-all]'); if (all) { all.closest('[data-g]').querySelectorAll('[data-bulk]').forEach(c => c.checked = all.checked); return; }
  const b = e.target.closest('[data-dobulk]'); if (b) {
    const k = b.dataset.dobulk; const ids = [...b.closest('[data-g]').querySelectorAll('[data-bulk]:checked')].map(c => c.dataset.bulk);
    if (!ids.length) return toast('حدّد ملف واحد على الأقل', true);
    if (['appr', 'pay', 'pay_go'].includes(k)) { const bad = ids.map(id => S.deals.find(x => x.id === id)).filter(d => d && (k === 'appr' ? needs(d).length : needs(d).includes('المبلغ'))); if (bad.length) return toast(`ما يكمل «${BULK[k][0]}»: المبلغ أو المنصة ناقصة في ${bad.map(d => d.name).join('، ')}. ${k === 'appr' ? 'رجّعها للتعديل أو شيل تحديدها' : 'اكتب المبلغ في الملف أول'}`, true); }
    if (!await confirmBox(`${BULK[k][0]}: ${ids.length} ملف؟`)) return;
    b.disabled = true; let ok = 0; for (const id of ids) { const d = S.deals.find(x => x.id === id); if (d && await saveDeal(id, BULK[k][1](d))) ok++; }
    toast(`تحدّث ${ok} ملف`); render();
  }
});

/* كشف الشحن: كل اللي في مرحلة الشحن (جاهز، في الطريق، تعذّر) ببيانات المستلم والحملة والمنتج */
function shipSheet() {
  const dt = t => t ? dtX(t) : '';
  const L = S.deals.filter(d => inPipe(d) && !isClosed(d) && !isParked(d) && d.approval === 'approved' && curStep(d) === SI.ship).sort((a, b) => new Date(a.approved_at || a.created_at) - new Date(b.approved_at || b.created_at));
  if (!L.length) return toast('ما فيه شحنات مفتوحة الحين', true);
  const rows = L.map((d, n) => ({ 'م': n + 1, 'الحالة': d.ship_failed_at ? 'تعذّر التسليم' : d.shipped_at ? 'انشحن (في الطريق)' : 'جاهز للشحن', 'المؤثر': d.name, 'اسم المستلم': d.rcv_name || d.name, 'جوال المستلم': d.rcv_phone || d.phone, 'الدولة': d.country, 'المدينة': d.rcv_city, 'الحي والرمز المختصر': [d.address, d.short_code].filter(Boolean).join(' – '), 'الحملة': camp(d.campaign_id).name || '', 'المنتج': camp(d.campaign_id).product || '', 'صانع المحتوى': memName(d.member_id), 'تاريخ الاعتماد': dt(d.approved_at), 'تاريخ الشحن': dt(d.shipped_at), 'شركة الشحن': d.ship_company, 'رقم البوليصة': d.tracking, 'ملاحظة الشحن': d.ship_note }));
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(40, k.length + 6)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'كشف الشحن'); XLSX.writeFile(wb, `كشف الشحن ${today()}.xlsx`);
}
/* كشف الدفع: كل اللي نزل محتواه وما اندفع — للمالية */
function paySheet(ids) {
  const dt = t => t ? dtX(t) : '';
  if (!ids || !ids.length) return toast('حدّد بالمربعات الملفات اللي تبي تنزّلها في الكشف', true);
  /* الكشف للمالية: المحدد فقط، وبشرط إن عبدالمحسن اعتمد دفعه وما اندفع */
  const L = S.deals.filter(d => ids.includes(d.id) && d.pay_ok_at && d.approval === 'approved' && allDelivered(d) && !d.paid_at && !d.no_pay && !isClosed(d)).sort((a, b) => new Date(a.posted_at || a.updated_at) - new Date(b.posted_at || b.updated_at));
  if (!L.length) return toast('المحدد ما فيه شي معتمد للدفع', true);
  const noAmt = L.filter(d => needs(d).includes('المبلغ')); if (noAmt.length) return toast(`ما ينزل الكشف: المبلغ ناقص في ${noAmt.map(d => d.name).join('، ')}`, true);
  const rows = L.map((d, n) => ({ 'م': n + 1, 'الحالة': d.pay_ok_at ? 'معتمد للدفع' : 'ينتظر موافقة عبدالمحسن', 'المؤثر': d.name, 'اليوزر': d.handle, 'جوال المؤثر': d.phone || d.rcv_phone, 'الحملة': camp(d.campaign_id).name || '', 'صانع المحتوى': memName(d.member_id), 'المنصات': platText(platKeys(d)), 'المبلغ': d.price, 'العملة': d.currency || 'SAR', 'نزل المحتوى': dt(d.posted_at || d.tt_at || d.sn_at || d.ig_at), 'اعتماد الدفع': dt(d.pay_ok_at), 'ملاحظات': d.notes || '' }));
  const tot = L.reduce((s, d) => s + (Number(d.price) || 0), 0);
  rows.push({ 'م': '', 'الحالة': 'الإجمالي', 'المؤثر': '', 'اليوزر': '', 'جوال المؤثر': '', 'الحملة': '', 'صانع المحتوى': '', 'المنصات': '', 'المبلغ': tot, 'العملة': 'SAR', 'نزل المحتوى': '', 'اعتماد الدفع': '', 'ملاحظات': '' });
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(40, k.length + 8)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'كشف الدفع'); XLSX.writeFile(wb, `كشف الدفع ${today()}.xlsx`);
}
/* كشف سلاسل: الجاهز للشحن بصيغة ملف الرفع الجماعي حق شركة الشحن (نفس أعمدة SINV) */
function salasilSheet() {
  const L = S.deals.filter(d => inPipe(d) && !isClosed(d) && !isParked(d) && d.approval === 'approved' && curStep(d) === SI.ship && !d.shipped_at).sort((a, b) => new Date(a.approved_at || a.created_at) - new Date(b.approved_at || b.created_at));
  if (!L.length) return toast('ما فيه شحنات جاهزة للرفع الحين', true);
  const base = 'INF' + today().replace(/-/g, '');
  const rows = L.map((d, n) => ({ orderNum: `${base}-${n + 1}`, Shipping_Method: '', phone: ph9(d.rcv_phone || d.phone) || '', name: d.rcv_name || d.name, address: [d.address, d.short_code].filter(Boolean).join('-'), city: d.rcv_city || '', state: d.rcv_city || '', zip: '0', country: d.country === 'السعودية' || !d.country ? 'SA' : d.country, cod: '0', sku: camp(d.campaign_id).product || camp(d.campaign_id).name || '', QTY: '1' }));
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'ALEZZ'); XLSX.writeFile(wb, `كشف سلاسل ${today()}.xlsx`);
}
/* شيت التشغيل لزياد: نفس أعمدة Content Tracker — السيريال (كود الفيديو) وأسماء الإعلانات يولدها الشيت نفسه */
const CAMP_EN = { 'هيرش سيطرة': 'Hersh Saytara', 'سطوة القرن': 'Satwat AlQarn', 'هيرش فاير': 'Hersh Fire', 'هيرش محور': 'Hersh Mhwar', 'هيرش': 'Hersh' };
function ziadSheet() {
  const dd = t => t ? new Date(t).toLocaleDateString('en-GB', { timeZone: TZ }) : '';
  const L = S.deals.filter(d => d.approval === 'approved' && !isClosed(d) && platKeys(d).some(p => delivered(d, p))).sort((a, b) => new Date(a.posted_at || a.tt_at || a.sn_at || a.ig_at || 0) - new Date(b.posted_at || b.tt_at || b.sn_at || b.ig_at || 0));
  if (!L.length) return toast('ما فيه محتوى نازل للحين', true);
  const rows = L.map(d => { const cn = camp(d.campaign_id).name || '';
    return { 'اسم المنتج أو العرض': CAMP_EN[cn] || cn, 'صانع المحتوى': d.name, 'اسم صانع المحتوى بالإنجليزي': '', 'Content Type': 'Review', 'تصنيف صانع المحتوى': 'Influencer', 'رابط الفيديو على السوشيال': d.post_url || (d.handle ? 'https://www.tiktok.com/@' + d.handle : ''), 'الفيديو': '', 'TikTok | كود الترويج': d.tt_code || '', 'Meta | كود الترويج': d.ig_code || '', 'Snapchat | كود الترويج': d.sn_code || d.sn_user || '', 'كود الفيديو': '', 'تاريخ إضافة الفيديو': dd(d.posted_at || d.tt_at || d.sn_at || d.ig_at) }; });
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(14, Math.min(34, k.length + 8)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'شيت التشغيل'); XLSX.writeFile(wb, `شيت التشغيل ${today()}.xlsx`);
}
$('mineBody').addEventListener('click', e => { if (e.target.closest('[data-shipx]')) shipSheet(); if (e.target.closest('[data-salx]')) salasilSheet(); const px = e.target.closest('[data-payx]'); if (px) paySheet([...px.closest('[data-g]').querySelectorAll('[data-bulk]:checked')].map(c => c.dataset.bulk)); if (e.target.closest('[data-ziadx]')) ziadSheet(); });

/* ================= ملف المشاركة في الحملة ================= */
function stepPill(d) { const i = curStep(d); if (d.approval === 'rejected') return '<span class="pill bad">مرفوض</span>'; if (i < 0) return `<span class="pill bad">مغلق</span>`; if (d.approval === 'needs_edit') return '<span class="pill warn">يحتاج تعديل</span>'; if (!d.sent_at && d.approval === 'pending') return '<span class="pill">مسودة</span>'; if (isParked(d)) return '<span class="pill acc">احتياط</span>'; if (i >= STEPS.length) return '<span class="pill good">اكتمل</span>'; const l = lateness(d, i); return `<span class="pill ${l === 'late' ? 'bad' : l === 'soon' ? 'warn' : ''}">${STEPS[i].n}${i === SI.video && draftPending(d) ? ` (عند ${esc(apprFor(d.member_id))})` : ''}${d.ship_failed_at && !d.delivered_at ? ' (تعذّر)' : ''}</span>`; }
function openDeal(id) {
  const d = S.deals.find(x => x.id === id); if (!d) return;
  const i = curStep(d), me = S.me.id, adm = isAdmin(), appr = isApprover() && (d.member_id !== me || adm), mine = d.member_id === me || adm;
  const ship = hasRole(me, 'shipper'), media = hasRole(me, 'media') || hasRole(me, 'snap');
  const keys = platKeys(d); const I = infl(d.influencer_id);
  const stepper = `<div class="stepper">${STEPS.map((s, j) => `<div class="st ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}"><b></b><span>${s.n}</span></div>`).join('')}</div>`;
  const secWho = j => STEPS[j].k === 'appr' ? apprFor(d.member_id) : STEPS[j].k === 'video' ? 'صانع المحتوى + ' + apprFor(d.member_id) : stepWho(STEPS[j]);
  const sec = (j, body, meta) => `<details class="sec ${j < i || i === STEPS.length ? 'd' : j === i ? 'c' : ''}" ${j === i ? 'open' : ''}><summary><span class="idx">${j + 1}</span><span class="ttl">${STEPS[j].n} <span class="muted small">· ${esc(secWho(j))}</span></span><span class="meta">${meta || ''}</span></summary><div class="body">${j === i ? `<div class="note small"><b>وش بعد؟</b> ${NEXT[STEPS[j].k]}</div>` : ''}${body}</div></details>`;
  const v = k => esc(d[k] ?? '');
  const link = intakeLink(d);
  const waIntake = waLink(d.phone || d.rcv_phone, `هلا ${d.name}، نورتنا 🌹 عبّ بياناتك للشحن والتحويل من هذا الرابط: ${link}`);
  const platCard = p => `<div class="card ${delivered(d, p) ? 'ok' : ''}"><div class="hd"><b>${PL[p]}</b>${delivered(d, p) ? `<span class="pill good">نزل ${dShort(d[p + '_at'])}</span>` : '<span class="pill">ما نزل</span>'}${launched(d, p) ? `<span class="pill good">انطلق ${dShort(d[p + '_live_at'])}</span>` : ''}</div>
     <div class="grid2">${p === 'sn' ? `<div class="field"><label>يوزر سناب شات *</label><input type="text" id="f_sn_user" dir="ltr" value="${v('sn_user')}"></div><div class="field"><label>رابط أو كود سناب (اختياري)</label><input type="text" id="f_sn_code" dir="ltr" value="${v('sn_code')}"></div>`
       : `<div class="field"><label>كود ${PL[p]} ${p === 'tt' ? '(Spark Code)' : ''} *</label><input type="text" id="f_${p}_code" dir="ltr" value="${v(p + '_code')}"></div>`}</div>
     <div class="row">${mine && !delivered(d, p) ? (d.video_ok_at || adm ? `<button class="btn good sm" data-act="dl_${p}" type="button">نزل على ${PL[p]} اليوم</button>` : '<span class="muted small">ينفتح بعد اعتماد المقطع الخام</span>') : ''}${mine && delivered(d, p) ? `<button class="btn sm" data-act="code_${p}" type="button">حفظ التعديل</button>` : ''}${media && delivered(d, p) && !launched(d, p) ? `<button class="btn sm primary" data-act="lv_${p}" type="button">انطلق الإعلان</button>` : ''}
       ${delivered(d, p) ? `<div class="copybox" style="flex:1"><code>${esc(adNameFor(d, p))}</code><button class="btn sm" data-copy="${esc(adNameFor(d, p))}" type="button">نسخ التسمية</button></div>` : ''}</div></div>`;
  modal(`<div class="row between"><div><h2>${esc(d.name)}</h2><div class="muted small">${esc([camp(d.campaign_id).name, memName(d.member_id), platText(keys), d.ad_type, d.handle ? '@' + d.handle : ''].filter(Boolean).join(' · '))}</div></div><div class="row">${I ? `<button class="btn sm" data-openinfl="${I.id}" type="button">ملف المؤثر</button>` : ''}<button class="btn" id="dClose" type="button">إغلاق</button></div></div>
  ${acctLinks(d, I) ? `<div class="row">${acctLinks(d, I)}</div>` : ''}
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
   ${mine ? `<div class="row"><button class="btn" data-act="save0" type="button">حفظ</button>${(!d.sent_at && d.approval === 'pending') || d.approval === 'needs_edit' ? `<button class="btn primary" data-act="send" type="button">${d.approval === 'needs_edit' ? 'أعد الإرسال للاعتماد' : 'أرسل للاعتماد'} (${esc(apprFor(d.member_id))})</button>` : ''}</div>` : ''}`, d.sent_at ? 'أُرسل ' + dShort(d.sent_at) : 'مسودة')}
  ${sec(1, appr && (d.approval === 'pending' && d.sent_at || d.approval === 'backup') ? `<div class="row"><button class="btn good" data-act="approve" type="button">اعتماد</button><button class="btn" data-act="needs_edit" type="button">يحتاج تعديل</button><button class="btn" data-act="backup" type="button">احتياط</button><button class="btn danger" data-act="reject" type="button">رفض</button></div>` : `<div class="muted">${d.approval === 'approved' ? 'معتمد من ' + esc(memName(d.approved_by)) : d.approval === 'pending' ? 'بانتظار ' + esc(apprFor(d.member_id)) : esc(d.approval)}</div>`, d.approval === 'approved' ? 'معتمد ' + dShort(d.approved_at) : '')}
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
  ${sec(3, `<div class="grid3"><div class="field"><label for="f_ship_company">شركة الشحن</label><input type="text" id="f_ship_company" list="dlShip" value="${v('ship_company')}" placeholder="اختر أو اكتب"><datalist id="dlShip">${SHIP_COS.map(x => `<option>${x}</option>`).join('')}</datalist></div><div class="field"><label for="f_tracking">رقم البوليصة</label><input type="text" id="f_tracking" dir="ltr" value="${v('tracking')}"></div><div class="field"><label for="f_ship_note">ملاحظة الشحن</label><input type="text" id="f_ship_note" value="${v('ship_note')}"></div></div>
   ${ship || adm ? `<div class="row"><button class="btn" data-act="shipped" type="button">${d.shipped_at ? 'انشحن ' + dShort(d.shipped_at) : 'انشحن اليوم'}</button><button class="btn good" data-act="delivered" type="button">${d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : 'وصل اليوم'}</button><button class="btn danger" data-act="failed" type="button">${d.ship_failed_at ? 'تعذّر ' + dShort(d.ship_failed_at) : 'تعذّر التسليم'}</button></div>` : `<div class="muted small">${d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : d.shipped_at ? 'انشحن ' + dShort(d.shipped_at) : 'عند صقر'}</div>`}`, d.delivered_at ? 'وصل ' + dShort(d.delivered_at) : d.ship_failed_at ? 'تعذّر' : d.shipped_at ? 'في الطريق' : '')}
  ${sec(4, `<div class="card ${d.video_ok_at ? 'ok' : draftPending(d) ? 'part' : ''}"><div class="hd"><b>أولاً: مراجعة المقطع الخام</b>${d.video_ok_at ? `<span class="pill good">معتمد ${dShort(d.video_ok_at)}</span>` : draftPending(d) ? `<span class="pill acc">عند ${esc(apprFor(d.member_id))} للمراجعة من ${dShort(d.draft_at)}</span>` : '<span class="pill">ما انرسل للمراجعة</span>'}${d.rounds ? `<span class="pill warn">${d.rounds} جولة تعديل</span>` : ''}</div>
     ${!d.video_ok_at && !draftPending(d) && d.rounds && (d.draft_feedback || '').trim() ? `<div class="dup"><b>المطلوب تعديله في المقطع:</b> ${esc(d.draft_feedback)}</div>` : ''}
     <div ${mine && !d.video_ok_at && !draftPending(d) ? '' : 'inert'} style="display:grid;gap:12px">
      <div class="field"><label for="f_draft_url">رابط المقطع الخام (قوقل درايف أو أي رابط يفتح) *</label><input type="url" id="f_draft_url" dir="ltr" value="${v('draft_url')}" placeholder="https://drive.google.com/..."></div>
      <div class="field"><label for="f_draft_note">ملاحظاتك على المقطع (وش أعجبك، وش تشوف يتعدّل)</label><textarea id="f_draft_note">${v('draft_note')}</textarea></div></div>
     <div class="row">${safeUrl(d.draft_url) ? `<a class="btn sm" href="${esc(safeUrl(d.draft_url))}" target="_blank" rel="noopener">افتح المقطع الخام ↗</a>` : ''}${mine && !draftPending(d) && !d.video_ok_at && !allDelivered(d) ? `<button class="btn sm primary" data-act="draft" type="button">${d.rounds ? 'أعد إرسال المقطع للمراجعة' : 'أرسل المقطع للمراجعة'}</button>` : ''}${appr && draftPending(d) ? '<button class="btn sm good" data-act="vok" type="button">اعتماد المقطع</button><button class="btn sm danger" data-act="vfix" type="button">يرجع للتعديل</button>' : ''}</div></div>
   <div class="field"><label for="f_post_url">رابط المقطع على تيك توك (بعد النشر)</label><input type="url" id="f_post_url" dir="ltr" value="${v('post_url')}"></div>
   <div class="muted small">ثانياً: بعد اعتماد المقطع، سجّل النزول والكود لكل منصة. كل منصة لها تسليم مستقل. أول ما تنزل منصة، تروح للميديا باير يشغّلها، حتى لو الباقي ما نزل.</div>
   <div style="display:grid;gap:10px">${keys.map(platCard).join('') || '<div class="muted">حدّد منصة التنزيل في المرحلة 1.</div>'}</div>`, allDelivered(d) ? 'نزل على كل المنصات' : keys.filter(p => delivered(d, p)).map(p => PL[p]).join('، '))}
  ${sec(5, `<div class="muted small">التشغيل لكل منصة من بطاقتها فوق. هنا الملخص.</div><div class="row">${keys.map(p => `<span class="pill ${launched(d, p) ? 'good' : delivered(d, p) ? 'warn' : ''}">${PL[p]}: ${launched(d, p) ? 'انطلق' : delivered(d, p) ? 'ينتظر التشغيل' : 'ما نزل'}</span>`).join('')}</div>`, allLaunched(d) ? 'انطلق كله' : '')}
  <div class="row between"><div class="row">${d.no_pay ? '' : d.paid_at ? (adm ? `<button class="btn sm" data-act="paid" type="button">دُفع ${dShort(d.paid_at)} (اضغط للتراجع)</button>` : `<span class="pill good">دُفع ${dShort(d.paid_at)}</span>`) : d.pay_ok_at ? `<span class="pill acc">الدفع معتمد من ${esc(memName(d.pay_ok_by))} ${dShort(d.pay_ok_at)}</span>${adm || isApprover() ? '<button class="btn sm good" data-act="paid" type="button">تم الدفع</button>' : ''}` : adm ? '<button class="btn sm" data-act="payok" type="button">اعتماد الدفع</button>' : allDelivered(d) ? '<span class="muted small">الدفع بعد موافقة عبدالمحسن</span>' : ''}</div>
   ${!isClosed(d) ? (mine ? '<button class="btn sm danger" data-act="close" type="button">إغلاق الملف (ما رد / ألغي)</button>' : '') : (adm || appr ? '<button class="btn sm" data-act="reopen" type="button">إعادة فتح</button>' : '')}</div>`, root => {
    $('dClose').onclick = closeModal;
    if (adm) renderBank(d);
    const val = k => { const e = $('f_' + k); return e.type === 'checkbox' ? e.checked : e.type === 'number' ? (e.value === '' ? null : Number(e.value)) : e.value.trim(); };
    const pick = ks => Object.fromEntries(ks.map(k => [k, val(k)]));
    const base = () => ({ ...pick(['name', 'acc_type', 'price', 'ad_type', 'hook', 'notes']), planned_date: val('planned_date') || null, platform: platText(readPlats(root, 'd')) });
    const dl = p => { const ch = { [p + '_at']: nowIso() }; if (p === 'sn') { ch.sn_user = val('sn_user'); ch.sn_code = val('sn_code'); if (!ch.sn_user) { toast('اكتب يوزر سناب', true); return null; } } else { ch[p + '_code'] = val(p + '_code'); if (!ch[p + '_code']) { toast('اكتب الكود', true); return null; } } if (p === 'tt' && val('post_url')) ch.post_url = val('post_url'); if (allDelivered({ ...d, ...ch })) Object.assign(ch, { posted_at: nowIso(), video_ok_at: d.video_ok_at || nowIso() }); return ch; };
    const A = {
      save0: base,
      send: () => { const b = base(); if (!b.platform) { toast('حدّد منصة التنزيل', true); return null; } if (b.price == null) { toast('اكتب المبلغ قبل الإرسال. إذا مقابل منتج اكتب 0', true); return null; } if (!b.name) { toast('اكتب اسم المؤثر', true); return null; } return { ...b, sent_at: nowIso(), approval: 'pending', decision_reason: '' }; },
      approve: () => { const m = needs(d); if (m.length) { toast(`ما ينعتمد وهو ناقص: ${m.join('، ')}. رجّعه بـ«يحتاج تعديل»`, true); return null; } return { approval: 'approved', approved_at: nowIso(), approved_by: me, decision_reason: '' }; },
      backup: () => ({ approval: 'backup' }),
      addr: () => { const p = normPhone(val('rcv_phone')); if (val('rcv_phone') && p === null) { toast('رقم الجوال مو صحيح', true); return null; } return { ...pick(['rcv_name', 'rcv_city', 'address', 'country']), rcv_phone: p || '' }; },
      flags: () => pick(['no_ship', 'no_pay']),
      shipped: () => ({ ship_company: val('ship_company'), tracking: val('tracking'), ship_note: val('ship_note'), shipped_at: d.shipped_at || nowIso(), ship_failed_at: null }),
      delivered: () => ({ ship_company: val('ship_company'), tracking: val('tracking'), ship_note: val('ship_note'), shipped_at: d.shipped_at || nowIso(), delivered_at: d.delivered_at || nowIso(), ship_failed_at: null }),
      failed: () => { if (!val('ship_note')) { toast('اكتب سبب تعذّر التسليم في «ملاحظة الشحن»', true); return null; } return { ship_note: val('ship_note'), ship_failed_at: nowIso() }; },
      draft: () => { if (!safeUrl(val('draft_url'))) { toast('حط رابط المقطع الخام (يبدأ بـ https)', true); return null; } return { draft_url: val('draft_url'), draft_note: val('draft_note'), draft_at: nowIso() }; },
      vok: () => ({ video_ok_at: nowIso(), draft_feedback: '' }),
      paid: () => { if (!d.paid_at && needs(d).includes('المبلغ')) { toast('اكتب المبلغ في قسم الترشيح قبل تسجيل الدفع', true); return null; } return { paid_at: d.paid_at ? null : nowIso() }; },
      payok: () => { if (needs(d).includes('المبلغ')) { toast('اكتب المبلغ في قسم الترشيح قبل اعتماد الدفع', true); return null; } return { pay_ok_at: nowIso(), pay_ok_by: me }; },
      close: () => ({ closed_at: nowIso(), closed_reason: 'ما رد / ألغي' }),
      reopen: () => ({ closed_at: null, closed_reason: '', approval: d.approval === 'rejected' ? 'pending' : d.approval, sent_at: d.approval === 'rejected' ? null : d.sent_at })
    };
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; let ch;
      if (a === 'reject' || a === 'needs_edit') { b.disabled = true; const r = await decideDeal(d, a); b.disabled = false; if (r) { toast('انحفظ القرار — رجعت لصانع المحتوى مع السبب في «مهامي» حقته'); openDeal(d.id); } return; }
      if (a.startsWith('lv_')) { b.disabled = true; if (await launchPlat(d, a.slice(3))) { toast('انسجّل التشغيل ✓ — الملف يكتمل بعد تشغيل كل المنصات'); openDeal(d.id); } return; }
      if (a === 'vfix') { const why = await reasonBox('وش المطلوب يتعدّل في المقطع؟', true); if (why == null) return; b.disabled = true; const r = await saveDeal(d.id, { draft_at: null, rounds: (d.rounds || 0) + 1, draft_feedback: why.trim() }); b.disabled = false; if (r) { toast('رجع لصانع المحتوى مع ملاحظتك'); openDeal(d.id); } return; }
      if (a.startsWith('dl_')) ch = dl(a.slice(3));
      else if (a.startsWith('code_')) { const p = a.slice(5); ch = p === 'sn' ? { sn_user: val('sn_user'), sn_code: val('sn_code') } : { [p + '_code']: val(p + '_code') }; }
      else ch = A[a]();
      if (!ch) return;
      if (a === 'close' && !await confirmBox('تأكيد إغلاق الملف؟')) return;
      if (a === 'shipped' && !d.shipped_at && !await confirmBox(`تسجّل إن شحنة ${d.name} انشحنت اليوم؟`)) return;
      if (a === 'delivered' && !d.delivered_at && !await confirmBox(`تسجّل إن شحنة ${d.name} وصلت اليوم؟`)) return;
      b.disabled = true; const r = await saveDeal(d.id, ch); b.disabled = false;
      if (r) {
        const AM = {
          send: `انرسلت للاعتماد ✓ — بتظهر عند ${apprFor(d.member_id)} في «مهامي»، وأول ما يقرر يرجع لك الرد في «مهامي» حقتك`,
          approve: 'انعتمدت ✓ — رجعت لصانع المحتوى في «مهامي»: يكمّل العنوان أو يرسل رابط البيانات للمؤثر',
          backup: 'انحفظت كاحتياط — تلاقيها في «مهامي» تحت «احتياط» متى ما احتجتها',
          addr: 'انحفظ العنوان — أول ما يكتمل (جوال + مدينة + حي) تنتقل تلقائياً لصقر في «جاهزة للشحن»',
          shipped: 'انسجّل الشحن ✓ — تابعها في «في الطريق: سجّل الوصول»',
          delivered: 'انسجّل الوصول ✓ — رجعت لصانع المحتوى في «مهامي»: «وصله المنتج، أرسل المقطع الخام»',
          failed: 'انسجّل تعذّر التسليم — بتظهر للشحن وصانع المحتوى للمتابعة',
          draft: `انرسل المقطع الخام ✓ — بيظهر عند ${apprFor(d.member_id)} في «مقاطع خام تنتظر اعتمادك»، وأول ما يعتمده تنفتح لك خانات النزول`,
          vok: 'انعتمد المقطع ✓ — رجع لصانع المحتوى في «مهامي» عشان ينزّله ويسجّل الكود لكل منصة',
          payok: 'اعتمدت الدفع ✓ — انتقلت لمتعب في «معتمدة للدفع»: ينزّل الكشف ويرسله للمالية',
          paid: d.paid_at ? 'ترجّع عن تسجيل الدفع' : 'انسجّل الدفع ✓ — اكتمل الملف مالياً'
        };
        toast(AM[a] || (a.startsWith('dl_') ? 'انسجّل النزول ✓ — راحت للميديا باير للتشغيل، وتطلع لزياد في شيت التشغيل' : 'انحفظ'));
        openDeal(d.id);
      }
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
  $('board').innerHTML = STEPS.map((s, i) => { const L = open.filter(d => curStep(d) === i), late = L.filter(d => lateness(d, i) === 'late').length; return `<button class="col${S.pStep === s.k ? ' on' : ''}" data-col="${s.k}" type="button"><span class="k">${i + 1}</span><span class="nm">${s.n}</span><span class="small muted">${esc(stepWho(s))}</span><span class="n">${L.length}</span><span class="small" style="color:var(--bad)">${late ? late + ' متأخر' : '&nbsp;'}</span></button>`; }).join('')
    + `<button class="col${S.pStep === 'done' ? ' on' : ''}" data-col="done" type="button"><span class="k">✓</span><span class="nm">اكتمل</span><span class="small muted">&nbsp;</span><span class="n">${open.filter(d => curStep(d) === STEPS.length).length}</span><span class="small">&nbsp;</span></button>`;
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
const EV = { created: 'أنشأ الطلب', edit: 'عدّل الطلب', start: 'بدأ التنفيذ', deliver: 'سلّم', fix: 'طلب تعديل', approve: 'اعتمد التسليم', cancel: 'ألغى الطلب', reopen: 'أعاد فتح الطلب للتعديل', comment: 'ردّ', quota_ok: 'وافق وزاد الحصة', quota_no: 'رفض الطلب' };
const EV_CLS = { deliver: 'good', approve: 'good', quota_ok: 'good', fix: 'bad', reopen: 'bad', quota_no: 'bad', edit: 'warn', comment: 'acc', created: 'acc' };
const RES_HINT = { design: 'حط رابط التصميم (درايف أو كانفا) واكتب أي ملاحظة.', ad: 'اكتب اسم الإعلان أو الحملة في مدير الإعلانات، والمنصة، ووقت التشغيل. ولو عندك رابط حطه.', snap: 'اكتب وش سوّيت (مثلاً: تواصلت مع المشهور واتفقنا على موعد النشر) وحط الرابط لو فيه.', ship: 'اكتب رقم الشحنة أو شركة الشحن وأي ملاحظة.', social: 'حط رابط المنشور أو المحتوى وأي ملاحظة.', other: 'اكتب وش سوّيت، وحط رابط لو فيه (ملف، صورة، منشور).' };
const DET_HINT = { design: 'وش التصميم؟ لمين؟ النص اللي ينكتب عليه، الألوان أو الستايل، وأي شي لازم يكون موجود.', ad: 'وش الإعلان؟ أي منصة؟ الميزانية والمدة، والجمهور، والمحتوى أو الكود المستخدم.', snap: 'مين المشهور؟ وش المطلوب منه؟ والموعد.', ship: 'وش ينشحن؟ لمين؟ والعنوان.', social: 'وش المنشور؟ أي منصة؟ النص والموعد.', other: 'اكتب المطلوب بالضبط، وكيف تعرف إنه خلص.' };
const links = s => ((s || '').match(/https?:\/\/[^\s<>"']+/g) || []);
const tms = t => t ? new Date(t).getTime() : 0;
const ago = t => { const m = (Date.now() - tms(t)) / 6e4; return m < 1 ? 'الحين' : m < 60 ? `قبل ${Math.round(m)} دقيقة` : m < 1440 ? `قبل ${Math.round(m / 60)} ساعة` : `قبل ${Math.round(m / 1440)} يوم`; };
const linkify = s => esc(s || '').replace(/https?:\/\/[^\s<>"']+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`);
const involved = r => r.to_member === S.me.id || r.from_member === S.me.id || (r.kind === 'quota' && !r.to_member && isApprover());
const unread = r => !!(r.last_event_at && r.last_event_by && r.last_event_by !== S.me.id && involved(r) && tms(S.reads[r.id]) < tms(r.last_event_at));
const lastLine = r => r.last_event_at ? `${memName(r.last_event_by)} ${EV[r.last_event_type] || ''} · ${dtFull(r.last_event_at)} (${ago(r.last_event_at)})` : '';
async function markRead(r) { if (S.noEv) return; const t = new Date(Math.max(Date.now(), tms(r.last_event_at))).toISOString(); S.reads[r.id] = t; S.notified[r.id] = r.last_event_at; await sb.from('request_reads').upsert({ request_id: r.id, member_id: S.me.id, seen_at: t }); updateMineCount(); }
async function addEv(r, type, body) {
  if (S.noEv) return { created_at: nowIso() };
  const { data: e, error } = await sb.from('request_events').insert({ request_id: r.id, member_id: S.me.id, type, body: body || '' }).select().single();
  if (error) { if (/request_events|relation|schema cache/i.test(error.message)) { S.noEv = true; console.warn('تحديث قاعدة البيانات 003 ما انشغّل'); return { created_at: nowIso() }; } toast(friendly(error), true); return null; }
  if (e) { Object.assign(r, { last_event_at: e.created_at, last_event_by: S.me.id, last_event_type: type }); await markRead(r); }
  return e;
}
async function reqAct(r, ch, type, body) { const x = ch ? await saveReq(r.id, ch) : r; if (!x) return null; await addEv(x, type, body); return x; }
function memOpts(sel) { return active().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} — ${esc((m.roles || []).map(r => ROLES[r]).join('، '))}</option>`).join(''); }

function reqForm(r) {
  const edit = !!r, designer = withRole('design').find(m => (m.roles || []).includes('design')), k0 = edit ? r.kind : 'design';
  modal(`<h2>${edit ? 'تعديل الطلب' : 'طلب جديد'}</h2>${edit ? '<div class="note">أي تعديل يوصل إشعار للمسؤول عن الطلب، وينحفظ في السجل وش تغيّر.</div>' : '<div class="muted small">كل ما كان الطلب أوضح من البداية، قلّت جولات التعديل.</div>'}
   <div class="grid2">
   <div class="field"><label for="rKind">النوع</label><select id="rKind" ${edit ? 'disabled' : ''}>${Object.entries(REQ_KINDS).filter(([k]) => k !== 'quota').map(([k, n]) => `<option value="${k}" ${k === k0 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
   <div class="field"><label for="rTo">مطلوب من</label><select id="rTo">${memOpts(edit ? r.to_member : designer && designer.id)}</select></div>
   <div class="field"><label for="rTitle">العنوان *</label><input type="text" id="rTitle" placeholder="مثال: بنر هيرش سيطرة للمتجر" value="${edit ? esc(r.title) : ''}"></div>
   <div class="field"><label for="rDue">الموعد *</label><input type="date" id="rDue" min="${edit ? '' : today()}" value="${edit && r.due ? r.due : ''}"></div>
   <div class="field"><label for="rSize">المقاس أو المنصة</label><input type="text" id="rSize" placeholder="مثال: 1080×1920 ستوري" value="${edit ? esc(r.size) : ''}"></div>
   <div class="field"><label for="rRef">مرجع (رابط أو وصف)</label><input type="text" id="rRef" dir="auto" placeholder="https://..." value="${edit ? esc(r.ref_url) : ''}"></div></div>
   <div class="field"><label for="rDet">وش المطلوب بالضبط؟ *</label><textarea id="rDet" rows="5" placeholder="${esc(DET_HINT[k0] || DET_HINT.other)}">${edit ? esc(r.details) : ''}</textarea></div>
   <div class="row"><button class="btn primary" id="rSave" type="button">${edit ? 'حفظ التعديل وإبلاغه' : 'إرسال الطلب'}</button><button class="btn" id="rCancel" type="button">إلغاء</button></div>`, () => {
    const kind = $('rKind'); kind.onchange = () => { const map = { design: 'design', ship: 'shipper', ad: 'media', snap: 'snap', social: 'social' }; const m = active().find(x => (x.roles || []).includes(map[kind.value] || '')); if (m) $('rTo').value = m.id; $('rDet').placeholder = DET_HINT[kind.value] || DET_HINT.other; };
    $('rCancel').onclick = () => edit ? openReq(r.id) : closeModal();
    $('rSave').onclick = async () => {
      const f = { to_member: $('rTo').value, title: $('rTitle').value.trim(), due: $('rDue').value || null, size: $('rSize').value.trim(), ref_url: $('rRef').value.trim(), details: $('rDet').value.trim() };
      if (!f.title) return toast('اكتب عنوان الطلب', true); if (!f.details) return toast('اكتب وش المطلوب بالضبط', true); if (!f.due) return toast('حدد الموعد', true);
      $('rSave').disabled = true;
      if (!edit) {
        const x = await saveReq(null, { ...f, kind: kind.value, from_member: S.me.id }); if (!x) { $('rSave').disabled = false; return; }
        await addEv(x, 'created', f.details); toast('انرسل الطلب، وبيوصله إشعار'); closeModal(); render(); return;
      }
      const L = { to_member: 'المسؤول', title: 'العنوان', due: 'الموعد', size: 'المقاس', ref_url: 'المرجع', details: 'المطلوب' };
      const diff = Object.keys(L).filter(k => String(f[k] || '') !== String(r[k] || '')).map(k => k === 'details' ? `المطلوب صار:\n${f.details}` : `${L[k]}: ${k === 'to_member' ? memName(r[k]) : (r[k] || '—')} ← ${k === 'to_member' ? memName(f[k]) : (f[k] || '—')}`);
      if (!diff.length) { toast('ما تغيّر شي'); return openReq(r.id); }
      const x = await reqAct(r, f, 'edit', diff.join('\n')); if (x) { toast('انحفظ التعديل وانبلغ'); openReq(x.id); } else $('rSave').disabled = false;
    };
  });
}
$('newReq').onclick = () => reqForm(null);

function reqRow(r) {
  const late = r.due && r.due < today() && !['done', 'cancelled'].includes(r.status) ? 'late' : r.due === today() ? 'soon' : '';
  const u = unread(r), ll = lastLine(r);
  return `<div class="qrow ${late} ${u ? 'unread' : ''}"><span>${u ? '<i class="dot" title="تحديث جديد"></i>' : ''}</span><div><div class="t">${esc(r.title)}${r.rounds ? ` <span class="pill warn">تعديل ${r.rounds}</span>` : ''}</div><div class="sub">${esc([REQ_KINDS[r.kind], 'من ' + memName(r.from_member), r.to_member ? 'إلى ' + memName(r.to_member) : '', r.due ? 'الموعد ' + r.due : ''].filter(Boolean).join(' · '))}</div>${ll ? `<div class="sub">${u ? '<b>جديد:</b> ' : 'آخر حدث: '}${esc(ll)}</div>` : ''}</div><div class="acts row" style="gap:6px"><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span><button class="btn sm" data-req="${r.id}" type="button">افتح</button></div></div>`;
}
function renderReqs() {
  const sc = $('rScope').value, dn = $('rDone').checked, me = S.me.id;
  const L = S.reqs.filter(r => (sc === 'all' || (sc === 'me' ? involved(r) : sc === 'to' ? (r.to_member === me || (r.kind === 'quota' && isApprover())) : r.from_member === me)) && (dn || !['done', 'cancelled'].includes(r.status) || unread(r)))
    .sort((a, b) => (unread(b) - unread(a)) || (tms(b.last_event_at || b.created_at) - tms(a.last_event_at || a.created_at)));
  $('rList').innerHTML = L.length ? `<div style="display:grid;gap:8px">${L.map(reqRow).join('')}</div>` : '<div class="empty">ما فيه طلبات هنا.</div>';
  const nb = $('notifBtn'); if (nb) nb.hidden = !('Notification' in window) || Notification.permission !== 'default';
}
['rScope', 'rDone'].forEach(id => $(id).addEventListener('input', renderReqs));
$('rList').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (b) openReq(b.dataset.req); });
if ($('notifBtn')) $('notifBtn').onclick = async () => { try { await Notification.requestPermission(); } catch (e) { } renderReqs(); };

async function openReq(id) {
  const r = S.reqs.find(x => x.id === id); if (!r) return; const me = S.me.id, isTo = r.to_member === me || isAdmin(), isFrom = r.from_member === me || isAdmin();
  const { data: E0, error: eE } = await sb.from('request_events').select('*').eq('request_id', id).order('created_at'); const E = E0 || []; if (eE) S.noEv = true;
  const quota = r.kind === 'quota', canQ = quota && isApprover() && (r.from_member !== S.me.id || isAdmin()) && !['done', 'cancelled'].includes(r.status), open = !['done', 'cancelled'].includes(r.status);
  let dn = 0; const evHtml = E.map(e => { const lbl = e.type === 'deliver' ? (++dn === 1 ? 'سلّم' : `سلّم التعديل ${dn - 1}`) : EV[e.type] || e.type;
    return `<div class="ev ${EV_CLS[e.type] || ''}"><div class="h"><b>${esc(memName(e.member_id))}</b> <span class="pill ${EV_CLS[e.type] || ''}">${esc(lbl)}</span><span class="muted small">${dtFull(e.created_at)}</span></div>${e.body ? `<div class="b">${linkify(e.body)}</div>` : ''}</div>`; }).join('');
  const steps = ['انطلب', 'قيد التنفيذ', 'بانتظار المراجعة', 'معتمد'], si = { new: 0, doing: 1, fix: 1, review: 2, done: 3, cancelled: -1 }[r.status];
  const prog = r.status === 'cancelled' ? '' : `<div class="stepper s4">${steps.map((s, j) => `<div class="st ${j < si || si === 3 ? 'd' : j === si ? 'c' : ''}"><b></b><span>${j === 1 && r.status === 'fix' ? 'يتعدّل' : s}</span></div>`).join('')}</div>`;
  const canDeliver = !quota && isTo && ['new', 'doing', 'fix'].includes(r.status);
  const lastFix = [...E].reverse().find(e => e.type === 'fix' || e.type === 'reopen');
  modal(`<div class="row between"><div><h2>${esc(r.title)}</h2><div class="muted small">${esc(REQ_KINDS[r.kind])} · من ${esc(memName(r.from_member))}${r.to_member ? ' إلى ' + esc(memName(r.to_member)) : ''} · ${r.due ? 'الموعد ' + dShort(r.due) : 'بدون موعد'}${r.rounds ? ' · ' + r.rounds + ' جولة تعديل' : ''}</div><div class="muted small">انطلب: ${dtFull(r.created_at)}${r.done_at ? ' · انتهى: ' + dtFull(r.done_at) : ''}</div></div><span class="pill ${REQ_STATUS[r.status][1]}">${REQ_STATUS[r.status][0]}</span></div>
   ${prog}
   ${quota ? `<div class="small">الحصة الحالية: ${quotaOf(r.campaign_id, r.from_member)} · المطلوب زيادة: ${r.qty}</div>` : `<div class="card"><div class="hd"><b>الطلب</b>${isFrom && open ? '<button class="btn sm" data-q="edit" type="button" style="margin-inline-start:auto">تعديل الطلب</button>' : ''}</div>
     <div style="white-space:pre-wrap">${linkify(r.details) || '<span class="muted">بدون تفاصيل</span>'}</div>
     <div class="small muted">${r.size ? 'المقاس: ' + esc(r.size) : ''}${r.size && r.ref_url ? ' · ' : ''}${r.ref_url ? 'المرجع: ' + linkify(r.ref_url) : ''}</div></div>`}
   <h3 style="margin:4px 0 0">السجل <span class="muted small" style="font-weight:400">· الأوقات بتوقيت الرياض</span></h3><div class="tl">${evHtml || (S.noEv ? '<div class="note">السجل يشتغل بعد تشغيل تحديث قاعدة البيانات رقم 3.</div>' : '<div class="muted small">ما فيه أحداث.</div>')}</div>
   ${canDeliver ? `<div class="card ${r.status === 'fix' ? 'warnc' : ''}"><div class="hd"><b>${r.status === 'fix' ? 'المطلوب تعديله' : 'التسليم'}</b></div>
     ${r.status === 'fix' && lastFix ? `<div class="note" style="white-space:pre-wrap">${linkify(lastFix.body)}</div>` : ''}
     <div class="field"><label for="qRes">${r.status === 'fix' ? 'وش عدّلت؟ (حط الرابط الجديد)' : 'وش سلّمت؟'}</label><textarea id="qRes" rows="3" placeholder="${esc(RES_HINT[r.kind] || RES_HINT.other)}"></textarea></div>
     <div class="row">${r.status === 'new' ? '<button class="btn" data-q="doing" type="button">بدأت فيه</button>' : ''}<button class="btn primary" data-q="review" type="button">${r.status === 'fix' ? 'سلّم التعديل وأرسل للمراجعة' : 'سلّم وأرسل للمراجعة'}</button></div></div>` : ''}
   ${!quota && isFrom && r.status === 'review' ? `<div class="card"><div class="hd"><b>راجع التسليم</b></div><div class="row"><button class="btn good" data-q="done" type="button">اعتماد التسليم</button><button class="btn danger" data-q="fix" type="button">يرجع للتعديل</button></div></div>` : ''}
   ${canQ ? '<div class="row"><button class="btn good" data-q="qok" type="button">موافقة وزيادة الحصة</button><button class="btn danger" data-q="qno" type="button">رفض</button></div>' : ''}
   ${r.status !== 'cancelled' && (involved(r) || isAdmin()) ? `<div class="field"><label for="qMsg">ردّ أو ملاحظة</label><textarea id="qMsg" rows="2" placeholder="سؤال، توضيح، أو أي ملاحظة. توصل إشعار للطرف الثاني."></textarea></div>` : ''}
   <div class="row">${r.status !== 'cancelled' && (involved(r) || isAdmin()) ? '<button class="btn" data-q="msg" type="button">إرسال الرد</button>' : ''}
    ${!quota && isFrom && r.status === 'done' ? '<button class="btn sm" data-q="reopen" type="button">إعادة فتح للتعديل</button>' : ''}
    ${isFrom && open ? '<button class="btn sm" data-q="cancel" type="button">إلغاء الطلب</button>' : ''}
    <button class="btn" id="qClose" type="button" style="margin-inline-start:auto">إغلاق</button></div>`, root => {
    $('qClose').onclick = () => { closeModal(); render(); };
    const tl = root.querySelector('.tl'); if (tl) tl.scrollTop = tl.scrollHeight;
    root.addEventListener('click', async e => { const b = e.target.closest('[data-q]'); if (!b) return; const k = b.dataset.q;
      if (k === 'edit') return reqForm(r);
      b.disabled = true; const done = msg => { toast(msg); openReq(r.id); }; const fail = () => { b.disabled = false; };
      if (k === 'msg') { const t = $('qMsg').value.trim(); if (!t) { fail(); return toast('اكتب الرد', true); } return (await addEv(r, 'comment', t)) ? done('انرسل الرد') : fail(); }
      if (k === 'doing') return (await reqAct(r, { status: 'doing', started_at: nowIso() }, 'start', '')) ? done('انسجّل إنك بدأت') : fail();
      if (k === 'review') { const t = $('qRes').value.trim(); if (!t) { fail(); return toast(r.status === 'fix' ? 'اكتب وش عدّلت' : 'اكتب وش سلّمت', true); }
        return (await reqAct(r, { status: 'review', result_url: t, started_at: r.started_at || nowIso() }, 'deliver', t)) ? done('انرسل للمراجعة') : fail(); }
      if (k === 'done') return (await reqAct(r, { status: 'done', done_at: nowIso() }, 'approve', '')) ? done('اعتمدت التسليم') : fail();
      if (k === 'fix' || k === 'reopen') { const why = await reasonBox('وش المطلوب تعديله بالضبط؟', true); if (why == null || !why.trim()) return fail();
        return (await reqAct(r, { status: 'fix', rounds: (r.rounds || 0) + 1, done_at: null }, k, why.trim())) ? done('رجع للتعديل، وبيوصله إشعار') : fail(); }
      if (k === 'cancel') { if (!await confirmBox('تلغي هذا الطلب؟')) return fail(); return (await reqAct(r, { status: 'cancelled' }, 'cancel', '')) ? done('انلغى الطلب') : fail(); }
      if (k === 'qok') { const { data: newq, error } = await sb.rpc('quota_grant', { p_campaign: r.campaign_id, p_member: r.from_member, p_qty: r.qty || 0 }); if (error || newq == null) { toast(friendly(error || 'ما نفعت'), true); return fail(); }
        const kq = S.quotas.findIndex(y => y.campaign_id === r.campaign_id && y.member_id === r.from_member); if (kq >= 0) S.quotas[kq].quota = newq; else S.quotas.push({ campaign_id: r.campaign_id, member_id: r.from_member, quota: newq });
        const cc = camp(r.campaign_id); if (cc && cc.target_total != null) cc.target_total += (r.qty || 0);
        return (await reqAct(r, { status: 'done', done_at: nowIso() }, 'quota_ok', `الحصة صارت ${newq}، والعدد المطلوب للحملة زاد بنفس المقدار`)) ? done('زادت الحصة وزاد العدد المطلوب للحملة') : fail(); }
      if (k === 'qno') { const why = await reasonBox('سبب الرفض', false); if (why == null) return fail(); return (await reqAct(r, { status: 'cancelled' }, 'quota_no', why.trim())) ? done('انرفض الطلب') : fail(); }
    });
  });
  await markRead(r);
}

/* ===== الإشعارات: كل 30 ثانية نشيك على الطلبات اللي تغيّرت ===== */
function notifyReq(r) {
  const msg = `${memName(r.last_event_by)} ${EV[r.last_event_type] || 'حدّث'}: ${r.title}`;
  toast(msg);
  try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) { const n = new Notification('أداء فريق العز', { body: msg, tag: r.id }); n.onclick = () => { window.focus(); openReq(r.id); }; } } catch (e) { }
}
async function pollReqs() {
  if (!S.me || !S.user) return;
  const since = new Date(tms(S.lastPoll || nowIso()) - 120000).toISOString(); S.lastPoll = nowIso();
  const { data } = await sb.from('requests').select('*').gt('updated_at', since); if (!data || !data.length) return;
  let changed = false;
  for (const row of data) { upsertLocal(S.reqs, row); changed = true;
    if (unread(row) && S.notified[row.id] !== row.last_event_at) { S.notified[row.id] = row.last_event_at; notifyReq(row);
      const ov = $('ov'); if (!ov.hidden && ov.querySelector('#qClose') && ov.innerHTML.includes(esc(row.title)) && !(($('qRes') || {}).value || ($('qMsg') || {}).value)) openReq(row.id); } }
  if (changed) { if ($('ov').hidden) render(); else updateMineCount(); }
}
setInterval(pollReqs, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollReqs(); });

/* ================= تقرير اليوم ================= */
$('tDate').value = today(); $('tDate').addEventListener('change', renderToday);
async function renderToday() {
  const day = $('tDate').value || today(), me = S.me.id;
  const on = t => t && dtX(t).slice(0, 10) === day;   // اليوم بتوقيت الرياض، مو UTC
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
  renderDaily(a, b); renderKpi();
}

/* ================= تقارير اليوم والمعوّقات (للأدمن) ================= */
/* أيام العمل: الأحد إلى الخميس. نحسب لين أمس، لأن تقرير اليوم ينكتب آخر الدوام. */
const isWorkDay = d => d.getDay() !== 5 && d.getDay() !== 6;
function workDaysBetween(from, to) { let n = 0; for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d.setDate(d.getDate() + 1)) if (isWorkDay(d)) n++; return n; }
const taskListOf = m => ((m && m.roles) || []).flatMap(r => (S.tasks[r] || []).map((t, i) => r + '_' + i));
let dailyTok = 0;
async function renderDaily(a, b) {
  const box = $('dDaily'); if (!box || !isAdmin()) return; const tok = ++dailyTok;
  const { data, error } = await sb.from('daily_reports').select('*').gte('day', ymd(a)).lt('day', ymd(b)).order('day', { ascending: false }).limit(5000);
  if (tok !== dailyTok) return;
  if (error) { box.innerHTML = `<div class="muted small" style="padding:12px">${esc(friendly(error))}</div>`; return; }
  const R = data || []; const td = today(); const t0 = new Date(td + 'T00:00:00'); const end = new Date(Math.min(+b, +t0));
  const firstDay = R.length ? new Date(R[R.length - 1].day + 'T00:00:00') : t0;
  const rows = active().filter(m => (m.roles || []).length || !m.is_admin).map(m => {
    const L = R.filter(r => r.member_id === m.id); const joined = new Date(m.created_at || 0);
    const from = new Date(Math.max(+a, +new Date(joined.getFullYear(), joined.getMonth(), joined.getDate()), a.getFullYear() < 2001 ? +firstDay : 0));
    const due = from < end ? workDaysBetween(from, end) : 0;
    const done = new Set(L.filter(r => r.day < td && r.day >= ymd(from)).map(r => r.day)).size;
    const list = taskListOf(m); const checked = L.reduce((s, r) => s + list.filter(k => r.tasks && r.tasks[k]).length, 0);
    return { m, n: L.length, due, done, rate: due ? Math.min(100, Math.round(done / due * 100)) : null, last: L[0] ? L[0].day : '', todayOk: L.some(r => r.day === td), taskRate: list.length && L.length ? Math.round(checked / (list.length * L.length) * 100) : null, blocks: L.filter(r => (r.blockers || '').trim()).length };
  }).sort((x, y) => (x.rate ?? 101) - (y.rate ?? 101));
  const pl = v => v == null ? '—' : `<span class="pill ${v >= 90 ? 'good' : v >= 70 ? 'warn' : 'bad'}">${v}٪</span>`;
  box.innerHTML = `<table><thead><tr><th>الشخص</th><th>الدور</th><th class="num">تقارير بالفترة</th><th class="num">أيام العمل</th><th class="num">الالتزام</th><th>تقرير اليوم</th><th>آخر تقرير</th><th class="num">إنجاز القائمة اليومية</th><th class="num">معوّقات</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.m.name)}</td><td class="small muted">${esc((x.m.roles || []).map(r => ROLES[r]).join(' + '))}</td><td class="num">${x.n}</td><td class="num">${x.due}</td><td class="num">${pl(x.rate)}</td><td>${x.todayOk ? '<span class="pill good">سلّم</span>' : '<span class="pill">ما سلّم للحين</span>'}</td><td class="small muted">${x.last ? dShort(x.last) : '—'}</td><td class="num">${pl(x.taskRate)}</td><td class="num">${x.blocks || ''}</td></tr>`).join('')}</tbody></table>`;
  const B = R.filter(r => (r.blockers || '').trim()), N = R.filter(r => (r.note || '').trim());
  $('dBlockN').textContent = B.length ? B.length : '';
  $('dBlock').innerHTML = B.length ? `<table><thead><tr><th>التاريخ</th><th>الشخص</th><th>المعوّق</th></tr></thead><tbody>${B.slice(0, 60).map(r => `<tr><td class="small" style="white-space:nowrap">${dShort(r.day)}</td><td style="white-space:nowrap">${esc(memName(r.member_id))}</td><td style="white-space:normal;min-width:260px">${esc(r.blockers)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small" style="padding:12px">ما أحد كتب معوّقات في هذي الفترة.</div>';
  $('dNotes').innerHTML = N.length ? `<table><thead><tr><th>التاريخ</th><th>الشخص</th><th>شغل غير مسجّل في النظام</th></tr></thead><tbody>${N.slice(0, 100).map(r => `<tr><td class="small" style="white-space:nowrap">${dShort(r.day)}</td><td style="white-space:nowrap">${esc(memName(r.member_id))}</td><td style="white-space:normal;min-width:260px">${esc(r.note)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small" style="padding:12px">ما فيه ملاحظات في هذي الفترة.</div>';
}
$('dXlsx').onclick = async () => {
  const dt = t => !t ? '' : String(t).length <= 10 ? String(t) : dtX(t);
  const deals = S.deals.map(d => ({ 'المؤثر': d.name, 'اليوزر': d.handle, 'الجوال': d.phone, 'الحملة': camp(d.campaign_id).name || '', 'صانع المحتوى': memName(d.member_id), 'نوع المحتوى': d.acc_type, 'نوع الإعلان': d.ad_type, 'المنصات': platText(platKeys(d)), 'المبلغ': d.price, 'العملة': d.currency, 'المرحلة': d.approval === 'rejected' ? 'مرفوض' : d.approval === 'needs_edit' ? 'يحتاج تعديل' : !inPipe(d) ? 'مسودة' : isClosed(d) ? 'مغلق' : (STEPS[curStep(d)] || { n: 'اكتمل' }).n, 'سبب القرار': d.decision_reason, 'الإرسال للاعتماد': dt(d.sent_at), 'الاعتماد': dt(d.approved_at), 'المدينة': d.rcv_city, 'الحي والرمز': d.address, 'الشحن': dt(d.shipped_at), 'شركة الشحن': d.ship_company, 'رقم البوليصة': d.tracking, 'الوصول': dt(d.delivered_at), 'تعذّر التسليم': dt(d.ship_failed_at), 'نزل تيك توك': dt(d.tt_at), 'كود تيك توك': d.tt_code, 'نزل سناب': dt(d.sn_at), 'يوزر سناب': d.sn_user, 'نزل انستقرام': dt(d.ig_at), 'كود انستقرام': d.ig_code, 'تشغيل تيك توك': dt(d.tt_live_at), 'تشغيل سناب': dt(d.sn_live_at), 'تشغيل انستقرام': dt(d.ig_live_at), 'الهوك': d.hook, 'اعتماد الدفع': dt(d.pay_ok_at), 'الدفع': dt(d.paid_at) }));
  const infls = S.infl.map(i => ({ 'المعلن': i.name, 'بالإنجليزي': i.name_en, 'اليوزر': i.handle, 'رابط تيك توك': i.tiktok_url, 'نوع الحساب': i.acc_type, 'حالة الحساب': i.account_status, 'المرشِّح': memName(i.nominated_by), 'تاريخ الترشيح': i.nominated_on, 'المصدر': i.source === 'acq' ? 'استقطاب' : i.source === 'campaign' ? 'حملة' : 'مستورد', 'حالة الاستقطاب': (ACQ[i.acq_status] || [i.acq_status])[0], 'سبب القرار': i.acq_reason, 'محاولات التواصل': (i.contacts || []).length, 'آخر نتيجة': ((i.contacts || []).slice(-1)[0] || {}).result || '', 'واجه مشكلة': i.had_problem == null ? '' : i.had_problem ? 'نعم' : 'لا', 'المشكلة': i.problem, 'المنصات': i.platforms, 'سناب': i.snap_user, 'انستقرام': i.ig_user, 'الجوال': i.phone, 'الدولة': i.country, 'المدينة': i.city, 'الحي والرمز': i.district, 'قبل التفاوض': i.price_before, 'بعد التفاوض': i.price_after, 'العملة': i.currency, 'تم الاتفاق': dt(i.agreed_at) }));
  const reqs = S.reqs.map(r => ({ 'النوع': REQ_KINDS[r.kind], 'العنوان': r.title, 'من': memName(r.from_member), 'إلى': memName(r.to_member), 'الموعد': r.due, 'الحالة': REQ_STATUS[r.status][0], 'جولات التعديل': r.rounds, 'تاريخ الطلب': dt(r.created_at), 'تاريخ التسليم': dt(r.done_at), 'التسليم': r.result_url }));
  const camps = S.camps.map(c => { const s = campStats(c.id); return { 'الحملة': c.name, 'الحالة': CAMP_ST[c.status || 'active'][0], 'المطلوب': c.target_total, 'موزّع': S.quotas.filter(q => q.campaign_id === c.id).reduce((x, q) => x + q.quota, 0), 'انرسل': s.sent.length, 'معتمد': s.approved.length, 'مرفوض': s.rejected.length, 'استلموا': s.approved.filter(d => d.delivered_at).length, 'نشروا': s.approved.filter(allDelivered).length }; });
  const wb = XLSX.utils.book_new(); const add = (rows, n) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, n); };
  add(camps, 'الحملات'); add(deals, 'ترشيحات الحملات'); add(infls, 'المؤثرين والاستقطاب'); const { data: EVS } = await sb.from('request_events').select('*').order('created_at').limit(20000);
  const evs = (EVS || []).map(e => { const r = S.reqs.find(x => x.id === e.request_id) || {}; return { 'التاريخ والوقت (الرياض)': dtX(e.created_at), 'الطلب': r.title || '', 'الشخص': memName(e.member_id), 'الحدث': EV[e.type] || e.type, 'التفاصيل': e.body }; });
  add(reqs, 'الطلبات'); if (evs.length) add(evs, 'سجل الطلبات');
  const { data: DR } = await sb.from('daily_reports').select('*').order('day', { ascending: false }).limit(20000);
  const drs = (DR || []).map(r => { const list = taskListOf(mem(r.member_id)); return { 'التاريخ': r.day, 'الشخص': memName(r.member_id), 'مهام يومية منجزة': list.filter(k => r.tasks && r.tasks[k]).length, 'من أصل': list.length, 'شغل غير مسجّل': r.note, 'المعوّقات': r.blockers, 'آخر حفظ (الرياض)': dtX(r.updated_at) }; });
  if (drs.length) add(drs, 'تقارير اليوم');
  const kc = (S.kpiCards || []).map(x => { const o = { 'الصانع': x.m.name, 'الشهر': $('kMonth').value, 'الدرجة من 60': x.s60 == null ? '' : Math.round(x.s60 * 10) / 10, 'النسبة ٪': x.pct == null ? '' : Math.round(x.pct), 'أوزان لها بيانات': x.max }; x.rows.forEach(r => { o[r.k.n] = r.v == null ? '' : Math.round(r.v * 10) / 10; o[r.k.n + ' (المستوى)'] = r.lv == null ? '' : r.lv; }); return o; });
  if (kc.length) add(kc, 'بطاقة الأداء'); XLSX.writeFile(wb, `أداء فريق العز ${today()}.xlsx`);
};

/* ================= بطاقة الأداء الشهرية (المؤشرات الـ11 من إطار الأداء) =================
   الدرجة من 60 = مجموع (مستوى المؤشر ÷ 6 × وزنه). المؤشر اللي ما له بيانات يُستبعد وتُعاد النسبة على باقي الأوزان.
   الـ40 الباقية (المهارات) من اختبار ربع سنوي خارج الموقع. */
const KPI_LV = ['منخفض', 'دون المتوسط', 'متوسط', 'جيد', 'جيد جداً', 'مثالي'];
const lvUp = (v, t) => 1 + t.filter(x => v >= x).length;      // الأعلى أفضل: t = بدايات المستويات 2..6
const lvDown = (v, t) => 6 - t.filter(x => v > x).length;     // الأقل أفضل: t = نهايات المستويات 6..2
const lvOcc = v => v < 35 ? 1 : v < 45 ? 2 : v < 55 ? 3 : v < 65 ? 4 : v < 75 ? 5 : v <= 100 ? 6 : v <= 115 ? 5 : v <= 130 ? 4 : 3;
const kP = v => fmt(Math.round(v)) + '٪';
const KPIS = [
  { k: 'clips', n: 'المقاطع المنشورة', s: 'مقاطع', w: 12, target: '60 بالشهر', show: v => fmt(v), lvl: (v, c) => lvUp(v, [30, 42, 54, 60, 72].map(x => x * c.f)), how: 'مشاركات نزل أول مقطع لها على أي منصة خلال الشهر (كل مشاركة مقطع واحد).' },
  { k: 'occ', n: 'الإشغال', s: 'إشغال', w: 10, target: '75–100٪', show: kP, lvl: v => lvOcc(v), how: 'حمل العمل ÷ السعة. الحمل = المقاطع + (قيد المتابعة × 0.5) + (الحملات النشطة × 3). فوق 100٪ ينزل المستوى لأنه ضغط زائد.' },
  { k: 'camps', n: 'الحملات المُدارة', s: 'حملات', w: 4, target: '4 بالشهر', show: v => fmt(v), lvl: (v, c) => lvUp(v, [2, 3, 4, 5, 6].map(x => x * c.f)), how: 'عدد الحملات اللي نزل له فيها مقطع خلال الشهر.' },
  { k: 'done', n: 'نسبة الإنجاز', s: 'إنجاز', w: 7, target: '95٪', show: kP, lvl: v => lvUp(v, [85, 90, 93, 95, 98]), how: 'اللي نزّلوا ÷ اللي وصلهم المنتج خلال الشهر.' },
  { k: 'speed', n: 'سرعة النشر', s: 'أيام النشر', w: 5, target: '7 أيام', show: v => fmt(v) + ' يوم', lvl: v => lvDown(v, [4, 7, 10, 14, 21]), how: 'وسيط الأيام من وصول المنتج لأول نشر، للمقاطع اللي نزلت خلال الشهر.' },
  { k: 'week', n: 'النشر خلال أسبوع', s: 'خلال أسبوع', w: 3, target: '55٪', show: kP, lvl: v => lvUp(v, [25, 35, 45, 55, 70]), how: 'اللي نزّلوا خلال 7 أيام من الوصول ÷ كل اللي نزّلوا خلال الشهر.' },
  { k: 'late', n: 'المتأخرين', s: 'متأخرين', w: 4, target: '0–3', show: v => fmt(v), lvl: v => lvDown(v, [0, 3, 6, 10, 15]), how: 'وصلهم المنتج من أكثر من 14 يوم وما نزّلوا (لحظة نهاية الشهر، أو الحين للشهر الحالي).' },
  { k: 'cost', n: 'تكلفة المقطع المدفوع', s: 'تكلفة المقطع', w: 4, target: 'وسيط القسم أو أقل', show: v => fmt(Math.round(v)), lvl: (v, c) => lvDown(v / c.med * 100, [84.99, 100, 110, 125, 150]), how: 'مجموع المبالغ ÷ عدد المقاطع المدفوعة (بالريال فقط)، مقارنة بوسيط القسم.' },
  { k: 'fresh', n: 'البلوجر الجدد', s: 'جدد', w: 3, target: '6 بالشهر', show: v => fmt(v), lvl: v => lvUp(v, [1, 2, 4, 6, 8]), how: 'مقاطع من حسابات أول مرة تنزّل لنا (ما لها نشر سابق في الموقع، ومو مستوردة من الشيتات القديمة).' },
  { k: 'tag', n: 'التزام التصنيف', s: 'تصنيف', w: 2, target: '90٪', show: kP, lvl: v => lvUp(v, [50, 70, 80, 90, 98]), how: 'الجدد اللي حالة حسابهم «استقطاب» ÷ كل الجدد فعلاً.' },
  { k: 'miss', n: 'جودة البيانات', s: 'ناقصة', w: 6, target: '0', show: v => fmt(v), lvl: v => lvDown(v, [0.49, 1.5, 3, 6, 10]), how: 'مقاطع الشهر اللي ينقصها كود أو سعر أو تاريخ وصول. الصف الناقص ينحسب مرة وحدة.' }
];
const postAt = d => firstAt(d) || d.posted_at || null;
function kpiMonth() { const v = $('kMonth').value || today().slice(0, 7); const [y, m] = v.split('-').map(Number); return [new Date(y, m - 1, 1), new Date(y, m, 1)]; }
function kpiFirstPosts() { const F = {}; for (const d of S.deals) { const t = postAt(d); if (t && d.influencer_id && (!F[d.influencer_id] || new Date(t) < new Date(F[d.influencer_id].t))) F[d.influencer_id] = { t, id: d.id }; } return F; }
function kpiCard(m, a, b, FP) {
  const end = new Date(Math.min(+b, Date.now()));
  const inM = t => !!t && new Date(t) >= a && new Date(t) < b, before = t => !!t && new Date(t) < end;
  const cfg = S.kpi || {}, cap = Number((cfg.capacity || {})[m.id]) || 80, c = { f: Math.min(1, cap / 80), med: Number(cfg.cost_median) || 1300 };
  const mine = S.deals.filter(d => d.member_id === m.id), L = mine.filter(d => d.approval === 'approved');
  const openAt = d => !before(d.closed_at), notPosted = d => !postAt(d) || new Date(postAt(d)) >= end;
  const clips = L.filter(d => inM(postAt(d)));
  const pending = L.filter(d => (before(d.shipped_at) || before(d.delivered_at)) && notPosted(d) && openAt(d));
  const late = pending.filter(d => d.delivered_at && (end - new Date(d.delivered_at)) / 864e5 > 14);
  const activeCamps = new Set([...clips, ...pending, ...mine.filter(d => inM(d.sent_at) && d.approval !== 'rejected')].map(d => d.campaign_id).filter(Boolean));
  const load = clips.length + pending.length * 0.5 + activeCamps.size * 3;
  const recv = L.filter(d => inM(d.delivered_at));
  const D = clips.filter(d => d.delivered_at).map(d => Math.max(0, days(d.delivered_at, postAt(d))));
  const paid = clips.filter(d => Number(d.price) > 0 && (!d.currency || d.currency === 'SAR'));
  const fresh = clips.filter(d => { const i = infl(d.influencer_id); return i && i.source !== 'import' && FP[d.influencer_id] && FP[d.influencer_id].id === d.id; });
  const miss = clips.filter(d => d.price == null || (!d.no_ship && !d.delivered_at) || !(d.tt_code || d.ig_code || d.sn_code || d.sn_user || d.post_url) || platKeys(d).filter(p => delivered(d, p)).some(p => p === 'sn' ? !d.sn_user : !d[p + '_code']));
  const V = {
    clips: [clips.length, c.f < 1 ? `مستهدف التأهيل ${fmt(60 * c.f)}` : ''],
    occ: [load / cap * 100, `${clips.length} مقطع + ${pending.length} قيد المتابعة × 0.5 + ${activeCamps.size} حملة × 3 = ${fmt(load)} من سعة ${cap}`],
    camps: [new Set(clips.map(d => d.campaign_id).filter(Boolean)).size, ''],
    done: [recv.length ? recv.filter(d => postAt(d)).length / recv.length * 100 : null, `${recv.filter(d => postAt(d)).length} نزّلوا من ${recv.length} وصلهم`],
    speed: [D.length ? median(D) : null, `${D.length} مقطع له تاريخ وصول`],
    week: [D.length ? D.filter(x => x <= 7).length / D.length * 100 : null, `${D.filter(x => x <= 7).length} من ${D.length}`],
    late: [L.some(d => before(d.delivered_at)) ? late.length : null, late.slice(0, 5).map(d => d.name).join('، ')],
    cost: [paid.length ? paid.reduce((s, d) => s + Number(d.price), 0) / paid.length : null, `${paid.length} مقطع مدفوع · وسيط القسم ${fmt(c.med)}`],
    fresh: [fresh.length, ''],
    tag: [fresh.length ? fresh.filter(d => infl(d.influencer_id).account_status === 'استقطاب').length / fresh.length * 100 : null, ''],
    miss: [clips.length ? miss.length : null, miss.slice(0, 5).map(d => d.name).join('، ')]
  };
  const rows = KPIS.map(k => { const [v, sub] = V[k.k]; const lv = v == null ? null : Math.max(1, Math.min(6, k.lvl(v, c))); return { k, v, sub, lv, pts: lv == null ? null : lv / 6 * k.w }; });
  const max = rows.reduce((s, r) => s + (r.lv == null ? 0 : r.k.w), 0), score = rows.reduce((s, r) => s + (r.pts || 0), 0);
  return { m, rows, cap, clips: clips.length, max, score, pct: max ? score / max * 100 : null, s60: max ? score / max * 60 : null };
}
const lvCls = lv => lv == null ? '' : lv <= 2 ? 'bad' : lv <= 4 ? 'warn' : 'good';
function renderKpi() {
  const sel = $('kMonth'); if (!sel) return;
  if (!sel.options.length) { const n = new Date(); sel.innerHTML = Array.from({ length: 12 }, (_, i) => { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); return `<option value="${ymd(d).slice(0, 7)}">${d.toLocaleDateString(LOC, { month: 'long', year: 'numeric' })}</option>`; }).join(''); }
  const [a, b] = kpiMonth(), FP = kpiFirstPosts(), now = new Date(), cur = now >= a && now < b;
  $('kSub').textContent = cur ? `الشهر ما اكتمل: اليوم ${now.getDate()} من ${new Date(b - 864e5).getDate()}. مؤشرات العدد (المقاطع، الحملات، الجدد) تكبر مع الأيام.` : 'شهر مكتمل.';
  const C = creators().map(m => kpiCard(m, a, b, FP)).sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1)); S.kpiCards = C;
  $('kCard').innerHTML = C.length ? `<table><thead><tr><th>الصانع</th><th class="num">الدرجة من 60</th><th class="num">النسبة</th>${KPIS.map(k => `<th class="num" title="${esc(k.n)} · الوزن ${k.w}">${k.s}<small class="muted" style="display:block;font-weight:400">${k.w}</small></th>`).join('')}</tr></thead><tbody>${C.map(x => `<tr class="click" data-kpi="${x.m.id}"><td>${esc(x.m.name)}${x.cap < 80 ? ' <span class="pill">تأهيل</span>' : ''}${x.clips < 5 ? ' <span class="pill" title="أقل من 5 مقاطع في الشهر: النسب مبنية على عدد قليل، لا تحكم منها لحالها">عيّنة صغيرة</span>' : ''}</td><td class="num"><b>${x.s60 == null ? '—' : fmt(x.s60)}</b></td><td class="num">${x.pct == null ? '—' : `<span class="pill ${x.pct >= 75 ? 'good' : x.pct >= 65 ? 'warn' : 'bad'}">${Math.round(x.pct)}٪</span>`}</td>${x.rows.map(r => `<td class="num">${r.lv == null ? '<span class="muted" title="بدون بيانات: مستبعد من الدرجة">—</span>' : `<span class="pill ${lvCls(r.lv)}" title="${KPI_LV[r.lv - 1]}">${r.k.show(r.v)}</span>`}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="muted small" style="padding:12px">ما فيه أحد دوره «صانع محتوى». حدد الأدوار من الإعدادات.</div>';
}
function openKpi(id) {
  const x = (S.kpiCards || []).find(c => c.m.id === id); if (!x) return; const sel = $('kMonth');
  modal(`<div class="row between"><div><h2>بطاقة أداء ${esc(x.m.name)}</h2><div class="muted small">${esc(sel.options[sel.selectedIndex].text)} · المؤشرات ${x.s60 == null ? '—' : fmt(x.s60)} من 60${x.max < 60 ? ` (محسوبة على ${x.max} وزن له بيانات)` : ''}${x.cap < 80 ? ` · سعة التأهيل ${x.cap}` : ''}</div></div><button class="btn" id="kX" type="button">إغلاق</button></div>
   <div class="tw"><table><thead><tr><th>المؤشر</th><th class="num">النتيجة</th><th>المستهدف</th><th>المستوى</th><th class="num">النقاط</th></tr></thead><tbody>${x.rows.map(r => `<tr><td style="white-space:normal;min-width:220px"><b>${esc(r.k.n)}</b><small class="muted" style="display:block">${esc(r.k.how)}${r.sub ? ' — ' + esc(r.sub) : ''}</small></td><td class="num">${r.v == null ? '—' : r.k.show(r.v)}</td><td class="small">${esc(r.k.target)}</td><td>${r.lv == null ? '<span class="muted small">بدون بيانات (مستبعد)</span>' : `<span class="pill ${lvCls(r.lv)}">${r.lv} · ${KPI_LV[r.lv - 1]}</span>`}</td><td class="num">${r.pts == null ? '—' : fmt(r.pts)} / ${r.k.w}</td></tr>`).join('')}</tbody></table></div>
   <div class="note">النقاط = (المستوى ÷ 6) × الوزن. هذي الـ60 حقت المؤشرات، والـ40 حقت المهارات تنضاف من الاختبار الربع سنوي.</div>`, () => { $('kX').onclick = closeModal; });
}
$('kMonth').addEventListener('change', renderKpi);
$('kCard').addEventListener('click', e => { const r = e.target.closest('[data-kpi]'); if (r) openKpi(r.dataset.kpi); });

/* ================= الإعدادات ================= */
function renderSetup() {
  $('sMembers').innerHTML = `<table><thead><tr><th>الاسم</th><th>الإيميل</th><th>الأدوار</th><th>مفعّل</th><th>مدير</th><th></th></tr></thead><tbody>${S.members.map(m => `<tr data-m="${m.id}"><td><input type="text" data-k="name" value="${esc(m.name)}" style="min-width:140px"></td><td class="small" dir="ltr">${esc(m.email)}</td><td style="white-space:normal;min-width:260px">${Object.entries(ROLES).map(([k, n]) => `<label class="check small" style="display:inline-flex;min-height:28px;margin-inline-end:8px"><input type="checkbox" data-role="${k}" ${(m.roles || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('')}</td><td><input type="checkbox" data-k="active" ${m.active ? 'checked' : ''} aria-label="مفعّل"></td><td><input type="checkbox" data-k="is_admin" ${m.is_admin ? 'checked' : ''} ${m.id === S.me.id ? 'disabled' : ''} aria-label="مدير"></td><td><button class="btn sm primary" data-msave type="button">حفظ</button></td></tr>`).join('')}</tbody></table>`;
  $('sSla').innerHTML = STEPS.map(s => `<div class="field"><label for="sla_${s.k}">${s.n}</label><input type="number" min="0" id="sla_${s.k}" value="${S.sla[s.k]}"></div>`).join('');
  $('sTasks').innerHTML = Object.entries(ROLES).filter(([k]) => k !== 'creator').map(([k, n]) => `<div class="field"><label for="tk_${k}">${n}</label><textarea id="tk_${k}">${esc((S.tasks[k] || []).join('\n'))}</textarea></div>`).join('');
  const K = S.kpi || {};
  $('sKpi').innerHTML = `<div class="field"><label for="kp_med">وسيط تكلفة المقطع المدفوع (ر.س)</label><input type="number" min="0" id="kp_med" value="${Number(K.cost_median) || 1300}"></div>` + creators().map(m => `<div class="field"><label for="kp_${m.id}">سعة ${esc(m.name)}</label><input type="number" min="1" data-cap="${m.id}" id="kp_${m.id}" value="${Number((K.capacity || {})[m.id]) || 80}"></div>`).join('');
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
$('sKpiSave').onclick = async () => { const capacity = {}; document.querySelectorAll('[data-cap]').forEach(x => { const n = Number(x.value) || 80; if (n !== 80) capacity[x.dataset.cap] = n; }); const v = { cost_median: Number($('kp_med').value) || 1300, capacity }; if (await q(sb.from('settings').upsert({ key: 'kpi', value: v }))) { S.kpi = v; toast('انحفظت إعدادات بطاقة الأداء'); } };
$('sTasksSave').onclick = async () => { const v = {}; Object.keys(ROLES).filter(k => k !== 'creator').forEach(k => { const L = $('tk_' + k).value.split('\n').map(s => s.trim()).filter(Boolean); if (L.length) v[k] = L; }); if (await q(sb.from('settings').upsert({ key: 'daily_tasks', value: v }))) { S.tasks = v; toast('انحفظت القوائم'); } };

/* ================= التشغيل ================= */
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showAuth(); });
/* أي خطأ غير متوقع: رسالة مفهومة بدل ما يتعطل بصمت */
let lastErrT = 0; const softErr = e => { console.warn(e); const msg = String((e && (e.message || (e.reason && e.reason.message))) || ''); if ((e && e.filename && !e.filename.includes(location.host)) || /ResizeObserver|Script error|extension/i.test(msg)) return; if (Date.now() - lastErrT < 8000) return; lastErrT = Date.now(); toast(friendly(e && (e.reason || e.error || e.message) || e), true); };
window.addEventListener('error', softErr); window.addEventListener('unhandledrejection', softErr);
window.addEventListener('offline', () => toast('انقطع النت. اللي تكتبه الحين ما راح ينحفظ لين يرجع الاتصال.', true));
window.addEventListener('online', () => toast('رجع النت.'));
start();
})();
