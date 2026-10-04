/* Ledgerline — sample data for a fictional retailer ("Ottervale"), generated deterministically.
   Timestamps are UTC numbers that stand for CEST wall-clock time: every formatter in app.js
   uses timeZone 'UTC', so the page reads the same on any machine. */
(function (root) {
  'use strict';

  var H = 36e5;
  var D = 24 * H;
  var NOW = Date.UTC(2026, 9, 2, 9, 10);          // Fri 2 Oct 2026, 09:10
  var TODAY = Date.UTC(2026, 9, 2);
  var SERIES_START = Date.UTC(2026, 7, 3);        // 3 Aug 2026 → 60 days to 1 Oct
  var SERIES_DAYS = 60;
  var ago = function (h) { return NOW - h * H; };
  var oct1 = function (hh, mm) { return Date.UTC(2026, 9, 1, hh, mm); };
  var sep30 = function (hh, mm) { return Date.UTC(2026, 8, 30, hh, mm); };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(0x0C70BE12);
  function normal(r) {
    r = r || rnd;
    var u = 0, v = 0;
    while (!u) u = r();
    while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function weighted(pairs, r) {
    r = r || rnd;
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var x = r() * total;
    for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }
  var round2 = function (v) { return Math.round(v * 100) / 100; };

  var providers = [
    { id: 'stripe', name: 'Stripe', share: 0.40, rate: 0.021 },
    { id: 'adyen', name: 'Adyen', share: 0.29, rate: 0.025 },
    { id: 'paypal', name: 'PayPal', share: 0.19, rate: 0.034 },
    { id: 'klarna', name: 'Klarna', share: 0.12, rate: 0.031 }
  ];
  var entities = [
    { id: 'de', name: 'Ottervale Goods GmbH', currency: 'EUR', account: 'EUR ••4410', share: 0.58 },
    { id: 'uk', name: 'Ottervale Goods Ltd', currency: 'GBP', account: 'GBP ••7302', share: 0.28 },
    { id: 'se', name: 'Ottervale Nordic AB', currency: 'SEK', account: 'SEK ••1189', share: 0.14 }
  ];
  var fx = { EUR: 1, GBP: 1.1563, SEK: 0.0874, USD: 0.8742 };
  var reasons = { missing: 'Missing payout', mismatch: 'Amount mismatch', duplicate: 'Duplicate', fx: 'FX difference' };
  var statuses = { 'new': 'New', investigating: 'Investigating', waiting: 'Waiting on provider', resolved: 'Resolved' };
  var people = {
    mk: { name: 'Marta Kowalski', first: 'Marta', you: true },
    ar: { name: 'Ana Ribeiro', first: 'Ana' },
    jb: { name: 'Jonas Berg', first: 'Jonas' },
    ps: { name: 'Priya Shah', first: 'Priya' },
    lm: { name: 'Leo Martin', first: 'Leo' }
  };

  /* ---------- Exceptions ---------- */

  // Open now (37): id, provider, entity, currency, amount, reason, status, assignee, opened (hours ago)
  var OPEN = [
    [2297, 'paypal', 'de', 'EUR', 2940.00, 'missing', 'new', null, 10.5],
    [2296, 'stripe', 'de', 'EUR', 412.80, 'mismatch', 'new', 'ps', 12.2],
    [2295, 'klarna', 'se', 'SEK', 1860.00, 'fx', 'new', null, 13.0],
    [2294, 'adyen', 'uk', 'GBP', 96.40, 'mismatch', 'new', null, 15.5],
    [2293, 'stripe', 'uk', 'GBP', 1280.00, 'duplicate', 'new', null, 17.8],
    [2292, 'adyen', 'de', 'EUR', 3215.60, 'missing', 'investigating', 'ar', 20.4],
    [2291, 'paypal', 'uk', 'GBP', 38.40, 'fx', 'new', null, 22.9],
    [2290, 'stripe', 'de', 'EUR', 18.75, 'mismatch', 'investigating', 'jb', 26.0],
    [2289, 'klarna', 'de', 'EUR', 245.00, 'duplicate', 'new', null, 31.6],
    [2285, 'adyen', 'se', 'SEK', 14320.00, 'missing', 'investigating', 'ps', 35.0],
    [2284, 'stripe', 'de', 'EUR', 64.10, 'fx', 'new', null, 37.5],
    [2283, 'paypal', 'de', 'EUR', 129.99, 'mismatch', 'investigating', 'ar', 40.2],
    [2282, 'stripe', 'uk', 'GBP', 22.15, 'fx', 'investigating', 'lm', 44.8],
    [2280, 'klarna', 'se', 'SEK', 3450.00, 'mismatch', 'waiting', 'jb', 49.0],
    [2279, 'adyen', 'de', 'EUR', 1742.30, 'missing', 'waiting', 'ps', 51.3],
    [2278, 'stripe', 'de', 'EUR', 8.40, 'mismatch', 'new', null, 54.0],
    [2277, 'paypal', 'uk', 'GBP', 310.00, 'duplicate', 'investigating', 'lm', 56.5],
    [2274, 'stripe', 'de', 'EUR', 1124.00, 'missing', 'waiting', 'ar', 59.0],
    [2272, 'adyen', 'uk', 'GBP', 47.90, 'fx', 'investigating', 'jb', 63.4],
    [2270, 'klarna', 'de', 'EUR', 92.35, 'mismatch', 'investigating', 'ps', 68.0],
    [2268, 'paypal', 'de', 'EUR', 15.60, 'fx', 'new', null, 72.5],
    [2266, 'klarna', 'se', 'SEK', 5980.00, 'duplicate', 'waiting', 'lm', 77.0],
    [2261, 'stripe', 'uk', 'GBP', 186.20, 'mismatch', 'investigating', 'ar', 84.0],
    [2258, 'adyen', 'de', 'EUR', 33.80, 'fx', 'waiting', 'jb', 89.0],
    [2255, 'paypal', 'de', 'EUR', 640.00, 'mismatch', 'investigating', 'mk', 94.0],
    [2249, 'stripe', 'de', 'EUR', 27.45, 'fx', 'investigating', 'ps', 99.0],
    [2246, 'adyen', 'uk', 'GBP', 905.00, 'missing', 'waiting', 'ar', 103.0],
    [2243, 'klarna', 'de', 'EUR', 156.70, 'mismatch', 'new', null, 108.0],
    [2237, 'paypal', 'de', 'EUR', 1350.00, 'missing', 'waiting', 'jb', 113.0],
    [2231, 'stripe', 'se', 'SEK', 2140.00, 'fx', 'investigating', 'lm', 117.5],
    [2224, 'adyen', 'de', 'EUR', 418.25, 'mismatch', 'waiting', 'ps', 131.0],
    [2215, 'paypal', 'uk', 'GBP', 74.10, 'mismatch', 'investigating', 'ar', 152.0],
    [2203, 'klarna', 'de', 'EUR', 2075.00, 'missing', 'waiting', 'mk', 179.0],
    [2190, 'stripe', 'de', 'EUR', 52.30, 'duplicate', 'investigating', 'jb', 214.0],
    [2174, 'adyen', 'se', 'SEK', 760.00, 'fx', 'waiting', 'lm', 258.0],
    [2158, 'paypal', 'de', 'EUR', 199.00, 'duplicate', 'waiting', 'ar', 301.0],
    [2139, 'stripe', 'uk', 'GBP', 1018.40, 'mismatch', 'waiting', 'ps', 346.0]
  ];

  // Resolved on 1 Oct and 30 Sep: id, provider, entity, currency, amount, reason, resolvedBy, opened (hours ago), resolved at
  var RESOLVED = [
    [2288, 'klarna', 'de', 'EUR', 0.04, 'mismatch', 'rule', 32.2, oct1(16, 10)],
    [2287, 'klarna', 'se', 'SEK', 0.45, 'mismatch', 'rule', 32.6, oct1(16, 10)],
    [2286, 'stripe', 'de', 'EUR', 1920.00, 'missing', 'auto', 33.0, oct1(11, 25)],
    [2281, 'paypal', 'de', 'EUR', 38.20, 'mismatch', 'ar', 46.5, oct1(17, 42)],
    [2276, 'klarna', 'de', 'EUR', 0.05, 'mismatch', 'rule', 56.8, oct1(16, 10)],
    [2275, 'adyen', 'de', 'EUR', 264.90, 'mismatch', 'jb', 57.0, oct1(10, 5)],
    [2273, 'klarna', 'uk', 'GBP', 0.03, 'mismatch', 'rule', 59.8, oct1(16, 10)],
    [2271, 'stripe', 'uk', 'GBP', 512.00, 'duplicate', 'ps', 65.0, oct1(8, 40)],
    [2269, 'paypal', 'de', 'EUR', 87.15, 'fx', 'lm', 70.0, oct1(8, 5)],
    [2256, 'klarna', 'de', 'EUR', 0.02, 'mismatch', 'rule', 91.5, oct1(16, 10)],
    [2251, 'klarna', 'se', 'SEK', 0.30, 'mismatch', 'rule', 97.0, oct1(16, 10)],
    [2244, 'adyen', 'uk', 'GBP', 143.60, 'mismatch', 'lm', 107.0, oct1(11, 15)],
    [2236, 'stripe', 'de', 'EUR', 2310.00, 'missing', 'ps', 114.0, oct1(16, 40)],
    [2229, 'paypal', 'de', 'EUR', 96.80, 'duplicate', 'mk', 120.0, oct1(15, 20)],
    [2211, 'adyen', 'se', 'SEK', 1290.00, 'fx', 'ar', 160.0, oct1(13, 5)],
    [2198, 'stripe', 'de', 'EUR', 734.50, 'mismatch', 'jb', 192.0, oct1(9, 40)],
    [2267, 'stripe', 'de', 'EUR', 58.40, 'fx', 'lm', 74.0, sep30(10, 0)],
    [2265, 'adyen', 'de', 'EUR', 1480.00, 'missing', 'auto', 78.0, sep30(14, 30)],
    [2264, 'paypal', 'uk', 'GBP', 22.90, 'mismatch', 'ar', 79.0, sep30(8, 0)],
    [2263, 'stripe', 'de', 'EUR', 310.00, 'duplicate', 'jb', 80.0, sep30(12, 40)],
    [2262, 'klarna', 'se', 'SEK', 920.00, 'mismatch', 'ps', 81.0, sep30(11, 0)],
    [2260, 'stripe', 'uk', 'GBP', 64.75, 'fx', 'lm', 85.5, sep30(7, 30)],
    [2257, 'adyen', 'de', 'EUR', 2050.00, 'missing', 'auto', 90.5, sep30(15, 0)],
    [2252, 'paypal', 'de', 'EUR', 141.30, 'mismatch', 'mk', 96.0, sep30(12, 0)],
    [2240, 'stripe', 'de', 'EUR', 19.99, 'fx', 'ar', 110.5, sep30(17, 30)],
    [2233, 'adyen', 'uk', 'GBP', 402.00, 'duplicate', 'jb', 116.0, sep30(13, 0)],
    [2219, 'paypal', 'de', 'EUR', 880.00, 'missing', 'ps', 143.0, sep30(9, 45)]
  ];

  function makeRecord(n, provider, entity, currency, amount, reason) {
    return {
      id: 'EX-' + n, n: n, provider: provider, entity: entity, currency: currency,
      amount: amount, eur: round2(amount * fx[currency]), reason: reason,
      status: 'new', assignee: null, opened: 0, resolved: null, resolvedBy: null, notes: []
    };
  }

  var exceptions = [];
  var anchors = {};
  OPEN.forEach(function (o) {
    var r = makeRecord(o[0], o[1], o[2], o[3], o[4], o[5]);
    r.status = o[6]; r.assignee = o[7]; r.opened = ago(o[8]);
    exceptions.push(r); anchors[r.n] = r;
  });
  RESOLVED.forEach(function (o) {
    var r = makeRecord(o[0], o[1], o[2], o[3], o[4], o[5]);
    r.status = 'resolved'; r.resolvedBy = o[6]; r.opened = ago(o[7]); r.resolved = o[8];
    r.assignee = people[o[6]] ? o[6] : null;
    exceptions.push(r); anchors[r.n] = r;
  });

  // Older history: every other id is generated, resolved before 30 Sep 00:00, so the hand-set
  // anchors alone decide yesterday's numbers.
  var FIRST_ID = 1610;
  var CUTOFF = Date.UTC(2026, 8, 30);
  var INCIDENT_DAY = Date.UTC(2026, 8, 22);
  var anchorIds = Object.keys(anchors).map(Number).sort(function (a, b) { return a - b; });
  var minAnchor = anchorIds[0];
  var openedFor = {};
  var t = anchors[minAnchor].opened;
  for (var id = minAnchor - 1; id >= FIRST_ID; id--) {
    t -= (24 / 11.2) * (0.55 + 0.9 * rnd()) * H;
    openedFor[id] = t;
  }
  for (var k = 0; k < anchorIds.length - 1; k++) {
    var a = anchorIds[k], b = anchorIds[k + 1];
    for (var j = a + 1; j < b; j++) {
      openedFor[j] = anchors[a].opened + (anchors[b].opened - anchors[a].opened) * (j - a) / (b - a);
    }
  }
  var team = ['ar', 'jb', 'ps', 'lm', 'mk'];
  for (var n = FIRST_ID; n < anchorIds[anchorIds.length - 1]; n++) {
    if (anchors[n]) continue;
    var opened = openedFor[n];
    var incident = opened >= INCIDENT_DAY && opened < INCIDENT_DAY + D && rnd() < 0.6;
    var provider = incident ? 'adyen' : weighted([['stripe', 0.36], ['adyen', 0.27], ['paypal', 0.23], ['klarna', 0.14]]);
    var ent = entities[0];
    var pickE = weighted([['de', 0.58], ['uk', 0.28], ['se', 0.14]]);
    for (var e = 0; e < entities.length; e++) if (entities[e].id === pickE) ent = entities[e];
    var reason = incident ? 'missing' : weighted([['mismatch', 0.42], ['fx', 0.26], ['missing', 0.18], ['duplicate', 0.14]]);
    var eurAmt;
    if (reason === 'missing') eurAmt = incident ? 1200 + 3600 * rnd() : Math.exp(Math.log(1400) + 0.6 * normal());
    else if (reason === 'duplicate') eurAmt = Math.exp(Math.log(220) + 0.8 * normal());
    else if (reason === 'fx') eurAmt = Math.exp(Math.log(25) + 0.9 * normal());
    else eurAmt = rnd() < 0.22 ? 0.01 + 0.08 * rnd() : Math.exp(Math.log(60) + 1.1 * normal());
    eurAmt = Math.min(eurAmt, 6800);
    var amount = round2(eurAmt / fx[ent.currency]);
    if (amount < 0.01) amount = 0.01;
    var rec = makeRecord(n, provider, ent.id, ent.currency, amount, reason);
    rec.opened = opened;
    var ttr = Math.min(12, Math.max(0.08, Math.exp(Math.log(reason === 'missing' ? 1.0 : 1.7) + 0.75 * normal())));
    if (incident) ttr = 0.8 + 1.2 * rnd();
    var resolved = opened + ttr * D;
    if (resolved >= CUTOFF) resolved = opened + (CUTOFF - opened) * (0.35 + 0.6 * rnd());
    if (resolved - opened < 0.05 * D) resolved = opened + 0.05 * D;
    rec.status = 'resolved';
    rec.resolved = resolved;
    var by = reason === 'missing' && rnd() < 0.45 ? 'auto'
      : reason === 'mismatch' && eurAmt < 0.1 ? 'rule'
      : weighted([['ar', 0.24], ['jb', 0.21], ['ps', 0.21], ['lm', 0.17], ['mk', 0.08], ['auto', 0.09]]);
    rec.resolvedBy = by;
    rec.assignee = people[by] ? by : (rnd() < 0.5 ? team[Math.floor(rnd() * 4)] : null);
    exceptions.push(rec);
  }
  exceptions.sort(function (x, y) { return y.n - x.n; });

  /* ---------- Daily payout volume (matched vs unmatched), per provider × entity ---------- */

  var weekday = [0.74, 1.32, 1.02, 0.98, 0.97, 1.03, 0.80]; // Sun … Sat
  var series = [];
  var sr = mulberry32(0x5E41E5);
  for (var d = 0; d < SERIES_DAYS; d++) {
    var day = SERIES_START + d * D;
    var dow = new Date(day).getUTCDay();
    var base = 690000 * weekday[dow] * (1 + 0.0022 * (d - 59)) * (1 + 0.05 * normal(sr));
    var improve = 1.12 - 0.004 * d;
    var cells = [];
    for (var p = 0; p < providers.length; p++) {
      for (var q = 0; q < entities.length; q++) {
        var v = base * providers[p].share * entities[q].share * (1 + 0.07 * normal(sr));
        var rate = providers[p].rate * improve * (1 + 0.25 * normal(sr));
        rate = Math.min(0.2, Math.max(0.004, rate));
        if (providers[p].id === 'adyen' && day === INCIDENT_DAY) rate = 0.14;
        if (providers[p].id === 'adyen' && day === INCIDENT_DAY + D) rate = 0.055;
        cells.push({ provider: providers[p].id, entity: entities[q].id, v: v, u: v * rate });
      }
    }
    series.push({ t: day, cells: cells });
  }
  // Pin the two days the brief quotes: 1 Oct = 97.4 % matched, €18,240.55 unmatched; 30 Sep = 96.8 %.
  function pinDay(index, vTotal, uTotal) {
    var cells = series[index].cells;
    var sv = 0, su = 0, i;
    for (i = 0; i < cells.length; i++) { sv += cells[i].v; su += cells[i].u; }
    var accV = 0, accU = 0, big = 0;
    for (i = 0; i < cells.length; i++) {
      cells[i].v = round2(cells[i].v * vTotal / sv);
      cells[i].u = round2(cells[i].u * uTotal / su);
      accV += cells[i].v; accU += cells[i].u;
      if (cells[i].v > cells[big].v) big = i;
    }
    cells[big].v = round2(cells[big].v + (vTotal - accV));
    cells[big].u = round2(cells[big].u + (uTotal - accU));
  }
  pinDay(59, 701559.62, 18240.55);
  pinDay(58, 684212.40, 21894.80);
  series.forEach(function (s, idx) {
    if (idx < 58) s.cells.forEach(function (c) { c.v = round2(c.v); c.u = round2(c.u); });
  });

  var incidents = [{ t: INCIDENT_DAY, provider: 'adyen', label: 'Adyen settlement delay', short: 'Adyen delay' }];

  /* ---------- Team activity (newest first) ---------- */

  var activity = [
    { t: Date.UTC(2026, 9, 2, 8, 52), actor: 'jb', type: 'assign', id: 'EX-2296', to: 'ps' },
    { t: Date.UTC(2026, 9, 2, 8, 31), actor: 'lm', type: 'note', id: 'EX-2266', text: 'Klarna confirmed the duplicate was reversed; credit expected 5 Oct.' },
    { t: Date.UTC(2026, 9, 2, 7, 58), actor: 'ps', type: 'status', id: 'EX-2279', status: 'waiting', text: 'Adyen case 48213' },
    { t: Date.UTC(2026, 9, 2, 6, 12), actor: 'system', type: 'run', text: 'Nightly run for 1 Oct finished: 4,318 transactions matched, 9 new exceptions' },
    { t: Date.UTC(2026, 9, 2, 6, 4), actor: 'system', type: 'sync', text: 'Bank feeds synced: EUR ••4410, GBP ••7302, SEK ••1189' },
    { t: oct1(17, 42), actor: 'ar', type: 'resolve', id: 'EX-2281', text: 'matched to PayPal refund batch' },
    { t: oct1(16, 40), actor: 'ps', type: 'resolve', id: 'EX-2236', text: 'late Stripe payout arrived' },
    { t: oct1(16, 10), actor: 'rule', type: 'rule', text: 'Rule “Klarna fee tolerance ±€0.05” resolved 6 exceptions' }
  ];

  // Hand-written history for records the activity feed mentions.
  var notes = {
    'EX-2296': [{ t: Date.UTC(2026, 9, 2, 8, 52), who: 'jb', text: 'Assigned to Priya Shah' }],
    'EX-2266': [
      { t: Date.UTC(2026, 8, 29, 11, 20), who: 'mk', text: 'Assigned to Leo Martin' },
      { t: Date.UTC(2026, 8, 30, 9, 5), who: 'lm', text: 'Status → Waiting on provider · Klarna ticket KL-77310' },
      { t: Date.UTC(2026, 9, 2, 8, 31), who: 'lm', text: 'Note: Klarna confirmed the duplicate was reversed; credit expected 5 Oct.' }
    ],
    'EX-2279': [
      { t: Date.UTC(2026, 8, 30, 10, 40), who: 'mk', text: 'Assigned to Priya Shah' },
      { t: Date.UTC(2026, 8, 30, 14, 15), who: 'ps', text: 'Status → Investigating' },
      { t: Date.UTC(2026, 9, 2, 7, 58), who: 'ps', text: 'Status → Waiting on provider · Adyen case 48213' }
    ]
  };

  var data = {
    H: H, D: D, NOW: NOW, TODAY: TODAY, SERIES_START: SERIES_START,
    providers: providers, entities: entities, fx: fx, reasons: reasons, statuses: statuses,
    people: people, me: 'mk', exceptions: exceptions, series: series, incidents: incidents,
    activity: activity, notes: notes, mulberry32: mulberry32,
    run: { day: Date.UTC(2026, 9, 1), finished: Date.UTC(2026, 9, 2, 6, 12), transactions: 4318 }
  };
  root.LEDGERLINE_DATA = data;
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
