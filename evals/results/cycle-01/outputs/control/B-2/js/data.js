/* Ledgerline · sample data, queries and formatters.
   Everything is generated in the browser from a fixed seed and anchored to
   today's date, so "yesterday's run" always means yesterday. No backend. */
(function () {
  'use strict';
  const LL = (window.LL = window.LL || {});

  /* ---------- seeded randomness ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20261001);
  const between = (a, b) => a + (b - a) * rand();
  const int = (a, b) => Math.floor(between(a, b + 1));
  const chance = (p) => rand() < p;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pickW = (items) => {
    let r = rand() * items.reduce((s, i) => s + i.w, 0);
    for (const i of items) { r -= i.w; if (r <= 0) return i; }
    return items[items.length - 1];
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const logn = (median, sigma) => median * Math.exp(sigma * normal());
  const round2 = (n) => Math.round(n * 100) / 100;
  const digits = (n) => { let s = ''; for (let i = 0; i < n; i++) s += int(0, 9); return s; };
  const b36 = (n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[int(0, 35)]; return s; };

  /* ---------- time ---------- */
  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dayStart = (offset) => { const d = new Date(base); d.setDate(d.getDate() + offset); return d.getTime(); };
  const at = (offset, h, m) => dayStart(offset) + h * HOUR + m * MIN;
  const dayIndex = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - base.getTime()) / DAY); };
  // The screen is "opened" at 08:47 this morning; the daily run finished at 06:12.
  const NOW = at(0, 8, 47);
  const RUN_AT = { h: 6, m: 12 };
  // Resolutions happen in office hours.
  function workHours(t) {
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < 7.5 || h > 18.5) {
      if (h > 18.5) d.setDate(d.getDate() + 1);
      d.setHours(7, 35 + int(0, 140), int(0, 59), 0);
    }
    return d.getTime();
  }

  /* ---------- reference data ---------- */
  const providers = [
    { id: 'stripe', name: 'Stripe', share: 0.36, base: 0.017, w: 0.21 },
    { id: 'adyen', name: 'Adyen', share: 0.27, base: 0.021, w: 0.22 },
    { id: 'paypal', name: 'PayPal', share: 0.18, base: 0.029, w: 0.24 },
    { id: 'klarna', name: 'Klarna', share: 0.13, base: 0.036, w: 0.23 },
    { id: 'mollie', name: 'Mollie', share: 0.06, base: 0.019, w: 0.1 },
  ];
  const entities = [
    { id: 'nl', name: 'Northwind Commerce B.V.', country: 'NL', currency: 'EUR', account: 'ING ••4021', share: 0.41, w: 0.4 },
    { id: 'de', name: 'Northwind Commerce GmbH', country: 'DE', currency: 'EUR', account: 'Commerzbank ••7710', share: 0.31, w: 0.3 },
    { id: 'uk', name: 'Northwind Commerce Ltd', country: 'UK', currency: 'GBP', account: 'Barclays ••3390', share: 0.18, w: 0.18 },
    { id: 'se', name: 'Northwind Commerce AB', country: 'SE', currency: 'SEK', account: 'SEB ••1187', share: 0.1, w: 0.12 },
  ];
  const fx = { EUR: 1, GBP: 1.1685, USD: 0.9132, SEK: 0.0874, DKK: 0.1341 };
  const reasons = [
    { id: 'mismatch', label: 'Amount mismatch', w: 0.36 },
    { id: 'missing', label: 'Missing payout', w: 0.22 },
    { id: 'fx', label: 'FX difference', w: 0.24 },
    { id: 'duplicate', label: 'Duplicate', w: 0.18 },
  ];
  const statuses = [
    { id: 'new', label: 'New' },
    { id: 'investigating', label: 'Investigating' },
    { id: 'waiting', label: 'Waiting on provider' },
    { id: 'resolved', label: 'Resolved' },
  ];
  const people = [
    { id: 'jw', name: 'Jonas Weber', first: 'Jonas', initials: 'JW', hue: 226, you: true, w: 0.08 },
    { id: 'ar', name: 'Ana Ribeiro', first: 'Ana', initials: 'AR', hue: 344, w: 0.26 },
    { id: 'mo', name: 'Malik Osei', first: 'Malik', initials: 'MO', hue: 158, w: 0.22 },
    { id: 'sl', name: 'Sofia Lindqvist', first: 'Sofia', initials: 'SL', hue: 268, w: 0.18 },
    { id: 'tb', name: 'Tom Brennan', first: 'Tom', initials: 'TB', hue: 28, w: 0.14 },
    { id: 'pn', name: 'Priya Nair', first: 'Priya', initials: 'PN', hue: 196, w: 0.12 },
  ];
  const byId = (list) => Object.fromEntries(list.map((i) => [i.id, i]));
  const P = byId(people), PR = byId(providers), EN = byId(entities), RS = byId(reasons), ST = byId(statuses);

  /* ---------- daily volumes: 60 days × provider × entity ---------- */
  const HISTORY_DAYS = 60;
  const weekday = [1.07, 1.12, 1.0, 0.97, 0.98, 1.03, 0.9]; // Sun → Sat
  // Multipliers on the unmatched share: incidents that show up in the trend.
  const incidents = { '-9': { klarna: 6.2 }, '-17': { paypal: 3.1 }, '-24': { adyen: 2.3 }, '-1': { klarna: 1.8 } };
  const notes = { '-9': 'Klarna payout delayed 2 days', '-17': 'PayPal FX rate feed outage', '-1': 'Klarna settlement report missing' };
  const daily = [];
  for (let d = -HISTORY_DAYS; d <= -1; d++) {
    const wd = new Date(dayStart(d)).getDay();
    const total = 652000 * weekday[wd] * (1 + 0.0011 * (d + HISTORY_DAYS)) * (1 + 0.045 * normal());
    const inc = incidents[String(d)] || {};
    for (const p of providers) {
      for (const e of entities) {
        const value = total * p.share * e.share * (1 + 0.07 * normal());
        const share = Math.min(0.6, p.base * Math.exp(0.2 * normal()) * (inc[p.id] || 1));
        const count = Math.round(value / between(61, 72));
        daily.push({
          d, provider: p.id, entity: e.id,
          value: round2(value), unmatched: round2(value * share),
          count, unmatchedCount: Math.round(count * share * between(0.85, 1.15)),
        });
      }
    }
  }

  /* ---------- exceptions raised by 75 daily runs ---------- */
  const medianEur = { mismatch: 190, missing: 2300, fx: 64, duplicate: 150 };
  const medianDays = { mismatch: 1.25, missing: 2.3, fx: 0.95, duplicate: 0.85 };
  const surges = {
    '-8': { provider: 'klarna', reason: 'missing', n: 8 },
    '-16': { provider: 'paypal', reason: 'fx', n: 6 },
    '0': { provider: 'klarna', reason: 'missing', n: 4 },
  };
  const resolutions = {
    mismatch: ['Matched manually', 'Fee adjustment booked', 'Partial refund matched'],
    missing: ['Payout located in bank feed', 'Provider re-sent payout'],
    fx: ['FX difference booked to 7940', 'Matched at provider rate'],
    duplicate: ['Duplicate entry voided', 'Duplicate payout reversed'],
  };
  const refFor = {
    stripe: () => 'po_' + b36(14),
    adyen: () => 'ADY-' + digits(4) + '-' + digits(6),
    paypal: () => 'PP-SETT-' + digits(9),
    klarna: () => 'KL-PO-' + digits(8),
    mollie: () => 'stl_' + b36(10),
  };

  function raise(runDay, forced) {
    const provider = forced ? forced.provider : pickW(providers).id;
    const entity = pickW(entities);
    const reason = forced ? forced.reason : pickW(reasons).id;
    let currency = entity.currency;
    if (reason === 'fx') currency = entity.currency === 'EUR' ? pick(['USD', 'GBP', 'USD', 'DKK']) : pick(['EUR', 'USD']);
    else if (provider === 'paypal' && chance(0.22)) currency = 'USD';
    let eur = forced && reason === 'missing' ? logn(2900, 0.55) : logn(medianEur[reason], reason === 'missing' ? 0.8 : 1.05);
    eur = Math.min(Math.max(eur, 3.2), 46000);
    const amount = round2(eur / fx[currency]);
    const created = at(runDay, RUN_AT.h, RUN_AT.m) + int(5, 220) * 1000;
    const days = forced ? logn(reason === 'missing' ? 2.0 : 1.1, 0.45) : logn(medianDays[reason], 0.85);
    return { provider, entity: entity.id, reason, currency, amount, created, runDay, willResolve: workHours(created + Math.max(0.05, days) * DAY) };
  }

  const raw = [];
  for (let k = -74; k <= 0; k++) {
    const wd = new Date(dayStart(k)).getDay();
    const n = Math.round(between(9, 15) * (wd === 1 ? 1.2 : 1));
    for (let i = 0; i < n; i++) raw.push(raise(k));
    const s = surges[String(k)];
    if (s) for (let i = 0; i < s.n; i++) raw.push(raise(k, s));
  }
  raw.sort((a, b) => a.created - b.created);

  const exceptions = raw.map((r, i) => {
    const x = {
      id: 'EX-' + (1490 + i), provider: r.provider, entity: r.entity, reason: r.reason,
      currency: r.currency, amount: r.amount, eur: round2(r.amount * fx[r.currency]), created: r.created,
      status: 'new', assignee: null, resolvedAt: null, resolver: null, resolution: null,
      orders: r.reason === 'missing' ? int(24, 160) : r.reason === 'duplicate' ? 1 : int(1, 5),
      payoutRef: refFor[r.provider](),
      log: [{ t: r.created, text: 'Raised by the daily run' }],
    };
    // What the run expected vs what actually landed, in the exception's currency.
    if (r.reason === 'missing') { x.expected = r.amount; x.received = 0; }
    else if (r.reason === 'duplicate') { x.expected = r.amount; x.received = round2(r.amount * 2); }
    else if (r.reason === 'fx') { x.expected = round2(r.amount * between(18, 60)); x.received = round2(x.expected - r.amount); }
    else { x.expected = round2(r.amount * between(5, 40)); x.received = round2(chance(0.2) ? x.expected + r.amount : x.expected - r.amount); }

    if (r.willResolve <= NOW) {
      const auto = r.reason === 'missing' && chance(0.35);
      const who = auto ? null : pickW(people);
      if (who) {
        const ta = workHours(r.created + between(0.5, 5) * HOUR);
        if (ta < r.willResolve) x.log.push({ t: ta, text: 'Assigned to ' + who.name });
      }
      x.status = 'resolved';
      x.assignee = who ? who.id : null;
      x.resolver = who ? who.id : 'system';
      x.resolvedAt = r.willResolve;
      x.resolution = auto ? 'Late payout auto-matched' : pick(resolutions[r.reason]);
      x.log.push({ t: x.resolvedAt, text: auto ? 'Auto-matched when the payout arrived' : 'Resolved by ' + who.name + ' · ' + x.resolution });
    } else if (r.runDay < 0) {
      const who = pickW(people);
      const ta = workHours(r.created + between(0.4, 4) * HOUR);
      x.assignee = who.id;
      x.log.push({ t: ta, text: 'Assigned to ' + who.name });
      if (r.reason === 'missing' ? chance(0.75) : chance(0.3)) {
        x.status = 'waiting';
        x.log.push({ t: Math.min(NOW - 40 * MIN, workHours(ta + between(1, 20) * HOUR)), text: 'Marked waiting on provider' });
      } else {
        x.status = 'investigating';
      }
      if ((NOW - r.created) / DAY > 1.5 && chance(0.1)) { // slipped through triage
        x.status = 'new'; x.assignee = null; x.log.length = 1;
      }
    }
    return x;
  });
  const EX = byId(exceptions);

  /* ---------- this morning's activity (scripted on top of the generated data) ---------- */
  const events = [];
  const isOpen = (x) => x.status !== 'resolved';
  const older = exceptions.filter((x) => x.status === 'investigating' && x.created < dayStart(-1));
  const fresh = exceptions.filter((x) => x.status === 'new' && x.created > dayStart(0));
  function scriptResolve(x, who, t, resolution) {
    Object.assign(x, { status: 'resolved', assignee: who, resolver: who, resolvedAt: t, resolution });
    x.log.push({ t, text: 'Resolved by ' + P[who].name + ' · ' + resolution });
    events.push({ t, actor: who, type: 'resolved', ex: x.id, detail: resolution });
  }
  if (older.length >= 4) {
    scriptResolve(older[0], 'ar', at(0, 7, 48), pick(resolutions[older[0].reason]));
    scriptResolve(older[older.length - 1], 'mo', at(0, 8, 12), pick(resolutions[older[older.length - 1].reason]));
    scriptResolve(older[Math.floor(older.length / 2)], 'ar', at(0, 8, 31), pick(resolutions[older[Math.floor(older.length / 2)].reason]));
    const w = older.find((x) => isOpen(x) && x.provider === 'adyen') || older.find(isOpen);
    if (w) {
      w.status = 'waiting';
      w.log.push({ t: at(0, 8, 9), text: 'Marked waiting on provider · Adyen case 2210-4471' });
      events.push({ t: at(0, 8, 9), actor: 'sl', type: 'waiting', ex: w.id, detail: 'Adyen case 2210-4471' });
    }
  }
  if (fresh.length >= 6) {
    const a = fresh[2];
    a.assignee = 'ar';
    a.log.push({ t: at(0, 8, 5), text: 'Assigned to Ana Ribeiro by Malik Osei' });
    events.push({ t: at(0, 8, 5), actor: 'mo', type: 'assigned', ex: a.id, target: 'ar' });
    const b = fresh[5];
    Object.assign(b, { assignee: 'pn', status: 'investigating' });
    b.log.push({ t: at(0, 8, 22), text: 'Picked up by Priya Nair' });
    events.push({ t: at(0, 8, 22), actor: 'pn', type: 'picked', ex: b.id });
  }
  // Two high-value items, so "urgent" covers both rules (age and amount).
  const setEur = (x, eur) => {
    if (!x) return;
    x.amount = round2(eur / fx[x.currency]);
    x.eur = round2(x.amount * fx[x.currency]);
    if (x.reason === 'missing') x.expected = x.amount;
    else if (x.reason === 'duplicate') { x.expected = x.amount; x.received = round2(x.amount * 2); }
    else x.received = round2(x.expected - x.amount);
  };
  setEur(exceptions.find((x) => x.provider === 'klarna' && x.reason === 'missing' && x.status === 'new' && x.created > dayStart(0)), 8412.9);
  setEur(exceptions.find((x) => x.status === 'investigating' && x.reason === 'mismatch' && x.created > dayStart(-2)), 6184.2);

  const chased = exceptions
    .filter((x) => x.status === 'waiting' && x.created < dayStart(-2))
    .sort((a, b) => (a.provider === 'paypal' ? -1 : 0) - (b.provider === 'paypal' ? -1 : 0) || a.created - b.created)[0];
  if (chased) {
    const text = PR[chased.provider].name + ' confirmed the reversal; credit expected with Monday’s payout.';
    chased.comments = [{ t: at(0, 8, 36), who: 'tb', text }];
    chased.log.push({ t: at(0, 8, 36), text: 'Tom Brennan: “' + text + '”' });
    events.push({ t: at(0, 8, 36), actor: 'tb', type: 'comment', ex: chased.id, detail: text });
  }
  events.push({ t: at(0, RUN_AT.h, RUN_AT.m) + 40e3, actor: 'system', type: 'run', ex: null });

  /* ---------- queries ---------- */
  const inScope = (r, f) => (!f || f.provider === 'all' || r.provider === f.provider) && (!f || f.entity === 'all' || r.entity === f.entity);
  function volume(from, to, f) {
    const o = { value: 0, unmatched: 0, count: 0, unmatchedCount: 0 };
    for (const r of daily) {
      if (r.d < from || r.d > to || !inScope(r, f)) continue;
      o.value += r.value; o.unmatched += r.unmatched; o.count += r.count; o.unmatchedCount += r.unmatchedCount;
    }
    return o;
  }
  function series(from, to, f) {
    const out = [];
    for (let d = from; d <= to; d++) out.push({ d, t: dayStart(d), value: 0, unmatched: 0, count: 0, unmatchedCount: 0, note: notes[String(d)] || null });
    for (const r of daily) {
      if (r.d < from || r.d > to || !inScope(r, f)) continue;
      const s = out[r.d - from];
      s.value += r.value; s.unmatched += r.unmatched; s.count += r.count; s.unmatchedCount += r.unmatchedCount;
    }
    return out;
  }
  const openAt = (t, f) => exceptions.filter((x) => inScope(x, f) && x.created <= t && (!x.resolvedAt || x.resolvedAt > t)).length;
  function resolveTimes(from, to, f) {
    const v = exceptions
      .filter((x) => x.resolvedAt && x.resolvedAt >= from && x.resolvedAt < to && inScope(x, f))
      .map((x) => (x.resolvedAt - x.created) / DAY)
      .sort((a, b) => a - b);
    if (!v.length) return { median: null, n: 0 };
    const m = v.length >> 1;
    return { median: v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2, n: v.length };
  }
  // Urgent = still open and either past the 3-day SLA or worth €5,000 or more.
  const SLA_DAYS = 3, HIGH_VALUE = 5000;
  const isUrgent = (x, now) => x.status !== 'resolved' && ((now - x.created) / DAY >= SLA_DAYS || x.eur >= HIGH_VALUE);

  /* ---------- formatters ---------- */
  const nf = (o) => new Intl.NumberFormat('en-GB', o);
  const n2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n0 = nf({ maximumFractionDigits: 0 });
  const symbols = { EUR: '€', GBP: '£', USD: '$' };
  const dDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const dShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  const tShort = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmt = {
    amount: (n) => n2.format(n),
    money: (n, ccy = 'EUR') => (symbols[ccy] ? (n < 0 ? '−' : '') + symbols[ccy] + n2.format(Math.abs(n)) : ccy + ' ' + n2.format(n)),
    eur: (n) => '€' + n2.format(n),
    eurCompact: (n) => (n >= 1e6 ? '€' + n1.format(n / 1e6) + 'M' : n >= 1e3 ? '€' + n0.format(n / 1e3) + 'k' : '€' + n0.format(n)),
    compact: (n) => (n >= 1e3 ? n1.format(n / 1e3).replace(/\.0$/, '') + 'k' : n0.format(n)),
    int: (n) => n0.format(n),
    one: (n) => n1.format(n),
    pct: (n, dp = 1) => nf({ minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n) + '%',
    day: (t) => dDay.format(t).replace(',', ''),
    date: (t) => dShort.format(t),
    time: (t) => tShort.format(t),
    when: (t) => {
      const i = dayIndex(t);
      return i === 0 ? tShort.format(t) : i === -1 ? 'Yesterday ' + tShort.format(t) : dShort.format(t);
    },
    age: (ms) => {
      const h = ms / HOUR;
      return h < 1 ? '<1 h' : h < 24 ? Math.floor(h) + ' h' : Math.floor(h / 24) + ' d';
    },
    iso: (t) => new Date(t).toISOString(),
  };

  LL.data = {
    NOW, MIN, HOUR, DAY, RUN_AT, SLA_DAYS, HIGH_VALUE, dayStart, dayIndex, at,
    providers, entities, fx, reasons, statuses, people, P, PR, EN, RS, ST,
    daily, exceptions, EX, events, notes,
  };
  LL.q = { volume, series, openAt, resolveTimes, inScope, isUrgent };
  LL.fmt = fmt;
})();
