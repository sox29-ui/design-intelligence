/* Ledgerline prototype: wiring (filters, table keyboard model, panel actions, menus, toasts). */
(function () {
  'use strict';
  var LL = window.LL, D = LL.D, f = LL.fmt, s = LL.state, DAY = D.DAY;
  function $(id) { return document.getElementById(id); }
  function on(el, type, fn) { el.addEventListener(type, fn); }

  /* ---------- toasts ---------- */
  function toast(msg, undo) {
    var box = $('toasts'), t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span>' + LL.esc(msg) + '</span>';
    if (undo) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'link-btn'; b.textContent = 'Undo';
      on(b, 'click', function () { undo(); t.remove(); LL.renderAll(); toast('Undone.'); });
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(function () { t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 250); }, undo ? 7000 : 3500);
  }
  LL.toast = toast;

  /* ---------- filters ---------- */
  function fillSelect(id, items, label) {
    $(id).innerHTML = '<option value="all">' + label + '</option>' + items.map(function (x) {
      return '<option value="' + x.id + '">' + LL.esc(x.label || x.name) + '</option>';
    }).join('');
  }
  function isoDay(t) { return new Date(t).toISOString().slice(0, 10); }
  function dayIndex(iso) { return Math.round((D.TODAY - Date.parse(iso + 'T00:00:00Z')) / DAY) - 1; }

  function syncReset() {
    $('f-reset').hidden = s.period === '1' && s.provider === 'all' && s.entity === 'all';
  }
  function filtersChanged() {
    s.pinned = {};
    syncReset();
    LL.renderAll();
  }

  function initFilters() {
    fillSelect('f-provider', D.PROVIDERS, 'All providers');
    fillSelect('f-entity', D.ENTITIES.map(function (e) { return { id: e.id, label: e.name + ' · ' + e.account }; }), 'All entities');
    var min = isoDay(LL.dayStart(29)), max = isoDay(LL.dayStart(0));
    ['f-from', 'f-to'].forEach(function (id) { $(id).min = min; $(id).max = max; });

    on($('f-period'), 'change', function () {
      var custom = this.value === 'custom';
      document.querySelectorAll('[data-custom]').forEach(function (el) { el.hidden = !custom; });
      if (custom) {
        var p = LL.period();
        $('f-from').value = isoDay(p.start); $('f-to').value = isoDay(p.end - DAY);
        s.from = p.from; s.to = p.to;
      }
      s.period = this.value;
      filtersChanged();
    });
    function onDate() {
      var a = $('f-from').value, b = $('f-to').value;
      if (!a || !b) return;
      var from = Math.min(29, Math.max(0, dayIndex(a))), to = Math.min(29, Math.max(0, dayIndex(b)));
      if (to > from) { var tmp = from; from = to; to = tmp; }
      s.from = from; s.to = to;
      filtersChanged();
    }
    on($('f-from'), 'change', onDate); on($('f-to'), 'change', onDate);
    on($('f-provider'), 'change', function () { s.provider = this.value; filtersChanged(); });
    on($('f-entity'), 'change', function () { s.entity = this.value; filtersChanged(); });
    on($('f-reset'), 'click', function () {
      s.period = '1'; s.provider = 'all'; s.entity = 'all';
      $('f-period').value = '1'; $('f-provider').value = 'all'; $('f-entity').value = 'all';
      document.querySelectorAll('[data-custom]').forEach(function (el) { el.hidden = true; });
      filtersChanged();
      $('f-period').focus();
    });
    on($('filters'), 'submit', function (e) { e.preventDefault(); });

    on($('f-status'), 'change', function () { s.status = this.value; s.pinned = {}; LL.renderTable(); LL.renderPanel(); });
    document.querySelectorAll('input[name="view"]').forEach(function (r) {
      on(r, 'change', function () { setView(this.value); });
    });
    var qTimer;
    on($('f-q'), 'input', function () {
      var v = this.value; clearTimeout(qTimer);
      qTimer = setTimeout(function () { s.query = v; s.pinned = {}; LL.renderTable(); LL.renderPanel(); }, 120);
    });
    on($('empty-reset'), 'click', function () {
      s.status = 'open'; s.query = ''; $('f-status').value = 'open'; $('f-q').value = '';
      setView('all');
    });
  }

  function setView(v) {
    s.view = v; s.pinned = {};
    var r = $('v-' + v); if (r) r.checked = true;
    LL.renderTable(); LL.renderPanel();
  }

  /* ---------- table: sorting, selection, roving focus ---------- */
  function select(id, focusSel) {
    s.selected = id;
    if (LL.lastRows.indexOf(id) !== -1) LL.focusId = id;
    LL.renderTable();
    LL.renderPanel(focusSel);
  }
  function closePanel() {
    var id = s.selected;
    s.selected = null;
    LL.renderTable(); LL.renderPanel();
    var b = id && document.querySelector('#ex-body tr[data-id="' + id + '"] .row-btn');
    if (b) b.focus();
  }
  LL.select = select;

  function initTable() {
    document.querySelectorAll('#ex-table th[data-sort] .sort-btn').forEach(function (btn) {
      on(btn, 'click', function () {
        var key = btn.parentNode.getAttribute('data-sort');
        if (s.sort.key === key) s.sort.dir = s.sort.dir === 'asc' ? 'desc' : 'asc';
        else s.sort = { key: key, dir: key === 'id' ? 'asc' : 'desc' };
        LL.renderTable(); LL.renderPanel();
      });
    });
    var body = $('ex-body');
    on(body, 'click', function (e) {
      var tr = e.target.closest('tr[data-id]'); if (!tr) return;
      var id = tr.getAttribute('data-id');
      if (s.selected === id && e.target.closest('.row-btn')) { closePanel(); return; }
      select(id);
    });
    on(body, 'keydown', function (e) {
      var btn = e.target.closest('.row-btn'); if (!btn) return;
      var ids = LL.lastRows, i = ids.indexOf(btn.closest('tr').getAttribute('data-id')), j = i;
      if (e.key === 'ArrowDown') j = i + 1;
      else if (e.key === 'ArrowUp') j = i - 1;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = ids.length - 1;
      else if (e.key === 'PageDown') j = i + 10;
      else if (e.key === 'PageUp') j = i - 10;
      else return;
      e.preventDefault();
      j = Math.max(0, Math.min(ids.length - 1, j));
      LL.focusId = ids[j];
      if (s.selected) { select(ids[j]); }
      else {
        body.querySelectorAll('.row-btn').forEach(function (b) { b.tabIndex = -1; });
        var next = body.querySelector('tr[data-id="' + ids[j] + '"] .row-btn');
        next.tabIndex = 0; next.focus();
      }
    });
  }

  /* ---------- detail panel actions ---------- */
  function initPanel() {
    var panel = $('detail');
    on(panel, 'click', function (e) {
      var x = LL.byId[s.selected]; if (!x) return;
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-close')) { closePanel(); return; }
      if (t.hasAttribute('data-step')) {
        var ids = LL.lastRows, i = ids.indexOf(x.id) + (+t.getAttribute('data-step'));
        if (ids[i]) select(ids[i], '[data-step="' + t.getAttribute('data-step') + '"]');
        return;
      }
      if (t.hasAttribute('data-resolve')) {
        var undo = LL.act.status(x, 'resolved');
        LL.renderAll(); LL.renderPanel('[data-reopen]');
        toast(x.id + ' resolved.', undo);
        return;
      }
      if (t.hasAttribute('data-reopen')) {
        var undo2 = LL.act.status(x, x.assignee ? 'investigating' : 'new');
        LL.renderAll(); LL.renderPanel('[data-resolve]');
        toast(x.id + ' reopened.', undo2);
        return;
      }
      if (t.hasAttribute('data-take')) {
        var undo3 = LL.act.assign(x, 'ms');
        LL.renderAll(); LL.renderPanel('#d-assignee');
        toast(x.id + ' assigned to you.', undo3);
      }
    });
    on(panel, 'change', function (e) {
      var x = LL.byId[s.selected]; if (!x) return;
      if (e.target.id === 'd-assignee') {
        var who = e.target.value || null, undo = LL.act.assign(x, who);
        LL.renderAll(); LL.renderPanel('#d-assignee');
        toast(who ? x.id + ' assigned to ' + (LL.people[who].me ? 'you' : LL.people[who].name) + '.' : x.id + ' is now unassigned.', undo);
      } else if (e.target.id === 'd-status') {
        var st = e.target.value, undo2 = LL.act.status(x, st);
        LL.renderAll(); LL.renderPanel('#d-status');
        toast(x.id + ' set to ' + LL.statuses[st].name + '.', undo2);
      }
    });
    on(panel, 'submit', function (e) {
      e.preventDefault();
      var x = LL.byId[s.selected], ta = $('d-note-text'), text = ta && ta.value.trim();
      if (!x || !text) { if (ta) ta.focus(); return; }
      var undo = LL.act.note(x, text);
      LL.renderAll(); LL.renderPanel('#d-note-text');
      toast('Note added to ' + x.id + '.', undo);
    });
  }

  /* ---------- KPI shortcuts, feed links ---------- */
  function initShortcuts() {
    on($('kpis'), 'click', function (e) {
      var b = e.target.closest('[data-view]'); if (!b) return;
      s.status = 'open'; $('f-status').value = 'open';
      setView(b.getAttribute('data-view'));
      $('exceptions').scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = document.querySelector('#ex-body .row-btn[tabindex="0"]'); if (first) first.focus({ preventScroll: true });
    });
    on($('feed'), 'click', function (e) {
      var b = e.target.closest('[data-open]'); if (!b) return;
      select(b.getAttribute('data-open'), '#d-title');
    });
  }

  /* ---------- menus, nav drawer, environment ---------- */
  function initChrome() {
    var pops = [['switcher-btn', 'switcher-pop'], ['user-btn', 'user-pop']];
    function closeAll(except) {
      pops.forEach(function (p) { if (p[0] !== except) { $(p[1]).hidden = true; $(p[0]).setAttribute('aria-expanded', 'false'); } });
    }
    pops.forEach(function (p) {
      on($(p[0]), 'click', function (e) {
        e.stopPropagation();
        var open = $(p[1]).hidden;
        closeAll(p[0]);
        $(p[1]).hidden = !open; this.setAttribute('aria-expanded', String(open));
        if (open) { var first = $(p[1]).querySelector('input:checked, a, button, input'); if (first) first.focus(); }
      });
      on($(p[1]), 'keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeAll(); $(p[0]).focus(); }
      });
    });
    on(document, 'click', function (e) {
      if (!e.target.closest('.pop-wrap')) closeAll();
    });

    var sidebar = $('sidebar'), toggle = $('nav-toggle'), scrim = $('scrim');
    function setNav(open) {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      scrim.hidden = !open;
      if (open) sidebar.querySelector('.nav-link').focus();
    }
    on(toggle, 'click', function () { setNav(!document.body.classList.contains('nav-open')); });
    on(scrim, 'click', function () { setNav(false); toggle.focus(); });
    on(sidebar, 'keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { e.stopPropagation(); setNav(false); toggle.focus(); } });
    on(sidebar, 'click', function (e) {
      var a = e.target.closest('[data-nav="exceptions"]');
      if (!a) return;
      e.preventDefault(); setNav(false);
      if (window.matchMedia('(max-width: 640px)').matches) { $('m-urgent').scrollIntoView({ behavior: 'smooth' }); return; }
      $('exceptions').scrollIntoView({ behavior: 'smooth' });
      var b = document.querySelector('#ex-body .row-btn[tabindex="0"]'); if (b) b.focus({ preventScroll: true });
    });

    on(document, 'click', function (e) {
      var a = e.target.closest('[data-soon]'); if (!a) return;
      e.preventDefault(); closeAll();
      toast(a.getAttribute('data-soon') + ' is not part of this prototype. Only the Overview screen is built.');
    });

    function setEnv(env) {
      LL.load(env);
      document.querySelectorAll('input[name="env"]').forEach(function (r) { r.checked = r.value === env; });
      var pill = $('env-pill');
      pill.textContent = env === 'sandbox' ? 'Sandbox' : 'Production';
      pill.setAttribute('data-env', env);
      $('switcher-btn').setAttribute('aria-label', 'Workspace and environment: Brightwater Group, ' + pill.textContent);
      $('env-banner').hidden = env !== 'sandbox';
      document.body.classList.toggle('is-sandbox', env === 'sandbox');
      LL.renderAll();
    }
    document.querySelectorAll('input[name="env"]').forEach(function (r) {
      on(r, 'change', function () { setEnv(this.value); toast('Switched to ' + (this.value === 'sandbox' ? 'Sandbox' : 'Production') + '.'); });
    });
    on($('env-back'), 'click', function () { setEnv('production'); toast('Switched to Production.'); });
  }

  /* ---------- global keys ---------- */
  function initKeys() {
    on(document, 'keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape' && s.selected && !e.defaultPrevented) {
        var popOpen = !$('switcher-pop').hidden || !$('user-pop').hidden || document.body.classList.contains('nav-open');
        if (!popOpen && (!typing || $('detail').contains(e.target))) { e.preventDefault(); closePanel(); }
      } else if (e.key === '/' && !typing) {
        e.preventDefault(); $('f-q').focus();
      }
    });
  }

  /* ---------- CSV export of the current table view ---------- */
  function initExport() {
    on($('export-btn'), 'click', function () {
      var now = LL.now();
      var rows = [['ID', 'Provider', 'Entity', 'Amount', 'Currency', 'EUR equivalent', 'Age (days)', 'Reason', 'Status', 'Assignee', 'Reference', 'Flagged']];
      LL.lastRows.forEach(function (id) {
        var x = LL.byId[id];
        rows.push([x.id, LL.providers[x.provider].name, LL.entities[x.entity].name, x.amount.toFixed(2), x.currency, x.eur.toFixed(2),
          (LL.ageOf(x, now) / DAY).toFixed(2), LL.reasons[x.reason].name, LL.statuses[x.status].name,
          x.assignee ? LL.people[x.assignee].name : '', x.ref, new Date(x.created).toISOString().slice(0, 16).replace('T', ' ')]);
      });
      var csv = rows.map(function (r) { return r.map(function (c) { return /[",]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'ledgerline-exceptions-' + new Date(D.TODAY).toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      toast('Exported ' + LL.lastRows.length + ' exceptions to CSV.');
    });
  }

  function init() {
    LL.load('production');
    LL.chart = window.LLChart.create($('trend-chart'), function (j, commit) { LL.chartReadout(j, commit); });
    initFilters(); initTable(); initPanel(); initShortcuts(); initChrome(); initKeys(); initExport();
    LL.renderAll();
    // keep ages and relative times fresh while the screen stays open
    setInterval(function () { LL.renderTable(); LL.renderFeed(); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
