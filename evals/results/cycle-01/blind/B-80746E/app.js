/* Ledgerline reconciliation overview: interaction layer (vanilla JS, no dependencies). */
(function () {
  'use strict';

  const D = window.LL_DATA;
  if (!D) return;
  const { NOW, H, PEOPLE, ME, REASONS, STATUSES, RESOLUTIONS, series: S } = D;
  const ENT = Object.fromEntries(D.ENTITIES.map((e) => [e.id, e]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = 'icon icon-xs') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  /* ---------- Formatting ---------- */
  const MINUS = '−';
  const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const SYMBOL = { EUR: '€', GBP: '£' };
  const money = (v, cur = 'EUR') => {
    const sign = v < 0 ? MINUS : '';
    const n = nf2.format(Math.abs(v));
    return SYMBOL[cur] ? `${sign}${SYMBOL[cur]}${n}` : `${sign}${cur} ${n}`;
  };
  const eurAxis = (v) => {
    const trim = (n) => nf1.format(n).replace(/\.0$/, '');
    return v >= 1e6 ? `€${trim(v / 1e6)}M` : v >= 1e3 ? `€${trim(v / 1e3)}k` : `€${nf0.format(v)}`;
  };
  const eurShort = (v) => {
    const a = Math.abs(v);
    const s = a >= 1e6 ? nf2.format(a / 1e6) + 'M' : a >= 1e3 ? nf1.format(a / 1e3) + 'k' : nf0.format(a);
    return (v < 0 ? MINUS : '') + '€' + s;
  };
  /* Dates: fixed three-letter months ("Sep", not ICU's "Sept"); every timestamp in the data window
     falls in CEST (UTC+2), and series days are UTC calendar days. */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CEST = 2 * H;
  const local = (t) => new Date(t + CEST);
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDay = (d, weekday) => `${weekday ? WD[d.getUTCDay()] + ' ' : ''}${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  const dShort = { format: (t) => fmtDay(local(t), false) };
  const dLong = { format: (t) => fmtDay(local(t), true) };
  const tFmt = { format: (t) => { const d = local(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; } };
  const keyFmt = { format: (t) => local(t).toISOString().slice(0, 10) };
  const uShort = { format: (t) => fmtDay(new Date(t), false) };
  const uLong = { format: (t) => fmtDay(new Date(t), true) };

  const t0 = Date.now();
  const nowTs = () => NOW + (Date.now() - t0); // session clock that starts at the data snapshot
  const whenLabel = (t) => {
    const k = keyFmt.format(t);
    if (k === keyFmt.format(NOW)) return tFmt.format(t);
    if (k === keyFmt.format(NOW - 864e5)) return 'Yesterday ' + tFmt.format(t);
    return dShort.format(t) + ', ' + tFmt.format(t);
  };
  const fmtAge = (h) => {
    if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
    if (h < 24) return Math.floor(h) + 'h';
    const d = Math.floor(h / 24);
    return d + 'd ' + Math.floor(h - d * 24) + 'h';
  };
  const ageWords = (h) => {
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' minutes';
    if (h < 24) return Math.floor(h) + ' hours';
    const d = Math.floor(h / 24);
    const hh = Math.floor(h - d * 24);
    return `${d} ${d === 1 ? 'day' : 'days'} ${hh} ${hh === 1 ? 'hour' : 'hours'}`;
  };

  /* ---------- Model ---------- */
  const isOpen = (x) => x.status !== 'resolved';
  const ageH = (x) => ((x.resolved || NOW) - x.created) / H;
  const isUrgent = (x) => isOpen(x) && (ageH(x) >= 72 || x.amountEUR >= 5000);
  const byId = (id) => D.exceptions.find((x) => x.id === id);
  const PAGE = 12;

  const DEFAULTS = { period: '1', from: '2026-09-25', to: '2026-10-01', provider: 'all', entity: 'all' };
  const state = {
    ...DEFAULTS,
    status: 'open',
    urgentOnly: false,
    sort: { key: 'age', dir: 'desc' },
    showAll: false,
    selected: null,
    keep: new Set(), // rows changed in this view stay visible until the view changes
    mAll: false,
    resolving: false,
    feedback: '',
  };
  const activity = D.activity.map((a) => ({ ...a }));

  const inScope = (x) => (state.provider === 'all' || x.provider === state.provider) && (state.entity === 'all' || x.entity === state.entity);
  const matchStatus = (x, s) => (s === 'all' ? true : s === 'open' ? isOpen(x) : x.status === s);
  const comboMask = () => S.combos.map((c) => (state.provider === 'all' || c.p === state.provider) && (state.entity === 'all' || c.e === state.entity));
  const dayIdx = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - S.DAY0) / 864e5);
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const periodDays = () => (state.period === 'custom' ? range(dayIdx(state.from), dayIdx(state.to)) : range(60 - Number(state.period), 59));

  function aggregate(days, mask) {
    let m = 0, u = 0, tx = 0;
    const ttr = [];
    mask.forEach((on, k) => {
      if (!on) return;
      days.forEach((i) => {
        if (i < 0) return;
        m += S.matched[k][i];
        u += S.unmatched[k][i];
        tx += S.unmatchedTx[k][i];
        ttr.push(...S.ttr[k][i]);
      });
    });
    return { m, u, tx, rate: m + u > 0 ? m / (m + u) : null, ttr: D.util.median(ttr) };
  }
  const backlogAt = (i, mask) => mask.reduce((sum, on, k) => sum + (on && i >= 0 ? S.backlogEnd[k][i] : 0), 0);

  function rowsFor({ status = state.status, urgentOnly = state.urgentOnly } = {}) {
    return D.exceptions.filter((x) => inScope(x)
      && (matchStatus(x, status) || state.keep.has(x.id))
      && (!urgentOnly || isUrgent(x) || state.keep.has(x.id)));
  }
  function sortRows(rows) {
    const { key, dir } = state.sort;
    const f = dir === 'asc' ? 1 : -1;
    const val = (x) => (key === 'amount' ? x.amountEUR : ageH(x));
    return rows.sort((a, b) => (val(a) - val(b)) * f || a.id.localeCompare(b.id));
  }

  /* ---------- Live announcements ---------- */
  let liveTimer;
  function announce(msg) {
    const live = $('#live');
    live.textContent = '';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = msg; }, 60);
  }

  /* ---------- KPIs ---------- */
  function deltaHTML(diff, text, upIsGood, vs, srText) {
    const d = Math.abs(diff) < 1e-9 ? 0 : diff;
    const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const good = d === 0 ? null : (d > 0) === upIsGood;
    const word = good === null ? 'no change' : good ? 'better' : 'worse';
    return {
      cls: 'delta' + (good === null ? '' : good ? ' is-better' : ' is-worse'),
      html: `<span class="sr-only">${dir === 'up' ? 'Up' : dir === 'down' ? 'Down' : 'Unchanged'}${srText ? ' ' + srText : ''}, ${word}, compared with ${vs}</span>`
        + `<span aria-hidden="true">${icon(dir)}<span class="d-val">${text}</span> <span class="d-word">${word}</span> <span class="d-vs">vs\u00a0${vs.replace(/ /g, '\u00a0')}</span></span>`,
    };
  }

  function periodLabels(days) {
    const n = days.length;
    const prevLast = days[0] - 1;
    const vsFlow = n === 1 ? uShort.format(S.days[prevLast]) : `prior ${n} days`;
    const vsStock = uShort.format(S.days[prevLast]);
    let label;
    if (state.period === '1') label = 'Yesterday';
    else if (state.period === 'custom') label = n === 1 ? uShort.format(S.days[days[0]]) : `${uShort.format(S.days[days[0]])} – ${uShort.format(S.days[days[n - 1]])}`;
    else label = `Last ${n} days`;
    return { vsFlow, vsStock, prevLast, label };
  }

  function renderKPIs() {
    const mask = comboMask();
    const days = periodDays();
    const prev = days.map((i) => i - days.length);
    const cur = aggregate(days, mask);
    const old = aggregate(prev, mask);
    const L = periodLabels(days);
    const set = (key, value, delta, context) => {
      const el = $(`.kpi[data-kpi="${key}"]`);
      $('[data-v]', el).textContent = value;
      const d = $('[data-d]', el);
      d.className = delta.cls;
      d.innerHTML = delta.html;
      if (context != null) $('[data-c]', el).textContent = context;
    };

    // Matched rate
    if (cur.rate == null) {
      set('rate', '–', { cls: 'delta', html: 'No volume in this scope' }, '');
    } else {
      const pp = Math.round((cur.rate - old.rate) * 1000) / 10;
      set('rate', nf1.format(cur.rate * 100) + '%',
        deltaHTML(pp, nf1.format(Math.abs(pp)) + '\u00a0pp', true, L.vsFlow, nf1.format(Math.abs(pp)) + ' percentage points'),
        'Target 98.0%');
    }
    // Unmatched amount
    const du = cur.u - old.u;
    const pct = old.u ? Math.abs(du / old.u) * 100 : 0;
    set('unmatched', money(cur.u),
      deltaHTML(Math.round(du * 100) / 100, `${money(Math.abs(du))}<span class="d-pct"> (${nf1.format(pct)}%)</span>`, false, L.vsFlow, `${money(Math.abs(du))}, ${nf1.format(pct)} percent`),
      `${nf0.format(cur.tx)} transactions`);
    // Open exceptions (live count) vs backlog at the close of the previous period
    const openRows = D.exceptions.filter((x) => inScope(x) && isOpen(x));
    const openNow = openRows.length;
    const dOpen = openNow - backlogAt(L.prevLast, mask);
    set('open', nf0.format(openNow), deltaHTML(dOpen, nf0.format(Math.abs(dOpen)), false, L.vsStock, nf0.format(Math.abs(dOpen))), null);
    $('#kpi-urgent-n').textContent = openRows.filter(isUrgent).length;
    // Median time to resolve
    if (cur.ttr == null) {
      set('ttr', '–', { cls: 'delta', html: 'Nothing resolved in this period' }, 'Target 2.0 days');
    } else {
      const dd = cur.ttr / 24;
      const dt = old.ttr == null ? 0 : Math.round((dd - old.ttr / 24) * 10) / 10;
      set('ttr', nf1.format(dd) + (Math.round(dd * 10) === 10 ? ' day' : ' days'),
        deltaHTML(dt, nf1.format(Math.abs(dt)) + '\u00a0d', false, L.vsFlow, nf1.format(Math.abs(dt)) + ' days'),
        'Target 2.0 days');
    }
    $('#nav-count').textContent = D.exceptions.filter(isOpen).length;
  }

  /* ---------- Exception queue ---------- */
  const STATUS_SHORT = { new: 'New', investigating: 'Investigating', waiting: 'Waiting', resolved: 'Resolved' };
  function statusHTML(s) {
    const long = STATUSES[s];
    const short = STATUS_SHORT[s];
    const label = long === short ? esc(long) : `<span class="status-long">${esc(long)}</span><span class="status-short" aria-hidden="true">${esc(short)}</span>`;
    return `<span class="status st-${s}">${icon('st-' + s)}<span>${label}</span></span>`;
  }
  function whoHTML(key) {
    if (!key) return '<span class="who who-none"><span class="avatar avatar-none" aria-hidden="true"></span>Unassigned</span>';
    const p = PEOPLE[key];
    const [first, ...rest] = p.name.split(' ');
    return `<span class="who"><span class="avatar" aria-hidden="true">${p.initials}</span><span>${esc(first)}<span class="who-last"> ${esc(rest.join(' '))}</span></span></span>`;
  }
  function rowHTML(x) {
    const urgent = isUrgent(x);
    const sel = state.selected === x.id;
    const h = ageH(x);
    const cls = [urgent ? 'is-urgent' : '', sel ? 'is-selected' : '', isOpen(x) ? '' : 'is-resolved'].join(' ').trim();
    return `<tr data-id="${x.id}"${cls ? ` class="${cls}"` : ''}>`
      + `<th scope="row"><button type="button" class="row-btn" aria-controls="detail" aria-expanded="${sel}">`
      + `<span class="urgent-mark">${urgent ? icon('flag') : ''}</span>${urgent ? '<span class="sr-only">Urgent: </span>' : ''}<span class="row-id">${x.id}</span></button></th>`
      + `<td>${x.provider}</td>`
      + `<td class="num"><span class="amount">${nf2.format(x.amount)}</span><span class="cur-inline">${x.currency}</span></td>`
      + `<td class="c-cur"><span class="cur">${x.currency}</span>${x.currency === 'EUR' ? '' : `<span class="eq"><span aria-hidden="true">≈ </span><span class="sr-only">, about </span>${money(x.amountEUR)}</span>`}</td>`
      + `<td class="num"><span class="${urgent && h >= 72 ? 'age-over' : ''}" aria-hidden="true">${fmtAge(h)}</span><span class="sr-only">${ageWords(h)}${isOpen(x) ? '' : ' to resolve'}</span></td>`
      + `<td>${REASONS[x.reason]}</td>`
      + `<td>${statusHTML(x.status)}</td>`
      + `<td>${whoHTML(x.assignee)}</td></tr>`;
  }

  function renderQueue() {
    const all = sortRows(rowsFor());
    const n = all.length;
    if (state.selected && !state.showAll) {
      const pos = all.findIndex((x) => x.id === state.selected);
      if (pos >= PAGE) state.showAll = true;
    }
    const shown = state.showAll ? all : all.slice(0, PAGE);
    const body = $('#xbody');
    body.innerHTML = shown.length
      ? shown.map(rowHTML).join('')
      : `<tr><td class="empty" colspan="8">No exceptions match these filters. <button type="button" class="link-btn" id="clear-queue">Show all open exceptions</button></td></tr>`;

    const sumEUR = all.reduce((a, x) => a + x.amountEUR, 0);
    $('#xfoot').innerHTML = n
      ? `<tr><th scope="row" colspan="2">Total, ${n} ${n === 1 ? 'exception' : 'exceptions'}</th>`
        + `<td class="num"><span class="total-amt">${nf2.format(sumEUR)}</span><span class="cur-inline">EUR</span></td>`
        + `<td class="c-cur"><span class="cur">EUR</span></td>`
        + `<td class="tf-note" colspan="4">EUR equivalent${n > shown.length ? `, includes the ${n - shown.length} rows not shown` : ''}</td></tr>`
      : '';

    // Counts on the status filter reflect every other active filter.
    const counts = { open: 0, new: 0, investigating: 0, waiting: 0, resolved: 0, all: 0 };
    D.exceptions.forEach((x) => {
      if (!inScope(x) || (state.urgentOnly && !isUrgent(x))) return;
      counts.all++;
      counts[x.status]++;
      if (isOpen(x)) counts.open++;
    });
    $$('.seg-n[data-n]').forEach((el) => { el.textContent = counts[el.dataset.n]; });
    const openScoped = D.exceptions.filter((x) => inScope(x) && isOpen(x));
    const urgentN = openScoped.filter(isUrgent).length;
    $('#urgent-n').textContent = urgentN;
    const outstanding = openScoped.reduce((a, x) => a + x.amountEUR, 0);
    $('#queue-summary').innerHTML = `<strong>${openScoped.length}</strong> open · <strong>${money(outstanding)}</strong> outstanding · <strong>${urgentN}</strong> urgent`;

    $('#queue-count').textContent = n ? `Showing ${shown.length} of ${n}` : 'No matching exceptions';
    const more = $('#show-all');
    more.hidden = n <= PAGE;
    more.textContent = state.showAll ? `Show first ${PAGE}` : `Show all ${n}`;
    $('#xcaption').textContent = `Exception queue, ${describeView()}, sorted by ${state.sort.key} ${sortWords()}. ${shown.length} of ${n} shown.`;

    $$('#xtable th[data-sort]').forEach((th) => {
      const on = state.sort.key === th.dataset.sort;
      th.setAttribute('aria-sort', on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      $('use', th).setAttribute('href', on ? (state.sort.dir === 'asc' ? '#i-sort-asc' : '#i-sort-desc') : '#i-sort');
    });
  }
  const sortWords = () => (state.sort.key === 'age'
    ? (state.sort.dir === 'desc' ? 'oldest first' : 'newest first')
    : (state.sort.dir === 'desc' ? 'largest first' : 'smallest first'));
  function describeView() {
    const s = { open: 'open', new: 'new', investigating: 'investigating', waiting: 'waiting on provider', resolved: 'resolved', all: 'all statuses' }[state.status];
    return (state.urgentOnly ? 'urgent, ' : '') + s;
  }

  function renderMobile() {
    const open = D.exceptions.filter((x) => inScope(x) && isOpen(x));
    const urgent = sortRows(open.filter(isUrgent));
    const list = state.mAll ? sortRows(open.slice()) : urgent;
    $('#m-list').innerHTML = list.length
      ? list.map((x) => {
        const u = isUrgent(x);
        return `<li class="m-item"><button type="button" class="m-btn" data-id="${x.id}" aria-controls="detail">`
          + `<span class="m-id">${u ? icon('flag', 'icon icon-xs flag') + '<span class="sr-only">Urgent: </span>' : ''}${x.id}</span>`
          + `<span class="m-amt">${nf2.format(x.amount)} <span class="cur">${x.currency}</span></span>`
          + `<span class="m-sub">${x.provider} · ${REASONS[x.reason]} · open ${fmtAge(ageH(x))}</span>`
          + `<span class="m-state">${statusHTML(x.status)}${whoHTML(x.assignee)}</span></button></li>`;
      }).join('')
      : '<li class="m-empty">No urgent exceptions for these filters.</li>';
    const more = $('#m-more');
    more.textContent = state.mAll ? `Show urgent only (${urgent.length})` : `Show all open (${open.length})`;
  }

  /* ---------- Detail panel ---------- */
  const dlg = $('#detail');
  const mqWide = matchMedia('(min-width: 1280px)');
  let returnTo = null;

  function ledger(x) {
    const a = x.amount;
    const f = (x.seed % 997) / 997;
    const settle = dShort.format(x.created - 864e5);
    switch (x.reason) {
      case 'missing':
        return { rows: [[`Expected ${x.provider} payout`, `Settlement of ${settle} sales`, a], ['Received in bank', 'No matching deposit yet', 0]], total: 'Not received' };
      case 'mismatch': {
        const exp = Math.round((a * (5 + Math.floor(f * 28)) + (x.seed % 9000) / 100) * 100) / 100;
        return { rows: [['Expected payout', `${x.provider} settlement report`, exp], ['Received in bank', 'Deposit matched by reference', -(exp - a)]], total: 'Difference' };
      }
      case 'duplicate':
        return { rows: [['Booked in bank', 'Two deposits with one payout reference', 2 * a], [`${x.provider} payout`, 'Paid once according to provider', -a]], total: 'Booked twice' };
      default: {
        const exp = Math.round((a * (40 + Math.floor(f * 160))) * 100) / 100;
        return { rows: [['Expected at reference rate', 'ECB rate of the settlement day', exp], [`Received at ${x.provider} rate`, 'Provider conversion', -(exp - a)]], total: 'FX difference' };
      }
    }
  }
  function payoutRef(x) {
    const s = x.seed.toString(36).toUpperCase().padStart(7, '0');
    switch (x.provider) {
      case 'Stripe': return 'po_1Q' + s + (x.seed % 977).toString(36);
      case 'Adyen': return `Batch ${1200 + (x.seed % 700)} · KestrelLane${x.entity.toUpperCase()}`;
      case 'PayPal': return 'SR-' + String(x.seed).padStart(10, '0').slice(0, 10);
      default: return 'KS-' + String(x.seed % 9000000 + 1000000);
    }
  }

  function renderDetail() {
    const x = byId(state.selected);
    if (!x) return;
    const ent = ENT[x.entity];
    const urgent = isUrgent(x);
    const h = ageH(x);
    const L = ledger(x);
    const list = sortRows(rowsFor());
    const pos = list.findIndex((r) => r.id === x.id);
    $('#d-prev').disabled = pos <= 0;
    $('#d-next').disabled = pos === -1 ? list.length === 0 : pos >= list.length - 1;
    $('#detail-kicker').textContent = `${x.provider} · ${ent.name}`;
    $('#detail-title').innerHTML = `<span class="mono">${x.id}</span> ${REASONS[x.reason]}`;

    const ledgerRows = L.rows.map(([label, sub, v]) => `<tr><th scope="row">${esc(label)}<span class="l-sub">${esc(sub)}</span></th><td>${v === 0 ? '0.00' : (v < 0 ? MINUS : '') + nf2.format(Math.abs(v))}</td></tr>`).join('');
    const assigneeOptions = ['', ...Object.keys(PEOPLE)].map((k) => `<option value="${k}"${(x.assignee || '') === k ? ' selected' : ''}>${k ? esc(PEOPLE[k].name) + (k === ME ? ' (you)' : '') : 'Unassigned'}</option>`).join('');
    const moves = ['new', 'investigating', 'waiting'].filter((s) => s !== x.status)
      .map((s) => `<button type="button" class="btn btn-secondary btn-sm" data-move="${s}">${icon('st-' + s)}${esc(STATUSES[s])}</button>`).join('');

    let actions;
    if (isOpen(x)) {
      actions = `<section class="d-actions detail-actions" aria-labelledby="d-triage">
        <h3 id="d-triage">Triage</h3>
        <div class="d-row">
          <label for="d-assignee">Assignee</label>
          <div class="inline"><select id="d-assignee">${assigneeOptions}</select><button type="button" class="btn btn-secondary" id="d-assign">Assign</button></div>
          ${x.assignee === ME ? '' : '<div><button type="button" class="link-btn" id="d-assign-me">Assign to me</button></div>'}
        </div>
        <div class="d-row"><span class="d-label" id="d-move-label">Change status</span><div class="inline" role="group" aria-labelledby="d-move-label">${moves}</div></div>
        <div class="d-row">
          ${state.resolving
            ? `<form class="resolve-form" id="d-resolve-form" novalidate>
                <label for="d-resolution">Resolution</label>
                <select id="d-resolution" required aria-describedby="d-resolution-err"><option value="">Choose a resolution</option>${RESOLUTIONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
                <p class="err" id="d-resolution-err" hidden>Choose how this exception was resolved.</p>
                <label for="d-note">Note (optional)</label>
                <textarea id="d-note" rows="2"></textarea>
                <div class="inline"><button type="submit" class="btn btn-primary">Resolve ${x.id}</button><button type="button" class="btn btn-quiet" id="d-resolve-cancel">Cancel</button></div>
              </form>`
            : `<div class="inline"><button type="button" class="btn btn-primary" id="d-resolve-start">${icon('check')}Resolve…</button></div>`}
        </div>
        <p class="d-feedback" id="d-feedback">${esc(state.feedback)}</p>
      </section>
      <p class="detail-readonly">Read-only on phones. Assign or resolve ${x.id} on a tablet or desktop.</p>`;
    } else {
      actions = `<section class="d-actions detail-actions" aria-labelledby="d-triage">
        <h3 id="d-triage">Resolution</h3>
        <p>${esc(x.resolution || 'Resolved')}${x.resolved ? ` · ${esc(whenLabel(x.resolved))}` : ''}</p>
        <div class="inline"><button type="button" class="btn btn-secondary" data-move="investigating">Reopen</button></div>
        <p class="d-feedback" id="d-feedback">${esc(state.feedback)}</p>
      </section>`;
    }

    const facts = [
      ['Status', statusHTML(x.status)],
      ['Assignee', whoHTML(x.assignee)],
      ['Raised', `${esc(dLong.format(x.created))}, ${esc(tFmt.format(x.created))}`],
      [isOpen(x) ? 'Open for' : 'Resolved in', esc(ageWords(h))],
      ['Account', `${esc(ent.name)}<br><span class="mono">${esc(ent.account)}</span>`],
      ['Payout reference', `<span class="mono">${esc(payoutRef(x))}</span>`],
    ];
    if (x.currency !== 'EUR') facts.push(['EUR equivalent', money(x.amountEUR)]);

    $('#detail-body').innerHTML = `
      <div class="d-status">${statusHTML(x.status)}${urgent ? `<span class="tag-urgent">${icon('flag')}Urgent</span>` : ''}<span class="d-age">${isOpen(x) ? 'Open' : 'Took'} ${esc(fmtAge(h))}</span></div>
      <section class="d-section" aria-labelledby="d-rec">
        <h3 id="d-rec">${isOpen(x) ? 'Reconciliation' : 'Reconciliation when raised'} <span class="l-cur">${x.currency}</span></h3>
        <table class="ledger">
          <caption class="sr-only">Amounts in ${x.currency}</caption>
          <tbody>${ledgerRows}</tbody>
          <tfoot><tr><th scope="row">${esc(L.total)}</th><td><span>${nf2.format(x.amount)}</span></td></tr></tfoot>
        </table>
      </section>
      ${actions}
      <section class="d-section" aria-labelledby="d-facts">
        <h3 id="d-facts">Details</h3>
        <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      </section>
      <section class="d-section" aria-labelledby="d-hist">
        <h3 id="d-hist">History</h3>
        <ol class="history">${x.history.slice().reverse().map((ev) => `<li><time datetime="${new Date(ev.at).toISOString()}">${esc(whenLabel(ev.at))}</time><span>${ev.who ? `<strong>${ev.who === ME ? 'You' : esc(PEOPLE[ev.who].name)}</strong> ` : ''}${esc(ev.text)}${ev.note ? `<span class="h-note">${esc(ev.note)}</span>` : ''}</span></li>`).join('')}</ol>
      </section>`;
  }

  function syncSelection() {
    $$('#xbody tr[data-id]').forEach((tr) => {
      const on = tr.dataset.id === state.selected;
      tr.classList.toggle('is-selected', on);
      $('.row-btn', tr).setAttribute('aria-expanded', String(on));
    });
  }

  function placeDialog() {
    const wantModal = !mqWide.matches;
    if (dlg.open && dlg.matches(':modal') !== wantModal) dlg.close('switch');
    // Swap the rail content before showing, so the panel opens where it will stay (no scroll jump).
    $('#rail').classList.toggle('has-detail', !wantModal);
    if (!dlg.open) {
      if (wantModal) dlg.showModal();
      else dlg.show();
    }
  }

  function openDetail(id, from) {
    if (!byId(id)) return;
    if (state.selected !== id) { state.resolving = false; state.feedback = ''; }
    state.selected = id;
    if (from) returnTo = from;
    renderQueue();
    renderDetail();
    placeDialog();
    $('#detail-title').focus({ preventScroll: true });
    if (!dlg.matches(':modal')) {
      const r = dlg.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight - 120) dlg.scrollIntoView({ block: 'nearest' });
    }
  }

  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'switch') { dlg.returnValue = ''; return; }
    const id = state.selected;
    state.selected = null;
    state.resolving = false;
    state.feedback = '';
    $('#rail').classList.remove('has-detail');
    syncSelection();
    const target = (returnTo && document.querySelector(returnTo.replace('{id}', id))) || $(`#xbody tr[data-id="${id}"] .row-btn`);
    if (target && target.offsetParent !== null) target.focus();
    else $('#queue-title').focus();
    returnTo = null;
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dlg.matches(':modal')) {
      e.preventDefault();
      e.stopPropagation();
      dlg.close();
    }
  });
  mqWide.addEventListener('change', () => { if (dlg.open) placeDialog(); });

  function step(dir) {
    const list = sortRows(rowsFor());
    const pos = list.findIndex((r) => r.id === state.selected);
    const next = pos === -1 ? list[0] : list[pos + dir];
    if (!next) return;
    returnTo = '#xbody tr[data-id="{id}"] .row-btn';
    openDetail(next.id);
    const pressed = dir > 0 ? $('#d-next') : $('#d-prev');
    if (!pressed.disabled) pressed.focus();
    announce(`${next.id}, ${REASONS[next.reason]}, ${STATUSES[next.status]}`);
  }
  $('#d-prev').addEventListener('click', () => step(-1));
  $('#d-next').addEventListener('click', () => step(1));
  $('#d-close').addEventListener('click', () => dlg.close());

  function logActivity(entry) {
    activity.unshift({ at: nowTs(), who: ME, ...entry });
    renderActivity();
  }
  function afterChange(x, message) {
    state.keep.add(x.id);
    state.feedback = message;
    renderKPIs();
    renderQueue();
    renderMobile();
    renderDetail();
    announce(message);
  }

  $('#detail-body').addEventListener('click', (e) => {
    const x = byId(state.selected);
    if (!x) return;
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'd-assign' || t.id === 'd-assign-me') {
      const key = t.id === 'd-assign-me' ? ME : $('#d-assignee').value || null;
      if ((x.assignee || null) === key) { state.feedback = 'Assignee unchanged.'; renderDetail(); $('#d-assign') && $('#d-assign').focus(); return; }
      x.assignee = key;
      x.history.push({ at: nowTs(), who: ME, text: key ? `assigned it to ${PEOPLE[key].name}` : 'unassigned it' });
      logActivity({ kind: 'assign', text: key ? 'assigned' : 'unassigned', ref: x.id, tail: key ? `to ${key === ME ? 'yourself' : PEOPLE[key].name}` : '' });
      afterChange(x, key ? `${x.id} assigned to ${PEOPLE[key].name}.` : `${x.id} is now unassigned.`);
      $('#d-assign').focus();
    } else if (t.dataset.move) {
      const s = t.dataset.move;
      const wasResolved = x.status === 'resolved';
      x.status = s;
      if (wasResolved) { x.resolved = null; x.resolution = null; }
      x.history.push({ at: nowTs(), who: ME, text: wasResolved ? 'reopened it' : `set the status to ${STATUSES[s]}` });
      logActivity({ kind: 'status', text: wasResolved ? 'reopened' : 'set', ref: x.id, tail: wasResolved ? '' : `to ${STATUSES[s]}` });
      afterChange(x, wasResolved ? `${x.id} reopened.` : `${x.id} moved to ${STATUSES[s]}.`);
      $('#detail-title').focus();
    } else if (t.id === 'd-resolve-start') {
      state.resolving = true;
      state.feedback = '';
      renderDetail();
      $('#d-resolution').focus();
    } else if (t.id === 'd-resolve-cancel') {
      state.resolving = false;
      renderDetail();
      $('#d-resolve-start').focus();
    }
  });
  $('#detail-body').addEventListener('submit', (e) => {
    e.preventDefault();
    const x = byId(state.selected);
    const sel = $('#d-resolution');
    if (!sel.value) {
      sel.setAttribute('aria-invalid', 'true');
      $('#d-resolution-err').hidden = false;
      sel.focus();
      return;
    }
    const note = $('#d-note').value.trim();
    x.status = 'resolved';
    x.resolved = nowTs();
    x.resolution = sel.value;
    x.history.push({ at: x.resolved, who: ME, text: `resolved it: ${sel.value}`, note });
    state.resolving = false;
    logActivity({ kind: 'resolve', text: 'resolved', ref: x.id, note: sel.value });
    const open = D.exceptions.filter(isOpen).length;
    afterChange(x, `${x.id} resolved: ${sel.value}. ${open} exceptions remain open.`);
    $('#detail-title').focus();
  });

  /* ---------- Activity ---------- */
  function renderActivity() {
    $('#act-list').innerHTML = activity.slice(0, 8).map((a) => {
      const p = a.who ? PEOPLE[a.who] : null;
      const mark = p
        ? `<span class="avatar${a.who === ME ? ' avatar-me' : ''}" aria-hidden="true">${p.initials}</span>`
        : `<span class="act-sys" aria-hidden="true">${icon(a.kind === 'run' ? 'run' : a.kind === 'feed' ? 'feed' : 'rule')}</span>`;
      const name = p ? `<strong>${a.who === ME ? 'You' : esc(p.name)}</strong> ` : '';
      const ref = a.ref ? ` <button type="button" class="ref-btn" data-ref="${a.ref}" aria-controls="detail">${a.ref}</button>` : '';
      const tail = a.tail ? ' ' + esc(a.tail) : '';
      const note = a.note ? `${esc(a.note)} · ` : '';
      return `<li class="act">${mark}<div><p class="act-text">${name}${esc(a.text)}${ref}${tail}</p>`
        + `<p class="act-meta">${note}<time datetime="${new Date(a.at).toISOString()}">${esc(whenLabel(a.at))}</time></p></div></li>`;
    }).join('');
  }
  $('#act-list').addEventListener('click', (e) => {
    const b = e.target.closest('.ref-btn');
    if (b) openDetail(b.dataset.ref, '#act-list .ref-btn[data-ref="{id}"]');
  });

  /* ---------- Trend chart (SVG drawn from the data) ---------- */
  const chartHost = $('#chart');
  let chartData = [];
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
    return m * p;
  }
  function renderChart() {
    const mask = comboMask();
    const sel = new Set(periodDays());
    chartData = range(30, 59).map((i) => {
      let m = 0, u = 0;
      mask.forEach((on, k) => { if (on) { m += S.matched[k][i]; u += S.unmatched[k][i]; } });
      return { i, m, u, t: S.days[i], hi: sel.has(i) };
    });
    const W = Math.max(240, chartHost.clientWidth);
    const Hh = chartHost.clientHeight || 204;
    const n = chartData.length;
    const stepX = W / n;
    const bw = Math.max(2, Math.min(14, stepX * 0.64));
    const A = { top: 24, bottom: 96 };
    const B = { top: 128, bottom: 176 };
    const maxM = niceMax(Math.max(...chartData.map((d) => d.m)) || 1);
    const maxU = niceMax(Math.max(...chartData.map((d) => d.u)) || 1);
    const yA = (v) => A.bottom - (v / maxM) * (A.bottom - A.top);
    const yB = (v) => B.bottom - (v / maxU) * (B.bottom - B.top);
    const hiDays = chartData.filter((d) => d.hi);
    const sumM = hiDays.reduce((a, d) => a + d.m, 0);
    const sumU = hiDays.reduce((a, d) => a + d.u, 0);
    const L = periodLabels(periodDays());
    const tag = hiDays.length === 1 ? uShort.format(hiDays[0].t) : L.label.toLowerCase();

    let band = '';
    if (hiDays.length) {
      const first = chartData.indexOf(hiDays[0]);
      const last = chartData.indexOf(hiDays[hiDays.length - 1]);
      band = `<rect class="band" x="${(first * stepX).toFixed(1)}" y="${A.top - 4}" width="${((last - first + 1) * stepX).toFixed(1)}" height="${B.bottom - A.top + 8}" rx="2"/>`;
    }
    const bars = chartData.map((d, j) => {
      const x = (j * stepX + (stepX - bw) / 2).toFixed(1);
      const hm = Math.max(1, A.bottom - yA(d.m));
      const hu = Math.max(1, B.bottom - yB(d.u));
      return `<rect class="b-m${d.hi ? ' hi' : ''}" x="${x}" y="${(A.bottom - hm).toFixed(1)}" width="${bw.toFixed(1)}" height="${hm.toFixed(1)}" rx="1"/>`
        + `<rect class="b-u${d.hi ? ' hi' : ''}" x="${x}" y="${(B.bottom - hu).toFixed(1)}" width="${bw.toFixed(1)}" height="${hu.toFixed(1)}" rx="1"/>`;
    }).join('');
    const ticks = [0, 7, 14, 21, 29].map((j) => {
      const anchor = j === 0 ? 'start' : j === n - 1 ? 'end' : 'middle';
      const x = j === 0 ? 0 : j === n - 1 ? W : j * stepX + stepX / 2;
      return `<text class="t-axis" x="${x.toFixed(1)}" y="${Hh - 6}" text-anchor="${anchor}">${uShort.format(chartData[j].t)}</text>`;
    }).join('');

    chartHost.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" aria-hidden="true" focusable="false">
      ${band}
      <text class="t-label" x="0" y="13">Matched <tspan class="t-value">${eurShort(sumM)} · ${esc(tag)}</tspan></text>
      <text class="t-axis" x="${W}" y="13" text-anchor="end">${eurAxis(maxM)}</text>
      <line class="grid grid-top" x1="0" x2="${W}" y1="${A.top}" y2="${A.top}"/>
      <line class="grid" x1="0" x2="${W}" y1="${A.bottom + 0.5}" y2="${A.bottom + 0.5}"/>
      <text class="t-label" x="0" y="${B.top - 11}">Unmatched <tspan class="t-value">${eurShort(sumU)} · ${esc(tag)}</tspan></text>
      <text class="t-axis" x="${W}" y="${B.top - 11}" text-anchor="end">${eurAxis(maxU)}</text>
      <line class="grid grid-top" x1="0" x2="${W}" y1="${B.top}" y2="${B.top}"/>
      <line class="grid" x1="0" x2="${W}" y1="${B.bottom + 0.5}" y2="${B.bottom + 0.5}"/>
      ${bars}
      <rect class="hover-col" id="hover-col" x="0" y="${A.top - 4}" width="${stepX.toFixed(1)}" height="${B.bottom - A.top + 8}" visibility="hidden"/>
      ${ticks}
    </svg><div class="chart-tip" id="chart-tip" hidden></div>`;

    const peak = chartData.reduce((a, d) => (d.u > a.u ? d : a), chartData[0]);
    const last = chartData[n - 1];
    const mins = Math.min(...chartData.map((d) => d.m));
    const maxs = Math.max(...chartData.map((d) => d.m));
    $('#chart-summary').textContent = `Bar charts of matched and unmatched value per day from ${uShort.format(chartData[0].t)} to ${uShort.format(last.t)}. `
      + `Matched value ranged from ${eurShort(mins)} to ${eurShort(maxs)} a day. Unmatched value peaked at ${eurShort(peak.u)} on ${uShort.format(peak.t)}; `
      + `on ${uShort.format(last.t)} it was ${eurShort(last.u)}, ${nf1.format((100 * last.m) / (last.m + last.u))}% matched. `
      + `Highlighted period (${L.label}): ${eurShort(sumM)} matched, ${eurShort(sumU)} unmatched. The table below lists every day.`;

    $('#chart-table tbody').innerHTML = chartData.slice().reverse().map((d) => `<tr${d.hi ? ' class="is-hi"' : ''}><th scope="row">${uLong.format(d.t)}</th><td class="num">${money(d.m)}</td><td class="num">${money(d.u)}</td><td class="num">${nf1.format((100 * d.m) / (d.m + d.u))}%</td></tr>`).join('');
  }
  chartHost.addEventListener('pointermove', (e) => {
    if (!chartData.length) return;
    const r = chartHost.getBoundingClientRect();
    const stepX = r.width / chartData.length;
    const j = Math.min(chartData.length - 1, Math.max(0, Math.floor((e.clientX - r.left) / stepX)));
    const d = chartData[j];
    const col = $('#hover-col');
    const tip = $('#chart-tip');
    if (!col || !tip) return;
    col.setAttribute('x', (j * stepX).toFixed(1));
    col.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${uLong.format(d.t)}</b><span class="tip-row"><span>Matched</span><span>${eurShort(d.m)}</span></span><span class="tip-row"><span>Unmatched</span><span>${eurShort(d.u)}</span></span><span class="tip-row"><span>Rate</span><span>${nf1.format((100 * d.m) / (d.m + d.u))}%</span></span>`;
    const tw = tip.offsetWidth;
    let x = j * stepX + stepX / 2 - tw / 2;
    x = Math.max(0, Math.min(r.width - tw, x));
    tip.style.left = x + 'px';
    tip.style.top = '-6px';
    tip.style.transform = 'translateY(-100%)';
  });
  chartHost.addEventListener('pointerleave', () => {
    const col = $('#hover-col');
    if (col) col.setAttribute('visibility', 'hidden');
    const tip = $('#chart-tip');
    if (tip) tip.hidden = true;
  });
  let chartRaf = 0;
  let lastW = 0;
  new ResizeObserver(() => {
    const w = chartHost.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(chartRaf);
    chartRaf = requestAnimationFrame(renderChart);
  }).observe(chartHost);

  /* ---------- Filters ---------- */
  const fPeriod = $('#f-period');
  const fFrom = $('#f-from');
  const fTo = $('#f-to');
  const fProvider = $('#f-provider');
  const fEntity = $('#f-entity');

  function renderFilterUI() {
    const custom = state.period === 'custom';
    $('#field-from').hidden = !custom;
    $('#field-to').hidden = !custom;
    const changed = ['period', 'provider', 'entity'].some((k) => state[k] !== DEFAULTS[k]);
    $('#f-reset').hidden = !changed;
    const L = periodLabels(periodDays());
    const prov = state.provider === 'all' ? 'All providers' : state.provider;
    const ent = state.entity === 'all' ? 'All entities' : ENT[state.entity].name.replace('Kestrel & Lane ', 'K&L ');
    $('#filters-summary').textContent = `${L.label} · ${prov} · ${ent}`;
    $('#trend-sub').textContent = `Daily, last 30 days · EUR equivalent${state.provider !== 'all' || state.entity !== 'all' ? ' · filtered' : ''}`;
  }
  function renderAll() {
    renderKPIs();
    renderQueue();
    renderMobile();
    renderChart();
    renderActivity();
    renderFilterUI();
    if (state.selected) renderDetail();
  }
  function scopeChanged(msg) {
    state.keep.clear();
    renderAll();
    const open = D.exceptions.filter((x) => inScope(x) && isOpen(x)).length;
    announce(msg || `Overview updated: ${open} open exceptions in scope.`);
  }

  fPeriod.addEventListener('change', () => {
    state.period = fPeriod.value;
    if (state.period === 'custom') { state.from = fFrom.value; state.to = fTo.value; }
    scopeChanged(`Date range: ${periodLabels(periodDays()).label}.`);
  });
  [fFrom, fTo].forEach((inp) => inp.addEventListener('change', () => {
    const err = $('#range-error');
    const a = fFrom.value, b = fTo.value;
    const valid = a && b && a <= b && a >= fFrom.min && b <= fTo.max;
    err.hidden = !!valid;
    fFrom.toggleAttribute('aria-invalid', !valid);
    fTo.toggleAttribute('aria-invalid', !valid);
    if (!valid) { err.textContent = 'Choose a start date on or before the end date, between 2 Sep and 1 Oct.'; return; }
    state.from = a; state.to = b;
    scopeChanged(`Date range: ${periodLabels(periodDays()).label}.`);
  }));
  fProvider.addEventListener('change', () => { state.provider = fProvider.value; scopeChanged(); });
  fEntity.addEventListener('change', () => { state.entity = fEntity.value; scopeChanged(); });
  $('#f-reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    fPeriod.value = DEFAULTS.period; fProvider.value = DEFAULTS.provider; fEntity.value = DEFAULTS.entity;
    fFrom.value = DEFAULTS.from; fTo.value = DEFAULTS.to;
    $('#range-error').hidden = true;
    scopeChanged('Filters reset.');
    fPeriod.focus();
  });
  $('#filters-toggle').addEventListener('click', (e) => {
    const b = e.currentTarget;
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    $('#filters').classList.toggle('is-open', open);
  });

  /* Status, urgency, sorting, paging */
  $('#status-filter').addEventListener('change', (e) => {
    if (e.target.name !== 'status') return;
    state.status = e.target.value;
    state.keep.clear();
    renderQueue();
    announce(`Showing ${rowsFor().length} ${describeView()} exceptions.`);
  });
  $('#f-urgent').addEventListener('change', (e) => {
    state.urgentOnly = e.target.checked;
    state.keep.clear();
    renderQueue();
    announce(`Showing ${rowsFor().length} ${describeView()} exceptions.`);
  });
  $$('#xtable th[data-sort] .sort-btn').forEach((b) => b.addEventListener('click', () => {
    const key = b.closest('th').dataset.sort;
    state.sort = state.sort.key === key ? { key, dir: state.sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' };
    state.keep.clear();
    renderQueue();
    announce(`Sorted by ${key}, ${sortWords()}.`);
  }));
  $('#show-all').addEventListener('click', () => {
    state.showAll = !state.showAll;
    renderQueue();
    announce(state.showAll ? 'Showing all exceptions.' : `Showing the first ${PAGE} exceptions.`);
  });
  $('#kpi-urgent').addEventListener('click', () => {
    state.urgentOnly = true;
    state.status = 'open';
    state.keep.clear();
    $('#f-urgent').checked = true;
    $('#status-filter input[value="open"]').checked = true;
    renderQueue();
    renderMobile();
    const title = $('#queue-title');
    title.setAttribute('tabindex', '-1');
    title.scrollIntoView({ block: 'start' });
    title.focus({ preventScroll: true });
    announce(`Showing ${rowsFor().length} urgent open exceptions, ${sortWords()}.`);
  });

  /* Table: whole row opens details; arrows move between rows */
  $('#xbody').addEventListener('click', (e) => {
    if (e.target.closest('#clear-queue')) {
      state.status = 'open'; state.urgentOnly = false; state.keep.clear();
      $('#f-urgent').checked = false;
      $('#status-filter input[value="open"]').checked = true;
      renderQueue();
      return;
    }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (state.selected === tr.dataset.id && dlg.open) { dlg.close(); return; }
    openDetail(tr.dataset.id, '#xbody tr[data-id="{id}"] .row-btn');
  });
  $('#xbody').addEventListener('keydown', (e) => {
    const btn = e.target.closest('.row-btn');
    if (!btn) return;
    const btns = $$('#xbody .row-btn');
    const i = btns.indexOf(btn);
    let j = null;
    if (e.key === 'ArrowDown') j = Math.min(btns.length - 1, i + 1);
    else if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = btns.length - 1;
    if (j === null) return;
    e.preventDefault();
    btns[j].focus();
  });

  /* Phone list */
  $('#m-list').addEventListener('click', (e) => {
    const b = e.target.closest('.m-btn');
    if (b) openDetail(b.dataset.id, '#m-list .m-btn[data-id="{id}"]');
  });
  $('#m-more').addEventListener('click', () => {
    state.mAll = !state.mAll;
    renderMobile();
    announce(state.mAll ? 'Showing all open exceptions.' : 'Showing urgent exceptions only.');
  });

  /* ---------- App chrome: navigation, workspace switcher, account menu ---------- */
  const navToggle = $('#nav-toggle');
  const nav = $('#primary-nav');
  function setNav(open, focusToggle) {
    navToggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    if (open) $('a', nav).focus();
    else if (focusToggle) navToggle.focus();
  }
  navToggle.addEventListener('click', () => setNav(navToggle.getAttribute('aria-expanded') !== 'true'));

  let openPop = null;
  function popover(btnSel, popSel) {
    const btn = $(btnSel);
    const pop = $(popSel);
    const api = {
      btn, pop,
      set(open) {
        btn.setAttribute('aria-expanded', String(open));
        pop.hidden = !open;
        if (open) openPop = api;
        else if (openPop === api) openPop = null;
      },
    };
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      if (openPop && openPop !== api) openPop.set(false);
      api.set(open);
      if (open) {
        const first = pop.querySelector('input:checked, a[href], button');
        if (first) first.focus();
      }
    });
    pop.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) api.set(false);
    });
    return api;
  }
  const wsPop = popover('#ws-btn', '#ws-menu');
  popover('#user-btn', '#user-menu');
  document.addEventListener('click', (e) => {
    if (openPop && !openPop.pop.contains(e.target) && !openPop.btn.contains(e.target)) openPop.set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (openPop) {
      const b = openPop.btn;
      openPop.set(false);
      b.focus();
      return;
    }
    if (navToggle.getAttribute('aria-expanded') === 'true' && getComputedStyle(navToggle).display !== 'none') setNav(false, true);
  });
  $$('#ws-menu input[name="env"]').forEach((r) => r.addEventListener('change', () => {
    const sandbox = r.value === 'sandbox';
    document.body.classList.toggle('is-sandbox', sandbox);
    $('#env-label').textContent = sandbox ? 'Sandbox' : 'Live';
    $('#page-meta').textContent = sandbox
      ? 'Sandbox environment · test data, nothing here moves money'
      : 'Run for Thu 1 Oct completed 06:12 · data as of Fri 2 Oct, 07:30 CEST';
    announce(sandbox ? 'Switched to the Sandbox environment.' : 'Switched to the Live environment.');
  }));
  $('#ws-menu').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.name === 'env') { e.preventDefault(); wsPop.set(false); wsPop.btn.focus(); }
  });

  /* ---------- Start ---------- */
  renderAll();
})();
