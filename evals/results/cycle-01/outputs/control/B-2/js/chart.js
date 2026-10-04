/* Ledgerline · 30-day trend chart.
   Two small multiples that share an x axis: matched volume on top, unmatched
   below on its own scale. Unmatched volume is ~3% of matched, so a stacked or
   dual-axis chart would hide exactly the part people need to see.
   Keyboard: focus the chart, then ← → Home End to inspect days. */
(function () {
  'use strict';
  const LL = (window.LL = window.LL || {});
  const NS = 'http://www.w3.org/2000/svg';
  const F = LL.fmt;

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10) * e;
  }

  LL.TrendChart = function (root, live) {
    const svg = el('svg', { class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' }, root);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    root.appendChild(tip);

    let data = [], mode = 'value', band = null, active = null, g = null, guide = null, lastW = 0;
    let barsA = [], barsB = [];

    const val = (d) => (mode === 'value'
      ? { a: d.value - d.unmatched, b: d.unmatched, rate: d.value ? (1 - d.unmatched / d.value) * 100 : 0 }
      : { a: d.count - d.unmatchedCount, b: d.unmatchedCount, rate: d.count ? (1 - d.unmatchedCount / d.count) * 100 : 0 });
    const axisFmt = (n) => (mode === 'value' ? F.eurCompact(n) : F.compact(n));
    const exactFmt = (n) => (mode === 'value' ? F.eur(n) : F.int(n) + ' txns');

    function draw() {
      const W = Math.round(root.clientWidth);
      if (!W || !data.length) return;
      lastW = W;
      const m = { l: 46, r: 4 };
      const aTop = 22, aH = 104, bTop = aTop + aH + 36, bH = 48, H = bTop + bH + 24;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.textContent = '';

      const n = data.length;
      const step = (W - m.l - m.r) / n;
      const bw = Math.max(2, Math.min(16, step * 0.66));
      const vals = data.map(val);
      const aMax = niceMax(Math.max(...vals.map((v) => v.a)));
      const bMax = niceMax(Math.max(...vals.map((v) => v.b)));
      const x = (i) => m.l + i * step + step / 2;
      g = { m, aTop, aH, bTop, bH, H, W, step, x };

      if (band) {
        const i0 = data.findIndex((d) => d.d === band[0]);
        const i1 = data.findIndex((d) => d.d === band[1]);
        if (i0 > -1 && i1 > -1) {
          el('rect', { class: 'band', x: m.l + i0 * step, y: aTop - 4, width: (i1 - i0 + 1) * step, height: bTop + bH - aTop + 4 }, svg);
        }
      }

      function panel(top, h, max, ticks, cls, label) {
        el('rect', { x: m.l, y: top - 16, width: 8, height: 8, rx: 2, class: cls }, svg);
        el('text', { x: m.l + 13, y: top - 8, class: 'panel-title' }, svg).textContent = label;
        for (const t of ticks) {
          const y = top + h - (t / max) * h;
          el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: t === 0 ? 'base' : 'grid' }, svg);
          el('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'tick' }, svg).textContent = axisFmt(t);
        }
      }
      const unit = mode === 'value' ? 'value, EUR' : 'transactions';
      panel(aTop, aH, aMax, [0, aMax / 2, aMax], 'bar-a', `Matched · ${unit}`);
      panel(bTop, bH, bMax, [0, bMax / 2, bMax], 'bar-b', `Unmatched · ${unit}`);

      barsA = [];
      barsB = [];
      vals.forEach((v, i) => {
        const left = x(i) - bw / 2;
        const ha = Math.max(1, (v.a / aMax) * aH);
        const hb = v.b > 0 ? Math.max(1, (v.b / bMax) * bH) : 0;
        barsA.push(el('rect', { x: left, y: aTop + aH - ha, width: bw, height: ha, rx: 1, class: 'bar bar-a' }, svg));
        barsB.push(el('rect', { x: left, y: bTop + bH - hb, width: bw, height: hb, rx: 1, class: 'bar bar-b' }, svg));
        if (data[i].note) el('circle', { cx: x(i), cy: bTop + bH - hb - 5, r: 2.5, class: 'note-dot' }, svg);
      });

      for (let i = n - 1; i >= 0; i -= 7) {
        const last = i === n - 1;
        el('text', { x: last ? W - m.r : x(i), y: H - 6, 'text-anchor': last ? 'end' : 'middle', class: 'tick' }, svg).textContent = F.date(data[i].t);
      }
      guide = el('line', { class: 'guide', x1: 0, x2: 0, y1: aTop - 4, y2: bTop + bH, visibility: 'hidden' }, svg);
      paint(false);
    }

    function paint(announce) {
      barsA.forEach((b, i) => b.classList.toggle('is-active', i === active));
      barsB.forEach((b, i) => b.classList.toggle('is-active', i === active));
      if (active == null || !g || !data[active]) {
        if (guide) guide.setAttribute('visibility', 'hidden');
        tip.hidden = true;
        return;
      }
      const d = data[active], v = val(d), cx = g.x(active);
      guide.setAttribute('x1', cx);
      guide.setAttribute('x2', cx);
      guide.setAttribute('visibility', 'visible');
      tip.innerHTML =
        `<div class="tip-date">${F.day(d.t)}</div>` +
        `<div class="tip-row"><span class="tip-sw bar-a"></span>Matched<b>${exactFmt(v.a)}</b></div>` +
        `<div class="tip-row"><span class="tip-sw bar-b"></span>Unmatched<b>${exactFmt(v.b)}</b></div>` +
        `<div class="tip-row tip-rate">Match rate<b>${F.pct(v.rate, 2)}</b></div>` +
        (d.note ? `<div class="tip-note">${d.note}</div>` : '');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = cx + 14 + tw > g.W ? cx - 14 - tw : cx + 14;
      tip.style.left = Math.max(0, left) + 'px';
      if (announce && live) {
        live.textContent = `${F.day(d.t)}. Matched ${exactFmt(v.a)}. Unmatched ${exactFmt(v.b)}. Match rate ${F.pct(v.rate, 2)}.${d.note ? ' ' + d.note + '.' : ''}`;
      }
    }

    function setActive(i, announce) {
      active = i;
      paint(announce);
    }

    root.addEventListener('pointermove', (e) => {
      if (!g || e.pointerType === 'touch') return;
      const r = svg.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left - g.m.l) / g.step);
      setActive(i >= 0 && i < data.length ? i : null, false);
    });
    root.addEventListener('pointerdown', (e) => {
      if (!g || e.pointerType !== 'touch') return;
      const r = svg.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left - g.m.l) / g.step);
      setActive(i >= 0 && i < data.length ? i : null, false);
    });
    root.addEventListener('pointerleave', () => { if (document.activeElement !== root) setActive(null); });
    root.addEventListener('focus', () => { if (active == null) setActive(data.length - 1, true); });
    root.addEventListener('blur', () => setActive(null));
    root.addEventListener('keydown', (e) => {
      let i = active == null ? data.length - 1 : active;
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowRight') i = Math.min(data.length - 1, i + 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = data.length - 1;
      else return;
      e.preventDefault();
      setActive(i, true);
    });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { if (Math.round(root.clientWidth) !== lastW) draw(); }).observe(root);
    } else {
      window.addEventListener('resize', draw);
    }

    return {
      update(next) {
        data = next.data;
        mode = next.mode;
        band = next.band;
        if (active != null && active >= data.length) active = null;
        draw();
      },
    };
  };
})();
