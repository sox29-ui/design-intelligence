/* Ledgerline — reconciliation overview behaviour. Vanilla JS, no dependencies. */
(function () {
  'use strict';

  const DATA = window.LEDGERLINE_DATA;
  if (!DATA) return;
  const { H, D, NOW, TODAY, SERIES_START } = DATA;
  const ME = DATA.me;
  const t0 = Date.now();
  const now = () => NOW + (Date.now() - t0);

  /* ---------- helpers ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const round1 = (v) => Math.round(v * 10) / 10;
  const round2 = (v) => Math.round(v * 100) / 100;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

  const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf4 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const money = (v) => nf2.format(v);
  const euro = (v) => (v < 0 ? '−€' : '€') + nf2.format(Math.abs(v));
  const euroShort = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return '€' + nf1.format(v / 1e6).replace(/\.0$/, '') + 'm';
    if (a >= 1e3) return '€' + nf0.format(v / 1e3) + 'k';
    return '€' + nf0.format(v);
  };

  // Fixed English abbreviations (Intl's en-GB writes "Sept", which clashes with "Oct" and the static copy).
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtYear = { format: (t) => String(new Date(t).getUTCFullYear()) };
  const day = (t) => { const d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
  const dayW = (t) => WEEKDAYS[new Date(t).getUTCDay()] + ' ' + day(t);
  const dayLong = (t) => dayW(t) + ' ' + fmtYear.format(t);
  const time = (t) => { const d = new Date(t); return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); };
  const stamp = (t) => (t >= TODAY ? 'Today' : t >= TODAY - D ? 'Yesterday' : day(t)) + ', ' + time(t);
  const isoLocal = (t) => new Date(t).toISOString().slice(0, 16);
  const ageText = (ms) => nf1.format(ms / D) + ' d';
  const parseDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };

  const svgAttrs = 'viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" focusable="false"';
  const ICON = {
    urgent: `<svg class="i-urgent" ${svgAttrs}><path d="M7 1.2 13.2 12.3H.8Z" fill="currentColor"/><path d="M7 5.2v3.3" stroke="#fff" stroke-width="1.5"/><circle cx="7" cy="10.3" r=".85" fill="#fff"/></svg>`,
    new: `<svg ${svgAttrs}><circle cx="7" cy="7" r="4.6" fill="currentColor"/></svg>`,
    investigating: `<svg ${svgAttrs}><circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 1.75a5.25 5.25 0 0 1 0 10.5Z" fill="currentColor"/></svg>`,
    waiting: `<svg ${svgAttrs}><circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3.9v3.4l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    resolved: `<svg ${svgAttrs}><circle cx="7" cy="7" r="6" fill="currentColor"/><path d="M4.2 7.2 6.1 9.1l3.7-4" fill="none" stroke="#fff" stroke-width="1.6"/></svg>`,
    up: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M5 1.2 9.2 8.6H.8Z" fill="currentColor"/></svg>',
    down: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M5 8.8.8 1.4h8.4Z" fill="currentColor"/></svg>',
    flat: '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1.5 5h7" stroke="currentColor" stroke-width="1.6"/></svg>'
  };

  const providerName = Object.fromEntries(DATA.providers.map((p) => [p.id, p.name]));
  const entityById = Object.fromEntries(DATA.entities.map((e) => [e.id, e]));
  const byId = new Map(DATA.exceptions.map((r) => [r.id, r]));
  const personName = (id) => (id === ME ? 'You' : DATA.people[id] ? DATA.people[id].name : '');
  const fullName = (id) => (DATA.people[id] ? DATA.people[id].name : '');

  /* ---------- state ---------- */

  const DEFAULTS = { range: 'yesterday', from: Date.UTC(2026, 8, 25), to: Date.UTC(2026, 9, 1), provider: 'all', entity: 'all' };
  const state = Object.assign({}, DEFAULTS, {
    status: 'open',
    urgentOnly: false,
    sort: { key: 'priority', dir: 'desc' },
    page: 1,
    selectedId: null,
    chartDay: null,
    hoverDay: null
  });
  const PAGE_SIZE = 15;

  function period() {
    let start;
    let end;
    if (state.range === '7d') { end = TODAY; start = TODAY - 7 * D; }
    else if (state.range === '30d') { end = TODAY; start = TODAY - 30 * D; }
    else if (state.range === 'custom') { start = state.from; end = state.to + D; }
    else { end = TODAY; start = TODAY - D; }
    const days = Math.round((end - start) / D);
    const prevStart = start - days * D;
    const last = end - D;
    return {
      start, end, days, prevStart, prevEnd: start, live: end >= TODAY,
      label: days === 1 ? dayLong(start) : day(start) + ' – ' + day(last) + ' ' + fmtYear.format(last),
      short: days === 1 ? day(start) : day(start) + ' – ' + day(last),
      prevLabel: days === 1 ? day(prevStart) : 'previous ' + days + ' days',
      scope: state.range === 'yesterday' ? 'Yesterday, ' + day(start)
        : state.range === '7d' ? 'Last 7 days'
        : state.range === '30d' ? 'Last 30 days'
        : (days === 1 ? day(start) : day(start) + ' – ' + day(last))
    };
  }

  const cellInScope = (c) => (state.provider === 'all' || c.provider === state.provider) && (state.entity === 'all' || c.entity === state.entity);
  const inScope = (r) => cellInScope(r);
  const isOpen = (r) => r.status !== 'resolved';
  const openAt = (r, t) => r.opened < t && (!r.resolved || r.resolved >= t);
  const ageMs = (r) => (r.resolved || now()) - r.opened;
  const isUrgent = (r) => isOpen(r) && (ageMs(r) >= 5 * D || r.eur >= 2500);
  const urgentAt = (r, t) => t - r.opened >= 5 * D || r.eur >= 2500;
  const urgentWhy = (r) => [r.eur >= 2500 ? '€2,500 or more' : '', ageMs(r) >= 5 * D ? 'open 5+ days' : ''].filter(Boolean).join(', ');

  function median(values) {
    if (!values.length) return null;
    const a = values.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function volume(start, end) {
    let v = 0;
    let u = 0;
    for (const d of DATA.series) {
      if (d.t < start || d.t >= end) continue;
      for (const c of d.cells) if (cellInScope(c)) { v += c.v; u += c.u; }
    }
    return { v, u };
  }

  function kpis() {
    const p = period();
    const cur = volume(p.start, p.end);
    const prev = volume(p.prevStart, p.prevEnd);
    const scoped = DATA.exceptions.filter(inScope);
    const open = p.live ? scoped.filter(isOpen) : scoped.filter((r) => openAt(r, p.end));
    const urgent = p.live ? open.filter(isUrgent) : open.filter((r) => urgentAt(r, p.end));
    const openPrev = scoped.filter((r) => openAt(r, p.prevEnd));
    const resolvedIn = (s, e) => scoped.filter((r) => r.resolved && r.resolved >= s && r.resolved < e);
    const res = resolvedIn(p.start, p.end);
    const resPrev = resolvedIn(p.prevStart, p.prevEnd);
    const ttr = (list) => median(list.map((r) => (r.resolved - r.opened) / D));
    const hasPrev = p.prevStart >= SERIES_START;
    return {
      p, hasPrev,
      volume: cur.v,
      rate: cur.v ? (cur.v - cur.u) / cur.v : null,
      ratePrev: hasPrev && prev.v ? (prev.v - prev.u) / prev.v : null,
      unmatched: cur.u,
      unmatchedPrev: hasPrev ? prev.u : null,
      open: open.length,
      openPrev: openPrev.length,
      urgent: urgent.length,
      ttr: ttr(res),
      ttrPrev: hasPrev ? ttr(resPrev) : null,
      resolvedCount: res.length
    };
  }

  /* ---------- announcements ---------- */

  let announceTimer = 0;
  function announce(text) {
    const el = $('#announcer');
    el.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { el.textContent = text; }, 60);
  }

  /* ---------- KPI band ---------- */

  function deltaHTML(diff, goodWhen, fmt, prevLabel) {
    if (diff == null || !Number.isFinite(diff)) return `<span>No data for ${esc(prevLabel)}</span>`;
    if (diff === 0) return `<span class="delta delta--flat">${ICON.flat}<span>No change</span></span><span>vs ${esc(prevLabel)}</span>`;
    const up = diff > 0;
    const good = goodWhen === 'down' ? !up : up;
    const tone = good ? 'good' : 'bad';
    return `<span class="delta delta--${tone}">${up ? ICON.up : ICON.down}<span class="vh">${up ? 'Up' : 'Down'} </span>${fmt(Math.abs(diff))}</span>` +
      `<span><span class="verdict verdict--${tone}">${good ? 'better' : 'worse'}</span> than ${esc(prevLabel)}</span>`;
  }

  function renderKpis() {
    const k = kpis();
    const p = k.p;
    const box = (key) => $(`[data-kpi="${key}"]`);
    const put = (key, value, note, delta) => {
      const el = box(key);
      $('[data-value]', el).textContent = value;
      if (note !== null) $('[data-note]', el).innerHTML = note;
      $('[data-delta]', el).innerHTML = delta;
    };

    const rate = k.rate == null ? null : round1(k.rate * 100);
    const ratePrev = k.ratePrev == null ? null : round1(k.ratePrev * 100);
    put('rate', rate == null ? '—' : nf1.format(rate) + '%', `of ${euro(k.volume)} payout volume`,
      deltaHTML(rate != null && ratePrev != null ? round1(rate - ratePrev) : null, 'up', (v) => nf1.format(v) + ' pp', p.prevLabel));

    put('unmatched', euro(k.unmatched), p.days === 1 ? 'not matched by the nightly run' : `not matched across ${p.days} nightly runs`,
      deltaHTML(k.unmatchedPrev == null ? null : round2(k.unmatched - k.unmatchedPrev), 'down', euro, p.prevLabel));

    const openBox = box('open');
    $('[data-value]', openBox).textContent = nf0.format(k.open);
    $('[data-urgent-count]', openBox).textContent = `${k.urgent} urgent`;
    const link = $('[data-urgent-link]', openBox);
    link.disabled = !p.live;
    link.setAttribute('aria-pressed', String(state.urgentOnly));
    link.title = p.live ? 'Show only urgent exceptions in the table' : `Urgent at the end of ${day(p.end - D)}`;
    $('[data-delta]', openBox).innerHTML = deltaHTML(k.open - k.openPrev, 'down', (v) => nf0.format(v), 'end of ' + day(p.prevEnd - D));

    const ttr = k.ttr == null ? null : round1(k.ttr);
    const ttrPrev = k.ttrPrev == null ? null : round1(k.ttrPrev);
    put('ttr', ttr == null ? '—' : nf1.format(ttr) + ' days', `across ${plural(k.resolvedCount, 'resolved exception')}`,
      deltaHTML(ttr != null && ttrPrev != null ? round1(ttr - ttrPrev) : null, 'down', (v) => nf1.format(v) + ' days', p.prevLabel));

    $('[data-period-label]').textContent = p.label;
    const totalOpen = DATA.exceptions.filter(isOpen).length;
    $$('[data-nav-count]').forEach((el) => { el.textContent = totalOpen; });
  }

  /* ---------- status counts, scope line ---------- */

  function resolvedInView(r, p) {
    return !isOpen(r) && r.resolved >= p.start && (p.live || r.resolved < p.end);
  }

  function renderCounts() {
    const p = period();
    const c = { open: 0, new: 0, investigating: 0, waiting: 0, resolved: 0, urgent: 0 };
    for (const r of DATA.exceptions) {
      if (!inScope(r)) continue;
      if (isOpen(r)) {
        c.open++;
        c[r.status]++;
        if (isUrgent(r)) c.urgent++;
      } else if (resolvedInView(r, p)) c.resolved++;
    }
    Object.keys(c).forEach((key) => $$(`[data-count="${key}"]`).forEach((el) => { el.textContent = c[key]; }));
  }

  function renderScope() {
    const p = period();
    const prov = state.provider === 'all' ? 'All providers' : providerName[state.provider];
    const ent = state.entity === 'all' ? 'All entities' : entityById[state.entity].name;
    $('[data-scope-line]').textContent = `${p.scope} · ${prov} · ${ent}`;
    const dirty = state.range !== DEFAULTS.range || state.provider !== 'all' || state.entity !== 'all';
    $('[data-reset]').hidden = !dirty;
  }

  /* ---------- exceptions table ---------- */

  const SORTS = {
    priority: { cmp: (a, b) => (isUrgent(a) - isUrgent(b)) || (ageMs(a) - ageMs(b)), name: 'priority', desc: 'urgent and oldest first', asc: 'least urgent first' },
    age: { cmp: (a, b) => ageMs(a) - ageMs(b), name: 'age', desc: 'oldest first', asc: 'newest first' },
    amount: { cmp: (a, b) => a.eur - b.eur, name: 'amount', desc: 'largest first', asc: 'smallest first' }
  };

  function tableRows() {
    const p = period();
    let list = DATA.exceptions.filter(inScope);
    if (state.status === 'open') list = list.filter(isOpen);
    else if (state.status === 'resolved') list = list.filter((r) => resolvedInView(r, p));
    else list = list.filter((r) => r.status === state.status);
    if (state.urgentOnly) list = list.filter(isUrgent);
    const sign = state.sort.dir === 'asc' ? 1 : -1;
    const cmp = SORTS[state.sort.key].cmp;
    return list.sort((a, b) => sign * cmp(a, b) || b.n - a.n);
  }

  function statusHTML(status) {
    return `<span class="status status--${status}">${ICON[status]}<span>${esc(DATA.statuses[status])}</span></span>`;
  }

  function assigneeHTML(r) {
    if (!r.assignee) return '<span class="assignee-none">Unassigned</span>';
    const full = fullName(r.assignee);
    const parts = full.split(' ');
    return `<span class="name-full">${esc(full)}</span><span class="name-short" aria-hidden="true">${esc(parts[0] + ' ' + parts[1][0] + '.')}</span>`;
  }

  function rowHTML(r) {
    const urgent = isUrgent(r);
    const selected = r.id === state.selectedId;
    return `<tr data-id="${r.id}" class="${urgent ? 'is-urgent' : ''}${selected ? ' is-selected' : ''}">` +
      `<td class="c-prio">${urgent ? `<span class="prio">${ICON.urgent}<span class="prio__text">Urgent</span></span>` : '<span class="vh">Normal</span>'}</td>` +
      `<th scope="row" class="c-id"><button type="button" class="row-open" tabindex="-1" aria-haspopup="dialog" aria-controls="detail"${selected ? ' aria-current="true"' : ''}>${r.id}</button></th>` +
      `<td class="c-prov">${esc(providerName[r.provider])}</td>` +
      `<td class="c-amt num">${money(r.amount)}</td>` +
      `<td class="c-cur">${r.currency}</td>` +
      `<td class="c-age num">${ageText(ageMs(r))}</td>` +
      `<td class="c-reason">${esc(DATA.reasons[r.reason])}</td>` +
      `<td class="c-status">${statusHTML(r.status)}</td>` +
      `<td class="c-assignee">${assigneeHTML(r)}</td>` +
      '</tr>';
  }

  function setRoving(btn) {
    $$('[data-rows] .row-open').forEach((b) => { b.tabIndex = b === btn ? 0 : -1; });
  }

  function renderTable() {
    const p = period();
    const list = tableRows();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const from = (state.page - 1) * PAGE_SIZE;
    const slice = list.slice(from, from + PAGE_SIZE);
    const tbody = $('[data-rows]');
    tbody.innerHTML = slice.length ? slice.map(rowHTML).join('')
      : '<tr><td class="empty" colspan="9"><p>No exceptions match these filters.</p><button class="btn btn--small" type="button" data-clear-view>Show all open exceptions</button></td></tr>';
    const btns = $$('.row-open', tbody);
    const current = btns.find((b) => b.closest('tr').dataset.id === state.selectedId) || btns[0];
    if (current) current.tabIndex = 0;

    const total = list.reduce((s, r) => s + r.eur, 0);
    const what = state.status === 'resolved' ? 'resolved' : state.status === 'open' ? 'open' : DATA.statuses[state.status].toLowerCase();
    $('[data-tfoot]').innerHTML = list.length
      ? `<tr><th scope="row" colspan="3" class="tf-label">Total, <strong>${list.length}</strong> ${esc(what)}${state.urgentOnly ? ' urgent' : ''} <span class="muted">(EUR equivalent)</span></th>` +
        `<td class="num">${money(total)}</td><td class="c-cur">EUR</td><td colspan="4"></td></tr>`
      : '';

    $('[data-pager-label]').textContent = list.length ? `${from + 1}–${from + slice.length} of ${list.length}` : 'No results';
    $('[data-page="-1"]').disabled = state.page <= 1;
    $('[data-page="1"]').disabled = state.page >= pages;
    $('.pager').hidden = list.length <= PAGE_SIZE;

    $$('[data-sort-th]').forEach((th) => {
      const key = th.dataset.sortTh;
      th.setAttribute('aria-sort', key === state.sort.key ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });

    const sort = SORTS[state.sort.key];
    const scope = state.status === 'resolved' ? (p.live ? `since ${day(p.start)}` : `in ${p.short}`) : 'all dates';
    $('[data-queue-summary]').innerHTML = `<strong>${list.length}</strong> ${esc(what)}${state.urgentOnly ? ' and urgent' : ''} · ${scope} · sorted by ${sort.name}, ${sort[state.sort.dir]}`;
    $('[data-caption]').textContent = `Exceptions: ${list.length} ${what}${state.urgentOnly ? ' and urgent' : ''}, sorted by ${sort.name}, ${sort[state.sort.dir]}. Page ${state.page} of ${pages}.`;
  }

  function syncSelection() {
    $$('[data-rows] tr[data-id]').forEach((tr) => {
      const on = tr.dataset.id === state.selectedId;
      tr.classList.toggle('is-selected', on);
      const b = $('.row-open', tr);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- 30-day chart: two aligned panels (matched, unmatched) with their own scales ---------- */

  const chart = { days: [], geom: null, width: 0 };

  function chartDays() {
    const p = period();
    const endIdx = Math.min(DATA.series.length, Math.round((p.end - SERIES_START) / D));
    const startIdx = Math.max(0, endIdx - 30);
    return DATA.series.slice(startIdx, endIdx).map((d) => {
      let v = 0;
      let u = 0;
      for (const c of d.cells) if (cellInScope(c)) { v += c.v; u += c.u; }
      return { t: d.t, v, u, m: v - u, inPeriod: d.t >= p.start && d.t < p.end };
    });
  }

  function niceMax(x) {
    if (!(x > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  function renderChart() {
    const svg = $('[data-chart]');
    const days = chartDays();
    chart.days = days;
    const n = days.length;
    if (!n) return;
    if (state.chartDay == null || state.chartDay >= n) state.chartDay = n - 1;
    const active = state.hoverDay != null ? state.hoverDay : state.chartDay;

    const W = Math.max(260, Math.round(svg.getBoundingClientRect().width || 360));
    chart.width = W;
    const padL = 46;
    const padR = 4;
    const top = 22;
    const h1 = 104;
    const gap = 34;
    const h2 = 54;
    const axis = 22;
    const Ht = top + h1 + gap + h2 + axis;
    const plotW = W - padL - padR;
    const slot = plotW / n;
    const bw = Math.max(2, Math.min(16, slot * 0.64));
    const maxM = niceMax(Math.max.apply(null, days.map((d) => d.m)) * 1.02);
    const maxU = niceMax(Math.max.apply(null, days.map((d) => d.u)) * 1.02);
    const y1 = (v) => top + h1 - (v / maxM) * h1;
    const base2 = top + h1 + gap + h2;
    const y2 = (v) => base2 - (v / maxU) * h2;
    const x = (i) => padL + i * slot;
    chart.geom = { padL, slot, n };

    const out = [];
    // selected-period band
    const inIdx = days.map((d, i) => (d.inPeriod ? i : -1)).filter((i) => i >= 0);
    if (inIdx.length) {
      out.push(`<rect class="band" x="${x(inIdx[0]).toFixed(1)}" y="${top - 4}" width="${(slot * inIdx.length).toFixed(1)}" height="${base2 - top + 4}"/>`);
    }
    // active-day column
    out.push(`<rect class="hover" x="${x(active).toFixed(1)}" y="${top - 4}" width="${slot.toFixed(1)}" height="${base2 - top + 4}"/>`);
    // gridlines and scale labels
    [maxM / 2, maxM].forEach((v) => {
      out.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y1(v).toFixed(1)}" y2="${y1(v).toFixed(1)}"/>`);
      out.push(`<text x="${padL - 6}" y="${(y1(v) + 4).toFixed(1)}" text-anchor="end">${euroShort(v)}</text>`);
    });
    out.push(`<text x="${padL - 6}" y="${top + h1 + 4}" text-anchor="end">€0</text>`);
    out.push(`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y2(maxU).toFixed(1)}" y2="${y2(maxU).toFixed(1)}"/>`);
    out.push(`<text x="${padL - 6}" y="${(y2(maxU) + 4).toFixed(1)}" text-anchor="end">${euroShort(maxU)}</text>`);
    out.push(`<text x="${padL - 6}" y="${base2 + 4}" text-anchor="end">€0</text>`);
    // bars
    days.forEach((d, i) => {
      const bx = (x(i) + (slot - bw) / 2).toFixed(1);
      const hm = Math.max(1, top + h1 - y1(d.m));
      const hu = Math.max(d.u > 0 ? 1 : 0, base2 - y2(d.u));
      out.push(`<g class="day${i === active ? ' is-sel' : ''}">` +
        `<rect class="bar-m" x="${bx}" y="${(top + h1 - hm).toFixed(1)}" width="${bw.toFixed(1)}" height="${hm.toFixed(1)}"/>` +
        `<rect class="bar-u" x="${bx}" y="${(base2 - hu).toFixed(1)}" width="${bw.toFixed(1)}" height="${hu.toFixed(1)}"/></g>`);
    });
    // baselines
    out.push(`<line class="base" x1="${padL}" x2="${W - padR}" y1="${top + h1}" y2="${top + h1}"/>`);
    out.push(`<line class="base" x1="${padL}" x2="${W - padR}" y1="${base2}" y2="${base2}"/>`);
    // direct series labels
    out.push(`<text class="t-series t-m" x="${padL}" y="${top - 9}">Matched</text>`);
    const uLabelY = top + h1 + gap - 9;
    out.push(`<text class="t-series t-u" x="${padL}" y="${uLabelY}">Unmatched</text>`);
    // incident annotation (only when the incident's provider is in scope)
    DATA.incidents.forEach((inc) => {
      const i = days.findIndex((d) => d.t === inc.t);
      if (i < 0 || (state.provider !== 'all' && state.provider !== inc.provider)) return;
      const cx = x(i) + slot / 2;
      const labelEnd = padL + 74;
      let text = inc.label;
      let anchor = 'end';
      let tx = cx - 5;
      if (tx - text.length * 5.6 < labelEnd) text = inc.short;
      if (tx - text.length * 5.6 < labelEnd) { anchor = 'start'; tx = cx + 5; }
      out.push(`<line class="lead" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${uLabelY - 9}" y2="${(y2(days[i].u) - 3).toFixed(1)}"/>`);
      out.push(`<text class="t-note" x="${tx.toFixed(1)}" y="${uLabelY}" text-anchor="${anchor}">${esc(text)}</text>`);
    });
    // x-axis: every 7th day counted back from the last
    days.forEach((d, i) => {
      if ((n - 1 - i) % 7 !== 0) return;
      const last = i === n - 1;
      const tx = last ? x(i) + slot : x(i) + slot / 2;
      out.push(`<text x="${tx.toFixed(1)}" y="${base2 + 16}" text-anchor="${last ? 'end' : 'middle'}">${day(d.t)}</text>`);
    });

    svg.setAttribute('viewBox', `0 0 ${W} ${Ht}`);
    svg.setAttribute('height', String(Ht));
    const title = '<title id="chart-title">Daily payout volume, matched and unmatched</title>';
    const peak = days.reduce((a, d) => (d.u > a.u ? d : a), days[0]);
    const lastDay = days[n - 1];
    const desc = `<desc id="chart-desc">${esc(`${day(days[0].t)} to ${day(lastDay.t)}. Matched volume ranged ${euroShort(Math.min.apply(null, days.map((d) => d.m)))} to ${euroShort(Math.max.apply(null, days.map((d) => d.m)))} a day. Unmatched peaked at ${euro(peak.u)} on ${day(peak.t)}. On ${day(lastDay.t)}: ${euro(lastDay.u)} unmatched, ${nf1.format(lastDay.v ? (lastDay.m / lastDay.v) * 100 : 0)}% matched.`)}</desc>`;
    svg.innerHTML = title + desc + out.join('');

    $('[data-trend-range]').textContent = `${day(days[0].t)} – ${day(lastDay.t)} · matched vs unmatched, EUR`;
    renderReadout(false);
  }

  function renderReadout(speak) {
    const days = chart.days;
    if (!days.length) return;
    const i = state.hoverDay != null ? state.hoverDay : state.chartDay;
    const d = days[i];
    const pct = d.v ? (d.u / d.v) * 100 : 0;
    const el = $('[data-readout]');
    el.setAttribute('aria-live', speak ? 'polite' : 'off');
    el.innerHTML = `<span class="readout__day">${dayW(d.t)}</span>` +
      `<span class="readout__line readout__line--m"><span><span class="swatch" aria-hidden="true"></span>Matched</span><strong>${euro(d.m)}</strong></span>` +
      `<span class="readout__line readout__line--u"><span><span class="swatch" aria-hidden="true"></span>Unmatched</span><strong>${euro(d.u)} · ${nf1.format(pct)}%</strong></span>`;
    $('[data-day="-1"]').disabled = state.chartDay <= 0;
    $('[data-day="1"]').disabled = state.chartDay >= days.length - 1;
  }

  function renderChartTable() {
    $('[data-chart-table]').innerHTML = chart.days.slice().reverse().map((d) =>
      `<tr><th scope="row">${dayW(d.t)}</th><td class="num">${money(d.m)}</td><td class="num">${money(d.u)}</td><td class="num">${nf1.format(d.v ? (d.u / d.v) * 100 : 0)}%</td></tr>`).join('');
  }

  function chartIndexFromEvent(e) {
    const svg = $('[data-chart]');
    const g = chart.geom;
    if (!g) return null;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (chart.width / rect.width);
    if (px < g.padL - 4) return null;
    return Math.max(0, Math.min(g.n - 1, Math.floor((px - g.padL) / g.slot)));
  }

  /* ---------- activity journal ---------- */

  // Record references inside sentences are links to the exception (JS opens it in the panel instead).
  const idButton = (id) => `<a class="link-btn" href="#exceptions/${id}" data-open="${id}" aria-haspopup="dialog">${id}</a>`;

  function activityText(a) {
    const who = a.actor === 'system' ? '<span class="j-sys">Ledgerline</span>'
      : a.actor === 'rule' ? '<span class="j-sys">Auto-rule</span>'
      : `<strong>${esc(personName(a.actor))}</strong>`;
    const extra = a.text ? ` <span class="muted">· ${esc(a.text)}</span>` : '';
    switch (a.type) {
      case 'assign': return `${who} assigned ${idButton(a.id)} to ${esc(a.to === ME && a.actor !== ME ? 'you' : a.to === ME ? 'yourself' : fullName(a.to) || 'nobody')}`;
      case 'unassign': return `${who} unassigned ${idButton(a.id)}`;
      case 'note': return `${who} added a note to ${idButton(a.id)}<span class="j-quote">“${esc(a.text)}”</span>`;
      case 'status': return `${who} set ${idButton(a.id)} to ${esc(DATA.statuses[a.status])}${extra}`;
      case 'resolve': return `${who} resolved ${idButton(a.id)}${extra}`;
      case 'reopen': return `${who} reopened ${idButton(a.id)}`;
      default: return `${who} · ${esc(a.text)}`;
    }
  }

  function renderActivity() {
    const groups = [];
    DATA.activity.slice(0, 8).forEach((a) => {
      const label = a.t >= TODAY ? 'Today' : a.t >= TODAY - D ? 'Yesterday' : dayW(a.t);
      let g = groups[groups.length - 1];
      if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
      g.items.push(a);
    });
    $('[data-activity]').innerHTML = groups.map((g) =>
      `<h3 class="journal__day">${g.label}</h3><ol>` +
      g.items.map((a) => `<li class="j-item${a.fresh ? ' is-new' : ''}"><time class="j-time" datetime="${isoLocal(a.t)}">${time(a.t)}</time><p class="j-text">${activityText(a)}</p></li>`).join('') +
      '</ol>').join('');
  }

  function logActivity(entry) {
    DATA.activity.unshift(Object.assign({ t: now(), actor: ME, fresh: true }, entry));
  }

  /* ---------- exception detail ---------- */

  const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const STRIPE = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const randStr = (rr, len, set) => Array.from({ length: len }, () => set[Math.floor(rr() * set.length)]).join('');

  const idSpan = (s) => `<span class="mono">${esc(s)}</span>`;

  function refsFor(r) {
    const rr = DATA.mulberry32(r.n * 7919 + 17);
    const payout = r.provider === 'stripe' ? idSpan('po_1' + randStr(rr, 13, STRIPE))
      : r.provider === 'adyen' ? 'Settlement batch ' + idSpan(String(4300 + (r.n % 97)))
      : r.provider === 'paypal' ? 'Transfer ' + idSpan(randStr(rr, 12, ALNUM))
      : 'Settlement ' + idSpan(randStr(rr, 4, ALNUM) + '-' + randStr(rr, 4, ALNUM));
    const firstOrder = 551200 + ((r.n * 37) % 9000);
    return { rr, payout, bank: 'bank ref ' + idSpan(randStr(rr, 10, '0123456789')), firstOrder };
  }

  function legsFor(r) {
    const refs = refsFor(r);
    const rr = refs.rr;
    const a = r.amount;
    const ent = entityById[r.entity];
    const prov = providerName[r.provider];
    const orders = (gross) => {
      const count = Math.max(2, Math.min(480, Math.round((gross * DATA.fx[r.currency]) / 165)));
      return `${count} orders · ${idSpan(`ORD-${refs.firstOrder}…${refs.firstOrder + count - 1}`)}`;
    };
    if (r.reason === 'missing') {
      return {
        rows: [['Orders captured', orders(a), a], [`${prov} payout, as reported`, refs.payout, a], ['Bank deposit', `${esc(ent.account)} · due ${day(r.opened + D)}`, null]],
        foot: ['Unmatched', a]
      };
    }
    if (r.reason === 'duplicate') {
      return {
        rows: [['Orders captured', orders(a), a], [`${prov} payout`, refs.payout, a], ['Bank deposits (2, same reference)', `${esc(ent.account)} · ${refs.bank}`, round2(a * 2)]],
        foot: ['Received twice', a]
      };
    }
    if (r.reason === 'fx') {
      const expected = round2(a * (55 + rr() * 140));
      return {
        rows: [['Expected at reference rate', 'ECB rate on capture date', expected], [`${prov} payout, converted`, refs.payout, round2(expected - a)], ['Bank deposit', `${esc(ent.account)} · ${refs.bank}`, round2(expected - a)]],
        foot: ['FX difference', a]
      };
    }
    const gross = round2(Math.max(a * (12 + rr() * 60), 380 + rr() * 9000));
    return {
      rows: [['Orders captured', orders(gross), gross], [`${prov} payout`, refs.payout, round2(gross - a)], ['Bank deposit', `${esc(ent.account)} · ${refs.bank}`, round2(gross - a)]],
      foot: ['Difference vs orders', a]
    };
  }

  const DETECT = {
    missing: 'Detected: payout reported by provider, no bank deposit',
    mismatch: 'Detected: payout differs from captured orders',
    duplicate: 'Detected: two bank deposits share one payout reference',
    fx: 'Detected: conversion outside the FX tolerance'
  };

  function historyFor(r) {
    if (r.history) return r.history;
    const rr = DATA.mulberry32(r.n * 31337 + 5);
    const h = [{ t: r.opened, who: 'system', text: DETECT[r.reason] }];
    const special = DATA.notes[r.id];
    if (special) {
      special.forEach((s) => h.push(Object.assign({}, s)));
    } else {
      const limit = (r.resolved || NOW) - 0.2 * H;
      let t = r.opened;
      const step = (maxH) => { t = Math.min(t + (0.4 + rr() * maxH) * H, limit - 0.05 * H); return t; };
      const owner = r.assignee || (DATA.people[r.resolvedBy] ? r.resolvedBy : null);
      if (owner) h.push({ t: step(5), who: owner === ME ? ME : (rr() < 0.7 ? ME : owner), text: `Assigned to ${fullName(owner)}` });
      if (owner && (r.status === 'investigating' || r.status === 'waiting' || DATA.people[r.resolvedBy])) h.push({ t: step(8), who: owner, text: 'Status → Investigating' });
      if (owner && r.status === 'waiting') h.push({ t: step(14), who: owner, text: `Status → Waiting on provider · ${providerName[r.provider]} case ${30000 + ((r.n * 7) % 59999)}` });
    }
    if (r.resolved) {
      const how = r.resolvedBy === 'rule' ? 'Resolved by rule “Klarna fee tolerance ±€0.05”'
        : r.resolvedBy === 'auto' ? 'Matched automatically when the bank deposit arrived'
        : 'Resolved';
      h.push({ t: r.resolved, who: DATA.people[r.resolvedBy] ? r.resolvedBy : 'system', text: how });
    }
    h.sort((a, b) => a.t - b.t);
    r.history = h;
    return h;
  }

  function nextStep(r) {
    const prov = providerName[r.provider];
    if (r.status === 'waiting') return `${prov} has the case. Chase it if there is no update by ${day(Math.max(r.opened + 5 * D, NOW + D))}.`;
    if (r.reason === 'missing') return `Check the ${prov} settlement report for ${day(r.opened)}. If the payout is listed, ask the bank to trace it; if not, open a provider case.`;
    if (r.reason === 'duplicate') return `Confirm with the bank that both deposits cleared, then ask ${prov} to reverse one of them.`;
    if (r.reason === 'fx') return `${prov} converts at settlement; the reference uses the capture date. Accept within tolerance or raise with treasury.`;
    return `Compare the payout's fee lines with the contracted ${prov} fee schedule. Repeating small gaps are a candidate for a tolerance rule.`;
  }

  function whoHTML(id) {
    if (id === 'system') return '<span class="j-sys">Ledgerline</span>';
    if (id === 'rule') return '<span class="j-sys">Auto-rule</span>';
    return `<strong>${esc(personName(id))}</strong>`;
  }

  function renderDetail(keepFocus) {
    const r = byId.get(state.selectedId);
    if (!r) return;
    const body = $('[data-detail-body]');
    const active = document.activeElement;
    let focusKey = keepFocus && body.contains(active) && active.dataset ? active.dataset.fk : null;
    $('#detail-title').textContent = r.id;
    const ent = entityById[r.entity];
    const urgent = isUrgent(r);
    const L = legsFor(r);
    const cell = (v) => (v == null ? '<span class="legs__missing">Not received</span>' : money(v));
    const people = Object.keys(DATA.people);
    const open = isOpen(r);

    body.innerHTML =
      '<div>' +
        `<div class="d-badges">${statusHTML(r.status)}${urgent ? `<span class="d-urgent">${ICON.urgent}Urgent · ${esc(urgentWhy(r))}</span>` : ''}</div>` +
        `<p class="d-summary">${esc(DATA.reasons[r.reason])} · ${esc(providerName[r.provider])} · ${esc(ent.name)}</p>` +
        `<p class="d-amount"><span class="d-amount__value">${money(r.amount)}</span><span class="d-amount__cur">${r.currency}</span>` +
        (r.currency !== 'EUR' ? `<span class="d-amount__eur">≈ ${euro(r.eur)} at ${nf4.format(DATA.fx[r.currency])}</span>` : '') + '</p>' +
      '</div>' +
      '<dl class="d-facts">' +
        `<dt>Opened</dt><dd>${stamp(r.opened)} · ${ageText(ageMs(r))}${r.resolved ? ' to resolve' : ' ago'}</dd>` +
        `<dt>Bank account</dt><dd>${esc(ent.account)}</dd>` +
        `<dt>Assignee</dt><dd>${r.assignee ? esc(fullName(r.assignee)) + (r.assignee === ME ? ' (you)' : '') : 'Unassigned'}</dd>` +
        (r.resolved ? `<dt>Resolved</dt><dd>${stamp(r.resolved)} · ${whoHTML(DATA.people[r.resolvedBy] ? r.resolvedBy : r.resolvedBy === 'rule' ? 'rule' : 'system')}</dd>` : '') +
      '</dl>' +
      '<section class="d-section" aria-labelledby="legs-h"><h3 id="legs-h">Reconciliation</h3>' +
        `<table class="legs"><caption class="vh">Reconciliation legs for ${r.id}, amounts in ${r.currency}</caption>` +
        `<thead class="vh"><tr><th scope="col">Leg</th><th scope="col">Amount (${r.currency})</th></tr></thead><tbody>` +
        L.rows.map((row) => `<tr><th scope="row">${esc(row[0])}<span class="legs__ref">${row[1]}</span></th><td class="num">${cell(row[2])}</td></tr>`).join('') +
        `</tbody><tfoot><tr><th scope="row">${esc(L.foot[0])}</th><td class="num">${money(L.foot[1])} ${r.currency}</td></tr></tfoot></table>` +
      '</section>' +
      (open ? `<p class="d-next"><strong>Suggested next step</strong>${esc(nextStep(r))}</p>` : '') +
      '<section class="d-section d-actions" aria-labelledby="triage-h"><h3 id="triage-h">Triage</h3>' +
        '<div class="field"><label for="d-assignee">Assignee</label>' +
          '<select id="d-assignee" data-fk="assignee"><option value="">Unassigned</option>' +
          people.map((id) => `<option value="${id}"${r.assignee === id ? ' selected' : ''}>${esc(fullName(id))}${id === ME ? ' (you)' : ''}</option>`).join('') +
        '</select></div>' +
        '<fieldset class="d-status"><legend>Status</legend><div class="seg__opts">' +
          ['new', 'investigating', 'waiting', 'resolved'].map((s) =>
            `<label class="seg__opt"><input type="radio" name="d-status" value="${s}" data-fk="status-${s}"${r.status === s ? ' checked' : ''}>${ICON[s]}<span>${esc(DATA.statuses[s])}</span></label>`).join('') +
        '</div></fieldset>' +
        '<div class="row">' +
          (r.assignee !== ME ? '<button class="btn" type="button" data-act="assign-me" data-fk="assign-me">Assign to me</button>' : '') +
          (open ? '<button class="btn btn--primary" type="button" data-act="resolve" data-fk="resolve">Resolve</button>'
                : '<button class="btn" type="button" data-act="reopen" data-fk="resolve">Reopen</button>') +
        '</div>' +
      '</section>' +
      '<form class="d-note" data-note-form><label for="d-note">Add a note</label>' +
        '<textarea id="d-note" rows="2" data-fk="note"></textarea>' +
        '<div class="row"><button class="btn btn--small" type="submit" data-fk="note-submit">Add note</button></div></form>' +
      '<section class="d-section" aria-labelledby="hist-h"><h3 id="hist-h">History</h3><ol class="timeline">' +
        historyFor(r).map((h) => `<li><time datetime="${isoLocal(h.t)}">${stamp(h.t)}</time><span>${whoHTML(h.who)} · ${esc(h.text)}</span></li>`).join('') +
      '</ol></section>' +
      `<p class="d-foot"><a href="#exceptions/${r.id}">Open in Exceptions</a><span class="muted">${esc(ent.name)}</span></p>`;

    if (focusKey === 'assign-me' && !body.querySelector('[data-fk="assign-me"]')) focusKey = 'assignee';
    if (focusKey) {
      const f = body.querySelector(`[data-fk="${focusKey}"]`);
      if (f) f.focus();
    }
  }

  /* ---------- mutations ---------- */

  function openTotal() { return DATA.exceptions.filter(isOpen).length; }

  function setStatus(r, s) {
    if (!r || r.status === s) return;
    historyFor(r);
    const t = now();
    if (s === 'resolved') {
      r.status = 'resolved';
      r.resolved = t;
      r.resolvedBy = ME;
      r.history.push({ t, who: ME, text: 'Resolved' });
      logActivity({ type: 'resolve', id: r.id });
    } else {
      const wasResolved = r.status === 'resolved';
      r.status = s;
      r.resolved = null;
      r.resolvedBy = null;
      r.history.push({ t, who: ME, text: (wasResolved ? 'Reopened · ' : '') + 'Status → ' + DATA.statuses[s] });
      logActivity(wasResolved ? { type: 'reopen', id: r.id } : { type: 'status', id: r.id, status: s });
    }
    refresh(true);
    announce(`${r.id} ${s === 'resolved' ? 'resolved' : 'set to ' + DATA.statuses[s]}. ${openTotal()} open exceptions.`);
  }

  function setAssignee(r, who) {
    if (!r || (r.assignee || '') === (who || '')) return;
    historyFor(r);
    r.assignee = who || null;
    r.history.push({ t: now(), who: ME, text: who ? `Assigned to ${fullName(who)}` : 'Unassigned' });
    logActivity(who ? { type: 'assign', id: r.id, to: who } : { type: 'unassign', id: r.id });
    refresh(true);
    announce(`${r.id} ${who ? 'assigned to ' + (who === ME ? 'you' : fullName(who)) : 'unassigned'}.`);
  }

  function addNote(r, text) {
    const clean = text.trim();
    if (!r || !clean) return false;
    historyFor(r);
    r.history.push({ t: now(), who: ME, text: 'Note: ' + clean });
    logActivity({ type: 'note', id: r.id, text: clean });
    refresh(true);
    announce(`Note added to ${r.id}.`);
    return true;
  }

  /* ---------- phone priority list ---------- */

  function renderUrgentPhone() {
    const list = DATA.exceptions.filter((r) => inScope(r) && isUrgent(r)).sort((a, b) => -SORTS.priority.cmp(a, b) || b.n - a.n);
    $('[data-urgent-m]').innerHTML = list.length ? list.map((r) =>
      `<li class="u-item"><button type="button" data-open="${r.id}" aria-haspopup="dialog">` +
        `<span class="u-item__id">${r.id}</span>` +
        `<span class="u-item__amt">${money(r.amount)} <span class="cur">${r.currency}</span></span>` +
        `<span class="u-item__meta">${esc(providerName[r.provider])} · ${esc(DATA.reasons[r.reason])}</span>` +
        `<span class="u-item__age">${ageText(ageMs(r))} old</span>` +
        `<span class="u-item__status">${statusHTML(r.status)}<span class="muted">· ${r.assignee ? esc(fullName(r.assignee)) : 'Unassigned'}</span></span>` +
      '</button></li>').join('')
      : '<li class="u-item"><p class="urgent-m__note">Nothing urgent in this scope.</p></li>';
  }

  /* ---------- render orchestration ---------- */

  function refresh(keepDetailFocus) {
    renderKpis();
    renderCounts();
    renderTable();
    renderActivity();
    renderUrgentPhone();
    if (detail.open) renderDetail(keepDetailFocus);
  }

  function update() {
    renderScope();
    renderKpis();
    renderCounts();
    renderTable();
    renderChart();
    renderChartTable();
    renderUrgentPhone();
  }

  /* ---------- detail dialog: in the rail on wide screens, a modal side sheet below 1280 px ---------- */

  const detail = $('#detail');
  const rail = $('.rail');
  const wide = matchMedia('(min-width: 1280px)');
  let opener = null;
  let switching = false;

  function openDetail(id, from) {
    if (!byId.has(id)) return;
    state.selectedId = id;
    if (from) opener = from;
    renderDetail(false);
    const modal = !wide.matches;
    if (detail.open && detail.matches(':modal') !== modal) { switching = true; detail.close(); }
    if (!detail.open) {
      if (modal) detail.showModal(); else detail.show();
    }
    rail.classList.toggle('has-detail', !modal);
    syncSelection();
    $('#detail-title').focus({ preventScroll: !modal });
    if (!modal) {
      const box = detail.getBoundingClientRect();
      if (box.top < 0 || box.top > window.innerHeight - 80) detail.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeDetail() { if (detail.open) detail.close(); }

  detail.addEventListener('close', () => {
    if (switching) { switching = false; return; }
    rail.classList.remove('has-detail');
    const id = state.selectedId;
    state.selectedId = null;
    syncSelection();
    const row = id && $(`[data-rows] tr[data-id="${id}"] .row-open`);
    const target = opener && document.contains(opener) && opener.getClientRects().length ? opener : row;
    if (target) target.focus();
  });
  detail.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detail.matches(':modal')) { e.preventDefault(); e.stopPropagation(); closeDetail(); }
  });
  $('[data-detail-close]').addEventListener('click', closeDetail);
  detail.addEventListener('click', (e) => {
    if (e.target === detail && detail.matches(':modal')) { closeDetail(); return; }
    const r = byId.get(state.selectedId);
    const act = e.target.closest('[data-act]');
    if (!act || !r) return;
    if (act.dataset.act === 'assign-me') setAssignee(r, ME);
    else if (act.dataset.act === 'resolve') setStatus(r, 'resolved');
    else if (act.dataset.act === 'reopen') setStatus(r, 'investigating');
  });
  detail.addEventListener('change', (e) => {
    const r = byId.get(state.selectedId);
    if (!r) return;
    if (e.target.id === 'd-assignee') setAssignee(r, e.target.value);
    else if (e.target.name === 'd-status') setStatus(r, e.target.value);
  });
  detail.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = byId.get(state.selectedId);
    const ta = $('#d-note', detail);
    if (ta && addNote(r, ta.value)) {
      const again = $('#d-note', detail);
      if (again) again.focus();
    }
  });
  wide.addEventListener('change', () => { if (detail.open && state.selectedId) openDetail(state.selectedId); });

  // anything with data-open (activity ids, phone list) opens that exception
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    e.preventDefault();
    openDetail(b.dataset.open, b);
  });

  /* ---------- table interactions ---------- */

  const tbody = $('[data-rows]');
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-view]')) {
      state.status = 'open';
      state.urgentOnly = false;
      $$('input[name="status"]').forEach((i) => { i.checked = i.value === 'open'; });
      $('#f-urgent').checked = false;
      state.page = 1;
      renderKpis(); renderTable();
      const first = $('.row-open', tbody);
      if (first) first.focus();
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const btn = $('.row-open', tr);
    setRoving(btn);
    openDetail(tr.dataset.id, btn);
  });
  tbody.addEventListener('keydown', (e) => {
    const btn = e.target.closest('.row-open');
    if (!btn) return;
    const btns = $$('.row-open', tbody);
    const i = btns.indexOf(btn);
    let j = null;
    if (e.key === 'ArrowDown') j = Math.min(i + 1, btns.length - 1);
    else if (e.key === 'ArrowUp') j = Math.max(i - 1, 0);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = btns.length - 1;
    if (j === null) return;
    e.preventDefault();
    setRoving(btns[j]);
    btns[j].focus();
  });

  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.sort;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'desc' ? 'asc' : 'desc';
    else state.sort = { key, dir: 'desc' };
    state.page = 1;
    renderTable();
    announce(`Sorted by ${SORTS[key].name}, ${SORTS[key][state.sort.dir]}.`);
  }));

  $$('[data-page]').forEach((b) => b.addEventListener('click', () => {
    state.page += Number(b.dataset.page);
    renderTable();
    if (b.disabled) { const other = $(`[data-page="${-Number(b.dataset.page)}"]`); if (other) other.focus(); }
    announce($('[data-pager-label]').textContent);
  }));

  $('[data-status-filter]').addEventListener('change', (e) => {
    if (e.target.name !== 'status') return;
    state.status = e.target.value;
    state.page = 1;
    renderTable();
    announce($('[data-caption]').textContent);
  });

  function setUrgentOnly(on) {
    state.urgentOnly = on;
    $('#f-urgent').checked = on;
    if (on && state.status === 'resolved') {
      state.status = 'open';
      $$('input[name="status"]').forEach((i) => { i.checked = i.value === 'open'; });
    }
    state.page = 1;
    renderKpis();
    renderTable();
    announce($('[data-caption]').textContent);
  }
  $('#f-urgent').addEventListener('change', (e) => setUrgentOnly(e.target.checked));
  $('[data-urgent-link]').addEventListener('click', () => {
    const phone = !$('.queue').getClientRects().length;
    if (phone) { $('.urgent-m').scrollIntoView({ block: 'start' }); $('#urgent-m-title').setAttribute('tabindex', '-1'); $('#urgent-m-title').focus(); return; }
    setUrgentOnly(!state.urgentOnly);
    if (state.urgentOnly) {
      const head = $('#queue-title');
      const box = head.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) head.scrollIntoView({ block: 'start' });
    }
  });

  /* ---------- filters ---------- */

  const form = $('#filters');
  function readCustom() {
    const fromEl = $('#f-from');
    const toEl = $('#f-to');
    const from = parseDate(fromEl.value);
    const to = parseDate(toEl.value);
    const min = parseDate(fromEl.min);
    const max = parseDate(fromEl.max);
    let error = '';
    if (from == null || to == null) error = 'Enter both dates.';
    else if (from < min || to > max) error = `Choose dates between ${day(min)} and ${day(max)}.`;
    else if (from > to) error = 'The start date must be on or before the end date.';
    const err = $('#range-error');
    err.hidden = !error;
    err.textContent = error;
    fromEl.setAttribute('aria-invalid', String(!!error && (from == null || from > to || from < min)));
    toEl.setAttribute('aria-invalid', String(!!error && (to == null || to > max || from > to)));
    if (error) return false;
    state.from = from;
    state.to = to;
    return true;
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'f-range') {
      state.range = t.value;
      $('[data-custom]').hidden = t.value !== 'custom';
      if (t.value === 'custom' && !readCustom()) return;
    } else if (t.id === 'f-from' || t.id === 'f-to') {
      if (!readCustom()) return;
    } else if (t.id === 'f-provider') state.provider = t.value;
    else if (t.id === 'f-entity') state.entity = t.value;
    syncEntityControls();
    state.page = 1;
    state.chartDay = null;
    update();
    announce(`Showing ${$('[data-scope-line]').textContent}.`);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('reset', () => {
    setTimeout(() => {
      Object.assign(state, DEFAULTS, { page: 1, chartDay: null });
      syncEntityControls();
      $('[data-custom]').hidden = true;
      $('#range-error').hidden = true;
      $$('#f-from, #f-to').forEach((i) => i.removeAttribute('aria-invalid'));
      update();
      $('#f-range').focus();
      announce('Filters reset to yesterday, all providers, all entities.');
    }, 0);
  });

  /* ---------- chart interactions ---------- */

  const chartSvg = $('[data-chart]');
  chartSvg.addEventListener('pointermove', (e) => {
    const i = chartIndexFromEvent(e);
    if (i === state.hoverDay) return;
    state.hoverDay = i;
    renderChart();
  });
  chartSvg.addEventListener('pointerleave', () => { state.hoverDay = null; renderChart(); });
  chartSvg.addEventListener('click', (e) => {
    const i = chartIndexFromEvent(e);
    if (i == null) return;
    state.chartDay = i;
    state.hoverDay = null;
    renderChart();
  });
  $$('[data-day]').forEach((b) => b.addEventListener('click', () => {
    state.chartDay = Math.max(0, Math.min(chart.days.length - 1, state.chartDay + Number(b.dataset.day)));
    state.hoverDay = null;
    renderChart();
    renderReadout(true);
    if (b.disabled) { const other = $(`[data-day="${-Number(b.dataset.day)}"]`); if (other) other.focus(); }
  }));
  if ('ResizeObserver' in window) {
    let raf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = Math.round(chartSvg.getBoundingClientRect().width);
        if (w && w !== chart.width) renderChart();
      });
    }).observe($('[data-chart-wrap]'));
  }

  /* ---------- app bar popovers, menu sheet, environment ---------- */

  const pops = [];
  function setupPop(btnId, panelId) {
    const btn = $('#' + btnId);
    const panel = $('#' + panelId);
    const set = (open) => { btn.setAttribute('aria-expanded', String(open)); panel.hidden = !open; };
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      pops.forEach((p) => p.set(false));
      set(open);
      if (open) {
        const f = panel.querySelector('input:checked, a[href], button, input');
        if (f) f.focus();
      }
    });
    panel.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== btn) set(false);
    });
    pops.push({ btn, panel, set });
  }
  setupPop('env-btn', 'env-pop');
  setupPop('user-btn', 'user-pop');
  document.addEventListener('click', (e) => {
    pops.forEach((p) => { if (!p.panel.hidden && !p.panel.contains(e.target) && !p.btn.contains(e.target)) p.set(false); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = pops.find((p) => !p.panel.hidden);
    if (open) { e.preventDefault(); open.set(false); open.btn.focus(); return; }
    if (detail.open && !detail.matches(':modal') && !document.querySelector('dialog:modal')) closeDetail();
  });

  const sheet = $('#menu-sheet');
  const menuBtn = $('#menu-btn');
  menuBtn.addEventListener('click', () => {
    sheet.showModal();
    menuBtn.setAttribute('aria-expanded', 'true');
    const current = $('a[aria-current="page"]', sheet);
    if (current) current.focus();
  });
  sheet.addEventListener('close', () => { menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); });
  $('[data-sheet-close]').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close();
    if (e.target.closest('a[href]')) sheet.close();
  });

  function setEnv(value) {
    $$('input[name="env"], input[name="env-m"]').forEach((i) => { i.checked = i.value === value; });
    const sandbox = value === 'sandbox';
    $('[data-env-tag]').classList.toggle('is-sandbox', sandbox);
    $('[data-env-label]').textContent = sandbox ? 'Sandbox' : 'Live';
    $('[data-env-banner]').hidden = !sandbox;
    announce(sandbox ? 'Switched to Sandbox. Test data.' : 'Switched to Live.');
  }
  // Entity lives in the app chrome (global scope) and in the filter bar; both drive the same state.
  function syncEntityControls() {
    $('#f-entity').value = state.entity;
    $$('input[name="entity-c"], input[name="entity-m"]').forEach((i) => { i.checked = i.value === state.entity; });
    $('[data-entity-label]').textContent = state.entity === 'all' ? 'Ottervale Group' : entityById[state.entity].name;
  }
  function setEntity(value) {
    if (state.entity === value) return;
    state.entity = value;
    syncEntityControls();
    state.page = 1;
    state.chartDay = null;
    update();
    announce(`Showing ${$('[data-scope-line]').textContent}.`);
  }
  document.addEventListener('change', (e) => {
    if (e.target.name === 'env' || e.target.name === 'env-m') setEnv(e.target.value);
    if (e.target.name === 'entity-c' || e.target.name === 'entity-m') setEntity(e.target.value);
  });

  /* ---------- go ---------- */

  renderActivity();
  update();
})();
