/* Ledgerline prototype: 30-day matched vs unmatched trend.
   Two aligned panels share one time axis. Unmatched volume is ~3% of matched volume,
   so it gets its own (labelled) scale instead of disappearing at the foot of a stacked bar. */
(function () {
  'use strict';

  function nice(v) {
    if (!(v > 0)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10;
    return n * e;
  }
  function short(v) {
    if (v === 0) return '€0';
    if (v >= 1e6) return '€' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '€' + (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + 'k';
    return '€' + Math.round(v);
  }

  function create(el, onActive) {
    var data = null, hover = null;

    function draw() {
      if (!data) return;
      var series = data.series, n = series.length;
      var W = Math.max(260, Math.floor(el.clientWidth)), H = 206;
      var padL = 44, padR = 4;
      var A = { top: 20, h: 88 }, B = { top: 138, h: 40 };
      var axisY = B.top + B.h + 18;
      var step = (W - padL - padR) / n;
      var bw = Math.max(3, Math.min(16, step * 0.62));
      var maxA = nice(Math.max.apply(null, series.map(function (d) { return d.matched; })) * 1.02);
      var maxB = nice(Math.max.apply(null, series.map(function (d) { return d.unmatched; })) * 1.02);
      var cur = hover != null ? hover : data.active;
      var s = '';

      if (data.band) {
        var bx = padL + data.band[0] * step, bwid = (data.band[1] - data.band[0] + 1) * step;
        s += '<rect class="c-band" x="' + bx.toFixed(1) + '" y="' + (A.top - 6) + '" width="' + bwid.toFixed(1) + '" height="' + (B.top + B.h - A.top + 6) + '" rx="3"/>';
      }
      if (cur != null) {
        s += '<rect class="c-hover" x="' + (padL + cur * step).toFixed(1) + '" y="' + (A.top - 6) + '" width="' + step.toFixed(1) + '" height="' + (B.top + B.h - A.top + 6) + '" rx="2"/>';
      }

      [0, 0.5, 1].forEach(function (t) {
        var y = (A.top + A.h - t * A.h).toFixed(1);
        s += '<line class="' + (t === 0 ? 'c-base' : 'c-grid') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>';
        s += '<text class="c-tick" x="' + (padL - 6) + '" y="' + y + '" dy="0.32em" text-anchor="end">' + short(t * maxA) + '</text>';
      });
      [0, 1].forEach(function (t) {
        var y = (B.top + B.h - t * B.h).toFixed(1);
        s += '<line class="' + (t === 0 ? 'c-base' : 'c-grid') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>';
        s += '<text class="c-tick" x="' + (padL - 6) + '" y="' + y + '" dy="0.32em" text-anchor="end">' + short(t * maxB) + '</text>';
      });
      s += '<text class="c-panel" x="' + padL + '" y="' + (A.top - 9) + '">Matched volume</text>';
      s += '<text class="c-panel" x="' + padL + '" y="' + (B.top - 9) + '">Unmatched volume</text>';

      series.forEach(function (d, i) {
        var x = (padL + i * step + (step - bw) / 2).toFixed(1);
        var ha = Math.max(1, d.matched / maxA * A.h), hb = d.unmatched > 0 ? Math.max(1.5, d.unmatched / maxB * B.h) : 0;
        var on = i === cur ? ' is-on' : '';
        s += '<rect class="c-m' + on + '" x="' + x + '" y="' + (A.top + A.h - ha).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ha.toFixed(1) + '" rx="1.5"/>';
        if (hb) s += '<rect class="c-u' + on + '" x="' + x + '" y="' + (B.top + B.h - hb).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hb.toFixed(1) + '" rx="1.5"/>';
      });

      for (var i = n - 1; i >= 0; i -= 7) {
        var cx = padL + i * step + step / 2;
        var anchor = i === n - 1 ? 'end' : 'middle';
        if (anchor === 'end') cx = Math.min(W - padR, cx + step / 2);
        s += '<text class="c-tick" x="' + cx.toFixed(1) + '" y="' + axisY + '" text-anchor="' + anchor + '">' + series[i].label + '</text>';
      }

      el.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false">' + s + '</svg>';
      el._geom = { padL: padL, step: step, n: n };
    }

    function indexAt(evt) {
      var g = el._geom; if (!g) return null;
      var x = evt.clientX - el.getBoundingClientRect().left;
      var i = Math.floor((x - g.padL) / g.step);
      return i < 0 || i >= g.n ? null : i;
    }
    function setHover(i) {
      if (i === hover) return;
      hover = i; draw();
      onActive(hover != null ? hover : data.active);
    }

    el.addEventListener('mousemove', function (e) { setHover(indexAt(e)); });
    el.addEventListener('mouseleave', function () { setHover(null); });
    el.addEventListener('keydown', function (e) {
      if (!data) return;
      var n = data.series.length, i = data.active;
      if (e.key === 'ArrowLeft') i -= 1;
      else if (e.key === 'ArrowRight') i += 1;
      else if (e.key === 'PageUp') i -= 7;
      else if (e.key === 'PageDown') i += 7;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      else return;
      e.preventDefault();
      data.active = Math.max(0, Math.min(n - 1, i));
      hover = null; draw(); onActive(data.active, true);
    });
    if ('ResizeObserver' in window) new ResizeObserver(function () { draw(); }).observe(el);

    return {
      update: function (d) { data = d; draw(); onActive(hover != null ? hover : data.active); }
    };
  }

  window.LLChart = { create: create, short: short };
})();
