/* Ledgerline prototype: state, derived numbers and actions (no DOM in here). */
(function () {
  'use strict';
  var D = window.LedgerlineData;
  var DAY = D.DAY, HOUR = D.HOUR, MIN = D.MIN;
  var SEEDS = { production: 1422, sandbox: 217 };
  var URGENT_AGE = 3 * DAY, URGENT_EUR = 5000;
  var LOADED = Date.now();

  function index(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }

  var LL = window.LL = {
    D: D, db: null, byId: {},
    URGENT_AGE: URGENT_AGE, URGENT_EUR: URGENT_EUR,
    people: index(D.PEOPLE), providers: index(D.PROVIDERS), entities: index(D.ENTITIES),
    reasons: index(D.REASONS), statuses: index(D.STATUSES),
    state: {
      env: 'production', period: '1', from: 0, to: 0,
      provider: 'all', entity: 'all',
      status: 'open', view: 'all', query: '',
      sort: { key: 'age', dir: 'desc' },
      selected: null, pinned: {}, chartDay: 29
    }
  };

  LL.load = function (env) {
    LL.state.env = env;
    LL.db = D.generate(SEEDS[env]);
    LL.byId = index(LL.db.exceptions);
    LL.state.selected = null; LL.state.pinned = {};
  };

  /* The prototype's clock starts at Fri 2 Oct 2026 08:42 and then runs in real time. */
  LL.now = function () { return D.NOW + (Date.now() - LOADED); };

  /* ---------- formatting ---------- */
  var nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  /* Dates are formatted by hand so every browser shows the same short forms ("1 Oct", "Thu 1 Oct"). */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  var dfDay = { format: function (t) { var d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; } };
  var dfWeek = { format: function (t) { return WD[new Date(t).getUTCDay()] + ' ' + dfDay.format(t); } };
  var dfLong = { format: function (t) { var d = new Date(t); return WD_LONG[d.getUTCDay()] + ' ' + dfDay.format(t) + ' ' + d.getUTCFullYear(); } };
  var dfTime = { format: function (t) { var d = new Date(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); } };

  LL.fmt = {
    money: function (n) { return nf2.format(n); },
    eur: function (n) { return (n < 0 ? '−€' : '€') + nf2.format(Math.abs(n)); },
    eur0: function (n) { return (n < 0 ? '−€' : '€') + nf0.format(Math.abs(n)); },
    int: function (n) { return nf0.format(n); },
    day: function (t) { return dfDay.format(t); },
    week: function (t) { return dfWeek.format(t); },
    long: function (t) { return dfLong.format(t); },
    time: function (t) { return dfTime.format(t); },
    dateTime: function (t) { return dfDay.format(t) + ', ' + dfTime.format(t); },
    rel: function (t) {
      var today = D.TODAY;
      if (t >= today) return dfTime.format(t);
      if (t >= today - DAY) return 'Yesterday ' + dfTime.format(t);
      return dfDay.format(t) + ' ' + dfTime.format(t);
    },
    age: function (ms) {
      if (ms < HOUR) return Math.max(1, Math.floor(ms / MIN)) + 'm';
      if (ms < DAY) return Math.floor(ms / HOUR) + 'h';
      return Math.floor(ms / DAY) + 'd ' + Math.floor((ms % DAY) / HOUR) + 'h';
    },
    ageLong: function (ms) {
      var d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
      var parts = [];
      if (d) parts.push(d + (d === 1 ? ' day' : ' days'));
      if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
      if (!d && m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
      return parts.join(' ') || 'just now';
    },
    days: function (ms) { return (ms / DAY).toFixed(1) + ' d'; },
    shortName: function (id) {
      if (!id) return 'Unassigned';
      var p = LL.people[id]; if (!p) return id;
      return p.me ? 'You' : p.first + ' ' + p.name.split(' ')[1].charAt(0) + '.';
    },
    actor: function (id) {
      if (id === 'system') return 'Ledgerline';
      var p = LL.people[id]; return p ? (p.me ? 'You' : p.first) : id;
    }
  };

  /* ---------- period & scope ---------- */
  LL.period = function () {
    var s = LL.state, from, to;
    if (s.period === 'custom') { from = s.from; to = s.to; } else { from = +s.period - 1; to = 0; }
    var len = from - to + 1;
    return {
      from: from, to: to, len: len, prevFrom: from + len, prevTo: to + len,
      start: D.TODAY - (from + 1) * DAY, end: D.TODAY - to * DAY,
      prevStart: D.TODAY - (from + len + 1) * DAY, prevEnd: D.TODAY - (from + 1) * DAY
    };
  };
  LL.dayStart = function (i) { return D.TODAY - (i + 1) * DAY; };

  LL.inScope = function (x) {
    var s = LL.state;
    return (s.provider === 'all' || x.provider === s.provider) && (s.entity === 'all' || x.entity === s.entity);
  };

  LL.volume = function (from, to) {
    var s = LL.state, tot = 0;
    for (var i = to; i <= from; i++) {
      var d = LL.db.days[i]; if (!d) continue;
      D.PROVIDERS.forEach(function (p, pi) {
        if (s.provider !== 'all' && p.id !== s.provider) return;
        D.ENTITIES.forEach(function (e, ei) {
          if (s.entity === 'all' || e.id === s.entity) tot += d.vol[pi][ei];
        });
      });
    }
    return tot;
  };

  LL.isOpen = function (x) { return x.status !== 'resolved'; };
  LL.ageOf = function (x, now) { return (x.resolvedAt || now) - x.created; };
  LL.isUrgent = function (x, now) {
    return LL.isOpen(x) && (now - x.created >= URGENT_AGE || x.eur >= URGENT_EUR);
  };
  LL.urgentWhy = function (x, now) {
    var why = [];
    if (now - x.created >= URGENT_AGE) why.push('open ' + LL.fmt.ageLong(now - x.created) + ', past the 3‑day SLA');
    if (x.eur >= URGENT_EUR) why.push('amount of ' + LL.fmt.eur0(x.eur) + ' is above the €5,000 threshold');
    return why;
  };

  function median(a) {
    if (!a.length) return null;
    a = a.slice().sort(function (p, q) { return p - q; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* ---------- KPIs (everything derived from the same exceptions + volume data) ---------- */
  LL.kpis = function () {
    var p = LL.period(), now = LL.now();
    var ex = LL.db.exceptions.filter(LL.inScope);
    function flagged(from, to) {
      var sum = 0, n = 0, open = 0;
      ex.forEach(function (x) { if (x.day <= from && x.day >= to) { sum += x.eur; n++; if (LL.isOpen(x)) open += x.eur; } });
      return { sum: sum, n: n, open: open };
    }
    function openAt(t) { return ex.filter(function (x) { return x.created <= t && (!x.resolvedAt || x.resolvedAt > t); }); }
    function ttr(a, b) {
      return ex.filter(function (x) { return x.resolvedAt && x.resolvedAt >= a && x.resolvedAt < b; })
        .map(function (x) { return x.resolvedAt - x.created; });
    }
    var cu = flagged(p.from, p.to), pu = flagged(p.prevFrom, p.prevTo);
    var cv = LL.volume(p.from, p.to), pv = LL.volume(p.prevFrom, p.prevTo);
    var openNow = openAt(now), openPrev = openAt(now - p.len * DAY);
    var tc = ttr(p.start, p.end), tp = ttr(p.prevStart, p.prevEnd);
    return {
      period: p,
      rate: { cur: cv ? (cv - cu.sum) / cv * 100 : 100, prev: pv ? (pv - pu.sum) / pv * 100 : 100, matched: cv - cu.sum, total: cv },
      unmatched: { cur: cu.sum, prev: pu.sum, n: cu.n, open: cu.open },
      open: {
        cur: openNow.length, prev: openPrev.length,
        urgent: openNow.filter(function (x) { return LL.isUrgent(x, now); }).length,
        unassigned: openNow.filter(function (x) { return !x.assignee; }).length
      },
      ttr: { cur: median(tc), prev: median(tp), n: tc.length }
    };
  };

  /* ---------- chart series: last 30 complete days ---------- */
  LL.series = function () {
    var out = [];
    for (var i = 29; i >= 0; i--) {
      var total = LL.volume(i, i), un = 0;
      LL.db.exceptions.forEach(function (x) { if (x.day === i && LL.inScope(x)) un += x.eur; });
      out.push({ i: i, t: LL.dayStart(i), label: LL.fmt.day(LL.dayStart(i)), matched: total - un, unmatched: un, total: total });
    }
    return out;
  };

  /* ---------- table rows ---------- */
  LL.rows = function () {
    var s = LL.state, p = LL.period(), now = LL.now();
    var q = s.query.trim().toLowerCase().replace(/,/g, '');
    function statusOk(x) {
      var resolvedInPeriod = x.status === 'resolved' && x.resolvedAt >= p.start && (p.to === 0 || x.resolvedAt < p.end);
      if (s.status === 'open') return LL.isOpen(x);
      if (s.status === 'resolved') return resolvedInPeriod;
      if (s.status === 'all') return LL.isOpen(x) || resolvedInPeriod;
      return x.status === s.status;
    }
    var base = LL.db.exceptions.filter(function (x) { return LL.inScope(x) && (s.pinned[x.id] || statusOk(x)); });
    var counts = { all: base.length, urgent: 0, unassigned: 0, mine: 0 };
    base.forEach(function (x) {
      if (LL.isUrgent(x, now)) counts.urgent++;
      if (!x.assignee && LL.isOpen(x)) counts.unassigned++;
      if (x.assignee === 'ms') counts.mine++;
    });
    var rows = base.filter(function (x) {
      if (s.pinned[x.id]) return true;
      if (s.view === 'urgent') return LL.isUrgent(x, now);
      if (s.view === 'unassigned') return !x.assignee && LL.isOpen(x);
      if (s.view === 'mine') return x.assignee === 'ms';
      return true;
    }).filter(function (x) {
      if (!q) return true;
      var hay = [x.id, x.ref, x.amount.toFixed(2), LL.providers[x.provider].name, LL.reasons[x.reason].name,
        LL.statuses[x.status].name, x.assignee ? LL.people[x.assignee].name : 'unassigned', x.currency].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    var dir = s.sort.dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var va, vb;
      if (s.sort.key === 'amount') { va = a.eur; vb = b.eur; }
      else if (s.sort.key === 'id') { va = +a.id.slice(3); vb = +b.id.slice(3); }
      else { va = LL.ageOf(a, now); vb = LL.ageOf(b, now); }
      return va === vb ? (+a.id.slice(3) - +b.id.slice(3)) : (va - vb) * dir;
    });
    return { rows: rows, counts: counts };
  };

  /* ---------- events ---------- */
  LL.feed = function (limit) {
    return LL.db.events.filter(function (e) {
      if (!e.ex) return true;
      var x = LL.byId[e.ex]; return x && LL.inScope(x);
    }).slice(0, limit || 8);
  };
  LL.timeline = function (x) {
    var items = LL.db.events.filter(function (e) { return e.ex === x.id; }).slice().reverse();
    var nightly = new Date(x.created).getUTCHours() < 8;
    items.unshift({ t: x.created, actor: 'system', type: 'flagged', ex: x.id, text: nightly ? 'Flagged by the nightly run' : 'Flagged by the intraday run' });
    return items;
  };

  /* ---------- actions: each returns an undo function ---------- */
  function snapshot(x) {
    return { status: x.status, statusAt: x.statusAt, resolvedAt: x.resolvedAt, resolvedBy: x.resolvedBy,
      assignee: x.assignee, assignedAt: x.assignedAt, assignedBy: x.assignedBy, notes: x.notes.slice() };
  }
  function record(evt) { LL.db.events.unshift(evt); return evt; }
  function undoer(x, snap, evt) {
    return function () {
      Object.keys(snap).forEach(function (k) { x[k] = snap[k]; });
      var i = LL.db.events.indexOf(evt); if (i !== -1) LL.db.events.splice(i, 1);
    };
  }
  LL.act = {
    assign: function (x, who) {
      var snap = snapshot(x), t = LL.now();
      x.assignee = who || null; x.assignedAt = t; x.assignedBy = 'ms';
      LL.state.pinned[x.id] = true;
      return undoer(x, snap, record({ t: t, actor: 'ms', type: who ? 'assigned' : 'unassigned', ex: x.id, to: who }));
    },
    status: function (x, st) {
      var snap = snapshot(x), t = LL.now();
      x.status = st; x.statusAt = t;
      if (st === 'resolved') { x.resolvedAt = t; x.resolvedBy = 'ms'; if (!x.assignee) x.assignee = 'ms'; }
      else { x.resolvedAt = null; x.resolvedBy = null; }
      LL.state.pinned[x.id] = true;
      var type = st === 'resolved' ? 'resolved' : snap.status === 'resolved' ? 'reopened' : 'status';
      return undoer(x, snap, record({ t: t, actor: 'ms', type: type, ex: x.id, to: st }));
    },
    note: function (x, text) {
      var snap = snapshot(x), t = LL.now();
      x.notes.push({ t: t, by: 'ms', text: text });
      return undoer(x, snap, record({ t: t, actor: 'ms', type: 'note', ex: x.id, text: text }));
    }
  };

  /* ---------- per-exception detail (deterministic from the exception's seed) ---------- */
  LL.detail = function (x) {
    var r = x.seed, p = LL.providers[x.provider], e = LL.entities[x.entity];
    function rnd() { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r / 4294967296; }
    var expectedOn = LL.fmt.day(LL.dayStart(x.day));
    var gross, expected, received, summary;
    if (x.reason === 'missing') {
      expected = x.amount; received = 0;
      summary = p.name + ' reports a payout of ' + LL.fmt.money(x.amount) + ' ' + x.currency + ' for ' + expectedOn +
        ', but no matching deposit has arrived on ' + e.account + '.';
    } else if (x.reason === 'mismatch') {
      gross = Math.round((x.amount * (6 + rnd() * 30) + 400 + rnd() * 9000) * 100) / 100;
      expected = gross; received = Math.round((gross - x.amount) * 100) / 100;
      summary = 'The ' + expectedOn + ' deposit is ' + LL.fmt.money(x.amount) + ' ' + x.currency + ' short of the ' + p.name +
        ' payout total. Likely an unbooked fee, refund or chargeback.';
    } else if (x.reason === 'duplicate') {
      expected = x.amount; received = Math.round(x.amount * 200) / 100;
      summary = 'Order BW-' + (100000 + Math.floor(rnd() * 90000)) + ' appears twice in the ' + p.name +
        ' settlement for ' + expectedOn + '. One of the two lines has no matching order.';
    } else {
      gross = Math.round((x.amount * (40 + rnd() * 160)) * 100) / 100;
      expected = gross; received = Math.round((gross - x.amount) * 100) / 100;
      summary = p.name + ' converted at a different rate than the order currency reference, leaving ' +
        LL.fmt.money(x.amount) + ' ' + x.currency + ' unexplained.';
    }
    return { summary: summary, expected: expected, received: received, difference: x.amount, expectedOn: expectedOn };
  };
})();
