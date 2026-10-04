/*
 * Tidewrack: progressive enhancement, no dependencies.
 *
 *  1. A modelled tide, drawn as a live score on <canvas>
 *  2. A sound sketch of that score (Web Audio, only on request)
 *  3. Motion control: honours prefers-reduced-motion and offers a pause
 *  4. Header state
 *  5. Reservation form
 *
 * Everything works without this file: the page reads top to bottom,
 * links jump to the form, and the form is plain HTML.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var TAU = Math.PI * 2;
  var MOTION_KEY = 'tidewrack-motion';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function safe(fn) { try { fn(); } catch (err) { if (window.console) console.error(err); } }

  var storage = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) {
      try {
        if (v === null) window.localStorage.removeItem(k);
        else window.localStorage.setItem(k, v);
      } catch (e) { /* private mode: nothing to remember */ }
    }
  };

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function motionWanted() {
    return !(reduceQuery && reduceQuery.matches) && storage.get(MOTION_KEY) !== 'off';
  }

  /* -----------------------------------------------------------------
     1. The modelled tide
     One reading every six minutes gives 240 readings a day: a
     semi-diurnal wave with a small diurnal inequality. It is an
     illustration of the method, not live data.
     ----------------------------------------------------------------- */
  var PER_DAY = 240;
  var BEAT = 1.2;           // seconds per reading on screen: six minutes, 300 times faster
  var SILENCE = 0.14;       // below this share of the fastest flow, the water is slack

  function level(i) {
    return 2.1 + 1.3 * Math.cos(TAU * (i - 26) / 120) + 0.18 * Math.cos(TAU * (i - 80) / 240);
  }

  var tide = (function () {
    var list = [], lo = Infinity, hi = -Infinity, maxRate = 0, i;
    for (i = 0; i < PER_DAY; i++) {
      var h = level(i), r = level(i + 0.5) - level(i - 0.5);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      maxRate = Math.max(maxRate, Math.abs(r));
      list.push({ h: h, r: r });
    }
    list.forEach(function (d, j) {
      var speed = Math.abs(d.r) / maxRate;
      var p = Math.round((d.h - lo) / (hi - lo) * 12);     // pitch: 13 places on the stave
      d.speed = speed;
      d.notes = [];
      if (speed < SILENCE) {                                 // slack water: silence
        d.trend = 'slack';
        d.rest = Math.abs(d.r) <= Math.abs(list[mod(j - 1, PER_DAY)].r) &&
                 Math.abs(d.r) < Math.abs(list[mod(j + 1, PER_DAY)].r);
        return;
      }
      var count = speed < 0.5 ? 1 : speed < 0.82 ? 2 : 3;   // density: faster water, more notes
      var dir = d.r > 0 ? 1 : -1;
      // stack in thirds in the direction the water is moving; fold back at the edge of the stave
      var options = [p + dir * 2, p + dir * 4, p - dir * 2, p - dir * 4];
      d.notes.push(p);
      for (var k = 0; k < options.length && d.notes.length < count; k++) {
        if (options[k] >= 0 && options[k] <= 12) d.notes.push(options[k]);
      }
      d.trend = d.r > 0 ? 'rising' : 'falling';
    });
    return { list: list, lo: lo, hi: hi };
  })();

  function at(i) { return tide.list[mod(i, PER_DAY)]; }
  function norm(h) { return (h - tide.lo) / (tide.hi - tide.lo); }
  function clockLabel(i) { var m = mod(i, PER_DAY) * 6; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

  /* -----------------------------------------------------------------
     Shared state for the score, the title waterline and the sound
     ----------------------------------------------------------------- */
  var score = $('[data-score]');
  var canvas = score && $('canvas', score);
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var titleEl = $('[data-title]');
  var waterLabel = $('[data-water-label]');
  var readout = $('.score__readout');
  var readoutTime = $('[data-readout-time]');
  var readoutTrend = $('[data-readout-trend]');
  var motionBtn = $('[data-motion]');
  var soundBtn = $('[data-sound]');

  var started = new Date();
  var pos = (started.getHours() * 60 + started.getMinutes()) / 6;   // the score opens at your time of day
  var lastIndex = null;
  var motionOn = false, soundOn = false, inView = true;
  var rafId = 0, tickId = 0, lastTs = 0;
  var view = { w: 0, h: 0, dpr: 1, staff: 12, dx: 16, head: 0, cy: 0 };
  var colors = { fg: '#ece6d8', sea: '#7eaaa4', accent: '#e7b462' };
  var edgeFade = null;
  var sound = null;

  /* ---------- drawing ---------- */
  var forcedQuery = window.matchMedia ? window.matchMedia('(forced-colors: active)') : null;
  function readColors() {
    if (forcedQuery && forcedQuery.matches) {          // high-contrast themes: draw in system colours
      colors = { fg: 'CanvasText', sea: 'GrayText', accent: 'Highlight' };
      return;
    }
    var cs = getComputedStyle(root);
    ['fg', 'sea', 'accent'].forEach(function (k) {
      var v = cs.getPropertyValue('--' + k).trim();
      if (v) colors[k] = v;
    });
  }

  function measure() {
    var rect = canvas.getBoundingClientRect();
    view.w = rect.width;
    view.h = rect.height;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(view.w * view.dpr));
    canvas.height = Math.max(1, Math.round(view.h * view.dpr));
    view.staff = Math.max(9, Math.min(view.h * 0.105, 22));
    view.dx = Math.max(15, Math.min(26, view.staff * 1.3));
    view.head = Math.round(view.w * (view.w < 720 ? 0.66 : 0.62));
    view.cy = view.h * 0.56;
    if (readout) readout.style.left = view.head + 'px';
    edgeFade = null;
  }

  function yOf(p) { return view.cy + (6 - p) * view.staff / 2; }

  function noteHead(x, p, rx, ry, ledger) {
    var y = yOf(p);
    if (ledger && (p <= 0 || p >= 12)) {
      var ly = Math.round(y) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x - rx * 1.75, ly);
      ctx.lineTo(x + rx * 1.75, ly);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.35, 0, TAU);
    ctx.fill();
  }

  function restMark(x) {
    var s = view.staff, y = yOf(6);
    ctx.fillRect(x - s * 0.36, y - s * 0.26, s * 0.72, s * 0.26);   // a half rest on the middle line
    var fy = yOf(10) - s * 0.6, r = s * 0.48;                       // a fermata above the stave: hold
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x, fy, r, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, fy - r * 0.28, 1.4, 0, TAU);
    ctx.fill();
  }

  function draw() {
    if (!ctx || !view.w) return;
    var w = view.w, h = view.h, t = pos, dx = view.dx, hx = view.head, s = view.staff;
    var first = Math.floor(t - hx / dx) - 2;
    var last = Math.ceil(t + (w - hx) / dx) + 2;
    var i, x, k;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    // the stave
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.fg;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    for (k = 2; k <= 10; k += 2) {
      var ly = Math.round(yOf(k)) + 0.5;
      ctx.moveTo(0, ly);
      ctx.lineTo(w, ly);
    }
    ctx.stroke();

    // the tide itself, as one continuous line under the notes
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = colors.sea;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (i = first; i <= last; i += 0.25) {
      x = hx + (i - t) * dx;
      var yc = yOf(norm(level(i)) * 12);
      if (i === first) ctx.moveTo(x, yc); else ctx.lineTo(x, yc);
    }
    ctx.stroke();

    // notes, ledger lines and rests; notes still to come are faint
    var rx = s * 0.37, ry = s * 0.26;
    ctx.fillStyle = colors.fg;
    ctx.strokeStyle = colors.fg;
    ctx.lineWidth = 1;
    for (i = first; i <= last; i++) {
      var d = at(i);
      x = hx + (i - t) * dx;
      ctx.globalAlpha = i > t ? 0.4 : 0.92;
      if (!d.notes.length) { if (d.rest) restMark(x); continue; }
      for (k = 0; k < d.notes.length; k++) noteHead(x, d.notes[k], rx, ry, true);
    }

    // both edges dissolve into the dark
    if (!edgeFade) {
      edgeFade = ctx.createLinearGradient(0, 0, w, 0);
      edgeFade.addColorStop(0, 'rgba(0,0,0,0)');
      edgeFade.addColorStop(Math.min(0.25, 110 / w), 'rgba(0,0,0,1)');
      edgeFade.addColorStop(Math.max(0.75, 1 - 70 / w), 'rgba(0,0,0,1)');
      edgeFade.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = edgeFade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // the playhead, and the reading sounding now
    var top = yOf(12) - s * 0.9, bottom = yOf(0) + s * 0.9;
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, top);
    ctx.lineTo(hx + 0.5, bottom);
    ctx.stroke();

    var cur = Math.floor(t), now = at(cur);
    if (now.notes.length) {
      var glow = motionOn ? Math.exp(-(t - cur) * 2.2) : 0.7;
      x = hx + (cur - t) * dx;
      ctx.fillStyle = colors.accent;
      ctx.shadowColor = colors.accent;
      ctx.shadowBlur = 16 * glow;
      ctx.globalAlpha = 0.4 + 0.6 * glow;
      for (k = 0; k < now.notes.length; k++) {
        noteHead(x, now.notes[k], rx * (1 + 0.22 * glow), ry * (1 + 0.22 * glow), false);
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the title's waterline follows the same tide ---------- */
  var lastWater = -1;
  function setWater(n) {
    if (!titleEl) return;
    var pct = 80 - n * 50;                 // low water near the baseline, high water near the cap height
    if (Math.abs(pct - lastWater) < 0.05) return;
    lastWater = pct;
    titleEl.style.setProperty('--water', pct.toFixed(2) + '%');
  }

  /* ---------- one clock for picture and sound ---------- */
  function onReading(i) {
    var d = at(i);
    if (readoutTime) readoutTime.textContent = clockLabel(i);
    if (readoutTrend) readoutTrend.textContent = d.trend === 'rising' ? '↑' : d.trend === 'falling' ? '↓' : 'slack';
    if (waterLabel) waterLabel.textContent = d.h.toFixed(2) + ' m';
    if (soundOn && sound) sound.play(d, i);
  }

  function advance(ts) {
    if (lastTs) pos += Math.min(ts - lastTs, 1500) / 1000 / BEAT;
    lastTs = ts;
    var idx = Math.floor(pos);
    if (idx !== lastIndex) { lastIndex = idx; onReading(idx); }
  }

  function frame(ts) {
    rafId = 0;
    advance(ts);
    draw();
    setWater(norm(level(pos)));
    schedule();
  }

  function tick() { advance(performance.now()); }

  function schedule() {
    var moving = !!ctx && motionOn && inView && !doc.hidden;
    var ticking = soundOn && !moving;
    if (moving && !rafId) rafId = window.requestAnimationFrame(frame);
    if (!moving && rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    if (ticking && !tickId) { lastTs = performance.now(); tickId = window.setInterval(tick, 100); }
    if (!ticking && tickId) { window.clearInterval(tickId); tickId = 0; }
    if (!moving && !ticking) lastTs = 0;
  }

  /* -----------------------------------------------------------------
     3. Motion: off by default for reduced-motion users; anyone can
        pause it (WCAG 2.2.2). A pause is remembered on this device.
     ----------------------------------------------------------------- */
  function setMotion(on, remember) {
    motionOn = on;
    root.classList.toggle('motion-on', on);
    root.classList.toggle('motion-off', !on);
    if (motionBtn) {
      if (on) motionBtn.removeAttribute('data-alt'); else motionBtn.setAttribute('data-alt', '');
      $('[data-label]', motionBtn).textContent = on ? 'Pause motion' : 'Play motion';
    }
    if (remember) storage.set(MOTION_KEY, on ? null : 'off');
    schedule();
    if (!on) draw();
  }

  function initScore() {
    if (motionBtn) {
      motionBtn.hidden = false;
      motionBtn.addEventListener('click', function () { setMotion(!motionOn, true); });
    }
    if (reduceQuery) {
      var follow = function () { setMotion(motionWanted(), false); };
      if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', follow);
      else if (reduceQuery.addListener) reduceQuery.addListener(follow);
    }

    if (!ctx) { setMotion(motionWanted(), false); return; }

    readColors();
    measure();
    lastIndex = Math.floor(pos);
    onReading(lastIndex);
    setWater(norm(level(pos)));

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { measure(); draw(); }).observe(canvas);
    } else {
      window.addEventListener('resize', function () { measure(); draw(); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
        schedule();
      }).observe(score);
    }
    doc.addEventListener('visibilitychange', schedule);

    setMotion(motionWanted(), false);
    draw();
  }

  /* -----------------------------------------------------------------
     2. Sound: a sketch of the score, made in the browser on request.
        Height → pitch on an open pentatonic scale, speed → how many
        notes sound together, slack water → silence. Each reading is
        voiced from one of forty positions around the stereo field.
     ----------------------------------------------------------------- */
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var SCALE = [0, 2, 5, 7, 9];                       // D E G A B: no third, so it never settles
  function freq(p) { return 146.83 * Math.pow(2, (12 * Math.floor(p / 5) + SCALE[p % 5]) / 12); }

  function impulse(ac, seconds, decay) {
    var rate = ac.sampleRate, len = Math.floor(rate * seconds), buf = ac.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var data = buf.getChannelData(c);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function brownNoise(ac, seconds) {
    var n = Math.floor(ac.sampleRate * seconds), x = Math.floor(ac.sampleRate * 0.3);
    var tmp = new Float32Array(n + x), last = 0, i;
    for (i = 0; i < n + x; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; tmp[i] = last * 3.5; }
    var buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
    for (i = 0; i < n; i++) data[i] = tmp[i];
    for (i = 0; i < x; i++) { var g = i / x; data[i] = tmp[i] * g + tmp[n + i] * (1 - g); }   // seamless loop
    return buf;
  }

  function createSound() {
    var ac = new AudioCtx();
    var out = ac.createGain();
    out.gain.value = 0;
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
    comp.attack.value = 0.02; comp.release.value = 0.5;
    var tone = ac.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 2400; tone.Q.value = 0.4;
    var bus = ac.createGain();
    var dry = ac.createGain(); dry.gain.value = 0.6;
    var wet = ac.createGain(); wet.gain.value = 0.55;
    var verb = ac.createConvolver(); verb.buffer = impulse(ac, 4.5, 2.8);
    bus.connect(tone);
    tone.connect(dry); tone.connect(verb); verb.connect(wet);
    dry.connect(comp); wet.connect(comp);
    comp.connect(out); out.connect(ac.destination);

    // the estuary underneath: brown noise that swells with the current
    var water = ac.createBufferSource();
    water.buffer = brownNoise(ac, 6);
    water.loop = true;
    var waterTone = ac.createBiquadFilter(); waterTone.type = 'lowpass'; waterTone.frequency.value = 380;
    var waterGain = ac.createGain(); waterGain.gain.value = 0.02;
    water.connect(waterTone); waterTone.connect(waterGain); waterGain.connect(comp);
    water.start();

    function voice(f, when, vel, pan, dur) {
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vel, when + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      var dest = bus;
      if (ac.createStereoPanner) {
        var pn = ac.createStereoPanner();
        pn.pan.value = pan;
        pn.connect(bus);
        dest = pn;
      }
      g.connect(dest);
      // a soft fundamental, an octave, and a brief inharmonic shimmer
      [[1, 1, 0], [2, 0.2, 0], [2.76, 0.07, 0.6]].forEach(function (pt) {
        var o = ac.createOscillator(), pg = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f * pt[0];
        pg.gain.value = pt[1];
        if (pt[2]) {
          pg.gain.setValueAtTime(pt[1], when);
          pg.gain.exponentialRampToValueAtTime(0.0001, when + pt[2]);
        }
        o.connect(pg); pg.connect(g);
        o.start(when);
        o.stop(when + dur + 0.05);
      });
    }

    return {
      context: ac,
      start: function () {
        if (ac.state !== 'running') ac.resume();
        var now = ac.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(2.2, now + 1.5);
      },
      stop: function () {
        var now = ac.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.6);
        window.setTimeout(function () { if (!soundOn && ac.state === 'running') ac.suspend(); }, 900);
      },
      play: function (d, i, confirm) {
        var now = ac.currentTime;
        waterGain.gain.setTargetAtTime(0.012 + 0.03 * d.speed, now, 0.8);
        waterTone.frequency.setTargetAtTime(240 + 520 * d.speed, now, 0.8);
        var notes = d.notes.length ? d.notes : (confirm ? [Math.round(norm(d.h) * 12)] : []);
        var n = notes.length;
        var pan = Math.sin(TAU * mod(i, 40) / 40) * 0.65;   // forty speakers, heard as forty places
        notes.forEach(function (p, k) {
          var spread = Math.max(-1, Math.min(1, pan + (k - (n - 1) / 2) * 0.2));
          voice(freq(p), now + 0.03 + k * 0.12, (k ? 0.11 : 0.16) / Math.sqrt(n), spread, 3.8 - p * 0.1);
        });
      }
    };
  }

  function initSound() {
    if (!soundBtn || !AudioCtx) return;
    soundBtn.hidden = false;
    soundBtn.addEventListener('click', function () {
      if (!soundOn) {
        try {
          if (navigator.audioSession) navigator.audioSession.type = 'playback';   // iOS: play with the ring switch off, like video
          if (!sound) sound = createSound();
          soundOn = true;
          sound.start();
          var idx = Math.floor(pos);
          sound.play(at(idx), idx, true);       // answer the click at once, even at slack water
        } catch (err) {
          soundOn = false;
          soundBtn.hidden = true;
          return;
        }
      } else {
        soundOn = false;
        sound.stop();
      }
      if (soundOn) soundBtn.setAttribute('data-alt', ''); else soundBtn.removeAttribute('data-alt');
      $('[data-label]', soundBtn).textContent = soundOn ? 'Stop sound' : 'Listen';
      schedule();
    });
  }

  /* -----------------------------------------------------------------
     4. Header: the wordmark appears once the title has scrolled away;
        the reserve button fills in once the hero button has.
     ----------------------------------------------------------------- */
  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    if (!('IntersectionObserver' in window)) { header.classList.add('is-scrolled'); return; }
    var title = $('#title');
    var heroCta = $('#hero-cta');
    var headerCta = $('[data-header-cta]');
    if (title) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        header.classList.toggle('is-scrolled', !e.isIntersecting && e.boundingClientRect.top < 0);
      }, { rootMargin: '-64px 0px 0px 0px' }).observe(title);
    }
    if (heroCta && headerCta) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        headerCta.classList.toggle('is-raised', !e.isIntersecting && e.boundingClientRect.top < 0);
      }).observe(heroCta);
    }
  }

  function initInView() {
    $$('[data-inview]').forEach(function (el) {
      if (!('IntersectionObserver' in window)) { el.classList.add('in-view'); return; }
      new IntersectionObserver(function (entries) {
        el.classList.toggle('in-view', entries[entries.length - 1].isIntersecting);
      }).observe(el);
    });
  }

  /* -----------------------------------------------------------------
     5. Reservation form
     ----------------------------------------------------------------- */
  var SESSIONS = { '2026-11-28': '20:42', '2026-12-06': '19:58', '2026-12-13': '20:16', '2026-12-20': '21:03' };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function initBooking() {
    var form = $('#booking');
    if (!form) return;
    var days = $$('input[name="day"]', form);
    var times = $$('input[name="time"]', form);
    var slotsBox = $('.slots', form);
    var timeHint = $('[data-time-hint]', form);
    var summary = $('[data-summary]', form);
    var errorsBox = $('#errors', form);
    var email = $('#email', form);
    var confirmBox = $('#confirm');
    var heading = $('#reserve-title');

    var today = new Date();
    var todayISO = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    var nowHM = pad(today.getHours()) + ':' + pad(today.getMinutes());

    function parse(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
    function longDate(iso) { var d = parse(iso); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
    function chosen(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
    function firstEnabled(list) { for (var i = 0; i < list.length; i++) if (!list[i].disabled) return list[i]; return null; }
    function timeText(t) { return t === '20:30' ? '20:30, low-tide session' : t; }
    function people(n) { return n + (n === '1' ? ' person' : ' people'); }

    // Prototype availability, stable per day and time. A live build would ask the ticketing system.
    function hash(str) {
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0) / 4294967296;
    }
    function availability(day, time) {
      if (time === '20:30') return 'few';
      var dow = parse(day).getUTCDay();
      var busy = (dow === 0 || dow === 6) ? 0.34 : 0.1;
      if (time >= '13:30' && time <= '16:00') busy *= 1.4;
      var r = hash(day + 'T' + time);
      return r < busy * 0.4 ? 'full' : r < busy ? 'few' : 'open';
    }

    days.forEach(function (input) {
      if (input.value < todayISO) { input.disabled = true; input.parentNode.classList.add('is-past'); }
    });

    function renderTimes() {
      var day = chosen('day');
      var session = day ? SESSIONS[day] : '';
      if (day) slotsBox.removeAttribute('data-locked'); else slotsBox.setAttribute('data-locked', '');
      times.forEach(function (input) {
        var cell = input.parentNode, note = $('.slot__s', cell), state;
        if (input.value === '20:30') {
          cell.hidden = !session;
          input.disabled = !session;
          if (session) note.textContent = 'Low-tide session · low water ' + session;
        } else {
          state = !day ? 'idle' : (day === todayISO && input.value <= nowHM) ? 'past' : availability(day, input.value);
          cell.setAttribute('data-state', state);
          input.disabled = state === 'idle' || state === 'full' || state === 'past';
          note.textContent = state === 'few' ? 'few left' : state === 'full' ? 'full' : state === 'past' ? 'gone' : '';
        }
        if (input.disabled && input.checked) input.checked = false;
      });
      timeHint.textContent = day
        ? longDate(day) + ': entry every half hour, last entry 18:30.' + (session ? ' Low-tide session at 20:30.' : '')
        : 'Choose a day first. Entry is every half hour from 11:00; last entry 18:30.';
    }

    function renderSummary() {
      var day = chosen('day'), time = chosen('time'), party = chosen('party') || '1';
      summary.innerHTML = [
        day ? longDate(day) : '<span class="is-missing">choose a day</span>',
        time ? timeText(time) : '<span class="is-missing">choose a time</span>',
        people(party)
      ].join(' · ');
    }

    function setError(key, message) {
      var field = $('#field-' + key, form);
      var box = $('#' + key + '-error', form);
      if (message) {
        box.innerHTML = '<span class="vh">Error: </span>' + message;
        box.hidden = false;
      } else {
        box.textContent = '';
        box.hidden = true;
      }
      if (field) field.classList.toggle('has-error', !!message);
      if (key === 'email') {
        if (message) email.setAttribute('aria-invalid', 'true'); else email.removeAttribute('aria-invalid');
      }
      if (!message) {                                   // a fixed problem leaves the summary too
        var item = errorsBox.querySelector('[data-key="' + key + '"]');
        if (item) item.parentNode.removeChild(item);
      }
      if (!form.querySelector('.has-error')) errorsBox.hidden = true;
    }

    function validEmail(v) { return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v); }

    form.addEventListener('change', function (e) {
      var name = e.target.name;
      if (name === 'day') { renderTimes(); setError('day'); }
      if (name === 'day' || name === 'time') { if (chosen('time')) setError('time'); }
      renderSummary();
    });
    email.addEventListener('input', function () {
      if (email.getAttribute('aria-invalid') === 'true' && validEmail(email.value.trim())) setError('email');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var day = chosen('day'), time = chosen('time'), mail = email.value.trim();
      var problems = [];
      if (!day) problems.push(['day', 'Choose a day for your visit.', firstEnabled(days)]);
      if (!time) problems.push(['time', day ? 'Choose an entry time.' : 'Choose an entry time once you have picked a day.', day ? firstEnabled(times) : firstEnabled(days)]);
      if (!mail) problems.push(['email', 'Enter your email address so we can send your ticket.', email]);
      else if (!validEmail(mail)) problems.push(['email', 'Enter an email address like name@example.com.', email]);

      if (problems.length) {
        var list = $('.errors__list', errorsBox);
        list.innerHTML = '';
        problems.forEach(function (p) {
          var li = doc.createElement('li'), a = doc.createElement('a');
          li.setAttribute('data-key', p[0]);
          a.href = '#' + (p[2] ? p[2].id : 'booking');
          a.textContent = p[1];
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (p[2]) p[2].focus();
          });
          li.appendChild(a);
          list.appendChild(li);
        });
      }
      ['day', 'time', 'email'].forEach(function (key) {
        var hit = problems.filter(function (p) { return p[0] === key; })[0];
        setError(key, hit ? hit[1] : '');
      });
      if (problems.length) {
        errorsBox.hidden = false;
        errorsBox.focus();
        return;
      }
      confirm(day, time, chosen('party') || '1', mail);
    });

    function icsFile(day, time, party) {
      var d = day.replace(/-/g, ''), start = time.replace(':', '') + '00';
      var end = parseInt(time.slice(0, 2), 10) * 60 + parseInt(time.slice(3), 10) + 60;
      var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      // Lisbon keeps UTC (WET) from late October to late March, so these times are already UTC.
      return [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidewrack//Timed entry//EN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' + d + 'T' + start + '-' + Math.random().toString(36).slice(2, 10) + '@tidewrack.example',
        'DTSTAMP:' + stamp,
        'DTSTART:' + d + 'T' + start + 'Z',
        'DTEND:' + d + 'T' + pad(Math.floor(end / 60)) + pad(end % 60) + '00Z',
        'SUMMARY:Tidewrack · ' + (time === '20:30' ? 'low-tide session' : 'timed entry'),
        'LOCATION:Armazém 7\\, Cais do Sodré\\, Lisbon',
        'DESCRIPTION:Free timed entry for ' + people(party) + '. Step-free access\\; seating.',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
    }

    function confirm(day, time, party, mail) {
      $('[data-confirm-what]', confirmBox).textContent = longDate(day) + ' · ' + timeText(time) + ' · ' + people(party);
      $('[data-confirm-email]', confirmBox).textContent = mail;
      var ics = $('[data-ics]', confirmBox);
      if (ics && window.Blob && window.URL && URL.createObjectURL) {
        if (ics.href.indexOf('blob:') === 0) URL.revokeObjectURL(ics.href);
        ics.href = URL.createObjectURL(new Blob([icsFile(day, time, party)], { type: 'text/calendar;charset=utf-8' }));
      } else if (ics) {
        ics.hidden = true;
      }
      errorsBox.hidden = true;
      form.hidden = true;
      confirmBox.hidden = false;
      $('.confirm__title', confirmBox).focus();
    }

    $('[data-again]', confirmBox).addEventListener('click', function () {
      confirmBox.hidden = true;
      form.hidden = false;
      var target = form.querySelector('input[name="day"]:checked') || firstEnabled(days);
      if (target) target.focus();
    });

    // "Reserve" on a low-tide session: choose that evening for the visitor
    $$('[data-session]').forEach(function (link) {
      link.addEventListener('click', function () {
        var day = form.querySelector('input[name="day"][value="' + link.getAttribute('data-session') + '"]');
        if (!day || day.disabled) return;
        confirmBox.hidden = true;
        form.hidden = false;
        day.checked = true;
        renderTimes();
        var slot = form.querySelector('input[name="time"][value="20:30"]');
        if (slot && !slot.disabled) slot.checked = true;
        setError('day');
        setError('time');
        renderSummary();
      });
    });

    // Every link to the form lands keyboard and screen-reader users on its heading
    $$('a[href="#reserve"]').forEach(function (a) {
      a.addEventListener('click', function () {
        window.setTimeout(function () {
          try { heading.focus({ preventScroll: true }); } catch (err) { heading.focus(); }
        }, 0);
      });
    });

    renderTimes();
    renderSummary();
  }

  safe(initScore);
  safe(initSound);
  safe(initHeader);
  safe(initInView);
  safe(initBooking);
})();
