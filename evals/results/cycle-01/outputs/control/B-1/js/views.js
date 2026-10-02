/* Ledgerline prototype: rendering. Each render* function reads LL.state and redraws one region. */
(function () {
  'use strict';
  var LL = window.LL, D = LL.D, f = LL.fmt, DAY = D.DAY;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function icon(id, cls) { return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function badge(st) { return '<span class="status status-' + st + '">' + icon('i-s-' + st, 'icon-xs') + LL.statuses[st].name + '</span>'; }
  function avatar(id) {
    if (id === 'system') return '<span class="avatar avatar-system" aria-hidden="true">' + icon('i-bolt', 'icon-xs') + '</span>';
    if (!id) return '<span class="avatar avatar-none" aria-hidden="true"></span>';
    return '<span class="avatar" data-p="' + id + '" aria-hidden="true">' + LL.people[id].initials + '</span>';
  }
  function person(id, full) {
    var name = !id ? 'Unassigned' : full ? LL.people[id].name + (LL.people[id].me ? ' (you)' : '') : f.shortName(id);
    var title = id ? LL.people[id].name : 'Unassigned';
    return '<span class="person' + (id ? '' : ' person-none') + '" title="' + esc(title) + '">' + avatar(id) + '<span class="person-name">' + esc(name) + '</span></span>';
  }
  LL.esc = esc; LL.icon = icon;

  /* ---------- header + KPIs ---------- */
  function prevLabel(p) { return p.len === 1 ? 'on ' + f.day(p.prevStart) : 'in prior ' + p.len + ' days'; }

  function delta(cur, prev, o) {
    if (cur == null || prev == null) return '<span class="delta delta-flat">no comparison</span>';
    var diff = o.rel ? (prev ? (cur - prev) / prev * 100 : 0) : cur - prev;
    var dir = Math.abs(diff) < (o.eps || 1e-9) ? 'flat' : diff > 0 ? 'up' : 'down';
    var tone = dir === 'flat' ? 'flat' : dir === o.good ? 'good' : 'bad';
    var word = tone === 'good' ? 'improvement' : tone === 'bad' ? 'deterioration' : 'no change';
    var sign = dir === 'up' ? '+' : dir === 'down' ? '−' : '±';
    return '<span class="delta delta-' + tone + '">' + (dir === 'flat' ? '' : icon(dir === 'up' ? 'i-caret-up' : 'i-caret-down', 'icon-xs')) +
      sign + o.fmt(Math.abs(diff)) + '<span class="sr-only"> (' + word + ')</span></span>';
  }

  LL.renderHeader = function () {
    var p = LL.period();
    $('period-text').textContent = p.len === 1 ? f.long(p.start) : f.day(p.start) + ' – ' + f.day(p.end - DAY) + ' 2026';
    var run = LL.db.events.filter(function (e) { return e.type === 'run' && e.day === 0; })[0];
    $('run-text').textContent = run ? 'Nightly run finished today at ' + f.time(run.t) : '';
  };

  LL.renderKpis = function () {
    var k = LL.kpis(), p = k.period, pl = prevLabel(p);
    var openPl = p.len === 1 ? '24 h ago' : p.len + ' days ago';
    var cards = [
      { id: 'rate', label: 'Matched rate', value: k.rate.cur.toFixed(1) + '%',
        delta: delta(k.rate.cur, k.rate.prev, { good: 'up', eps: 0.05, fmt: function (v) { return v.toFixed(1) + ' pp'; } }),
        prev: 'from ' + k.rate.prev.toFixed(1) + '% ' + pl,
        foot: f.eur0(k.rate.matched) + ' of ' + f.eur0(k.rate.total) + ' matched' },
      { id: 'unmatched', label: 'Unmatched amount', value: f.eur(k.unmatched.cur),
        delta: delta(k.unmatched.cur, k.unmatched.prev, { good: 'down', rel: true, eps: 0.05, fmt: function (v) { return v.toFixed(1) + '%'; } }),
        prev: 'from ' + f.eur0(k.unmatched.prev) + ' ' + pl,
        foot: k.unmatched.n + ' exceptions flagged · ' + f.eur0(k.unmatched.open) + ' still open' },
      { id: 'open', label: 'Open exceptions', value: f.int(k.open.cur),
        delta: delta(k.open.cur, k.open.prev, { good: 'down', fmt: function (v) { return f.int(v); } }),
        prev: 'from ' + k.open.prev + ', ' + openPl,
        foot: '<button type="button" class="kpi-link" data-view="urgent">' + icon('i-flag', 'icon-xs') + k.open.urgent + ' urgent</button>' +
          '<span aria-hidden="true"> · </span><button type="button" class="kpi-link" data-view="unassigned">' + k.open.unassigned + ' unassigned</button>' },
      { id: 'ttr', label: 'Median time to resolve', value: k.ttr.cur == null ? '–' : (k.ttr.cur / DAY).toFixed(1) + ' days',
        delta: delta(k.ttr.cur == null ? null : k.ttr.cur / DAY, k.ttr.prev == null ? null : k.ttr.prev / DAY, { good: 'down', eps: 0.05, fmt: function (v) { return v.toFixed(1) + ' d'; } }),
        prev: k.ttr.prev == null ? '' : 'from ' + (k.ttr.prev / DAY).toFixed(1) + ' d ' + pl,
        foot: k.ttr.n + ' resolved in period · target 3.0 days' }
    ];
    $('kpis').innerHTML = cards.map(function (c) {
      return '<article class="kpi" aria-labelledby="kpi-' + c.id + '">' +
        '<h3 class="kpi-label" id="kpi-' + c.id + '">' + c.label + '</h3>' +
        '<p class="kpi-value">' + c.value + '</p>' +
        '<p class="kpi-cmp">' + c.delta + ' <span class="kpi-prev">' + c.prev + '</span></p>' +
        '<p class="kpi-foot">' + c.foot + '</p></article>';
    }).join('');
    $('nav-count').textContent = k.open.cur;
    $('m-cmp').textContent = 'Changes compared with ' + (p.len === 1 ? f.week(p.prevStart) : 'the prior ' + p.len + ' days') + '; open exceptions with 24 h ago.';
  };

  /* ---------- chart ---------- */
  LL.renderChart = function () {
    var series = LL.series(), p = LL.period();
    var a = 29 - p.from, b = 29 - p.to, band = b < 0 || a > 29 ? null : [Math.max(0, a), Math.min(29, b)];
    LL.chartSeries = series;
    $('trend-table').tBodies[0].innerHTML = series.map(function (d) {
      return '<tr><th scope="row">' + f.week(d.t) + '</th><td>' + f.eur0(d.matched) + '</td><td>' + f.eur0(d.unmatched) + '</td><td>' +
        (d.total ? (d.matched / d.total * 100).toFixed(1) : '100.0') + '%</td></tr>';
    }).join('');
    LL.chart.update({ series: series, band: band, active: LL.state.chartDay });
  };
  LL.chartReadout = function (j, commit) {
    var d = LL.chartSeries && LL.chartSeries[j]; if (!d) return;
    if (commit) LL.state.chartDay = j;
    $('trend-readout').innerHTML = '<strong>' + f.week(d.t) + '</strong>' +
      '<span><span class="swatch swatch-m" aria-hidden="true"></span><span class="sr-only">matched </span>' + f.eur0(d.matched) + '</span>' +
      '<span><span class="swatch swatch-u" aria-hidden="true"></span><span class="sr-only">unmatched </span>' + f.eur0(d.unmatched) + '</span>' +
      '<span class="ro-rate">' + (d.total ? (d.matched / d.total * 100).toFixed(1) : '100.0') + '% matched</span>';
  };

  /* ---------- exceptions table ---------- */
  var SORT_NAMES = { age: 'age', amount: 'amount (EUR equivalent)', id: 'ID' };
  LL.renderTable = function () {
    var s = LL.state, now = LL.now(), res = LL.rows(), body = $('ex-body');
    var hadFocus = body.contains(document.activeElement);
    document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = res.counts[el.getAttribute('data-count')]; });

    body.innerHTML = res.rows.map(function (x) {
      var urgent = LL.isUrgent(x, now), sel = s.selected === x.id, open = LL.isOpen(x);
      var late = open && now - x.created >= LL.URGENT_AGE;
      return '<tr data-id="' + x.id + '" class="' + (urgent ? 'is-urgent' : '') + (sel ? ' is-selected' : '') + (open ? '' : ' is-resolved') + '">' +
        '<td class="c-id"><button type="button" class="row-btn" tabindex="-1" aria-expanded="' + sel + '" aria-controls="detail">' +
          (urgent ? icon('i-flag', 'icon-xs flag') + '<span class="sr-only">Urgent: </span>' : '<span class="flag-gap" aria-hidden="true"></span>') +
          x.id + '</button></td>' +
        '<td class="c-provider">' + LL.providers[x.provider].name + '<span class="t-reason">' + LL.reasons[x.reason].name + '</span></td>' +
        '<td class="c-num">' + f.money(x.amount) + '<span class="t-cur">' + x.currency + '</span></td>' +
        '<td class="c-cur">' + x.currency + '</td>' +
        '<td class="c-num c-age' + (late ? ' is-late' : '') + '">' + (late ? icon('i-clock', 'icon-xs') : '') + f.age(LL.ageOf(x, now)) +
          (late ? '<span class="sr-only"> (past SLA)</span>' : '') + (open ? '' : '<span class="sr-only"> to resolve</span>') + '</td>' +
        '<td class="c-reason">' + LL.reasons[x.reason].name + '</td>' +
        '<td class="c-status">' + badge(x.status) + '</td>' +
        '<td class="c-assignee">' + person(x.assignee) + '</td></tr>';
    }).join('');

    var ids = res.rows.map(function (x) { return x.id; });
    LL.lastRows = ids;
    if (!LL.focusId || ids.indexOf(LL.focusId) === -1) LL.focusId = s.selected && ids.indexOf(s.selected) !== -1 ? s.selected : ids[0] || null;
    var btn = LL.focusId && body.querySelector('tr[data-id="' + LL.focusId + '"] .row-btn');
    if (btn) { btn.tabIndex = 0; if (hadFocus) btn.focus({ preventScroll: false }); }
    $('ex-empty').hidden = ids.length > 0;

    document.querySelectorAll('#ex-table th[data-sort]').forEach(function (th) {
      var on = th.getAttribute('data-sort') === s.sort.key;
      th.setAttribute('aria-sort', on ? (s.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.querySelector('use').setAttribute('href', on ? (s.sort.dir === 'asc' ? '#i-sort-up' : '#i-sort-down') : '#i-sort');
    });

    var p = LL.period();
    var window_ = p.to === 0 ? 'since ' + f.day(p.start) : 'between ' + f.day(p.start) + ' and ' + f.day(p.end - DAY);
    var scope = s.status === 'open' ? ' open exceptions'
      : s.status === 'resolved' ? ' exceptions resolved ' + window_
      : s.status === 'all' ? ' exceptions, open or resolved ' + window_
      : ' exceptions with status ' + LL.statuses[s.status].name;
    var dirWord = s.sort.key === 'age' ? (s.sort.dir === 'desc' ? 'oldest first' : 'newest first') : s.sort.key === 'amount' ? (s.sort.dir === 'desc' ? 'largest first' : 'smallest first') : (s.sort.dir === 'asc' ? 'ascending' : 'descending');
    $('table-summary').textContent = ids.length + ' of ' + res.counts.all + scope + ' · sorted by ' + SORT_NAMES[s.sort.key] + ', ' + dirWord + '.';
  };

  /* ---------- detail panel ---------- */
  function timelineText(e) {
    var who = '<strong>' + esc(f.actor(e.actor)) + '</strong>';
    switch (e.type) {
      case 'flagged': return esc(e.text);
      case 'resolved': return who + ' resolved it';
      case 'reopened': return who + ' reopened it as ' + LL.statuses[e.to].name;
      case 'assigned': return e.actor === e.to ? who + ' took it' : who + ' assigned it to ' + esc(f.actor(e.to).replace('You', 'you'));
      case 'unassigned': return who + ' removed the assignee';
      case 'status': return who + ' set status to ' + LL.statuses[e.to].name;
      case 'note': return who + ' added a note<q>' + esc(e.text) + '</q>';
      case 'rule': return 'Auto-resolved by rule <strong>FX tolerance ±0.5%</strong>';
      default: return '';
    }
  }
  function fact(label, value, cls) { return '<div class="fact' + (cls ? ' ' + cls : '') + '"><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }

  LL.renderPanel = function (focusSel) {
    var s = LL.state, el = $('detail'), x = s.selected && LL.byId[s.selected];
    $('board').classList.toggle('has-detail', !!x);
    if (!x) { el.hidden = true; el.innerHTML = ''; return; }
    var now = LL.now(), d = LL.detail(x), p = LL.providers[x.provider], e = LL.entities[x.entity];
    var open = LL.isOpen(x), urgent = LL.isUrgent(x, now), pos = LL.lastRows.indexOf(x.id), n = LL.lastRows.length;
    var due = x.created + LL.URGENT_AGE, cur = ' <span class="unit">' + x.currency + '</span>';
    var people = [''].concat(D.PEOPLE.map(function (q) { return q.id; }));

    el.hidden = false;
    el.innerHTML =
      '<div class="d-bar">' +
        '<div class="d-steps">' +
          '<button type="button" class="icon-btn" data-step="-1" aria-label="Previous exception"' + (pos <= 0 ? ' disabled' : '') + '>' + icon('i-left') + '</button>' +
          '<button type="button" class="icon-btn" data-step="1" aria-label="Next exception"' + (pos === -1 || pos >= n - 1 ? ' disabled' : '') + '>' + icon('i-right') + '</button>' +
          '<span class="d-pos">' + (pos === -1 ? 'Not in current list' : (pos + 1) + ' of ' + n) + '</span>' +
        '</div>' +
        '<button type="button" class="icon-btn" data-close aria-label="Close details">' + icon('i-close') + '</button>' +
      '</div>' +
      '<div class="d-scroll">' +
      '<div class="d-title-row"><h2 id="d-title" tabindex="-1">' + x.id + '</h2>' + badge(x.status) + '</div>' +
      '<p class="d-meta">' + p.name + ' · ' + LL.reasons[x.reason].name + ' · ' + esc(e.name) + '</p>' +
      (urgent ? '<p class="d-urgent">' + icon('i-flag', 'icon-sm') + '<span><strong>Urgent</strong>: ' + LL.urgentWhy(x, now).join('; ') + '.</span></p>' : '') +
      '<p class="d-amount">' + f.money(x.amount) + ' <span class="unit">' + x.currency + '</span>' +
        (x.currency !== 'EUR' ? '<span class="d-eq">≈ ' + f.eur(x.eur) + '</span>' : '') + '</p>' +
      '<p class="d-summary">' + esc(d.summary) + '</p>' +
      '<div class="d-actions">' +
        '<div class="field"><label for="d-assignee">Assignee</label><select id="d-assignee">' + people.map(function (id) {
          return '<option value="' + id + '"' + ((x.assignee || '') === id ? ' selected' : '') + '>' + (id ? esc(LL.people[id].name + (LL.people[id].me ? ' (you)' : '')) : 'Unassigned') + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label for="d-status">Status</label><select id="d-status">' + D.STATUSES.map(function (st) {
          return '<option value="' + st.id + '"' + (x.status === st.id ? ' selected' : '') + '>' + st.name + '</option>';
        }).join('') + '</select></div>' +
        (open ? '<button type="button" class="btn btn-primary" data-resolve>' + icon('i-s-resolved', 'icon-sm') + 'Resolve</button>'
              : '<button type="button" class="btn" data-reopen>Reopen</button>') +
        (open && x.assignee !== 'ms' ? '<button type="button" class="link-btn d-take" data-take>Assign to me</button>' : '') +
      '</div>' +
      '<h3 class="d-h">Details</h3>' +
      '<dl class="facts">' +
        fact('Expected', f.money(d.expected) + cur, 'num') +
        fact('Received', f.money(d.received) + cur, 'num') +
        fact('Difference', f.money(d.difference) + cur, 'num strong') +
        fact('Account', esc(e.name) + ' · ' + e.account) +
        fact('Reference', '<code>' + esc(x.ref) + '</code>') +
        fact('Linked orders', f.int(x.orders), 'num') +
        fact('Flagged', f.dateTime(x.created)) +
        (open ? fact('SLA due', f.dateTime(due) + (now > due ? ' <span class="overdue">' + icon('i-clock', 'icon-xs') + 'overdue by ' + f.age(now - due) + '</span>' : ''))
              : fact('Resolved', f.dateTime(x.resolvedAt) + ' · ' + f.age(x.resolvedAt - x.created) + ' after flagging')) +
      '</dl>' +
      '<h3 class="d-h">History</h3>' +
      '<ol class="tl">' + LL.timeline(x).map(function (ev) {
        return '<li><span class="tl-dot" aria-hidden="true"></span><p>' + timelineText(ev) + '</p><time>' + f.rel(ev.t) + '</time></li>';
      }).join('') + '</ol>' +
      '<form class="d-note" id="d-note"><label for="d-note-text">Add a note</label>' +
        '<textarea id="d-note-text" rows="2" placeholder="What did you find? Notes are visible to the team."></textarea>' +
        '<button type="submit" class="btn">Add note</button></form>' +
      '</div>';
    if (focusSel) { var t = el.querySelector(focusSel); if (t && !t.disabled) t.focus(); else $('d-title').focus(); }
  };

  /* ---------- activity feed ---------- */
  function feedText(e) {
    var who = '<strong>' + esc(f.actor(e.actor)) + '</strong>';
    var ex = e.ex ? '<button type="button" class="link-btn" data-open="' + e.ex + '">' + e.ex + '</button>' : '';
    switch (e.type) {
      case 'resolved': return who + ' resolved ' + ex;
      case 'reopened': return who + ' reopened ' + ex;
      case 'assigned': return e.actor === e.to ? who + ' took ' + ex : who + ' assigned ' + ex + ' to ' + esc(f.actor(e.to).replace('You', 'you'));
      case 'unassigned': return who + ' unassigned ' + ex;
      case 'status': return who + ' moved ' + ex + ' to ' + LL.statuses[e.to].name;
      case 'note': return who + ' commented on ' + ex;
      case 'rule': return '<strong>FX tolerance rule</strong> auto-resolved ' + ex;
      case 'run': return '<strong>Nightly run</strong> for ' + f.day(LL.dayStart(e.day)) + ' flagged ' + e.count + ' new exceptions';
      default: return '';
    }
  }
  LL.renderFeed = function () {
    $('feed').innerHTML = LL.feed(8).map(function (e) {
      var x = e.ex && LL.byId[e.ex];
      var meta = e.type === 'note' ? '<q>' + esc(e.text) + '</q>'
        : x ? LL.providers[x.provider].name + ' · ' + f.money(x.amount) + ' ' + x.currency : 'All providers';
      return '<li class="feed-item">' + avatar(e.type === 'rule' || e.type === 'run' ? 'system' : e.actor) +
        '<div class="feed-body"><p class="feed-text">' + feedText(e) + '</p><p class="feed-meta">' + meta + '</p></div>' +
        '<time class="feed-time" datetime="' + new Date(e.t).toISOString().slice(0, 16) + '">' + f.rel(e.t) + '</time></li>';
    }).join('');
  };

  /* ---------- phone: read-only urgent list ---------- */
  LL.renderMobile = function () {
    var now = LL.now();
    var list = LL.db.exceptions.filter(function (x) { return LL.inScope(x) && LL.isUrgent(x, now); })
      .sort(function (a, b) { return (now - b.created) - (now - a.created); });
    $('m-list').innerHTML = list.map(function (x) {
      return '<li class="m-item"><div class="m-line"><span class="m-id">' + icon('i-flag', 'icon-xs flag') + '<span class="sr-only">Urgent: </span>' + x.id + '</span>' +
        '<span class="m-amount">' + f.money(x.amount) + ' <span class="unit">' + x.currency + '</span></span></div>' +
        '<div class="m-line m-sub"><span>' + LL.providers[x.provider].name + ' · ' + LL.reasons[x.reason].name + '</span><span class="m-age">' + f.age(now - x.created) + '</span></div>' +
        '<div class="m-line m-sub">' + badge(x.status) + person(x.assignee) + '</div></li>';
    }).join('') || '<li class="m-item">No urgent exceptions. Nice.</li>';
  };

  LL.renderAll = function () {
    LL.renderHeader(); LL.renderKpis(); LL.renderChart(); LL.renderTable(); LL.renderPanel(); LL.renderFeed(); LL.renderMobile();
  };
})();
