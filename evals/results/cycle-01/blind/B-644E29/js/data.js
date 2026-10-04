/* Ledgerline prototype: deterministic sample data.
   Everything on the page (KPIs, chart, table, feed) is derived from this one dataset,
   so the numbers agree with each other. Times are local wall-clock values stored as UTC. */
(function () {
  'use strict';

  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  var NOW = Date.UTC(2026, 9, 2, 8, 42);   // Fri 2 Oct 2026, 08:42
  var TODAY = Date.UTC(2026, 9, 2);
  var HISTORY_DAYS = 64;
  var BASE_VOLUME = 640000;                // EUR settled per business day, all providers
  var WEEKDAY_FACTOR = [0.74, 1.10, 1.03, 1.0, 0.98, 1.05, 0.80]; // Sun..Sat

  var PROVIDERS = [
    { id: 'stripe', name: 'Stripe', share: 0.40 },
    { id: 'adyen', name: 'Adyen', share: 0.30 },
    { id: 'paypal', name: 'PayPal', share: 0.18 },
    { id: 'klarna', name: 'Klarna', share: 0.12 }
  ];
  var ENTITIES = [
    { id: 'de', name: 'Brightwater GmbH', country: 'DE', base: 'EUR', account: 'EUR ··4410', share: 0.55,
      currencies: [['EUR', 0.86], ['CHF', 0.09], ['USD', 0.05]] },
    { id: 'uk', name: 'Brightwater Ltd', country: 'UK', base: 'GBP', account: 'GBP ··0921', share: 0.25,
      currencies: [['GBP', 0.90], ['USD', 0.10]] },
    { id: 'nl', name: 'Brightwater B.V.', country: 'NL', base: 'EUR', account: 'EUR ··7735', share: 0.20,
      currencies: [['EUR', 0.84], ['SEK', 0.16]] }
  ];
  var FX = { EUR: 1, GBP: 1.1684, USD: 0.9118, CHF: 1.0642, SEK: 0.0876 };
  var REASONS = [
    { id: 'missing', name: 'Missing payout', share: 0.22, ttr: 3.0 },
    { id: 'mismatch', name: 'Amount mismatch', share: 0.38, ttr: 1.6 },
    { id: 'duplicate', name: 'Duplicate', share: 0.18, ttr: 1.9 },
    { id: 'fx', name: 'FX difference', share: 0.22, ttr: 0.9 }
  ];
  var STATUSES = [
    { id: 'new', name: 'New' },
    { id: 'investigating', name: 'Investigating' },
    { id: 'waiting', name: 'Waiting on provider' },
    { id: 'resolved', name: 'Resolved' }
  ];
  var PEOPLE = [
    { id: 'ms', name: 'Maren Schulz', first: 'Maren', initials: 'MS', role: 'Finance Ops Manager', me: true },
    { id: 'ap', name: 'Ana Petrović', first: 'Ana', initials: 'AP', role: 'Senior Analyst' },
    { id: 'jw', name: 'Jonas Weber', first: 'Jonas', initials: 'JW', role: 'Analyst' },
    { id: 'pn', name: 'Priya Nair', first: 'Priya', initials: 'PN', role: 'Analyst' },
    { id: 'tb', name: 'Tom Becker', first: 'Tom', initials: 'TB', role: 'Analyst' },
    { id: 'lm', name: 'Lea Martin', first: 'Lea', initials: 'LM', role: 'Junior Analyst' }
  ];
  var RESOLVER_W = [['ap', 0.27], ['jw', 0.22], ['pn', 0.2], ['tb', 0.15], ['lm', 0.1], ['ms', 0.06]];
  var ASSIGN_W = [['ap', 0.22], ['jw', 0.2], ['pn', 0.2], ['tb', 0.15], ['lm', 0.1], ['ms', 0.13]];

  var NOTES = {
    missing: [
      'Opened a ticket with {p} support, case {n}.',
      'Payout shows as paid in the {p} dashboard; nothing on {a} yet.',
      'Bank confirms no incoming transfer as of this morning.'
    ],
    mismatch: [
      'Difference equals the {p} dispute fee; checking whether it was netted.',
      'Looks like a partial refund processed after the settlement cut-off.',
      'Fee table changed on 1 Sep; the rule still uses the old rate.'
    ],
    duplicate: [
      'Customer was charged twice for the same order; one charge already refunded.',
      'Second capture came from a webhook retry. Asked {p} to confirm it was voided.'
    ],
    fx: [
      'Rate used by {p} differs from the ECB reference by about 0.4%.',
      'Within tolerance after fees; proposing a write-off.'
    ]
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, items, key) {
    var x = r(), acc = 0, total = 0, i;
    for (i = 0; i < items.length; i++) total += key ? items[i][key] : items[i][1];
    x *= total;
    for (i = 0; i < items.length; i++) {
      acc += key ? items[i][key] : items[i][1];
      if (x < acc) return items[i];
    }
    return items[items.length - 1];
  }
  function lognormal(r, median, sigma) {
    var u = Math.max(r(), 1e-9), v = r();
    return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* Push a timestamp into working hours (Mon–Fri, 08:00–18:30). */
  function workingTime(t, r) {
    for (var guard = 0; guard < 8; guard++) {
      var dayStart = t - (t % DAY);
      var wd = new Date(dayStart).getUTCDay();
      var mins = (t - dayStart) / MIN;
      var next = (8 * 60 + 4 + r() * 75) * MIN;
      if (wd === 0 || wd === 6 || mins > 18 * 60 + 30) { t = dayStart + DAY + next; continue; }
      if (mins < 8 * 60) { t = dayStart + next; continue; }
      return Math.round(t / MIN) * MIN;
    }
    return t;
  }

  function reference(r, provider, created) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', s = '', i;
    if (provider === 'stripe') { for (i = 0; i < 14; i++) s += chars[Math.floor(r() * chars.length)]; return 'po_1Q' + s; }
    if (provider === 'adyen') return 'Settlement batch ' + (1180 + Math.floor((created - Date.UTC(2026, 6, 1)) / DAY));
    if (provider === 'paypal') { for (i = 0; i < 12; i++) s += 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'[Math.floor(r() * 33)]; return 'Transfer ' + s; }
    return 'Settlement ' + (4410000000 + Math.floor(r() * 899999999));
  }

  function makeException(r, dayIdx, start, vol) {
    var pIdx, eIdx;
    var p = pick(r, PROVIDERS, 'share'); pIdx = PROVIDERS.indexOf(p);
    var e = pick(r, ENTITIES, 'share'); eIdx = ENTITIES.indexOf(e);
    var reason = pick(r, REASONS, 'share');
    var cur = pick(r, e.currencies)[0];
    if (reason.id === 'fx' && cur === e.base) {
      var others = e.currencies.filter(function (c) { return c[0] !== e.base; });
      cur = others[Math.floor(r() * others.length)][0];
    }
    if (reason.id === 'missing') cur = e.base;   // payouts settle in the account's own currency
    var slice = vol[pIdx][eIdx], eur;
    if (reason.id === 'missing') eur = clamp(lognormal(r, 4600, 0.6), 650, slice * 0.45);
    else if (reason.id === 'mismatch') eur = clamp(lognormal(r, 64, 1.15), 0.35, 2600);
    else if (reason.id === 'duplicate') eur = clamp(lognormal(r, 120, 0.75), 9.9, 1800);
    else eur = clamp(lognormal(r, 7.5, 1.0), 0.11, 160);
    var amount = round2(eur / FX[cur]);
    if (reason.id === 'duplicate') amount = Math.max(9.9, Math.floor(amount) + [0.9, 0.95, 0, 0.5][Math.floor(r() * 4)]);
    eur = round2(amount * FX[cur]);

    // Exceptions are raised by the nightly run (next morning 06:00–06:25) or by intraday runs.
    var created = r() < 0.6
      ? start + DAY + (6 * 60 + r() * 25) * MIN
      : start + ([10, 14, 18, 22][Math.floor(r() * 4)] * 60 + r() * 12) * MIN;
    created = Math.round(created / 1000) * 1000;

    var x = {
      id: '', provider: p.id, entity: e.id, reason: reason.id, currency: cur, amount: amount, eur: eur,
      day: dayIdx, created: created, status: 'new', assignee: null, assignedAt: null, assignedBy: null,
      statusAt: created, resolvedAt: null, resolvedBy: null, notes: [],
      ref: reference(r, p.id, created), orders: 1, seed: Math.floor(r() * 1e9)
    };
    x.orders = reason.id === 'missing' ? 60 + Math.floor(r() * 340) : reason.id === 'fx' ? 1 + Math.floor(r() * 30) : 1 + Math.floor(r() * 2);

    var ttr = lognormal(r, reason.ttr * 0.95, 0.8) * DAY;
    if (reason.id === 'missing' && r() < 0.2) ttr *= 3.5;   // stuck with the provider
    var resolvedAt, by = null;
    if (reason.id === 'fx' && r() < 0.3) { resolvedAt = created + (2 + r() * 15) * MIN; by = 'rule'; }
    else resolvedAt = workingTime(created + ttr, r);

    if (resolvedAt <= NOW) {
      x.status = 'resolved'; x.resolvedAt = resolvedAt; x.statusAt = resolvedAt;
      x.resolvedBy = by || pick(r, RESOLVER_W)[0];
      x.assignee = by ? null : x.resolvedBy;
      return x;
    }
    var age = NOW - created, roll = r(), st;
    if (age < 5 * HOUR) st = roll < 0.85 ? 'new' : 'investigating';
    else if (reason.id === 'missing') st = roll < 0.62 ? 'waiting' : roll < 0.92 ? 'investigating' : 'new';
    else if (reason.id === 'mismatch') st = roll < 0.5 ? 'investigating' : roll < 0.78 ? 'new' : 'waiting';
    else if (reason.id === 'duplicate') st = roll < 0.5 ? 'investigating' : roll < 0.75 ? 'waiting' : 'new';
    else st = roll < 0.55 ? 'new' : 'investigating';
    x.status = st;
    x.assignee = st === 'new' && r() < 0.62 ? null : pick(r, ASSIGN_W)[0];
    function before(t, from) { return t >= NOW - 2 * MIN ? from + r() * (NOW - 2 * MIN - from) : t; }
    if (x.assignee) {
      x.assignedAt = Math.max(created + 3 * MIN, before(workingTime(created + age * (0.05 + 0.25 * r()), r), created));
      x.assignedBy = r() < 0.6 ? 'ms' : x.assignee;
    }
    if (st !== 'new') {
      var s = before(workingTime(created + age * (0.3 + 0.55 * r()), r), x.assignedAt || created);
      x.statusAt = Math.max(s, (x.assignedAt || created) + 4 * MIN);
      if (x.statusAt > NOW - MIN) x.statusAt = NOW - (2 + r() * 30) * MIN;
      if (r() < 0.55) {
        var pool = NOTES[reason.id], text = pool[Math.floor(r() * pool.length)];
        text = text.replace('{p}', p.name).replace('{a}', e.account).replace('{n}', '#' + (180000 + Math.floor(r() * 80000)));
        var nt = x.statusAt + (10 + r() * 240) * MIN;
        if (nt >= NOW - MIN) nt = x.statusAt + r() * (NOW - MIN - x.statusAt);
        x.notes.push({ t: nt, by: x.assignee, text: text });
      }
    }
    return x;
  }

  function generate(seed) {
    var r = mulberry32(seed);
    var days = [], exceptions = [], i, k;
    for (i = HISTORY_DAYS - 1; i >= 0; i--) {
      var start = TODAY - (i + 1) * DAY;
      var wd = new Date(start).getUTCDay();
      var f = WEEKDAY_FACTOR[wd] * (0.94 + 0.12 * r());
      var vol = PROVIDERS.map(function (p) {
        return ENTITIES.map(function (e) { return round2(BASE_VOLUME * f * p.share * e.share * (0.88 + 0.24 * r())); });
      });
      days[i] = { i: i, start: start, wd: wd, vol: vol };
      var n = Math.round((wd === 0 || wd === 6 ? 7 : 11) * (0.7 + 0.6 * r()));
      for (k = 0; k < n; k++) exceptions.push(makeException(r, i, start, vol));
    }
    exceptions.sort(function (a, b) { return a.created - b.created; });
    exceptions.forEach(function (x, idx) { x.id = 'EX-' + (1871 + idx); });

    var events = [];
    exceptions.forEach(function (x) {
      if (x.resolvedAt) {
        events.push({ t: x.resolvedAt, actor: x.resolvedBy === 'rule' ? 'system' : x.resolvedBy, type: x.resolvedBy === 'rule' ? 'rule' : 'resolved', ex: x.id });
        return;
      }
      if (x.assignedAt && x.assignedBy !== x.assignee) events.push({ t: x.assignedAt, actor: x.assignedBy, type: 'assigned', ex: x.id, to: x.assignee });
      if (x.status !== 'new') events.push({ t: x.statusAt, actor: x.assignee, type: 'status', ex: x.id, to: x.status });
      x.notes.forEach(function (n) { events.push({ t: n.t, actor: n.by, type: 'note', ex: x.id, text: n.text }); });
    });
    for (i = 0; i < 4; i++) {
      var runStart = TODAY - i * DAY;
      var flagged = exceptions.filter(function (x) { return x.day === i && x.created >= runStart; }).length;
      events.push({ t: runStart + (6 * 60 + 27) * MIN, actor: 'system', type: 'run', day: i, count: flagged });
    }
    events = events.filter(function (e) { return e.t <= NOW; }).sort(function (a, b) { return b.t - a.t; });

    return { seed: seed, days: days, exceptions: exceptions, events: events };
  }

  window.LedgerlineData = {
    MIN: MIN, HOUR: HOUR, DAY: DAY, NOW: NOW, TODAY: TODAY, HISTORY_DAYS: HISTORY_DAYS,
    PROVIDERS: PROVIDERS, ENTITIES: ENTITIES, FX: FX, REASONS: REASONS, STATUSES: STATUSES, PEOPLE: PEOPLE,
    generate: generate
  };
})();
