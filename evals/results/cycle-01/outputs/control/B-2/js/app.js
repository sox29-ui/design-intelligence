/* Ledgerline · Reconciliation overview — screen logic (vanilla JS, no build). */
(function () {
  'use strict';
  const { data: D, q: Q, fmt: F } = window.LL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
  const t0 = Date.now();
  const now = () => D.NOW + (Date.now() - t0); // the prototype's clock starts at 08:47

  /* ---------- state ---------- */
  const DEFAULTS = { period: 'yesterday', from: null, to: null, provider: 'all', entity: 'all' };
  const PAGE = 40;
  const state = Object.assign({}, DEFAULTS, {
    status: 'open', urgentOnly: false, search: '',
    sort: { key: 'age', dir: 'desc' }, limit: PAGE, focusId: null,
    selected: null, chartMode: 'value', noticeDismissed: false,
  });
  const scope = () => ({ provider: state.provider, entity: state.entity });
  const isUrgent = (x) => Q.isUrgent(x, now());
  const isOpen = (x) => x.status !== 'resolved';
  const ageMs = (x) => (isOpen(x) ? now() - x.created : x.resolvedAt - x.created);
  const person = (id) => D.P[id];
  const nameOf = (id) => (id === 'jw' ? 'You' : person(id).name);
  const raisedToday = () => D.exceptions.filter((x) => x.created >= D.dayStart(0)).length;

  /* ---------- periods ---------- */
  const SPAN = { yesterday: 1, '7d': 7, '14d': 14, '30d': 30 };
  function period() {
    let from = -(SPAN[state.period] || 1), to = -1;
    if (state.period === 'custom' && state.from != null) { from = state.from; to = state.to; }
    const len = to - from + 1;
    return { from, to, len, prevFrom: from - len, prevTo: from - 1, start: D.dayStart(from), end: D.dayStart(to + 1) };
  }
  const rangeText = (a, b) => (a === b ? F.day(D.dayStart(a)) : F.date(D.dayStart(a)) + ' – ' + F.date(D.dayStart(b)));
  const prevName = (p) => (p.len === 1 ? F.date(D.dayStart(p.prevFrom)) : `previous ${p.len} days`);
  const ymd = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return D.dayIndex(new Date(y, m - 1, d).getTime()); };

  /* ---------- filters ---------- */
  function initFilters() {
    $('#f-provider').innerHTML = '<option value="all">All providers</option>' +
      D.providers.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    $('#f-entity').innerHTML = '<option value="all">All entities and accounts</option>' +
      D.entities.map((e) => `<option value="${e.id}">${e.country} · ${e.name} · ${e.account}</option>`).join('');
    const from = $('#f-from'), to = $('#f-to');
    from.min = to.min = ymd(D.dayStart(-30));
    from.max = to.max = ymd(D.dayStart(-1));
    from.value = ymd(D.dayStart(-7));
    to.value = ymd(D.dayStart(-1));

    $('#f-period').addEventListener('change', (e) => {
      state.period = e.target.value;
      $('#custom-range').hidden = state.period !== 'custom';
      if (state.period === 'custom') readCustom();
      render();
    });
    [from, to].forEach((i) => i.addEventListener('change', () => { readCustom(); render(); }));
    $('#f-provider').addEventListener('change', (e) => { state.provider = e.target.value; render(); });
    $('#f-entity').addEventListener('change', (e) => { state.entity = e.target.value; render(); });
    $('#f-reset').addEventListener('click', () => {
      Object.assign(state, DEFAULTS);
      syncFilters();
      render();
      $('#f-period').focus();
    });
  }
  function readCustom() {
    const clamp = (v) => Math.min(-1, Math.max(-30, v));
    let a = clamp(parseYmd($('#f-from').value || ymd(D.dayStart(-7))));
    let b = clamp(parseYmd($('#f-to').value || ymd(D.dayStart(-1))));
    if (a > b) [a, b] = [b, a];
    state.from = a;
    state.to = b;
  }
  function syncFilters() {
    $('#f-period').value = state.period;
    $('#custom-range').hidden = state.period !== 'custom';
    $('#f-provider').value = state.provider;
    $('#f-entity').value = state.entity;
  }

  /* ---------- run line, notice, KPIs ---------- */
  function renderRunLine() {
    const y = Q.volume(-1, -1, null);
    $('#run-line').innerHTML =
      `<span class="run-ok">${icon('st-resolved')}Daily run finished ${F.time(D.at(0, D.RUN_AT.h, D.RUN_AT.m))}</span>` +
      `<span>${F.int(y.count)} transactions from ${F.day(D.dayStart(-1))}</span>` +
      `<span>${raisedToday()} exceptions raised</span>` +
      `<span>Next run tomorrow 06:00</span>`;
  }

  function renderNotice() {
    const n = D.exceptions.filter((x) => x.provider === 'klarna' && isOpen(x) && x.created >= D.dayStart(0)).length;
    $('#notice').hidden = state.noticeDismissed;
    $('#notice-text').innerHTML =
      `<strong>Klarna’s settlement report for ${F.day(D.dayStart(-1))} hasn’t arrived</strong> (due 05:00). ` +
      `${n} Klarna exceptions from this morning’s run may clear by themselves when it lands, so chase the others first.`;
    $('#notice-show').hidden = state.provider === 'klarna';
  }

  function deltaHtml(diff, absText, upIsGood, vs, eps) {
    if (diff == null || !isFinite(diff)) return `<span class="delta delta--flat">${icon('flat')}No data</span><span class="delta-vs">for ${vs}</span>`;
    if (Math.abs(diff) < eps) return `<span class="delta delta--flat">${icon('flat')}No change</span><span class="delta-vs">vs ${vs}</span>`;
    const up = diff > 0, good = up === upIsGood;
    return `<span class="delta ${good ? 'delta--good' : 'delta--bad'}">${icon(up ? 'up' : 'down')}${up ? '+' : '−'}${absText}</span>` +
      `<span class="delta-vs">${good ? 'better' : 'worse'} than ${vs}</span>`;
  }
  function kpi(name, value, delta, sub) {
    const el = $(`[data-kpi="${name}"]`);
    $('.kpi-value', el).innerHTML = value;
    $('.kpi-delta', el).innerHTML = delta;
    $('.kpi-sub', el).innerHTML = sub;
  }

  function renderKpis() {
    const p = period(), f = scope(), vs = prevName(p);
    const cur = Q.volume(p.from, p.to, f), prev = Q.volume(p.prevFrom, p.prevTo, f);
    const rate = cur.value ? (1 - cur.unmatched / cur.value) * 100 : null;
    const pRate = prev.value ? (1 - prev.unmatched / prev.value) * 100 : null;
    const TARGET = 98;
    kpi('rate',
      rate == null ? '—' : `${F.one(rate)}<span class="unit unit--pct">%</span>`,
      deltaHtml(rate - pRate, F.one(Math.abs(rate - pRate)) + ' pp', true, vs, 0.05),
      `<span>Target ${F.one(TARGET)}%</span><span class="${rate >= TARGET ? 'ok' : 'below'}">${rate >= TARGET ? 'On target' : F.one(TARGET - rate) + ' pp below'}</span>`);

    const chg = prev.unmatched ? ((cur.unmatched - prev.unmatched) / prev.unmatched) * 100 : null;
    kpi('unmatched',
      `<span class="cur">€</span>${F.amount(cur.unmatched)}`,
      deltaHtml(chg, F.one(Math.abs(chg)) + '%', false, vs, 0.05),
      `<span>${F.int(cur.unmatchedCount)} transactions</span><span>${cur.value ? F.pct((cur.unmatched / cur.value) * 100, 2) : '—'} of volume</span>`);

    const openNow = D.exceptions.filter((x) => isOpen(x) && Q.inScope(x, f));
    const openPrev = Q.openAt(p.start, f);
    const urgent = openNow.filter(isUrgent).length;
    const fresh = openNow.filter((x) => x.created >= D.dayStart(0)).length;
    kpi('open',
      String(openNow.length),
      deltaHtml(openNow.length - openPrev, String(Math.abs(openNow.length - openPrev)), false, vs, 0.5),
      `<button class="link-btn" type="button" data-show-urgent>${icon('urgent', 'ic--urgent')}${urgent} urgent</button><span>${fresh} raised today</span>`);

    const tt = Q.resolveTimes(p.start, p.end, f);
    const tp = Q.resolveTimes(D.dayStart(p.prevFrom), p.start, f);
    kpi('ttr',
      tt.median == null ? '—' : `${F.one(tt.median)}<span class="unit">days</span>`,
      tt.median == null || tp.median == null
        ? deltaHtml(null, '', false, vs, 0)
        : deltaHtml(tt.median - tp.median, F.one(Math.abs(tt.median - tp.median)) + ' d', false, vs, 0.05),
      `<span>${tt.n} resolved</span><span>Target ≤ 2.0 d</span>`);
  }

  /* ---------- exceptions table ---------- */
  const TABS = ['open', 'new', 'investigating', 'waiting', 'resolved', 'all'];
  const statusMatch = (x, s) => s === 'all' || (s === 'open' ? isOpen(x) : x.status === s);
  const searchText = (x) => [
    x.id, D.PR[x.provider].name, D.RS[x.reason].label, D.ST[x.status].label, D.EN[x.entity].name,
    x.assignee ? person(x.assignee).name : 'unassigned', x.payoutRef, x.currency, F.amount(x.amount),
  ].join(' ').toLowerCase();

  // Rows in scope: open items of any age, plus anything resolved since the period began.
  function baseRows() {
    const f = scope(), p = period(), q = state.search.trim().toLowerCase();
    return D.exceptions.filter((x) => Q.inScope(x, f) &&
      (isOpen(x) || x.resolvedAt >= p.start) &&
      (!state.urgentOnly || isUrgent(x)) &&
      (!q || searchText(x).includes(q)));
  }
  function sortRows(rows) {
    const m = state.sort.dir === 'asc' ? 1 : -1;
    const v = state.sort.key === 'amount' ? (x) => x.eur : ageMs;
    return rows.sort((a, b) => (v(a) - v(b)) * m || (a.id < b.id ? 1 : -1));
  }
  const visibleRows = () => sortRows(baseRows().filter((x) => statusMatch(x, state.status)));

  const statusChip = (s) => `<span class="status status--${s}">${icon('st-' + s)}${D.ST[s].label}</span>`;
  function who(id, full) {
    if (!id) return '<span class="who who--none"><span class="avatar avatar--none" aria-hidden="true"></span>Unassigned</span>';
    const p = person(id);
    return `<span class="who" title="${p.name}"><span class="avatar" style="--h:${p.hue}" aria-hidden="true">${p.initials}</span>${full ? p.name : p.first}${p.you ? ' <span class="you">(you)</span>' : ''}</span>`;
  }
  const autoMatch = `<span class="who who--none"><span class="avatar avatar--sys" aria-hidden="true">${icon('st-resolved')}</span>Auto-match</span>`;
  function ageCell(x) {
    const ms = ageMs(x), txt = F.age(ms);
    if (!isOpen(x)) return `<span class="age age--done" title="Took ${txt} to resolve">${txt}<span class="sr-only"> to resolve</span></span>`;
    if (ms >= D.SLA_DAYS * D.DAY) return `<span class="age age--over" title="Past the 3-day SLA">${icon('clock')}${txt}<span class="sr-only">, past SLA</span></span>`;
    return `<span class="age">${txt}</span>`;
  }
  function rowHtml(x, focusable) {
    const urgent = isUrgent(x), sel = state.selected === x.id;
    return `<tr data-id="${x.id}" class="${urgent ? 'is-urgent' : ''}${sel ? ' is-selected' : ''}"${sel ? ' aria-current="true"' : ''}>` +
      `<td class="c-id"><button type="button" class="row-btn" tabindex="${focusable ? 0 : -1}" aria-controls="detail" aria-expanded="${sel}">` +
      (urgent ? `${icon('urgent', 'ic--urgent')}<span class="sr-only">Urgent: </span>` : '<span class="ic-gap" aria-hidden="true"></span>') +
      `<span class="mono">${x.id}</span></button></td>` +
      `<td class="c-provider">${D.PR[x.provider].name}<span class="reason-inline">${D.RS[x.reason].label}</span></td>` +
      `<td class="c-reason">${D.RS[x.reason].label}</td>` +
      `<td class="c-amount num${x.eur >= D.HIGH_VALUE ? ' is-high' : ''}">${F.amount(x.amount)}<span class="ccy-inline"> ${x.currency}</span></td>` +
      `<td class="c-ccy">${x.currency}</td>` +
      `<td class="c-age num">${ageCell(x)}</td>` +
      `<td class="c-status">${statusChip(x.status)}</td>` +
      `<td class="c-assignee">${x.resolver === 'system' ? autoMatch : who(x.assignee)}</td></tr>`;
  }
  function emptyText() {
    if (state.search) return `No exceptions match “${esc(state.search)}”.`;
    if (state.urgentOnly) return 'Nothing urgent here. Turn off “Urgent only” to see everything.';
    return state.status === 'resolved' ? 'Nothing resolved in this period yet.' : 'No exceptions for these filters.';
  }

  function renderTable() {
    const base = baseRows();
    TABS.forEach((s) => { const c = $(`[data-count="${s}"]`); if (c) c.textContent = base.filter((x) => statusMatch(x, s)).length; });
    const rows = sortRows(base.filter((x) => statusMatch(x, state.status)));
    const shown = rows.slice(0, state.limit);
    const focusRow = shown.find((x) => x.id === state.focusId) || shown.find((x) => x.id === state.selected) || shown[0];
    $('#ex-body').innerHTML = shown.length
      ? shown.map((x) => rowHtml(x, x === focusRow)).join('')
      : `<tr class="empty"><td colspan="8">${emptyText()}</td></tr>`;

    $$('th[data-sort-key]').forEach((th) => {
      const on = state.sort.key === th.dataset.sortKey;
      if (on) th.setAttribute('aria-sort', state.sort.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      $('use', th).setAttribute('href', on ? (state.sort.dir === 'asc' ? '#i-sort-asc' : '#i-sort-desc') : '#i-updown');
    });

    const open = base.filter(isOpen);
    const exposure = open.reduce((s, x) => s + x.eur, 0);
    $('#ex-summary').innerHTML = `${open.length} open · ${F.eur(exposure)} at stake <span class="muted">(EUR equivalent)</span>`;
    const order = state.sort.key === 'age'
      ? (state.sort.dir === 'desc' ? 'oldest first' : 'newest first')
      : (state.sort.dir === 'desc' ? 'largest first' : 'smallest first') + ', by EUR equivalent';
    $('#ex-foot-text').innerHTML = `<span>Showing ${shown.length} of ${rows.length} · ${order}</span>` +
      `<span class="legend">${icon('urgent', 'ic--urgent')}Urgent: open 3+ days or €5,000+</span>` +
      `<span class="legend">${icon('clock', 'ic--over')}Past 3-day SLA</span>`;
    const rest = rows.length - shown.length, more = $('#ex-more');
    more.hidden = rest <= 0;
    more.textContent = `Show ${Math.min(rest, PAGE)} more`;
  }

  function markSelected() {
    $$('#ex-body tr[data-id]').forEach((tr) => {
      const on = tr.dataset.id === state.selected;
      tr.classList.toggle('is-selected', on);
      if (on) tr.setAttribute('aria-current', 'true'); else tr.removeAttribute('aria-current');
      $('.row-btn', tr).setAttribute('aria-expanded', String(on));
    });
  }
  function focusRowBtn(btn) {
    $$('#ex-body .row-btn').forEach((b) => { b.tabIndex = -1; });
    btn.tabIndex = 0;
    btn.focus();
    state.focusId = btn.closest('tr').dataset.id;
  }

  function initTable() {
    const body = $('#ex-body');
    body.addEventListener('keydown', (e) => {
      const btn = e.target.closest('.row-btn');
      if (!btn) return;
      const all = $$('.row-btn', body), i = all.indexOf(btn);
      const moves = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1, PageDown: i + 10, PageUp: i - 10 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      const next = all[Math.max(0, Math.min(all.length - 1, moves[e.key]))];
      focusRowBtn(next);
      if (state.selected) openDetail(next.closest('tr').dataset.id, { focus: false }); // details follow the cursor
    });
    body.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      focusRowBtn($('.row-btn', tr));
      openDetail(tr.dataset.id, { focus: true });
    });
    $('#ex-table thead').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]');
      if (!b) return;
      const k = b.dataset.sort;
      state.sort = state.sort.key === k ? { key: k, dir: state.sort.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: 'desc' };
      renderTable();
    });
    $$('input[name="status"]').forEach((r) => r.addEventListener('change', () => {
      state.status = r.value;
      state.limit = PAGE;
      renderTable();
    }));
    $('#urgent-only').addEventListener('change', (e) => { state.urgentOnly = e.target.checked; state.limit = PAGE; renderTable(); });
    $('#ex-search').addEventListener('input', (e) => { state.search = e.target.value; state.limit = PAGE; renderTable(); });
    $('#ex-more').addEventListener('click', () => { state.limit += PAGE; renderTable(); });
    // "N urgent" in the KPI tile jumps straight to the urgent queue.
    $('[data-kpi="open"]').addEventListener('click', (e) => {
      if (!e.target.closest('[data-show-urgent]')) return;
      state.urgentOnly = true;
      state.status = 'open';
      $('#urgent-only').checked = true;
      $('input[name="status"][value="open"]').checked = true;
      renderTable();
      const sec = $('#exceptions');
      sec.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      sec.focus({ preventScroll: true });
    });
  }

  /* ---------- trend chart ---------- */
  let chart;
  function renderChart() {
    const f = scope(), p = period();
    const series = Q.series(-30, -1, f);
    chart.update({ data: series, mode: state.chartMode, band: [p.from, p.to] });
    const byValue = state.chartMode === 'value';
    const pick = (d) => (byValue ? { a: d.value - d.unmatched, b: d.unmatched, r: 1 - d.unmatched / d.value } : { a: d.count - d.unmatchedCount, b: d.unmatchedCount, r: 1 - d.unmatchedCount / d.count });
    const tot = series.reduce((s, d) => ({ v: s.v + d.value, u: s.u + d.unmatched }), { v: 0, u: 0 });
    const worst = series.reduce((w, d) => (pick(d).r < pick(w).r ? d : w));
    $('#chart-summary').innerHTML =
      `<span><span class="key key--band" aria-hidden="true"></span>Selected period</span>` +
      `<span>30-day match rate <b>${F.pct((1 - tot.u / tot.v) * 100)}</b>. Lowest: ${F.day(worst.t)}, ${F.pct(pick(worst).r * 100)}${worst.note ? ` (${esc(worst.note)})` : ''}.</span>`;
    const cell = (n) => (byValue ? F.eur(n) : F.int(n));
    $('#chart-table').innerHTML = `<table class="mini-table"><caption class="sr-only">Daily matched and unmatched ${byValue ? 'value' : 'transactions'}, last 30 days</caption>` +
      `<thead><tr><th scope="col">Day</th><th scope="col" class="num">Matched</th><th scope="col" class="num">Unmatched</th><th scope="col" class="num">Rate</th></tr></thead><tbody>` +
      series.slice().reverse().map((d) => { const v = pick(d); return `<tr><th scope="row">${F.day(d.t)}</th><td class="num">${cell(v.a)}</td><td class="num">${cell(v.b)}</td><td class="num">${F.pct(v.r * 100, 2)}</td></tr>`; }).join('') +
      '</tbody></table>';
  }

  /* ---------- activity feed ---------- */
  const exLink = (id) => `<button type="button" class="ex-link" data-open="${id}">${id}</button>`;
  function evText(ev) {
    const a = `<strong>${nameOf(ev.actor === 'system' ? 'jw' : ev.actor)}</strong> `;
    switch (ev.type) {
      case 'resolved': return `${a}resolved ${exLink(ev.ex)}<span class="ev-detail">${esc(ev.detail)}</span>`;
      case 'assigned': return `${a}assigned ${exLink(ev.ex)} to <strong>${ev.target === 'jw' ? 'you' : person(ev.target).name}</strong>`;
      case 'picked': return `${a}picked up ${exLink(ev.ex)}`;
      case 'waiting': return `${a}marked ${exLink(ev.ex)} as waiting on provider${ev.detail ? `<span class="ev-detail">${esc(ev.detail)}</span>` : ''}`;
      case 'status': return `${a}moved ${exLink(ev.ex)} to ${D.ST[ev.target].label}`;
      case 'reopened': return `${a}reopened ${exLink(ev.ex)}`;
      case 'comment': return `${a}commented on ${exLink(ev.ex)}<span class="ev-detail">“${esc(ev.detail)}”</span>`;
      default: {
        const y = Q.volume(-1, -1, null);
        return `<strong>Daily run</strong> finished<span class="ev-detail">${F.day(D.dayStart(-1))} matched at ${F.pct((1 - y.unmatched / y.value) * 100)} · ${raisedToday()} exceptions raised</span>`;
      }
    }
  }
  function renderFeed() {
    const items = D.events.slice().sort((a, b) => b.t - a.t).slice(0, 8);
    $('#feed').innerHTML = items.map((ev) => {
      const av = ev.actor === 'system'
        ? `<span class="avatar avatar--sys" aria-hidden="true">${icon('st-resolved')}</span>`
        : `<span class="avatar" style="--h:${person(ev.actor).hue}" aria-hidden="true">${person(ev.actor).initials}</span>`;
      return `<li class="ev">${av}<p class="ev-text">${evText(ev)}</p><time class="ev-time" datetime="${F.iso(ev.t)}">${F.when(ev.t)}</time></li>`;
    }).join('');
  }

  /* ---------- detail panel ---------- */
  const modalMQ = window.matchMedia('(max-width: 1359.98px)');
  const RESOLUTIONS = {
    mismatch: ['Matched manually', 'Fee adjustment booked', 'Partial refund matched'],
    missing: ['Payout located in bank feed', 'Provider re-sent payout'],
    fx: ['FX difference booked to 7940', 'Matched at provider rate'],
    duplicate: ['Duplicate entry voided', 'Duplicate payout reversed'],
  };
  let opener = null;
  const stamp = (t) => { const i = D.dayIndex(t); return (i === 0 ? 'Today' : i === -1 ? 'Yesterday' : F.day(t)) + ', ' + F.time(t); };

  function explain(x) {
    const pr = D.PR[x.provider].name, acct = D.EN[x.entity].account, amt = F.money(x.amount, x.currency);
    const orders = `${x.orders} order${x.orders === 1 ? '' : 's'}`;
    return {
      mismatch: `The payout settled ${amt} ${x.received < x.expected ? 'less' : 'more'} than the ${orders} it covers.`,
      missing: `${pr} reported a payout for ${orders}, but no matching deposit has reached ${acct}.`,
      duplicate: `The same ${pr} payout was booked twice on ${acct}.`,
      fx: `${pr} converted at its own rate, ${amt} away from the reference rate.`,
    }[x.reason];
  }
  const LABELS = {
    mismatch: ['Expected from orders', 'Received in payout'],
    missing: ['Expected payout', 'Received in bank'],
    duplicate: ['Expected in bank', 'Booked in bank'],
    fx: ['Expected at reference rate', 'Received at provider rate'],
  };

  function actionsHtml(x) {
    const people = '<option value="">Unassigned</option>' + D.people.map((p) =>
      `<option value="${p.id}"${p.id === x.assignee ? ' selected' : ''}>${p.name}${p.you ? ' (you)' : ''}</option>`).join('');
    const sts = ['new', 'investigating', 'waiting'].map((s) =>
      `<option value="${s}"${s === x.status ? ' selected' : ''}>${D.ST[s].label}</option>`).join('');
    const res = RESOLUTIONS[x.reason].concat(x.eur < 10 ? ['Written off (under €10 tolerance)'] : [])
      .map((r) => `<option>${r}</option>`).join('');
    return `<section class="d-actions" aria-label="Triage">
      <div class="d-fields">
        <div class="field"><label for="d-assignee">Assignee</label><select class="select" id="d-assignee">${people}</select></div>
        <div class="field"><label for="d-status">Status</label><select class="select" id="d-status">${sts}</select></div>
      </div>
      <div class="d-buttons">
        <button class="btn btn--primary" type="button" id="d-resolve-btn" data-action="resolve" aria-expanded="false" aria-controls="d-resolve">${icon('st-resolved')}Resolve…</button>
        ${x.assignee !== 'jw' ? `<button class="btn" type="button" id="d-me" data-action="assign-me">${icon('assign')}Assign to me</button>` : ''}
      </div>
      <form class="d-resolve" id="d-resolve" hidden>
        <div class="field"><label for="d-resolution">Resolution</label><select class="select" id="d-resolution">${res}</select></div>
        <div class="field"><label for="d-note">Note <span class="optional">(optional)</span></label><textarea class="input" id="d-note" rows="2" placeholder="Added to the exception history"></textarea></div>
        <div class="d-buttons"><button class="btn btn--primary" type="submit">Confirm resolve</button><button class="btn btn--ghost" type="button" data-action="cancel-resolve">Cancel</button></div>
      </form>
    </section>`;
  }

  function renderDetail(x) {
    const pr = D.PR[x.provider], en = D.EN[x.entity], open = isOpen(x), age = now() - x.created;
    const why = [];
    if (open && age >= D.SLA_DAYS * D.DAY) why.push(`open ${F.age(age)}, past the 3-day SLA`);
    if (open && x.eur >= D.HIGH_VALUE) why.push('€5,000 or more at stake');
    const diff = x.received - x.expected, [l1, l2] = LABELS[x.reason];
    $('#detail').innerHTML = `
      <div class="d-head">
        <div class="d-title-row">
          <h2 id="detail-title" tabindex="-1"><span class="sr-only">Exception </span><span class="mono">${x.id}</span></h2>
          ${statusChip(x.status)}
          <button class="icon-btn d-close" type="button" data-action="close" aria-label="Close details">${icon('close')}</button>
        </div>
        <p class="d-sub">${pr.name} · ${D.RS[x.reason].label} · ${en.country}, ${en.name}</p>
      </div>
      <div class="d-body">
        ${why.length ? `<p class="d-urgent">${icon('urgent', 'ic--urgent')}<span><strong>Urgent:</strong> ${why.join('; ')}.</span></p>` : ''}
        <div class="d-amount">
          <span class="d-label">Unreconciled amount</span>
          <p class="d-amount-line"><span class="d-amount-value">${F.money(x.amount, x.currency)}</span>${x.currency !== 'EUR' ? `<span class="d-amount-eur">≈ ${F.eur(x.eur)} at ${D.fx[x.currency]} EUR/${x.currency}</span>` : ''}</p>
        </div>
        <p class="d-explain">${explain(x)}</p>
        ${open ? actionsHtml(x) : `<section class="d-resolved">${icon('st-resolved')}<div><p><strong>Resolved ${F.when(x.resolvedAt)}</strong> by ${x.resolver === 'system' ? 'auto-match' : nameOf(x.resolver).replace('You', 'you')}</p><p>${esc(x.resolution)}</p></div><button class="btn btn--sm" type="button" id="d-reopen" data-action="reopen">Reopen</button></section>`}
        <table class="d-compare"><caption class="sr-only">Expected versus received</caption><tbody>
          <tr><th scope="row">${l1}</th><td class="num">${F.money(x.expected, x.currency)}</td></tr>
          <tr><th scope="row">${l2}</th><td class="num">${F.money(x.received, x.currency)}</td></tr>
          <tr class="d-diff"><th scope="row">Difference</th><td class="num">${diff > 0 ? '+' : diff < 0 ? '−' : ''}${F.money(Math.abs(diff), x.currency)}</td></tr>
        </tbody></table>
        <dl class="d-facts">
          <div><dt>Payout reference</dt><dd class="mono">${x.payoutRef}</dd></div>
          <div><dt>Bank account</dt><dd>${en.account}</dd></div>
          <div><dt>Orders affected</dt><dd>${x.orders}</dd></div>
          <div><dt>Raised</dt><dd>${F.day(x.created)}, ${F.time(x.created)}</dd></div>
          <div><dt>${open ? 'Age' : 'Time to resolve'}</dt><dd>${F.age(ageMs(x))}</dd></div>
          <div><dt>Assignee</dt><dd>${who(x.assignee, true)}</dd></div>
        </dl>
        <section class="d-history" aria-labelledby="d-history-title">
          <h3 class="d-h3" id="d-history-title">History</h3>
          <ol class="timeline">${x.log.slice().sort((a, b) => b.t - a.t).map((l) =>
            `<li><time datetime="${F.iso(l.t)}">${stamp(l.t)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol>
        </section>
      </div>`;
  }

  function openDetail(id, { focus = true } = {}) {
    const x = D.EX[id];
    if (!x) return;
    const panel = $('#detail');
    if (panel.hidden && !panel.contains(document.activeElement)) opener = document.activeElement;
    state.selected = id;
    markSelected();
    renderDetail(x);
    panel.hidden = false;
    setPanelMode();
    document.body.classList.add('detail-open');
    if (focus) $('#detail-title').focus();
  }
  // Wide screens: the panel lives in the rail beside the table (master-detail).
  // Narrower screens: it is a modal sheet attached to <body>.
  function placePanel() {
    const panel = $('#detail'), home = modalMQ.matches ? document.body : $('.rail');
    if (panel.parentElement !== home) home.insertBefore(panel, home.firstChild);
  }
  function setPanelMode() {
    placePanel();
    const panel = $('#detail'), modal = modalMQ.matches && !panel.hidden;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', String(modal));
    $('#detail-scrim').hidden = !modal;
  }
  function closeDetail() {
    const id = state.selected;
    if (!id) return;
    state.selected = null;
    $('#detail').hidden = true;
    $('#detail-scrim').hidden = true;
    document.body.classList.remove('detail-open');
    markSelected();
    if ($('#ex-body').contains(document.activeElement)) return; // keyboard user is already in the table
    const rowBtn = $(`#ex-body tr[data-id="${id}"] .row-btn`);
    const back = opener && document.contains(opener) && opener !== document.body && !opener.closest('#detail') ? opener : rowBtn;
    if (back) back.focus(); else $('#exceptions').focus();
  }

  /* ---------- triage actions ---------- */
  const snapshot = (x) => ({ status: x.status, assignee: x.assignee, resolvedAt: x.resolvedAt, resolver: x.resolver, resolution: x.resolution, log: x.log.slice() });
  function afterChange(x, msg) {
    const focusId = document.activeElement && document.activeElement.id;
    renderKpis();
    renderTable();
    renderFeed();
    renderPhone();
    renderNav();
    if (state.selected === x.id) {
      renderDetail(x);
      const el = focusId && document.getElementById(focusId);
      (el && $('#detail').contains(el) ? el : $('#detail-title')).focus();
    }
    if (msg) toast(msg);
  }
  function assign(x, id) {
    if (x.assignee === id) return;
    const t = now();
    x.assignee = id;
    x.log.push({ t, text: id ? `Assigned to ${person(id).name} by you` : 'Unassigned by you' });
    if (id) D.events.push({ t, actor: 'jw', type: id === 'jw' ? 'picked' : 'assigned', ex: x.id, target: id });
    afterChange(x, id ? `${x.id} assigned to ${id === 'jw' ? 'you' : person(id).name}` : `${x.id} unassigned`);
  }
  function setStatus(x, s) {
    if (x.status === s) return;
    const t = now();
    x.status = s;
    x.log.push({ t, text: `Moved to ${D.ST[s].label} by you` });
    D.events.push({ t, actor: 'jw', type: s === 'waiting' ? 'waiting' : 'status', ex: x.id, target: s });
    afterChange(x, `${x.id} moved to ${D.ST[s].label}`);
  }
  function resolve(x, resolution, note) {
    const before = snapshot(x), t = now();
    Object.assign(x, { status: 'resolved', resolvedAt: t, resolver: 'jw', resolution, assignee: x.assignee || 'jw' });
    x.log.push({ t, text: `Resolved by you · ${resolution}${note ? ' · ' + note : ''}` });
    const ev = { t, actor: 'jw', type: 'resolved', ex: x.id, detail: resolution };
    D.events.push(ev);
    afterChange(x, null);
    toast(`${x.id} resolved`, () => {
      Object.assign(x, before);
      D.events.splice(D.events.indexOf(ev), 1);
      afterChange(x, `${x.id} is open again`);
    });
  }
  function reopen(x) {
    const t = now();
    Object.assign(x, { status: 'investigating', resolvedAt: null, resolver: null, resolution: null });
    x.log.push({ t, text: 'Reopened by you' });
    D.events.push({ t, actor: 'jw', type: 'reopened', ex: x.id });
    afterChange(x, `${x.id} reopened`);
  }

  function initDetail() {
    const panel = $('#detail');
    panel.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      const x = D.EX[state.selected];
      if (!a || !x) return;
      const act = a.dataset.action;
      if (act === 'close') closeDetail();
      else if (act === 'assign-me') assign(x, 'jw');
      else if (act === 'reopen') reopen(x);
      else if (act === 'resolve') {
        $('#d-resolve').hidden = false;
        a.setAttribute('aria-expanded', 'true');
        $('#d-resolution').focus();
      } else if (act === 'cancel-resolve') {
        $('#d-resolve').hidden = true;
        $('#d-resolve-btn').setAttribute('aria-expanded', 'false');
        $('#d-resolve-btn').focus();
      }
    });
    panel.addEventListener('change', (e) => {
      const x = D.EX[state.selected];
      if (!x) return;
      if (e.target.id === 'd-assignee') assign(x, e.target.value || null);
      if (e.target.id === 'd-status') setStatus(x, e.target.value);
    });
    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      const x = D.EX[state.selected];
      if (x) resolve(x, $('#d-resolution').value, $('#d-note').value.trim());
    });
    panel.addEventListener('keydown', (e) => { // focus trap while the panel is modal
      if (e.key !== 'Tab' || panel.getAttribute('aria-modal') !== 'true') return;
      const f = $$('a[href], button, select, textarea, input', panel).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === $('#detail-title'))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    });
    $('#detail-scrim').addEventListener('click', closeDetail);
    modalMQ.addEventListener('change', setPanelMode);
    $('#feed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openDetail(b.dataset.open, { focus: true });
    });
  }

  /* ---------- phone priority list, nav badge ---------- */
  function renderPhone() {
    const list = D.exceptions.filter(isUrgent).sort((a, b) => a.created - b.created);
    $('#phone-urgent-count').textContent = list.length;
    $('#phone-urgent-list').innerHTML = list.map((x) => {
      const age = now() - x.created, over = age >= D.SLA_DAYS * D.DAY;
      return `<li class="u-card">
        <div class="u-top"><span class="mono u-id">${x.id}</span>${statusChip(x.status)}</div>
        <div class="u-amount"><span>${F.money(x.amount, x.currency)}</span>${x.currency !== 'EUR' ? `<span class="u-eur">≈ ${F.eur(x.eur)}</span>` : ''}</div>
        <p class="u-meta">${D.PR[x.provider].name} · ${D.RS[x.reason].label} · <span class="${over ? 'age--over' : ''}">${over ? icon('clock') : ''}${F.age(age)} old</span> · ${x.assignee ? person(x.assignee).first : 'Unassigned'}</p>
      </li>`;
    }).join('');
  }
  function renderNav() {
    const n = D.exceptions.filter(isOpen).length;
    const badge = $('#nav-ex-count');
    badge.textContent = n;
    badge.setAttribute('aria-label', `${n} open`);
  }

  /* ---------- toasts ---------- */
  function toast(msg, undo) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-btn';
      b.textContent = 'Undo';
      b.addEventListener('click', () => { el.remove(); undo(); });
      el.appendChild(b);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), undo ? 9000 : 4500);
  }

  /* ---------- menus, navigation drawer, environment ---------- */
  const menus = [];
  function setupMenu(btn, menu) {
    const items = () => $$('[role^="menuitem"]', menu);
    const open = () => {
      menus.forEach((m) => m.menu !== menu && m.close(false));
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (items().find((i) => i.getAttribute('aria-checked') === 'true') || items()[0]).focus();
    };
    const close = (refocus) => {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    };
    btn.addEventListener('click', () => (menu.hidden ? open() : close(false)));
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    menu.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      const go = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
      if (go != null) { e.preventDefault(); list[go].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('[role^="menuitem"]')) close(true); });
    menus.push({ btn, menu, close });
  }
  document.addEventListener('pointerdown', (e) => {
    menus.forEach((m) => { if (!m.menu.contains(e.target) && !m.btn.contains(e.target)) m.close(false); });
  });

  function setEnv(env) {
    document.body.dataset.env = env;
    $$('[data-env]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.env === env)));
    const label = env === 'live' ? 'Live' : 'Sandbox';
    $('#env-label').textContent = label;
    $$('.env-text').forEach((n) => { n.textContent = label; });
    $('#env-banner').hidden = env === 'live';
  }

  const navBtn = $('#nav-open');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    navBtn.setAttribute('aria-expanded', String(open));
    $('#nav-scrim').hidden = !open;
    (open ? $('#nav-close') : navBtn).focus();
  }

  function initChrome() {
    setupMenu($('#ws-btn'), $('#ws-menu'));
    setupMenu($('#user-btn'), $('#user-menu'));
    document.addEventListener('click', (e) => {
      const stub = e.target.closest('[data-stub]');
      if (stub) {
        e.preventDefault();
        toast(`${stub.dataset.stub} isn’t part of this prototype.`);
        return;
      }
      if (e.target.closest('[data-open-shortcuts]')) $('#shortcuts').showModal();
      const env = e.target.closest('[data-env]');
      if (env) { setEnv(env.dataset.env); toast(env.dataset.env === 'live' ? 'Switched to Live' : 'Switched to Sandbox: test data only'); }
      if (e.target.closest('[data-ws="alder"]')) toast('Alder & Pine Home is another organisation; switching isn’t part of this prototype.');
    });
    navBtn.addEventListener('click', () => setNav(true));
    $('#nav-close').addEventListener('click', () => setNav(false));
    $('#nav-scrim').addEventListener('click', () => setNav(false));

    $('#notice-dismiss').addEventListener('click', () => { state.noticeDismissed = true; renderNotice(); $('#exceptions').focus(); });
    $('#notice-show').addEventListener('click', () => { state.provider = 'klarna'; syncFilters(); render(); });
    $$('input[name="chart-mode"]').forEach((r) => r.addEventListener('change', () => { state.chartMode = r.value; renderChart(); }));

    $('#export-btn').addEventListener('click', () => {
      const rows = visibleRows();
      const head = ['ID', 'Provider', 'Entity', 'Reason', 'Amount', 'Currency', 'EUR equivalent', 'Age (days)', 'Status', 'Assignee', 'Raised', 'Payout reference'];
      const lines = [head].concat(rows.map((x) => [x.id, D.PR[x.provider].name, D.EN[x.entity].name, D.RS[x.reason].label,
        x.amount.toFixed(2), x.currency, x.eur.toFixed(2), (ageMs(x) / D.DAY).toFixed(1), D.ST[x.status].label,
        x.assignee ? person(x.assignee).name : '', new Date(x.created).toISOString(), x.payoutRef]));
      const csv = lines.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `ledgerline-exceptions-${ymd(now())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`Exported ${rows.length} exceptions as CSV`);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.body.classList.contains('nav-open')) { setNav(false); return; }
        if (state.selected && !$('#shortcuts').open && !menus.some((m) => !m.menu.hidden)) { e.preventDefault(); closeDetail(); }
        return;
      }
      const t = e.target;
      const typing = /^(TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable ||
        (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset)$/.test(t.type));
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); $('#ex-search').focus(); }
      else if (e.key === '?') { e.preventDefault(); $('#shortcuts').showModal(); }
    });
  }

  /* ---------- render ---------- */
  function render() {
    state.limit = PAGE;
    const p = period();
    const changed = state.period !== DEFAULTS.period || state.provider !== 'all' || state.entity !== 'all';
    $('#f-reset').hidden = !changed;
    $('#period-note').innerHTML = `Comparing <b>${rangeText(p.from, p.to)}</b> with ${rangeText(p.prevFrom, p.prevTo)}`;
    renderKpis();
    renderTable();
    renderChart();
    renderNotice();
    if (state.selected) renderDetail(D.EX[state.selected]);
  }

  initFilters();
  syncFilters();
  chart = LL.TrendChart($('#trend-chart'), $('#chart-live'));
  initTable();
  initDetail();
  placePanel();
  initChrome();
  renderRunLine();
  render();
  renderFeed();
  renderPhone();
  renderNav();
})();
