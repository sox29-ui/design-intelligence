/* Ledgerline prototype: sample data.
   Kestrel & Lane, every person, reference and figure here is fictional.
   "Now" is fixed so ages, KPIs and the trend stay consistent with each other. */
'use strict';

window.LL_DATA = (function () {
  const NOW = Date.parse('2026-10-02T07:30:00+02:00'); // Fri 2 Oct 2026, 07:30 CEST
  const H = 3600e3;
  const round2 = (v) => Math.round(v * 100) / 100;

  /* Reference rates to EUR (fictional, "ECB 1 Oct") used for comparing and totalling. */
  const FX = { EUR: 1, GBP: 1.1563, SEK: 0.08762 };

  const ENTITIES = [
    { id: 'de', name: 'Kestrel & Lane GmbH', short: 'GmbH', currency: 'EUR', account: 'EUR main ··4021' },
    { id: 'nl', name: 'Kestrel & Lane B.V.', short: 'B.V.', currency: 'EUR', account: 'EUR operating ··7730' },
    { id: 'uk', name: 'Kestrel & Lane Ltd', short: 'Ltd', currency: 'GBP', account: 'GBP main ··1186' },
    { id: 'se', name: 'Kestrel & Lane AB', short: 'AB', currency: 'SEK', account: 'SEK main ··5402' },
  ];
  const PROVIDERS = ['Stripe', 'Adyen', 'PayPal', 'Klarna'];

  const PEOPLE = {
    mh: { name: 'Mira Hoffmann', first: 'Mira', initials: 'MH' },
    ar: { name: 'Ana Ribeiro', first: 'Ana', initials: 'AR' },
    jw: { name: 'Jonas Weber', first: 'Jonas', initials: 'JW' },
    pn: { name: 'Priya Nair', first: 'Priya', initials: 'PN' },
    tl: { name: 'Tomás Lindqvist', first: 'Tomás', initials: 'TL' },
    lm: { name: 'Lea Martin', first: 'Lea', initials: 'LM' },
  };
  const ME = 'mh';

  const REASONS = {
    missing: 'Missing payout',
    mismatch: 'Amount mismatch',
    duplicate: 'Duplicate',
    fx: 'FX difference',
  };
  const STATUSES = {
    new: 'New',
    investigating: 'Investigating',
    waiting: 'Waiting on provider',
    resolved: 'Resolved',
  };
  const RESOLUTIONS = [
    'Matched manually',
    'Provider corrected payout',
    'Payout received late',
    'Duplicate reversed by provider',
    'Written off below tolerance',
  ];

  /* id, provider, entity, amount (entity currency), raised (hours before now), reason, status, assignee,
     resolved (hours before now), resolution */
  const ROWS = [
    ['EX-2241', 'Klarna', 'de', 1960.00, 170.0, 'missing', 'resolved', 'tl', 29.0, 'Payout received late'],
    ['EX-2243', 'Stripe', 'nl', 2390.40, 122.0, 'missing', 'waiting', 'jw'],
    ['EX-2244', 'Stripe', 'se', 4400.00, 121.5, 'duplicate', 'resolved', 'pn', 25.5, 'Duplicate reversed by provider'],
    ['EX-2247', 'Klarna', 'de', 5212.30, 102.0, 'missing', 'waiting', 'tl'],
    ['EX-2249', 'Stripe', 'de', 148.90, 98.0, 'fx', 'investigating', 'ar'],
    ['EX-2250', 'Adyen', 'nl', 2734.90, 93.0, 'missing', 'resolved', 'jw', 23.0, 'Payout received late'],
    ['EX-2253', 'PayPal', 'uk', 318.44, 86.0, 'mismatch', 'investigating', 'lm'],
    ['EX-2255', 'Klarna', 'de', 4118.60, 79.5, 'missing', 'investigating', 'tl'],
    ['EX-2257', 'Adyen', 'uk', 1046.20, 75.0, 'mismatch', 'waiting', 'pn'],
    ['EX-2258', 'Adyen', 'nl', 88.12, 71.0, 'fx', 'waiting', 'pn'],
    ['EX-2260', 'Stripe', 'de', 18.40, 70.0, 'fx', 'waiting', 'ar'],
    ['EX-2261', 'PayPal', 'se', 1460.00, 69.0, 'mismatch', 'waiting', 'ar'],
    ['EX-2263', 'Klarna', 'nl', 734.00, 68.5, 'duplicate', 'waiting', 'tl'],
    ['EX-2266', 'Stripe', 'se', 9850.00, 66.0, 'mismatch', 'investigating', 'jw'],
    ['EX-2268', 'PayPal', 'de', 3.18, 763 / 60 + 52, 'fx', 'resolved', 'lm', 763 / 60, 'Written off below tolerance'], // resolved 18:47
    ['EX-2270', 'PayPal', 'uk', 52.60, 64.0, 'fx', 'waiting', 'lm'],
    ['EX-2271', 'Adyen', 'nl', 642.10, 63.0, 'mismatch', 'investigating', 'pn'],
    ['EX-2273', 'PayPal', 'nl', 129.99, 61.0, 'mismatch', 'waiting', 'lm'],
    ['EX-2274', 'PayPal', 'de', 77.30, 60.5, 'duplicate', 'investigating', 'ar'],
    ['EX-2276', 'Adyen', 'de', 6204.75, 58.0, 'missing', 'waiting', 'jw'],
    ['EX-2278', 'Klarna', 'se', 6120.00, 57.6, 'missing', 'resolved', 'tl', 19.6, 'Payout received late'],
    ['EX-2281', 'Stripe', 'uk', 412.75, 818 / 60 + 43.2, 'mismatch', 'resolved', 'ar', 818 / 60, 'Provider corrected payout'], // resolved 17:52
    ['EX-2282', 'Stripe', 'nl', 1875.25, 55.0, 'duplicate', 'investigating', 'jw'],
    ['EX-2284', 'Stripe', 'uk', 210.00, 53.5, 'duplicate', 'waiting', 'lm'],
    ['EX-2285', 'Adyen', 'uk', 2950.00, 52.0, 'missing', 'investigating', 'pn'],
    ['EX-2287', 'Klarna', 'se', 32600.00, 49.0, 'missing', 'waiting', 'tl'],
    ['EX-2288', 'Stripe', 'de', 5640.00, 47.5, 'missing', 'new', null],
    ['EX-2290', 'PayPal', 'se', 2480.00, 44.0, 'fx', 'investigating', 'ar'],
    ['EX-2291', 'Adyen', 'uk', 96.40, 40.2, 'fx', 'new', null],
    ['EX-2293', 'Adyen', 'de', 1048.30, 40.0, 'mismatch', 'resolved', 'ar', 14.0, 'Matched manually'],
    ['EX-2294', 'PayPal', 'de', 845.50, 34.0, 'missing', 'waiting', 'ar'],
    ['EX-2296', 'Adyen', 'de', 12.05, 33.0, 'mismatch', 'investigating', 'jw'],
    ['EX-2297', 'Klarna', 'nl', 3402.80, 28.6, 'missing', 'investigating', 'tl'],
    ['EX-2299', 'Adyen', 'nl', 1512.00, 27.2, 'mismatch', 'waiting', 'pn'],
    ['EX-2300', 'PayPal', 'nl', 284.75, 26.1, 'mismatch', 'new', 'lm'],
    ['EX-2302', 'Stripe', 'uk', 1120.00, 22.5, 'duplicate', 'new', null],
    ['EX-2303', 'PayPal', 'nl', 340.00, 20.5, 'duplicate', 'resolved', 'pn', 9.5, 'Duplicate reversed by provider'],
    ['EX-2305', 'Klarna', 'de', 956.40, 19.8, 'mismatch', 'new', null],
    ['EX-2306', 'PayPal', 'de', 38.92, 17.0, 'fx', 'new', null],
    ['EX-2307', 'Stripe', 'de', 22.10, 16.5, 'fx', 'resolved', 'jw', 12.0, 'Matched manually'],
    ['EX-2309', 'Adyen', 'de', 2206.14, 15.3, 'mismatch', 'new', 'pn'],
    ['EX-2310', 'Stripe', 'nl', 412.00, 13.9, 'duplicate', 'new', null],
    ['EX-2312', 'Adyen', 'nl', 7912.35, 12.6, 'missing', 'new', null],
    ['EX-2313', 'Klarna', 'se', 18450.00, 10.2, 'missing', 'new', null],
    ['EX-2315', 'PayPal', 'uk', 64.18, 9.1, 'fx', 'new', null],
    ['EX-2316', 'Stripe', 'de', 1284.60, 8.4, 'mismatch', 'new', null],
  ];

  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };

  /* Hand-placed moments that the activity feed also reports. */
  const SPECIAL = {
    'EX-2309': { assignedAt: NOW - (12 * 60e3), assignedBy: 'jw' }, // 07:18
    'EX-2299': { waitingAt: NOW - (25 * 60e3), waitingNote: 'Case opened with Adyen support' }, // 07:05
    'EX-2247': { comment: { at: NOW - (49 * 60e3), who: 'tl', text: 'Klarna confirms the 27 Sep settlement lands on 5 Oct.' } }, // 06:41
  };

  const exceptions = ROWS.map((r) => {
    const [id, provider, entityId, amount, raisedH, reason, status, assignee, resolvedH, resolution] = r;
    const ent = ENTITIES.find((e) => e.id === entityId);
    const seed = hash(id);
    const created = NOW - raisedH * H;
    const resolved = resolvedH != null ? NOW - resolvedH * H : null;
    const end = resolved || NOW;
    const span = end - created;
    const history = [{ at: created, who: null, text: 'Raised by the matching engine' }];
    const sp = SPECIAL[id] || {};
    if (assignee) {
      const at = sp.assignedAt || created + span * (0.08 + (seed % 7) / 100);
      history.push({ at, who: sp.assignedBy || ME, text: `assigned it to ${PEOPLE[assignee].name}` });
    }
    if (status === 'investigating' || status === 'waiting' || (status === 'resolved' && seed % 3 !== 0)) {
      history.push({ at: created + span * (0.22 + (seed % 11) / 100), who: assignee, text: 'set the status to Investigating' });
    }
    if (status === 'waiting') {
      const at = sp.waitingAt || created + span * (0.48 + (seed % 13) / 100);
      history.push({ at, who: assignee, text: 'set the status to Waiting on provider', note: sp.waitingNote || `Ticket raised with ${provider}` });
    }
    if (sp.comment) history.push({ at: sp.comment.at, who: sp.comment.who, text: 'commented', note: sp.comment.text });
    if (resolved) history.push({ at: resolved, who: assignee, text: `resolved it: ${resolution}` });
    history.sort((a, b) => a.at - b.at);
    return {
      id, provider, entity: entityId, currency: ent.currency, amount,
      amountEUR: round2(amount * FX[ent.currency]),
      created, reason, status, assignee: assignee || null,
      resolved, resolution: resolution || null, seed, history,
    };
  });

  /* Activity: the last eight events before "now". */
  const activity = [
    { at: NOW - 12 * 60e3, who: 'jw', kind: 'assign', text: 'assigned', ref: 'EX-2309', tail: 'to Priya Nair' },
    { at: NOW - 25 * 60e3, who: 'pn', kind: 'status', text: 'set', ref: 'EX-2299', tail: 'to Waiting on provider', note: 'Case opened with Adyen support' },
    { at: NOW - 49 * 60e3, who: 'tl', kind: 'comment', text: 'commented on', ref: 'EX-2247', note: 'Klarna confirms the 27 Sep settlement lands on 5 Oct.' },
    { at: NOW - (78 * 60e3), who: null, kind: 'run', text: 'Reconciliation run for 1 Oct completed', note: '97.4% matched · 14 exceptions raised' },
    { at: NOW - (92 * 60e3), who: null, kind: 'feed', text: 'Bank feed GmbH · EUR main synced', note: '1,204 transactions imported' },
    { at: NOW - (763 / 60) * H, who: 'lm', kind: 'resolve', text: 'resolved', ref: 'EX-2268', note: 'Written off below tolerance' },
    { at: NOW - (818 / 60) * H, who: 'ar', kind: 'resolve', text: 'resolved', ref: 'EX-2281', note: 'Provider corrected payout' },
    { at: NOW - 15.0 * H, who: null, kind: 'rule', text: 'Rule “Adyen fee tolerance ±€0.50” auto-matched 214 payouts' },
  ];

  /* ---------------------------------------------------------------------------------------
     60 days of daily reconciliation figures per provider × entity (3 Aug – 1 Oct 2026).
     The last day (1 Oct) and the day before are pinned to the figures the brief quotes. */
  const DAY0 = Date.UTC(2026, 7, 3); // 3 Aug 2026 (index 0); index 59 = 1 Oct
  const N = 60;
  const days = Array.from({ length: N }, (_, i) => DAY0 + i * 864e5);

  const COMBOS = [
    { p: 'Stripe', e: 'de', w: 0.20 }, { p: 'Stripe', e: 'nl', w: 0.08 }, { p: 'Stripe', e: 'uk', w: 0.07 }, { p: 'Stripe', e: 'se', w: 0.03 },
    { p: 'Adyen', e: 'de', w: 0.14 }, { p: 'Adyen', e: 'nl', w: 0.10 }, { p: 'Adyen', e: 'uk', w: 0.06 },
    { p: 'PayPal', e: 'de', w: 0.09 }, { p: 'PayPal', e: 'nl', w: 0.04 }, { p: 'PayPal', e: 'uk', w: 0.04 }, { p: 'PayPal', e: 'se', w: 0.02 },
    { p: 'Klarna', e: 'de', w: 0.06 }, { p: 'Klarna', e: 'nl', w: 0.03 }, { p: 'Klarna', e: 'se', w: 0.04 },
  ];
  const BASE_SHARE = { Stripe: 0.016, Adyen: 0.021, PayPal: 0.031, Klarna: 0.036 };
  const TICKET = { Stripe: 64, Adyen: 72, PayPal: 49, Klarna: 88 };
  const WEEKDAY = [0.88, 1.12, 1.03, 0.97, 0.99, 1.04, 0.91]; // Sun … Sat

  let s = 20261001;
  const rnd = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const poisson = (lam) => {
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const spike = (i, p) => {
    if (p === 'Klarna' && i === 42) return 4.6; // 14 Sep: Klarna settlement file delayed
    if (p === 'Klarna' && i === 43) return 2.4;
    if (p === 'PayPal' && i === 51) return 2.9; // 23 Sep: PayPal FX rounding change
    if (p === 'Adyen' && i === 35) return 2.1; //  7 Sep: Adyen batch split
    return 1;
  };

  const matched = COMBOS.map(() => new Array(N).fill(0));
  const unmatched = COMBOS.map(() => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    const dow = new Date(days[i]).getUTCDay();
    const total = 688000 * WEEKDAY[dow] * (0.965 + 0.035 * (i / (N - 1))) * (1 + 0.035 * gauss());
    COMBOS.forEach((c, k) => {
      const vol = total * c.w * (1 + 0.07 * gauss());
      const share = BASE_SHARE[c.p] * clamp(1 + 0.32 * gauss(), 0.5, 1.8) * spike(i, c.p);
      unmatched[k][i] = round2(vol * share);
      matched[k][i] = round2(vol - vol * share);
    });
  }
  const pinDay = (arr, i, target) => {
    const sum = arr.reduce((a, row) => a + row[i], 0);
    let acc = 0, big = 0;
    arr.forEach((row, k) => {
      row[i] = round2(row[i] * (target / sum));
      acc += row[i];
      if (row[i] > arr[big][i]) big = k;
    });
    arr[big][i] = round2(arr[big][i] + (target - acc));
  };
  pinDay(unmatched, 59, 18240.55); pinDay(matched, 59, 683319.07); // 97.4 % matched
  pinDay(unmatched, 58, 20555.65); pinDay(matched, 58, 621807.35); // 96.8 % matched

  const unmatchedTx = unmatched.map((row, k) => row.map((v) => Math.max(0, Math.round(v / TICKET[COMBOS[k].p]))));

  /* Exceptions raised / resolved per day, resolution times, and open backlog at each day's close. */
  const comboIndex = (p, e) => COMBOS.findIndex((c) => c.p === p && c.e === e);
  const dayIndexOf = (t) => Math.floor((t + 2 * H - DAY0) / 864e5); // CEST calendar day
  const raised = COMBOS.map(() => new Array(N).fill(0));
  const resolvedCount = COMBOS.map(() => new Array(N).fill(0));
  const ttr = COMBOS.map(() => Array.from({ length: N }, () => []));
  const openNow = COMBOS.map(() => 0);

  exceptions.forEach((x) => {
    const k = comboIndex(x.provider, x.entity);
    if (x.status !== 'resolved') openNow[k]++;
    if (dayIndexOf(x.created) === 59) raised[k][59]++;
    if (x.resolved && dayIndexOf(x.resolved) === 59) {
      resolvedCount[k][59]++;
      ttr[k][59].push((x.resolved - x.created) / H);
    }
  });

  const lamTotal = 11.5;
  const exShare = COMBOS.map((c) => c.w * BASE_SHARE[c.p]);
  const exShareSum = exShare.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 59; i++) {
    COMBOS.forEach((c, k) => {
      const lam = (lamTotal * exShare[k]) / exShareSum * spike(i, c.p);
      raised[k][i] = poisson(lam);
      resolvedCount[k][i] = poisson(lam * 0.98);
      for (let j = 0; j < resolvedCount[k][i]; j++) {
        ttr[k][i].push(clamp(Math.exp(Math.log(47) + 0.62 * gauss()), 1.5, 380));
      }
    });
  }
  /* Pin 30 Sep so its median time to resolve is 2.1 days (50.4 h). */
  const median = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const m58 = median(ttr.flatMap((row) => row[58]));
  if (m58) ttr.forEach((row) => { row[58] = row[58].map((v) => (v * 50.4) / m58); });

  /* Backlog at the close of each day, walked backwards from today's open count. */
  const backlogEnd = COMBOS.map(() => new Array(N).fill(0));
  COMBOS.forEach((c, k) => {
    backlogEnd[k][59] = openNow[k];
    for (let i = 59; i > 0; i--) {
      let prev = backlogEnd[k][i] - raised[k][i] + resolvedCount[k][i];
      if (prev < 0) { raised[k][i] += prev; prev = 0; }
      backlogEnd[k][i - 1] = prev;
    }
  });

  return {
    NOW, H, FX, ENTITIES, PROVIDERS, PEOPLE, ME, REASONS, STATUSES, RESOLUTIONS,
    exceptions, activity,
    series: { DAY0, days, combos: COMBOS, matched, unmatched, unmatchedTx, raised, resolved: resolvedCount, ttr, backlogEnd },
    util: { median, hash, round2 },
  };
})();
