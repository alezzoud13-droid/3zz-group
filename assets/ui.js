/* أداء فريق العز — سلوك الهيكل الجديد فقط (القائمة الجانبية، درج الجوال، قائمة «⋯»).
   ما يقرأ ولا يكتب أي بيانات، وما يلمس منطق app.js. */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const app = $('app'), side = $('side'), shade = $('shade'), menu = $('menu'), mainEl = $('mainEl');
if (!app || !side) return;
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };

/* ---- الشريط المصغّر (اللابتوب) ---- */
function setMini(on) { app.classList.toggle('mini', on); const b = $('sideMini'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); const t = on ? 'وسّع القائمة' : 'صغّر القائمة'; b.setAttribute('aria-label', t); b.title = t; b.textContent = on ? '⇤' : '⇥'; document.querySelectorAll('#tabs a').forEach(a => { const l = a.querySelector('.lbl'); if (on && l) a.title = l.textContent; else a.removeAttribute('title'); }); }
setMini(!!store.get('alezz_side_mini'));
$('sideMini').addEventListener('click', () => { const on = !app.classList.contains('mini'); store.set('alezz_side_mini', on ? '1' : ''); setMini(on); });

/* ---- درج الجوال: تعتيم، إغلاق بالزر وEsc والضغط خارجه، والتركيز ينحبس داخله ويرجع لزر القائمة ---- */
const isOpen = () => side.classList.contains('open');
function openDrawer() { side.classList.add('open'); shade.hidden = false; side.setAttribute('role', 'dialog'); side.setAttribute('aria-modal', 'true'); mainEl.inert = true; menu.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('sideClose').focus(); }
function closeDrawer(back) { if (!isOpen()) return; side.classList.remove('open'); shade.hidden = true; side.removeAttribute('role'); side.removeAttribute('aria-modal'); mainEl.inert = false; menu.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; if (back) menu.focus(); }
menu.addEventListener('click', openDrawer);
shade.addEventListener('click', () => closeDrawer(true));
$('sideClose').addEventListener('click', () => closeDrawer(true));
$('tabs').addEventListener('click', e => { if (e.target.closest('a')) closeDrawer(false); });
window.addEventListener('resize', () => { if (isOpen() && window.innerWidth > 900) closeDrawer(false); });

/* ---- قائمة «⋯» في صفوف المهام (على الجوال فقط، وعلى اللابتوب الأزرار ظاهرة) ---- */
let openMore = null;
function closeMore(back) { if (!openMore) return; const w = openMore; openMore = null; w.classList.remove('open'); const b = w.querySelector('[data-more]'); if (b) { b.setAttribute('aria-expanded', 'false'); if (back) b.focus(); } }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-more]');
  if (b) { const w = b.closest('.morew'); if (openMore === w) return closeMore(true); closeMore(false); openMore = w; w.classList.add('open'); b.setAttribute('aria-expanded', 'true'); const f = w.querySelector('.more a, .more button'); if (f) f.focus(); return; }
  if (openMore) closeMore(false);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (openMore) { e.stopPropagation(); return closeMore(true); } if (isOpen()) return closeDrawer(true); }
  if (openMore && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { const items = [...openMore.querySelectorAll('.more a, .more button')], i = items.indexOf(document.activeElement); if (items.length) { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); } }
  if (e.key === 'Tab' && isOpen()) { const f = [...side.querySelectorAll('a[href],button')].filter(x => x.offsetParent !== null); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
}, true);

/* ---- الصفحة الحالية لقارئ الشاشة + الحرف الأول من اسم المستخدم ---- */
function sync() { document.querySelectorAll('#tabs a').forEach(a => { if (a.classList.contains('on')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); const n = ($('whoName').textContent || '').trim(); $('meAv').textContent = n ? n[0] : ''; }
new MutationObserver(sync).observe($('tabs'), { attributes: true, attributeFilter: ['class'], subtree: true });
new MutationObserver(sync).observe($('whoName'), { childList: true, characterData: true, subtree: true });
sync();
})();
