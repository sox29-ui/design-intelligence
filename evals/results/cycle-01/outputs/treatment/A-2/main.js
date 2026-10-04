/* Tidewrack — engraves a stylised tide as notation, plays an optional sketch of it,
   and helps pick a timed entry. Vanilla JS, no dependencies; the page works without it. */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------------
     Tide model (stylised, not live data): one semidiurnal cycle from low
     water to low water, 124 six-minute readings. A small overtide makes
     flood and ebb unequal, as in a real estuary.
     ------------------------------------------------------------------ */
  var READINGS = 124;
  var PERIOD_MIN = 745.2;          // M2 period, 12 h 25.2 min
  var A2 = 0.1, P2 = 0.9;

  function rawH(th) { return -Math.cos(th) + A2 * Math.cos(2 * th - P2); }
  function rawR(th) { return Math.sin(th) - 2 * A2 * Math.sin(2 * th - P2); }

  function levelOf(rn) {            // speed of the water -> density
    var a = Math.abs(rn);
    return a < 0.13 ? 0 : a < 0.42 ? 1 : a < 0.76 ? 2 : 3;
  }

  function tideCycle() {
    var th0 = 0, best = Infinity, k, t;
    for (k = -400; k <= 400; k++) { t = k * 0.004; if (rawH(t) < best) { best = rawH(t); th0 = t; } }
    var pts = [], maxR = 0, minH = Infinity, maxH = -Infinity, i, th, p;
    for (i = 0; i <= READINGS; i++) {
      th = th0 + (2 * Math.PI * i) / READINGS;
      p = { i: i, h: rawH(th), r: rawR(th) };
      pts.push(p);
      maxR = Math.max(maxR, Math.abs(p.r));
      minH = Math.min(minH, p.h);
      maxH = Math.max(maxH, p.h);
    }
    pts.forEach(function (q) {
      q.hn = (q.h - minH) / (maxH - minH);
      q.rn = q.r / maxR;
      q.level = levelOf(q.rn);
      q.step = Math.round(-3 + q.hn * 14);   // staff steps: 0 = bottom line, 8 = top line
    });
    return pts;
  }

  /* ---------------------------- helpers ---------------------------- */
  function el(name, attrs, parent) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pad3(n) { return ('00' + n).slice(-3); }

  function restPath(cx, cy, sp) {
    var u = function (x, y) { return r1(cx + x * sp) + ' ' + r1(cy + y * sp); };
    return 'M' + u(-0.25, -1.45) + 'L' + u(0.35, -0.75) + 'L' + u(-0.15, -0.15) + 'L' + u(0.35, 0.45) +
      'Q' + u(-0.45, 0.25) + ' ' + u(0.05, 1.3);
  }

  /* --------------------------- engraving --------------------------- */
  var SYS = 13.6, GAP = 1.4;        // system height and gap, in staff spaces (mirrors styles.css)

  function engraveScore(stage, ruler, pts, animate) {
    var cs = getComputedStyle(stage);
    var systems = parseInt(cs.getPropertyValue('--systems'), 10) || 2;
    var sp = parseFloat(cs.getPropertyValue('--sp')) || 8;
    var sr = stage.getBoundingClientRect();
    var rr = ruler.getBoundingClientRect();
    var rcs = getComputedStyle(ruler);
    var left = rr.left - sr.left + parseFloat(rcs.paddingLeft);
    var right = rr.right - sr.left - parseFloat(rcs.paddingRight);
    var W = sr.width;
    var H = systems * SYS * sp + (systems - 1) * GAP * sp;

    var svg = el('svg', {
      class: 'score__svg' + (animate ? ' is-engraving' : ''),
      viewBox: '0 0 ' + r1(W) + ' ' + r1(H), width: r1(W), height: r1(H), 'aria-hidden': 'true'
    });

    var per = Math.ceil(pts.length / systems);
    var xStart = left + 1.4 * sp, xEnd = right - 0.4 * sp;
    var pr = (xEnd - xStart) / per;
    var rx = Math.min(0.62 * sp, pr * 0.48), ry = rx * 0.72;
    var txt = clamp(1.9 * sp, 12, 15), dyn = clamp(2.3 * sp, 14, 20);
    var layout = [];                  // per reading: system index, x, y of the staff top

    var hwIdx = 0, lwIdx = [0, pts.length - 1];
    pts.forEach(function (p) { if (p.h > pts[hwIdx].h) hwIdx = p.i; });
    var fastIdx = [0, 0];
    pts.forEach(function (p) {
      if (p.i < hwIdx && Math.abs(p.rn) > Math.abs(pts[fastIdx[0]].rn)) fastIdx[0] = p.i;
      if (p.i > hwIdx && Math.abs(p.rn) > Math.abs(pts[fastIdx[1]].rn)) fastIdx[1] = p.i;
    });

    for (var s = 0; s < systems; s++) {
      var a = s * per, b = Math.min(pts.length - 1, a + per - 1);
      if (a > b) break;
      var sysY = s * (SYS + GAP) * sp;
      var top = sysY + 4.4 * sp, bottom = top + 4 * sp;
      var yOf = (function (bt) { return function (step) { return bt - step * sp / 2; }; })(bottom);
      var xOf = (function (aa) { return function (i) { return xStart + (i - aa + 0.5) * pr; }; })(a);
      var g = el('g', { class: 'system' }, svg);

      // staff: ruled paper, edge to edge
      for (var l = 0; l < 5; l++) el('line', { class: 's-staff', x1: 0, x2: r1(W), y1: r1(top + l * sp), y2: r1(top + l * sp) }, g);
      el('line', { class: 's-bar', x1: r1(left), x2: r1(left), y1: r1(top), y2: r1(bottom) }, g);
      if (s > 0) el('text', { class: 's-num', x: r1(left), y: r1(top - 1.0 * sp), 'font-size': 12 }, g).textContent = String(Math.floor(a / 10) + 1);

      // bar lines every hour (10 readings)
      for (var i = a + 1; i <= b; i++) {
        if (i % 10 === 0) {
          var bx = (xOf(i - 1) + xOf(i)) / 2;
          el('line', { class: 's-bar', x1: r1(bx), x2: r1(bx), y1: r1(top), y2: r1(bottom) }, g);
        }
      }

      // events: rests (silence), half notes (slow water), beamed quavers / semiquavers (fast water)
      var groups = [], cur = null;
      for (i = a; i <= b; i++) {
        var p = pts[i];
        layout[i] = { s: s, x: xOf(i), top: top, sysY: sysY };
        if (p.level >= 2) {
          var maxN = p.level === 3 ? 4 : 2;
          if (cur && cur.level === p.level && cur.items.length < maxN && Math.floor(i / 10) === Math.floor(cur.items[0] / 10)) cur.items.push(i);
          else { cur = { level: p.level, items: [i] }; groups.push(cur); }
        } else {
          cur = null;
          groups.push({ level: p.level, items: [i] });
        }
      }

      groups.forEach(function (grp) {
        var items = grp.items;
        var avg = items.reduce(function (m, j) { return m + pts[j].step; }, 0) / items.length;
        var up = avg < 4;
        var heads = items.map(function (j) { return { j: j, x: xOf(j), y: yOf(pts[j].step) }; });

        if (grp.level === 0) {
          var ev0 = el('g', { class: 'ev', 'data-i': items[0], style: '--i:' + items[0] }, g);
          el('path', { class: 's-rest', d: restPath(heads[0].x, yOf(4), sp), 'stroke-width': r1(Math.max(1.2, 0.26 * sp)) }, ev0);
          return;
        }

        // stem ends: straight beam for groups, plain stems otherwise
        var stemX = function (h) { return up ? h.x + rx * 0.92 : h.x - rx * 0.92; };
        var ends;
        if (items.length > 1) {
          var x0 = stemX(heads[0]), x1 = stemX(heads[heads.length - 1]);
          var y0 = heads[0].y + (up ? -3.5 : 3.5) * sp;
          var y1 = heads[heads.length - 1].y + (up ? -3.5 : 3.5) * sp;
          var dy = clamp(y1 - y0, -0.6 * sp, 0.6 * sp);
          var slope = dy / Math.max(1, x1 - x0);
          var shift = 0;
          heads.forEach(function (h) {
            var by = y0 + slope * (stemX(h) - x0);
            var len = up ? h.y - by : by - h.y;
            if (len < 2.8 * sp) shift = Math.max(shift, 2.8 * sp - len);
          });
          y0 += up ? -shift : shift;
          ends = heads.map(function (h) { return y0 + slope * (stemX(h) - x0); });
          var t = 0.42 * sp, dir = up ? 1 : -1;
          var beams = grp.level === 3 ? 2 : 1;
          var evb = el('g', { class: 'ev', style: '--i:' + items[0] }, g);
          for (var k = 0; k < beams; k++) {
            var o = k * 0.72 * sp * dir;
            var ya = y0 + o, yb = ends[ends.length - 1] + o;
            el('path', { class: 's-beam', d: 'M' + r1(x0) + ' ' + r1(ya) + 'L' + r1(x1) + ' ' + r1(yb) + 'L' + r1(x1) + ' ' + r1(yb + t * dir) + 'L' + r1(x0) + ' ' + r1(ya + t * dir) + 'Z' }, evb);
          }
        } else {
          ends = [heads[0].y + (up ? -3.5 : 3.5) * sp];
        }

        heads.forEach(function (h, n) {
          var ev = el('g', { class: 'ev', 'data-i': h.j, style: '--i:' + h.j }, g);
          var st = pts[h.j].step, L;
          for (L = -2; L >= st; L -= 2) el('line', { class: 's-ledger', x1: r1(h.x - rx * 1.5), x2: r1(h.x + rx * 1.5), y1: r1(yOf(L)), y2: r1(yOf(L)) }, ev);
          for (L = 10; L <= st; L += 2) el('line', { class: 's-ledger', x1: r1(h.x - rx * 1.5), x2: r1(h.x + rx * 1.5), y1: r1(yOf(L)), y2: r1(yOf(L)) }, ev);
          el('line', { class: 's-stem', x1: r1(stemX(h)), x2: r1(stemX(h)), y1: r1(h.y + (up ? -0.2 : 0.2) * sp), y2: r1(ends[n]) }, ev);
          el('ellipse', {
            class: 's-head' + (grp.level === 1 ? ' s-head--open' : ''),
            cx: r1(h.x), cy: r1(h.y), rx: r1(rx), ry: r1(ry), transform: 'rotate(-20 ' + r1(h.x) + ' ' + r1(h.y) + ')'
          }, ev);
        });
      });

      // markings above the staff: where the tide turns
      [[lwIdx[0], 'low water'], [hwIdx, 'high water'], [lwIdx[1], 'low water']].forEach(function (m) {
        if (m[0] < a || m[0] > b) return;
        var x = xOf(m[0]), w = m[1].length * txt * 0.42, anchor = 'middle';
        if (x - w / 2 < left + (s > 0 ? 2.4 * sp + 10 : 0)) { anchor = 'start'; x = Math.max(x - rx, left + (s > 0 ? 2.4 * sp + 10 : 0)); }
        if (x + w / 2 > right) { anchor = 'end'; x = Math.min(x + rx, right); }
        el('text', { class: 's-text', x: r1(x), y: r1(sysY + 1.9 * sp), 'font-size': r1(txt), 'text-anchor': anchor }, g).textContent = m[1];
      });

      // dynamics: pianissimo at slack water, mezzo-forte where the water runs fastest
      var dynY = sysY + 12.5 * sp, pinY = dynY - 0.35 * dyn, open = 0.65 * sp;
      var marks = [[lwIdx[0], 'pp'], [fastIdx[0], 'mf'], [hwIdx, 'pp'], [fastIdx[1], 'mf'], [lwIdx[1], 'pp']];
      marks.forEach(function (m) {
        if (m[0] < a || m[0] > b) return;
        var anchor = m[0] === lwIdx[1] ? 'end' : m[0] === 0 ? 'start' : 'middle';
        var x = m[0] === 0 ? xOf(0) - rx : m[0] === lwIdx[1] ? Math.min(xOf(m[0]) + rx, right) : xOf(m[0]);
        el('text', { class: 's-dyn', x: r1(x), y: r1(dynY), 'font-size': r1(dyn), 'text-anchor': anchor }, g).textContent = m[1];
      });
      for (var h2 = 0; h2 < marks.length - 1; h2++) {
        var from = marks[h2][0] + 2.2, to = marks[h2 + 1][0] - 2.2;
        var cresc = marks[h2][1] === 'pp';
        var fa = Math.max(from, a - 0.5), fb = Math.min(to, b + 0.5);
        if (fa >= fb) continue;
        var openAt = function (idx) { var f = (idx - from) / (to - from); return (cresc ? f : 1 - f) * open; };
        var xa = xStart + (fa - a + 0.5) * pr, xb = xStart + (fb - a + 0.5) * pr;
        var oa = openAt(fa), ob = openAt(fb);
        el('path', { class: 's-hairpin', d: 'M' + r1(xa) + ' ' + r1(pinY - oa) + 'L' + r1(xb) + ' ' + r1(pinY - ob) + 'M' + r1(xa) + ' ' + r1(pinY + oa) + 'L' + r1(xb) + ' ' + r1(pinY + ob) }, g);
      }

      // the cycle ends on a repeat sign: the tide comes back, never quite the same
      if (b === pts.length - 1) {
        var ex = xOf(b) + pr * 0.5 + 0.6 * sp;
        el('line', { class: 's-bar', x1: r1(ex), x2: r1(ex), y1: r1(top), y2: r1(bottom) }, g);
        el('line', { class: 's-bar s-bar--thick', x1: r1(ex + 0.55 * sp), x2: r1(ex + 0.55 * sp), y1: r1(top), y2: r1(bottom) }, g);
        el('circle', { class: 's-dot', cx: r1(ex - 0.6 * sp), cy: r1(top + 1.5 * sp), r: r1(0.22 * sp) }, g);
        el('circle', { class: 's-dot', cx: r1(ex - 0.6 * sp), cy: r1(top + 2.5 * sp), r: r1(0.22 * sp) }, g);
      }
    }

    // the playhead used by the listening sketch
    var ph = el('g', { class: 's-playhead' }, svg);
    el('line', { x1: 0, x2: 0, y1: r1(2.6 * sp), y2: r1(10.4 * sp) }, ph);

    stage.textContent = '';
    stage.appendChild(svg);
    return { svg: svg, layout: layout, playhead: ph, sp: sp };
  }

  /* Session excerpts: 18:30–22:30 around each predicted low water, start marked at 20:30. */
  function toMin(hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; }

  function engraveMini(box) {
    var lw = toMin(box.getAttribute('data-lw'));
    var W = box.clientWidth, Hh = box.clientHeight || 44, sp = 4.5;
    if (!W) return;
    var top = (Hh - 4 * sp) / 2, bottom = top + 4 * sp;
    var from = toMin('18:30'), n = 40, padX = 4;
    var pr = (W - 2 * padX) / (n + 1);
    var rx = Math.min(0.62 * sp, pr * 0.45), ry = rx * 0.72;
    var svg = el('svg', { viewBox: '0 0 ' + r1(W) + ' ' + r1(Hh), width: r1(W), height: r1(Hh), 'aria-hidden': 'true' });
    for (var l = 0; l < 5; l++) el('line', { class: 's-staff', x1: 0, x2: r1(W), y1: r1(top + l * sp), y2: r1(top + l * sp) }, svg);
    var pts = [], k, th, minH = Infinity, maxH = -Infinity;
    for (k = 0; k <= n; k++) {
      th = (2 * Math.PI * (from + 6 * k - lw)) / PERIOD_MIN;
      pts.push({ h: -Math.cos(th), r: Math.sin(th) });
      minH = Math.min(minH, pts[k].h); maxH = Math.max(maxH, pts[k].h);
    }
    pts.forEach(function (p, j) {
      var x = padX + (j + 0.5) * pr;
      var step = Math.round(((p.h - minH) / (maxH - minH || 1)) * 8);
      var y = bottom - step * sp / 2;
      var lv = levelOf(p.r);
      if (lv === 0) {
        el('path', { class: 's-rest', d: restPath(x, bottom - 2 * sp, sp * 0.8), 'stroke-width': 1.1 }, svg);
      } else {
        el('ellipse', { class: 's-head' + (lv === 1 ? ' s-head--open' : ''), cx: r1(x), cy: r1(y), rx: r1(rx), ry: r1(ry), transform: 'rotate(-20 ' + r1(x) + ' ' + r1(y) + ')' }, svg);
      }
    });
    var mx = padX + (20 + 0.5) * pr;   // 20:30 = 20 readings after 18:30
    el('line', { class: 's-mark', x1: r1(mx), x2: r1(mx), y1: r1(top - 1.4 * sp), y2: r1(bottom + 1.4 * sp) }, svg);
    box.textContent = '';
    box.appendChild(svg);
  }

  /* ------------------------------ setup ----------------------------- */
  var stage = document.querySelector('[data-score]');
  var ruler = document.querySelector('[data-score-ruler]');
  var minis = Array.prototype.slice.call(document.querySelectorAll('[data-mini]'));
  var pts = tideCycle();
  var score = null, lastW = -1, engraveTimer = 0;
  var nowIdx = -1;

  function layoutAll(animate) {
    var w = document.documentElement.clientWidth;
    if (!animate && w === lastW) return;
    lastW = w;
    if (stage && ruler) {
      score = engraveScore(stage, ruler, pts, animate);
      if (animate) {
        clearTimeout(engraveTimer);
        engraveTimer = setTimeout(function () { score && score.svg.classList.remove('is-engraving'); }, 1700);
      }
      if (nowIdx >= 0) showStep(nowIdx, true);
    }
    minis.forEach(engraveMini);
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layoutAll(false); }, 150);
  });
  layoutAll(!reduceMotion.matches);

  /* ---------------- listening sketch (Web Audio, user-started) ----------------
     Height -> pitch on the harmonic series of a low A; speed -> how many notes
     sound per reading; slack water -> silence. A filtered-noise "water" bed follows
     the speed of the tide. One reading every half second: 720 times faster than the room. */
  var listenBtn = document.querySelector('[data-listen]');
  var listenLabel = document.querySelector('[data-listen-label]');
  var listenStatus = document.querySelector('[data-listen-status]');
  var readout = document.querySelector('[data-readout]');
  var readoutIdle = readout ? readout.textContent : '';
  var AC = window.AudioContext || window.webkitAudioContext;
  var audio = null;
  var STEP_S = 0.5;

  function describe(i) {
    var p = pts[i], mins = i * 6;
    var phase = p.level === 0 ? 'slack water' : p.rn > 0 ? 'rising' : 'falling';
    return 'reading ' + pad3(i) + ' / ' + READINGS + ' · ' + Math.floor(mins / 60) + ' h ' + ('0' + (mins % 60)).slice(-2) + ' min · ' + phase;
  }

  function showStep(i, jump) {
    nowIdx = i;
    if (!score) return;
    var prev = score.svg.querySelectorAll('.ev.is-now');
    for (var k = 0; k < prev.length; k++) prev[k].classList.remove('is-now');
    var cur = score.svg.querySelectorAll('.ev[data-i="' + i + '"]');
    for (k = 0; k < cur.length; k++) cur[k].classList.add('is-now');
    var L = score.layout[i];
    if (!L) return;
    var ph = score.playhead;
    var newSystem = ph.getAttribute('data-s') !== String(L.s);
    ph.classList.toggle('is-jump', !!jump || newSystem);
    ph.setAttribute('data-s', L.s);
    ph.style.transform = 'translate(' + r1(L.x) + 'px,' + r1(L.sysY) + 'px)';
    ph.classList.add('is-on');
    if (readout) readout.textContent = describe(i);
  }

  function clearStep() {
    nowIdx = -1;
    if (score) {
      var prev = score.svg.querySelectorAll('.ev.is-now');
      for (var k = 0; k < prev.length; k++) prev[k].classList.remove('is-now');
      score.playhead.classList.remove('is-on');
      score.playhead.removeAttribute('data-s');
    }
    if (readout) readout.textContent = readoutIdle;
  }

  function startListening() {
    var ctx = new AC();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    var master = ctx.createGain();
    var comp = ctx.createDynamicsCompressor();
    master.gain.value = 0;
    master.connect(comp);
    comp.connect(ctx.destination);

    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 0.5;
    var bed = ctx.createGain();
    bed.gain.value = 0;
    noise.connect(lp); lp.connect(bed); bed.connect(master);
    noise.start();

    var t0 = ctx.currentTime + 0.2;
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.85, t0 + 0.8);

    function tone(freq, t, dur, gain) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      if (ctx.createStereoPanner) {          // forty speakers, roughly: each note from somewhere else
        var pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.6 - 0.8;
        g.connect(pan); pan.connect(master);
      } else g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    function voice(p, t) {
      var speed = Math.abs(p.rn);
      bed.gain.setTargetAtTime(0.01 + speed * 0.045, t, 0.35);
      lp.frequency.setTargetAtTime(300 + speed * 800, t, 0.35);
      if (p.level === 0) return;                    // slack water: silence
      var f = 55 * (6 + p.step + 3);                // harmonic series of A1 (partials 6–20)
      if (p.level === 1) tone(f, t, 1.8, 0.14);
      else if (p.level === 2) { tone(f, t, 0.8, 0.1); tone(f + 55, t + 0.25, 0.7, 0.08); }
      else { tone(f, t, 0.4, 0.07); tone(f + 55, t + 0.125, 0.35, 0.055); tone(f, t + 0.25, 0.35, 0.06); tone(f - 55, t + 0.375, 0.35, 0.05); }
    }

    var next = 0, shown = -1;
    var timer = setInterval(function () {
      while (next < pts.length && t0 + next * STEP_S < ctx.currentTime + 0.3) { voice(pts[next], t0 + next * STEP_S); next++; }
      var idx = Math.floor((ctx.currentTime - t0) / STEP_S);
      if (idx >= pts.length) { stopListening(true); return; }
      if (idx >= 0 && idx !== shown) { shown = idx; showStep(idx, idx === 0); }
    }, 40);

    audio = { ctx: ctx, master: master, timer: timer };
    listenBtn.classList.add('is-playing');
    listenLabel.textContent = 'Stop listening';
    listenStatus.textContent = 'Playing one tide in about a minute.';
  }

  function stopListening(finished) {
    if (!audio) return;
    var a = audio;
    audio = null;
    clearInterval(a.timer);
    try {
      a.master.gain.cancelScheduledValues(a.ctx.currentTime);
      a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.08);
    } catch (e) { /* context already closed */ }
    setTimeout(function () { if (a.ctx.close) a.ctx.close(); }, 450);
    clearStep();
    listenBtn.classList.remove('is-playing');
    listenLabel.textContent = finished ? 'Listen again' : 'Listen to one tide';
    listenStatus.textContent = finished ? 'Finished: the tide has turned twice.' : 'Stopped.';
  }

  if (listenBtn && AC) {
    listenBtn.hidden = false;
    listenBtn.addEventListener('click', function () { if (audio) stopListening(false); else startListening(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopListening(false); });
  }

  /* ------------------- section index on narrow screens ------------------- */
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var isOpen = function () { return toggle.getAttribute('aria-expanded') === 'true'; };
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.hidden = false;
    toggle.addEventListener('click', function () { setOpen(!isOpen()); });
    nav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (isOpen() && !(e.target.closest && e.target.closest('.site-header'))) setOpen(false);
    });
    var wide = window.matchMedia('(min-width: 60rem)');
    var onWide = function () { if (wide.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  /* ------------------------- booking helpers ------------------------- */
  var form = document.querySelector('.booking');
  if (form) {
    var day = form.querySelector('#day');
    var time = form.querySelector('#time');
    var people = form.querySelector('#people');
    var bookingStatus = form.querySelector('[data-booking-status]');
    var slot = time.querySelector('[data-session-slot]');
    var sessionDays = ['2026-11-28', '2026-12-06', '2026-12-13', '2026-12-20'];
    var dayName = function () { return day.options[day.selectedIndex].text.replace(' · low-tide session', ''); };

    slot.textContent = '20:30 · low-tide session';
    var syncSlot = function () {
      var isSession = sessionDays.indexOf(day.value) !== -1;
      slot.disabled = !isSession;
      if (!isSession && time.value === '20:30') time.value = '';
      return isSession;
    };
    syncSlot();

    day.addEventListener('change', function () {
      bookingStatus.textContent = syncSlot() ? dayName() + ': the 20:30 low-tide session is also open for booking.' : '';
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-reserve-day]'), function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        day.value = link.getAttribute('data-reserve-day');
        syncSlot();
        time.value = link.getAttribute('data-reserve-time');
        bookingStatus.textContent = 'Selected: low-tide session, ' + dayName() + ', 20:30. Choose how many people.';
        var target = document.getElementById('reserve');
        target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', '#reserve');
        people.focus({ preventScroll: true });
      });
    });
  }
})();
