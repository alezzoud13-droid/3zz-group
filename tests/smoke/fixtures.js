/* Smoke-test fixtures for «أداء فريق العز».
 * One factory, usable from the browser (window.__makeFixtures) and from Node (require).
 * All ids are fixed; all dates are relative to `now` (the runner freezes the browser clock, see smoke.js).
 * Every name here is fake.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.__makeFixtures = factory;
})(typeof self !== 'undefined' ? self : this, function makeFixtures(nowMs) {
  'use strict';
  const NOW = nowMs || Date.now();
  const DAY = 864e5;
  const ago = d => new Date(NOW - d * DAY).toISOString();           // d days before "now" (fractions allowed)
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dayAgo = d => ymd(new Date(NOW - d * DAY));                  // local date, d days ago (negative = future)

  const uid = (p, n) => `${p}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const labels = {};                                                  // id -> readable alias used in the write log
  const tag = (id, name) => { labels[id] = '@' + name; return id; };

  /* ---------------- members ---------------- */
  const M = {
    admin: tag(uid('a', 1), 'member.admin'),
    approver: tag(uid('a', 2), 'member.approver'),
    creator: tag(uid('a', 3), 'member.creator'),
    creator2: tag(uid('a', 4), 'member.creator2'),
    shipper: tag(uid('a', 5), 'member.shipper'),
    media: tag(uid('a', 6), 'member.media'),
    snap: tag(uid('a', 7), 'member.snap'),
    design: tag(uid('a', 8), 'member.design'),
    social: tag(uid('a', 9), 'member.social'),
    pending: tag(uid('a', 10), 'member.pending')
  };
  const member = (key, name, roles, extra) => Object.assign({ id: M[key], email: key + '@smoke.test', name, roles, is_admin: false, active: true, aliases: [], created_at: '2026-09-01T06:00:00.000Z' }, extra);
  const members = [
    member('admin', 'مدير تجريبي', [], { is_admin: true }),
    member('approver', 'معتمد تجريبي', ['approver', 'creator']),
    member('creator', 'صانع أول', ['creator']),
    member('creator2', 'صانع ثاني', ['creator']),
    member('shipper', 'موظف الشحن', ['shipper']),
    member('media', 'ميديا باير تجريبي', ['media']),
    member('snap', 'منسق تجريبي', ['snap']),
    member('design', 'مصمم تجريبي', ['design']),
    member('social', 'سوشيال تجريبي', ['social']),
    member('pending', 'عضو جديد', [], { active: false, created_at: ago(1) })
  ];

  /* ---------------- campaigns + quotas ---------------- */
  const K = {
    alpha: tag(uid('c', 1), 'camp.alpha'),
    beta: tag(uid('c', 2), 'camp.beta'),
    ended: tag(uid('c', 3), 'camp.ended'),
    paused: tag(uid('c', 4), 'camp.paused')
  };
  const campaigns = [
    { id: K.alpha, name: 'حملة ألف', product: 'عطر ألف', active: true, status: 'active', target_total: 30, created_at: ago(40) },
    { id: K.beta, name: 'حملة باء', product: 'بكج باء', active: true, status: 'active', target_total: 10, created_at: ago(30) },
    { id: K.ended, name: 'حملة منتهية', product: 'عطر قديم', active: false, status: 'ended', target_total: 4, created_at: ago(90) },
    { id: K.paused, name: 'حملة متوقفة', product: '', active: true, status: 'paused', target_total: null, created_at: ago(20) }
  ];
  const quota = (c, m, n) => ({ campaign_id: c, member_id: m, quota: n, updated_by: M.approver, updated_at: ago(20) });
  const quotas = [
    quota(K.alpha, M.creator, 17), quota(K.alpha, M.creator2, 6), quota(K.alpha, M.approver, 3),
    quota(K.beta, M.creator, 3), quota(K.beta, M.creator2, 5),
    quota(K.ended, M.creator2, 1)
  ];

  /* ---------------- influencers + deals ---------------- */
  const influencers = [], deals = [];
  const I = {}, D = {};
  let iN = 0, dN = 0;
  function infl(key, owner, f) {
    const n = ++iN, id = tag(uid('e', n), 'infl.' + key);
    I[key] = id;
    influencers.push(Object.assign({
      id, name: 'مؤثر تجريبي ' + pad(n), name_en: '', handle: 'smoke_infl_' + pad(n), tiktok_url: 'https://www.tiktok.com/@smoke_infl_' + pad(n),
      acc_type: 'صانع محتوى', account_status: 'استقطاب', country: 'السعودية', phone: '', city: '', district: '',
      platforms: 'تيك توك', snap_user: '', ig_user: '', yt_url: '',
      nominated_by: owner, nominated_on: dayAgo(10), source: 'acq',
      acq_status: 'draft', acq_sent_at: null, acq_decided_at: null, acq_decided_by: null, acq_reason: '',
      contacts: [], had_problem: null, problem: '', contact_summary: '',
      price_before: null, price_after: null, currency: 'SAR', agreed_at: null, notes: '',
      created_at: ago(10), updated_by: owner, updated_at: ago(10)
    }, f));
    return id;
  }
  const B = { b1: tag(uid('b', 1), 'batch.b1'), b2: tag(uid('b', 2), 'batch.b2'), b3: tag(uid('b', 3), 'batch.b3') };
  function deal(key, owner, camp, f, inflF) {
    const n = ++dN, id = tag(uid('d', n), 'deal.' + key);
    D[key] = id;
    const plat = (f && f.platform) || 'تيك توك';
    const iid = infl('of_' + key, owner, Object.assign({ source: 'campaign', acq_status: 'none', account_status: 'استقطاب', platforms: plat, created_at: ago(30), nominated_on: dayAgo(30) }, inflF));
    const i = influencers[influencers.length - 1];
    deals.push(Object.assign({
      id, member_id: owner, campaign_id: camp, influencer_id: iid,
      name: i.name, phone: '', handle: i.handle, platform: plat, city: '', acc_type: i.acc_type, followers: '',
      price: 1000, currency: 'SAR', price_note: '', notes: '', sent_at: null,
      approval: 'pending', approved_by: null, approved_at: null,
      intake_token: 'tok' + String(n).padStart(21, '0'),
      rcv_name: '', rcv_phone: '', rcv_city: '', address: '', short_code: '', country: 'السعودية',
      intake_at: null, no_ship: false, no_pay: false,
      shipped_at: null, delivered_at: null, tracking: '',
      draft_url: '', draft_at: null, rounds: 0, video_ok_at: null, video_score: null,
      post_url: '', tt_code: '', ig_code: '', sn_code: '', hook: '', posted_at: null,
      ad_name: '', live_at: null, paid_at: null, closed_reason: '', closed_at: null,
      created_by: owner, created_at: ago(20), updated_by: owner, updated_at: ago(1),
      batch_id: null, decision_reason: '', ad_type: 'منزلي', planned_date: null, price_before: 1200,   // من 13 نوفمبر: السعر قبل التفاوض إلزامي قبل الإرسال والاعتماد
      ship_failed_at: null, ship_note: '', sn_user: '',
      tt_at: null, ig_at: null, sn_at: null, tt_live_at: null, ig_live_at: null, sn_live_at: null,
      draft_note: '', draft_feedback: '', ship_company: '', pay_ok_at: null, pay_ok_by: null
    }, f));
    return id;
  }
  /* building blocks for the stages */
  const sent = (d, batch) => ({ sent_at: ago(d), batch_id: batch || null });
  const approved = d => ({ approval: 'approved', sent_at: ago(d + 1), approved_at: ago(d), approved_by: M.approver });
  const addr = n => ({ rcv_name: 'مستلم تجريبي ' + n, rcv_phone: '+9665000000' + pad(n), phone: '+9665000000' + pad(n), rcv_city: 'الرياض', city: 'الرياض', address: 'حي تجريبي – RRRD10' + pad(n) });
  const shipped = d => ({ shipped_at: ago(d), ship_company: 'سمسا', tracking: 'SMK' + Math.round(d * 100) });
  const delivered = d => Object.assign(shipped(d + 2), { delivered_at: ago(d) });
  const draftSent = d => ({ draft_url: 'https://drive.example.test/raw-video', draft_note: 'ملاحظة تجريبية على المقطع', draft_at: ago(d) });
  const videoOk = d => Object.assign(draftSent(d + 1), { video_ok_at: ago(d) });
  const tt = d => ({ tt_at: ago(d), tt_code: '#SPARK-SMOKE', post_url: 'https://www.tiktok.com/@smoke/video/1' });
  const sn = d => ({ sn_at: ago(d), sn_user: 'smoke_snap' });
  const ig = d => ({ ig_at: ago(d), ig_code: 'IG-SMOKE' });
  const TTSN = 'تيك توك + سناب شات', ALL = 'جميع المنصات';

  // 1) draft, not sent
  deal('draft', M.creator, K.beta, { price: 500, created_at: ago(1.2) });
  // 2) sent, waiting for the approver (one batch of two, one late batch, one without batch, one owned by the approver)
  deal('pending1', M.creator, K.alpha, sent(1.1, B.b1));
  deal('pending2', M.creator, K.alpha, Object.assign(sent(1.1, B.b1), { price: 0, platform: TTSN, sn_user: 'smoke_p2' }));
  deal('pending3', M.creator2, K.alpha, sent(3.2, B.b2));
  deal('pending4', M.creator2, K.beta, sent(2.1, null));
  deal('pending_ap', M.approver, K.alpha, sent(1.3, B.b3));
  // 3) returned for edit / backup
  deal('needs_edit', M.creator, K.alpha, { approval: 'needs_edit', sent_at: null, approved_by: M.approver, decision_reason: 'السعر مرتفع، فاوض عليه' });
  deal('backup', M.creator, K.alpha, { approval: 'backup', sent_at: ago(6) });
  // 4) approved, address missing (one fresh, one late)
  deal('approved_noaddr', M.creator, K.alpha, approved(1.2));
  deal('approved_noaddr_late', M.creator2, K.beta, approved(4.5));
  // 5) ready to ship (one fresh, one late and filled by the influencer through the intake link)
  deal('ready_ship1', M.creator, K.alpha, Object.assign(approved(2.1), addr(11)));
  deal('ready_ship2', M.creator2, K.beta, Object.assign(approved(9.2), addr(12), { intake_at: ago(8.3), short_code: 'RRRD1012' }));
  // 6) shipped, on the way
  deal('shipped1', M.creator, K.alpha, Object.assign(approved(5.1), addr(13), shipped(2.2)));
  deal('shipped2', M.creator2, K.alpha, Object.assign(approved(4.1), addr(14), shipped(1.2)));
  // 7) delivery failed
  deal('ship_failed', M.creator, K.beta, Object.assign(approved(7.1), addr(15), shipped(4.2), { ship_failed_at: ago(1.1), ship_note: 'المستلم ما يرد' }));
  // 8) delivered, waiting for the raw video (one fresh, one late)
  deal('delivered', M.creator, K.alpha, Object.assign(approved(8.1), addr(16), delivered(3.2)));
  deal('delivered_late', M.creator2, K.alpha, Object.assign(approved(20.1), addr(17), delivered(12.3)));
  // 9) raw video returned for edit
  deal('video_fix', M.creator, K.alpha, Object.assign(approved(10.1), addr(18), delivered(5.2), { draft_url: 'https://drive.example.test/raw-old', draft_note: 'النسخة الأولى', draft_at: null, rounds: 1, draft_feedback: 'الإضاءة ضعيفة، أعد التصوير' }));
  // 10) raw video waiting for approval
  deal('draft_pending1', M.creator, K.alpha, Object.assign(approved(9.1), addr(19), delivered(4.2), draftSent(0.5)));
  deal('draft_pending2', M.creator2, K.alpha, Object.assign(approved(11.1), addr(20), delivered(6.2), draftSent(1.1)));
  deal('draft_pending_ap', M.approver, K.alpha, Object.assign(approved(8.1), addr(21), delivered(3.2), draftSent(1.2), { approved_by: M.admin }));
  // 11) video approved, nothing posted yet
  deal('video_ok', M.creator, K.alpha, Object.assign(approved(12.1), addr(22), delivered(6.2), videoOk(2.1), { platform: TTSN }));
  // 12) partly posted (tt only out of three platforms)
  deal('partly_posted', M.creator, K.alpha, Object.assign(approved(14.1), addr(23), delivered(8.2), videoOk(4.1), tt(1.5), { platform: ALL, hook: 'هوك تجريبي' }));
  // 13) posted on all platforms, waiting for launch
  deal('posted_wait_launch', M.creator2, K.alpha, Object.assign(approved(13.1), addr(24), delivered(7.2), videoOk(2.1), tt(0.5), sn(0.4), { platform: TTSN, posted_at: ago(0.4) }));
  // 14) launched, waiting for pay approval
  deal('launched_wait_pay', M.creator, K.alpha, Object.assign(approved(16.1), addr(25), delivered(10.2), videoOk(6.1), tt(5.2), { posted_at: ago(5.2), tt_live_at: ago(4.6), live_at: ago(4.6), ad_name: 'حملة ألف | إعلان تجريبي', price: 1500 }));
  deal('launched_wait_pay2', M.creator2, K.beta, Object.assign(approved(15.1), addr(26), delivered(9.2), videoOk(5.1), tt(4.2), { posted_at: ago(4.2), tt_live_at: ago(3.9), live_at: ago(3.9), ad_name: 'حملة باء | إعلان تجريبي', price: 800 }));
  // 15) pay approved, not paid yet
  deal('pay_ok1', M.creator, K.alpha, Object.assign(approved(18.1), addr(27), delivered(12.2), videoOk(8.1), tt(7.2), { posted_at: ago(7.2), tt_live_at: ago(6.8), live_at: ago(6.8), pay_ok_at: ago(1.2), pay_ok_by: M.admin, price: 2000 }));
  deal('pay_ok2', M.creator2, K.alpha, Object.assign(approved(17.1), addr(28), delivered(11.2), videoOk(7.1), tt(6.2), { posted_at: ago(6.2), tt_live_at: ago(5.8), live_at: ago(5.8), pay_ok_at: ago(1.1), pay_ok_by: M.admin, price: 1200 }));
  // 16) paid (complete)
  deal('paid', M.creator, K.alpha, Object.assign(approved(19.1), addr(29), delivered(14.2), videoOk(10.1), tt(9.2), { posted_at: ago(9.2), tt_live_at: ago(8.9), live_at: ago(8.9), pay_ok_at: ago(3.2), pay_ok_by: M.admin, paid_at: ago(1.3), price: 1800 }), { source: 'acq', acq_status: 'approved', agreed_at: ago(25), price_before: 2500, price_after: 1800 });
  // 17) rejected / closed
  deal('rejected', M.creator, K.alpha, { approval: 'rejected', sent_at: ago(8.1), approved_by: M.approver, decision_reason: 'المحتوى ما يناسب المنتج', closed_reason: 'رفضه معتمد تجريبي' });
  deal('closed', M.creator, K.beta, Object.assign(approved(9.1), { closed_at: ago(2.1), closed_reason: 'ما رد / ألغي' }));
  // 18) no shipping, no payment
  deal('no_ship', M.creator2, K.beta, Object.assign(approved(2.1), { no_ship: true, no_pay: true, price: 0 }));
  // 19) old finished deal in an ended campaign (last month's numbers), imported account
  deal('old_done', M.creator2, K.ended, Object.assign(approved(45.1), addr(30), delivered(38.2), videoOk(36.1), tt(35.2), { posted_at: ago(35.2), tt_live_at: ago(34.9), live_at: ago(34.9), pay_ok_at: ago(33), pay_ok_by: M.admin, paid_at: ago(32), created_at: ago(50) }), { source: 'import', account_status: 'مستمر' });

  /* acquisition files in every status (no deals attached) */
  infl('acq_draft', M.creator, { acq_status: 'draft', created_at: ago(0.3), nominated_on: dayAgo(0) });
  infl('acq_pending', M.creator, { acq_status: 'pending', acq_sent_at: ago(1.2) });
  infl('acq_pending2', M.creator2, { acq_status: 'pending', acq_sent_at: ago(2.2), acc_type: 'مقيم عطور عربي' });
  infl('acq_pending3', M.creator2, { acq_status: 'pending', acq_sent_at: ago(0.6) });
  infl('acq_pending_ap', M.approver, { acq_status: 'pending', acq_sent_at: ago(1.4) });
  infl('acq_needs_edit', M.creator, { acq_status: 'needs_edit', acq_sent_at: ago(4), acq_decided_at: ago(3), acq_decided_by: M.approver, acq_reason: 'الرابط ما يفتح، صححه' });
  infl('acq_approved', M.creator, { acq_status: 'approved', acq_sent_at: ago(6), acq_decided_at: ago(5), acq_decided_by: M.approver, contacts: [{ channel: 'واتساب', date: dayAgo(4), result: 'ما رد' }] });
  infl('acq_agreed', M.creator, { acq_status: 'approved', acq_sent_at: ago(9), acq_decided_at: ago(8), acq_decided_by: M.approver, contacts: [{ channel: 'تيك توك', date: dayAgo(7), result: 'رد وجاري التفاوض' }, { channel: 'واتساب', date: dayAgo(5), result: 'تم الاتفاق' }], had_problem: false, phone: '+966500000090', city: 'جدة', district: 'حي تجريبي – JJJD1090', platforms: 'تيك توك + سناب شات', snap_user: 'smoke_agreed', price_before: 3000, price_after: 2200, agreed_at: ago(4.5) });
  infl('acq_rejected', M.creator, { acq_status: 'rejected', acq_sent_at: ago(7), acq_decided_at: ago(6), acq_decided_by: M.approver, acq_reason: 'حساب غير مناسب' });

  /* ---------------- requests (+ events, reads) ---------------- */
  const requests = [], request_events = [], request_reads = [];
  const R = {};
  let rN = 0, evN = 0;
  function req(key, f, events, readBy) {
    const id = tag(uid('f', ++rN), 'req.' + key);
    R[key] = id;
    const row = Object.assign({
      id, kind: 'design', title: 'طلب تجريبي ' + pad(rN), details: 'تفاصيل الطلب التجريبي ' + pad(rN), ref_url: '', size: '',
      from_member: M.creator, to_member: M.design, due: dayAgo(-3), status: 'new', result_url: '', rounds: 0, deal_id: null,
      created_at: ago(3), started_at: null, done_at: null, updated_at: ago(1),
      campaign_id: null, qty: null, last_event_at: null, last_event_by: null, last_event_type: ''
    }, f);
    for (const [type, by, d, body] of (events || [])) {
      request_events.push({ id: ++evN, request_id: id, member_id: by, type, body: body || '', created_at: ago(d) });
      Object.assign(row, { last_event_at: ago(d), last_event_by: by, last_event_type: type });
    }
    for (const m of (readBy || [])) request_reads.push({ request_id: id, member_id: m, seen_at: ago(0.01) });
    requests.push(row);
    return id;
  }
  req('new_ship', { kind: 'ship', to_member: M.shipper, due: dayAgo(-2) }, [['created', M.creator, 1.2, 'شحنة إضافية لمؤثر']], [M.creator]);
  req('doing_ad', { kind: 'ad', to_member: M.media, status: 'doing', started_at: ago(2), due: dayAgo(1) }, [['created', M.creator, 3, 'إطلاق إعلان'], ['start', M.media, 2, ''], ['comment', M.media, 0.2, 'وش الميزانية؟']], [M.media]);   // unread for the creator, overdue
  req('review_ad', { kind: 'ad', to_member: M.media, status: 'review', started_at: ago(2), result_url: 'https://ads.example.test/1' }, [['created', M.creator, 3, 'إعلان ثاني'], ['start', M.media, 2, ''], ['deliver', M.media, 1, 'https://ads.example.test/1']], [M.creator, M.media]);
  req('review_snap', { kind: 'snap', to_member: M.snap, status: 'review', started_at: ago(2), result_url: 'تم التنسيق' }, [['created', M.creator, 3, 'تنسيق سناب'], ['deliver', M.snap, 1, 'تم التنسيق']], [M.creator, M.snap]);
  req('fix_ship', { kind: 'ship', from_member: M.approver, to_member: M.shipper, status: 'fix', rounds: 1, started_at: ago(4), result_url: 'بوليصة 1' }, [['created', M.approver, 5, 'شحنة عينات'], ['deliver', M.shipper, 3, 'بوليصة 1'], ['fix', M.approver, 2, 'العنوان غلط، أعد الشحن']], [M.approver, M.shipper]);
  req('done_design', { status: 'done', started_at: ago(6), done_at: ago(4), due: dayAgo(3), result_url: 'https://drive.example.test/design' }, [['created', M.creator, 7, 'بنر'], ['deliver', M.design, 5, 'https://drive.example.test/design'], ['approve', M.creator, 4, '']], [M.creator, M.design]);
  req('cancelled', { from_member: M.creator2, status: 'cancelled' }, [['created', M.creator2, 6, 'ملغي'], ['cancel', M.creator2, 5, '']], [M.creator2]);
  req('quota', { kind: 'quota', title: 'زيادة 2 ترشيح في حملة حملة باء', details: 'عندي حسابين جاهزين', to_member: M.approver, due: null, campaign_id: K.beta, qty: 2 });
  req('quota_ap', { kind: 'quota', title: 'زيادة 1 ترشيح في حملة حملة ألف', details: '', from_member: M.approver, to_member: M.admin, due: null, campaign_id: K.alpha, qty: 1 });

  /* ---------------- daily reports + settings ---------------- */
  const daily_reports = [
    { member_id: M.creator, day: dayAgo(1), tasks: {}, note: 'صورت مع مؤثر خارج النظام', blockers: 'شحنة متأخرة عند شركة الشحن', updated_at: ago(1) },
    { member_id: M.creator, day: dayAgo(2), tasks: {}, note: '', blockers: '', updated_at: ago(2) },
    { member_id: M.shipper, day: dayAgo(1), tasks: { shipper_0: true }, note: '', blockers: '', updated_at: ago(1) },
    { member_id: M.social, day: dayAgo(1), tasks: { social_0: true, social_1: true }, note: 'ردود على التعليقات', blockers: 'ما عندي صلاحية الرد', updated_at: ago(1) }
  ];
  const settings = [
    { key: 'sla', value: { nom: 3, appr: 2, intake: 3, ship: 7, video: 10, live: 2 }, updated_at: ago(30) },
    { key: 'daily_tasks', value: { shipper: ['مراجعة الشحنات الجديدة', 'متابعة المتعذر'], social: ['نشر', 'ردود 10:00', 'ردود 14:00'], media: ['مراجعة الحملات'] }, updated_at: ago(30) },
    { key: 'kpi', value: { cost_median: 1300, capacity: { [M.creator2]: 60 } }, updated_at: ago(30) }
    // bank_pub intentionally absent
  ];

  return {
    now: NOW,
    ids: { M, K, D, I, R, B },
    labels,
    personas: { admin: M.admin, approver: M.approver, creator: M.creator, creator2: M.creator2, shipper: M.shipper, media: M.media, snap: M.snap, design: M.design, social: M.social, pending: M.pending, anon: null },
    db: { members, campaigns, quotas, influencers, deals, deal_bank: [], requests, request_events, request_reads, daily_reports, settings }
  };
});
