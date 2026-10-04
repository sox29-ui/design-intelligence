/* Tidewrack: main.js
   Vanilla JS, no dependencies. The page is complete without it; this layer adds
   the modelled tide, the score, the sound sketch, motion control and booking. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs, parent) {
    const el = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  const state = { playing: false };

  /* ------------------------------------------------------------------ Motion
     Off when the visitor prefers reduced motion; anyone can pause or resume it.
     CSS reads [data-motion]; every animation shares one play-state switch. */
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const motionOn = () => {
    const pref = store.get('tw-motion');
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return !reduceMQ.matches;
  };
  const motionBtn = $('#motion-toggle');
  function applyMotion() {
    const on = motionOn();
    root.setAttribute('data-motion', on ? 'on' : 'off');
    if (motionBtn) $('.motion-toggle__label', motionBtn).textContent = on ? 'Pause motion' : 'Play motion';
  }
  if (motionBtn) {
    motionBtn.addEventListener('click', () => {
      store.set('tw-motion', motionOn() ? 'off' : 'on');
      applyMotion();
    });
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', applyMotion);
  else if (reduceMQ.addListener) reduceMQ.addListener(applyMotion);
  applyMotion();

  /* -------------------------------------------------------------- Tide model
     A small harmonic prediction: six constituents with nodal corrections.
     Amplitudes and phases are illustrative, shaped on the Tagus at Lisbon.
     Good enough to write music with; not for navigation. */
  const Tide = (() => {
    const RAD = Math.PI / 180, Z0 = 2.2;
    const M2 = [1.18, 346.3], S2 = [0.41, 12.5], N2 = [0.25, 329.8];
    const K2 = [0.12, 9.3], K1 = [0.07, 13.6], O1 = [0.06, 273.7];
    function level(ms) {
      const T = (ms / 864e5 + 2440587.5 - 2451545) / 36525;   // Julian centuries since J2000
      const s = 218.3164477 + 481267.88123421 * T;            // Moon's mean longitude
      const h = 280.46646 + 36000.76983 * T;                  // Sun's mean longitude
      const p = 83.3532465 + 4069.0137287 * T;                // lunar perigee
      const N = (125.04452 - 1934.136261 * T) * RAD;          // Moon's ascending node
      const hours = ((ms / 36e5) % 24 + 24) % 24;
      const tau = 180 + 15 * hours;                           // hour angle of the mean Sun
      const cN = Math.cos(N), c2 = Math.cos(2 * N), c3 = Math.cos(3 * N);
      const sN = Math.sin(N), s2 = Math.sin(2 * N), s3 = Math.sin(3 * N);
      const fM2 = 1.0004 - 0.0373 * cN + 0.0002 * c2, uM2 = -2.14 * sN;
      const fK2 = 1.0241 + 0.2863 * cN + 0.0083 * c2 - 0.0015 * c3, uK2 = -17.74 * sN + 0.68 * s2 - 0.04 * s3;
      const fK1 = 1.006 + 0.115 * cN - 0.0088 * c2 + 0.0006 * c3, uK1 = -8.86 * sN + 0.68 * s2 - 0.07 * s3;
      const fO1 = 1.0089 + 0.1871 * cN - 0.0147 * c2 + 0.0014 * c3, uO1 = 10.8 * sN - 1.34 * s2 + 0.19 * s3;
      const term = (f, k, V, u) => f * k[0] * Math.cos((V + u - k[1]) * RAD);
      return Z0
        + term(fM2, M2, 2 * tau - 2 * s + 2 * h, uM2)
        + term(1, S2, 2 * tau, 0)
        + term(fM2, N2, 2 * tau - 3 * s + 2 * h + p, uM2)
        + term(fK2, K2, 2 * tau + 2 * h, uK2)
        + term(fK1, K1, tau + h - 90, uK1)
        + term(fO1, O1, tau - 2 * s + h + 90, uO1);
    }
    const rate = ms => (level(ms + 3e5) - level(ms - 3e5)) * 6;  // metres per hour
    function nextTurn(ms) {
      const rising = rate(ms) > 0;
      for (let t = ms + 6e4; t < ms + 8 * 36e5; t += 6e4) {
        if ((rate(t) > 0) !== rising) return { t, high: rising };
      }
      return null;
    }
    return { level, rate, nextTurn };
  })();

  /* ------------------------------------------------------------------- Time */
  const SIX = 36e4;                                        // six minutes, in ms
  const alignedNow = () => Math.floor(Date.now() / SIX) * SIX;
  const pad = n => String(n).padStart(2, '0');
  const toMin = v => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (e) {
    fmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function lisbon(ms) {
    const o = {};
    fmt.formatToParts(ms).forEach(p => { o[p.type] = p.value; });
    const hour = Number(o.hour) % 24;
    return { iso: `${o.year}-${o.month}-${o.day}`, hm: `${pad(hour)}:${o.minute}`, minutes: hour * 60 + Number(o.minute) };
  }

  /* --------------------------------------------------------------- Readings
     The mapping, shared by the picture and the sound:
     height -> pitch (stave position), speed -> density, slack water -> silence. */
  const FAST = 0.55;                                       // m/h counted as a fully running tide
  const SLACK = 0.12;                                      // below this share of FAST: silence
  const posFor = h => Math.max(-5, Math.min(13, Math.round(4 + (h - 2.2) * 3.6)));
  const trendOf = r => (Math.abs(r) < FAST * SLACK ? 'slack' : (r < 0 ? 'falling' : 'rising'));
  function readings(fromMs, count) {
    const anchor = Math.floor(fromMs / 432e5) * 432e5;     // a 12-hour grid keeps the rhythm stable
    const out = [];
    let acc = 0.5;
    for (let t = anchor, end = fromMs + count * SIX; t < end; t += SIX) {
      const h = Tide.level(t), r = Tide.rate(t);
      const d = Math.min(1, Math.abs(r) / FAST);
      const slack = d < SLACK;
      let sound = false;
      if (slack) acc = 0.5;
      else { acc += d; if (acc >= 1) { acc -= 1; sound = true; } }
      if (t >= fromMs) out.push({ t, h, r, d, slack, sound, pos: posFor(h) });
    }
    return out;
  }

  function fermata(parent, x, y, w, cls) {
    const g = svgEl('g', { class: cls || 'fermata' }, parent);
    svgEl('path', { d: `M${(x - w).toFixed(2)} ${y.toFixed(2)}a${w} ${(w * 0.9).toFixed(2)} 0 0 1 ${2 * w} 0` }, g);
    svgEl('circle', { cx: x.toFixed(2), cy: (y - w * 0.22).toFixed(2), r: Math.max(1.3, w * 0.18).toFixed(2) }, g);
    return g;
  }

  /* --------------------------------------------------------------- Readouts */
  function updateReadouts() {
    const now = Date.now(), h = Tide.level(now), r = Tide.rate(now), trend = trendOf(r);
    const height = `${h.toFixed(2)} m`;
    const heroNow = $('#hero-now'), heroLabel = $('#hero-now-label');
    if (heroNow) {
      if (heroLabel) heroLabel.textContent = 'Now in the Tagus · modelled';
      heroNow.textContent = trend === 'slack' ? `${height}, slack water` : `${height} and ${trend}`;
    }
    const ro = $('#score-readout');
    if (ro) {
      const L = lisbon(now), turn = Tide.nextTurn(now);
      ro.innerHTML = `<span><strong>${L.hm}</strong> in Lisbon</span>`
        + `<span>reading <strong>${Math.floor(L.minutes / 6) + 1}</strong> of 240</span>`
        + `<span><strong class="is-amber">${height}</strong> ${trend === 'slack' ? 'slack water' : trend}</span>`
        + (turn ? `<span>${turn.high ? 'high' : 'low'} water about <strong>${lisbon(turn.t).hm}</strong></span>` : '');
    }
    // The wave of sound through the speakers follows the water: in on the flood, out on the ebb.
    const plan = $('.plan__svg');
    if (plan) plan.style.setProperty('--dir', r < 0 ? 'reverse' : 'normal');
  }

  /* ------------------------------------------------------------------ Score
     Twelve hours of readings engraved on a stave. Systems wrap like a printed
     score: one or two lines on a desk, three or four on a phone. */
  const Score = (() => {
    const host = $('#score-systems');
    const PAST = 90, FUTURE = 30, N = PAST + FUTURE;
    let key = '', data = [], notes = [], systems = [], geo = null, lit = -1;

    function render(force) {
      if (!host || state.playing) return;
      const W = Math.floor(host.clientWidth);
      const now = alignedNow();
      const k = `${W}|${now}`;
      if (!W || (!force && k === key)) return;
      key = k;
      data = readings(now - PAST * SIX, N);
      const compact = W < 560;
      const gap = compact ? 7 : 8;
      const padX = 2;
      let per = Math.max(12, Math.floor((W - padX * 2) / (compact ? 8.4 : 12)));
      const nSys = Math.ceil(N / per);
      per = Math.ceil(N / nSys);
      const sp = (W - padX * 2) / per;
      const rx = Math.min(gap * 0.64, sp * 0.45), ry = rx * 0.74;
      const top = 34, yb = top + 4 * gap, H = yb + 24;
      const yOf = p => yb - p * gap / 2;

      host.textContent = '';
      notes = new Array(N).fill(null);
      systems = [];
      lit = -1;
      for (let s = 0; s < nSys; s++) {
        const i0 = s * per, i1 = Math.min(N, i0 + per);
        const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true', focusable: 'false' }, host);
        const staff = svgEl('g', { class: 'sys__staff' }, svg);
        for (let l = 0; l < 5; l++) {
          const y = top + l * gap + 0.5;
          svgEl('line', { x1: 0, x2: W, y1: y, y2: y }, staff);
        }
        let nowX = -1;
        for (let i = i0; i < i1; i++) if (data[i].t === now) nowX = padX + (i - i0 + 0.5) * sp;

        // Like a bar number: the time of the first reading on each system.
        const label = svgEl('text', { class: 'sys__label', x: padX, y: 11 }, svg);
        label.textContent = lisbon(data[i0].t).hm;
        if (nowX >= 0 && nowX < 64) label.setAttribute('visibility', 'hidden');

        // Slack water: a fermata over the silence.
        let run = -1;
        for (let i = i0; i <= i1; i++) {
          const slack = i < i1 && data[i].slack;
          if (slack && run < 0) run = i;
          else if (!slack && run >= 0) {
            if (i - run >= 2) fermata(svg, padX + ((run + i - 1) / 2 - i0 + 0.5) * sp, top - 9, Math.max(5, Math.min(7, gap)));
            run = -1;
          }
        }

        if (nowX >= 0) {
          svgEl('line', { class: 'nowmark', x1: nowX, x2: nowX, y1: top - 16, y2: yb + 10 }, svg);
          const anchor = nowX < 24 ? 'start' : (nowX > W - 24 ? 'end' : 'middle');
          svgEl('text', { class: 'nowlabel', x: nowX, y: 11, 'text-anchor': anchor }, svg).textContent = 'NOW';
        }
        const sweep = svgEl('line', { class: 'sweep', x1: 0, x2: 0, y1: top - 12, y2: yb + 12 }, svg);
        systems.push({ i0, i1, sweep });

        for (let i = i0; i < i1; i++) {
          const r = data[i], isNow = r.t === now;
          if (!r.sound && !isNow) continue;
          const x = +(padX + (i - i0 + 0.5) * sp).toFixed(2), y = yOf(r.pos);
          for (let lp = 10; lp <= r.pos; lp += 2) svgEl('line', { class: 'sys__ledger', x1: x - rx - 3, x2: x + rx + 3, y1: yOf(lp), y2: yOf(lp) }, svg);
          for (let lp = -2; lp >= r.pos; lp -= 2) svgEl('line', { class: 'sys__ledger', x1: x - rx - 3, x2: x + rx + 3, y1: yOf(lp), y2: yOf(lp) }, svg);
          const cls = isNow ? 'note note--now' : (r.t < now ? 'note' : 'note note--future');
          notes[i] = svgEl('ellipse', { class: cls, cx: x, cy: y, rx: rx.toFixed(2), ry: ry.toFixed(2), transform: `rotate(-20 ${x} ${y})` }, svg);
          if (isNow) svgEl('circle', { class: 'ripple', cx: x, cy: y, r: (rx * 1.5).toFixed(2) }, svg);
        }
      }
      geo = { padX, sp };
      const cur = data[PAST], trend = trendOf(cur.r);
      host.setAttribute('aria-label', `Tide score: twelve hours of modelled readings drawn as notes on a stave, nine hours past and three to come. The water is at ${cur.h.toFixed(2)} metres and ${trend === 'slack' ? 'at slack water' : trend}.`);
    }

    function highlight(i) {
      if (lit >= 0 && notes[lit]) notes[lit].classList.remove('is-on');
      lit = i;
      if (notes[i]) notes[i].classList.add('is-on');
      systems.forEach(s => {
        const inside = i >= s.i0 && i < s.i1;
        s.sweep.classList.toggle('is-on', inside);
        if (inside) {
          const x = (geo.padX + (i - s.i0 + 0.5) * geo.sp).toFixed(2);
          s.sweep.setAttribute('x1', x);
          s.sweep.setAttribute('x2', x);
        }
      });
    }
    function clear() {
      if (lit >= 0 && notes[lit]) notes[lit].classList.remove('is-on');
      lit = -1;
      systems.forEach(s => s.sweep.classList.remove('is-on'));
    }
    return { render, highlight, clear, data: () => data, host };
  })();

  /* ------------------------------------------------------------ Hero ghost
     On wide screens the stave behind the title carries on: the reading being
     taken now (amber), then the next ones, hollow, fading as they go. */
  function renderGhost() {
    const svg = $('.title__ghost');
    if (!svg) return;
    svg.textContent = '';
    const lines = $$('.stave i');
    const box = svg.getBoundingClientRect();
    if (lines.length !== 5 || box.width < 48) return;
    const yTop = lines[0].getBoundingClientRect().top - box.top + 0.5;
    const yBot = lines[4].getBoundingClientRect().top - box.top + 0.5;
    const gap = (yBot - yTop) / 4;
    if (gap < 5) return;
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
    const reach = box.width + Math.max(0, root.clientWidth - box.right);
    const ry = gap * 0.5, rx = ry * 1.36, sp = gap * 2.2;
    const count = Math.max(0, Math.floor((reach - rx * 3) / sp) + 1);
    if (!count) return;
    const data = readings(alignedNow(), count);
    const yOf = p => yBot - p * gap / 2;
    data.forEach((r, i) => {
      const x = rx * 1.6 + i * sp, y = yOf(r.pos);
      const fade = 1 - i / (count + 0.5);
      if (i > 0 && r.slack) {
        fermata(svg, x, yTop - gap * 0.9, gap * 0.6, 'ghost-fermata').setAttribute('opacity', (0.8 * fade).toFixed(2));
        return;
      }
      if (i > 0 && !r.sound) return;
      const g = svgEl('g', { opacity: i === 0 ? 1 : (0.85 * fade).toFixed(2) }, svg);
      for (let lp = 10; lp <= r.pos; lp += 2) svgEl('line', { class: 'ghost-ledger', x1: x - rx * 1.5, x2: x + rx * 1.5, y1: yOf(lp), y2: yOf(lp) }, g);
      for (let lp = -2; lp >= r.pos; lp -= 2) svgEl('line', { class: 'ghost-ledger', x1: x - rx * 1.5, x2: x + rx * 1.5, y1: yOf(lp), y2: yOf(lp) }, g);
      svgEl('ellipse', { class: i === 0 ? 'ghost ghost--now' : 'ghost', cx: x.toFixed(2), cy: y.toFixed(2), rx: rx.toFixed(2), ry: ry.toFixed(2), transform: `rotate(-20 ${x.toFixed(2)} ${y.toFixed(2)})` }, g);
      if (i === 0) svgEl('circle', { class: 'ripple ripple--sm', cx: x.toFixed(2), cy: y.toFixed(2), r: (rx * 1.25).toFixed(2) }, g);
    });
  }

  /* ---------------------------------------------------------- Sound sketch
     Twelve hours in one minute, synthesised in the browser with the same rules
     as the score: no audio files are downloaded. Starts only on request. */
  const Sketch = (() => {
    const btn = $('#listen');
    const status = $('#listen-status');
    if (!btn) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    const note = $('#listen-note');
    if (!AC) {
      btn.disabled = true;
      if (note) note.textContent = 'This browser cannot play the sound sketch.';
      return null;
    }
    const STEP = 0.5;                    // seconds per reading
    const label = $('.listen__label', btn);
    let ctx = null, bus = null, data = [], startAt = 0, idx = 0, shown = -1, timer = 0, raf = 0;

    function impulse(seconds) {
      // A long, dark hall: decaying noise that loses its treble as it fades.
      const rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const ch = buf.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len;
          lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.5 * k);
          ch[i] = lp * Math.pow(1 - k, 2.3);
        }
      }
      return buf;
    }
    function whiteNoise(seconds) {
      const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      return buf;
    }
    function build() {
      const t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.exponentialRampToValueAtTime(1.25, t + 1.2);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3;
      comp.attack.value = 0.01; comp.release.value = 0.4;
      master.connect(comp); comp.connect(ctx.destination);
      const verb = ctx.createConvolver();
      verb.buffer = impulse(3.8);
      const wet = ctx.createGain(); wet.gain.value = 0.6;
      verb.connect(wet); wet.connect(master);
      const dry = ctx.createGain(); dry.gain.value = 0.5;
      dry.connect(master);

      // The estuary outside: filtered noise that swells and recedes.
      const src = ctx.createBufferSource(); src.buffer = whiteNoise(3); src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.4;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
      const wash = ctx.createGain(); wash.gain.value = 0.3;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const depth = ctx.createGain(); depth.gain.value = 0.22;
      lfo.connect(depth); depth.connect(wash.gain);
      src.connect(lp); lp.connect(hp); hp.connect(wash);
      wash.connect(dry); wash.connect(verb);

      // The room itself: a low drone on the 2nd and 3rd harmonics of A.
      const drone = ctx.createGain();
      drone.gain.setValueAtTime(0, t);
      drone.gain.linearRampToValueAtTime(0.02, t + 4);
      const d1 = ctx.createOscillator(); d1.frequency.value = 110;
      const d2 = ctx.createOscillator(); d2.frequency.value = 165; d2.detune.value = 4;
      const d2g = ctx.createGain(); d2g.gain.value = 0.55;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 600;
      d1.connect(drone); d2.connect(d2g); d2g.connect(drone);
      drone.connect(dlp); dlp.connect(dry); dlp.connect(verb);

      [src, lfo, d1, d2].forEach(n => n.start(t));
      return { master, dry, verb, drone, sources: [src, lfo, d1, d2] };
    }
    // Stave position -> a partial of the harmonic series on A (55 Hz).
    const freqFor = pos => 55 * Math.max(3, Math.min(19, 6 + pos));
    function voice(when, freq, pan, vel) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sine'; o1.frequency.value = freq;
      o2.type = 'sine'; o2.frequency.value = freq * 2.756;   // a faint inharmonic partial: glass, not piano
      const g1 = ctx.createGain(), g2 = ctx.createGain();
      const peak = 0.12 * vel;
      g1.gain.setValueAtTime(0.0001, when);
      g1.gain.exponentialRampToValueAtTime(peak, when + 0.025);
      g1.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
      g2.gain.setValueAtTime(0.0001, when);
      g2.gain.exponentialRampToValueAtTime(peak * 0.22, when + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
      let out;
      if (ctx.createStereoPanner) { out = ctx.createStereoPanner(); out.pan.value = pan; }
      else out = ctx.createGain();
      o1.connect(g1); o2.connect(g2); g1.connect(out); g2.connect(out);
      out.connect(bus.dry); out.connect(bus.verb);
      o1.start(when); o2.start(when);
      o1.stop(when + 3.3); o2.stop(when + 0.8);
    }
    function schedule() {
      const horizon = ctx.currentTime + 0.3;
      while (idx < data.length && startAt + idx * STEP < horizon) {
        const r = data[idx], when = startAt + idx * STEP;
        if (r.sound) {
          const pan = Math.sin(idx * 2.399963) * 0.85;          // scattered, as across forty speakers
          voice(when, freqFor(r.pos), pan, 0.55 + 0.45 * r.d);
          if (r.d > 0.8) voice(when + STEP / 2, freqFor(r.pos + 2), -pan * 0.7, 0.32);
        }
        bus.drone.gain.setTargetAtTime(0.012 + 0.005 * r.h, when, 1.2);  // the room swells with the water
        idx++;
      }
      if (idx >= data.length && ctx.currentTime > startAt + data.length * STEP) stop('finished');
    }
    function frame() {
      const i = Math.floor((ctx.currentTime - startAt) / STEP);
      if (i !== shown && i >= 0 && i < data.length) { shown = i; Score.highlight(i); }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
      try {
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) {
        if (status) status.textContent = 'Sound could not start in this browser.';
        return;
      }
      Score.render(true);                // a fresh window, then hold it still while it plays
      data = Score.data().slice();
      state.playing = true;
      bus = build();
      startAt = ctx.currentTime + 0.6;
      idx = 0; shown = -1;
      schedule();
      timer = setInterval(schedule, 60);
      raf = requestAnimationFrame(frame);
      btn.setAttribute('data-playing', 'true');
      label.textContent = 'Stop';
      if (status) status.textContent = 'Playing a one-minute sketch: twelve hours of the tide.';
    }
    function stop(reason) {
      if (!state.playing) return;
      state.playing = false;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      const t = ctx.currentTime, b = bus, tail = reason === 'finished' ? 3.5 : 0.8;
      b.master.gain.cancelScheduledValues(t);
      b.master.gain.setValueAtTime(Math.max(0.0001, b.master.gain.value), t);
      b.master.gain.exponentialRampToValueAtTime(0.0001, t + tail);
      setTimeout(() => {
        b.sources.forEach(s => { try { s.stop(); } catch (e) { /* already stopped */ } });
        b.master.disconnect();
      }, tail * 1000 + 200);
      Score.clear();
      btn.removeAttribute('data-playing');
      label.textContent = reason === 'finished' ? 'Listen again' : 'Listen';
      if (status) status.textContent = reason === 'finished' ? 'The sketch has finished.' : 'Sound stopped.';
      Score.render(true);
    }
    btn.addEventListener('click', () => (state.playing ? stop('user') : start()));
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop('user'); });
    return { stop };
  })();

  /* ---------------------------------------------------------------- Booking */
  (function booking() {
    const form = $('#booking');
    if (!form) return;
    form.setAttribute('novalidate', '');
    const ticket = $('#ticket'), summary = $('#summary'), status = $('#booking-status');
    const submit = $('button[type="submit"]', form);
    const sessionSlot = $('#slot-session'), sessionInput = sessionSlot ? $('input', sessionSlot) : null;
    const email = $('#email');
    const dates = $$('input[name="date"]', form), times = $$('input[name="time"]', form);
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const val = name => { const el = form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const parts = iso => { const d = new Date(`${iso}T12:00:00Z`); return [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth()]; };
    const dayLong = iso => { const [w, n, m] = parts(iso); return `${DAYS[w]} ${n} ${MONTHS[m]}`; };
    const dayShort = iso => { const [w, n, m] = parts(iso); return `${DAYS[w].slice(0, 3)} ${n} ${MONTHS[m].slice(0, 3)}`; };
    const people = n => `${n} ${n === '1' ? 'person' : 'people'}`;

    function syncAvailability() {
      const L = lisbon(Date.now());
      dates.forEach(i => {
        i.disabled = i.value < L.iso;
        if (i.disabled && i.checked) i.checked = false;
      });
      const d = val('date');
      const chosen = d ? form.querySelector(`input[name="date"][value="${d}"]`) : null;
      const isSession = !!(chosen && chosen.dataset.session);
      if (sessionSlot) {
        sessionSlot.hidden = !isSession;
        sessionInput.disabled = !isSession || (d === L.iso && toMin('20:30') <= L.minutes);
        if (sessionInput.disabled && sessionInput.checked) sessionInput.checked = false;
      }
      times.forEach(i => {
        if (i === sessionInput) return;
        i.disabled = d === L.iso && toMin(i.value) <= L.minutes;
        if (i.disabled && i.checked) i.checked = false;
      });
      if (dates.every(i => i.disabled)) {
        summary.textContent = 'Tidewrack has closed. Thank you for listening.';
        submit.disabled = true;
      }
    }
    function updateSummary() {
      if (submit.disabled) return;
      const d = val('date'), t = val('time'), p = val('party') || '1';
      if (!d && !t) { summary.textContent = 'Choose a day and a time.'; return; }
      summary.textContent = [
        d ? dayShort(d) : 'Choose a day',
        t ? (t === '20:30' ? '20:30 low-tide session' : t) : 'choose a time',
        people(p),
      ].join(' · ');
    }

    const errs = {
      date: { box: $('#date-err'), field: $('#f-date'), hint: 'date-hint', first: () => dates.find(i => !i.disabled) },
      time: { box: $('#time-err'), field: $('#f-time'), hint: '', first: () => times.find(i => !i.disabled && !i.closest('[hidden]')) },
      email: { box: $('#email-err'), field: email, hint: '', first: () => email },
    };
    function setErr(name, msg) {
      const e = errs[name];
      e.box.textContent = msg || '';
      e.box.hidden = !msg;
      const ids = [e.hint, msg ? e.box.id : ''].filter(Boolean).join(' ');
      if (ids) e.field.setAttribute('aria-describedby', ids); else e.field.removeAttribute('aria-describedby');
      if (name === 'email') {
        if (msg) email.setAttribute('aria-invalid', 'true'); else email.removeAttribute('aria-invalid');
      }
    }
    function validate() {
      const out = [];
      if (!val('date')) out.push(['date', 'Choose a day for your visit.']);
      if (!val('time')) out.push(['time', 'Choose an entry time.']);
      const v = email.value.trim();
      if (!v) out.push(['email', 'Enter your email address so we can send your ticket.']);
      else if (!EMAIL.test(v)) out.push(['email', 'Enter an email address in the format name@example.com.']);
      ['date', 'time', 'email'].forEach(n => {
        const hit = out.find(o => o[0] === n);
        setErr(n, hit ? hit[1] : '');
      });
      return out;
    }

    let icsUrl = '';
    function ics(d, t, p) {
      const ymd = d.replace(/-/g, ''), start = toMin(t), end = start + 60;
      const hhmmss = m => `${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      // Lisbon keeps UTC+0 (WET) for the whole run, so these UTC times are exact.
      const body = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidewrack//Timed entry//EN', 'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${ymd}-${hhmmss(start)}-${Math.random().toString(36).slice(2, 10)}@tidewrack.example`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${ymd}T${hhmmss(start)}Z`,
        `DTEND:${ymd}T${hhmmss(end)}Z`,
        `SUMMARY:Tidewrack${t === '20:30' ? ': low-tide session' : ': timed entry'}`,
        'LOCATION:Armazém 7\\, Cais do Sodré\\, Lisbon',
        `DESCRIPTION:${people(p)}. Free timed entry.`,
        'END:VEVENT', 'END:VCALENDAR',
      ].join('\r\n');
      if (icsUrl) URL.revokeObjectURL(icsUrl);
      icsUrl = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
      return icsUrl;
    }
    function showTicket() {
      const d = val('date'), t = val('time'), p = val('party') || '1';
      $('#t-count').textContent = p;
      $('#t-day').textContent = `${dayLong(d)} 2026`;
      $('#t-time').textContent = t === '20:30' ? '20:30, low-tide session' : t;
      $('#t-party').textContent = people(p);
      $('#t-email').textContent = email.value.trim();
      $('#t-ics').href = ics(d, t, p);
      form.hidden = true;
      ticket.hidden = false;
      $('#ticket-h').focus();
    }

    form.addEventListener('change', e => {
      const name = e.target.name;
      if (name === 'date') { syncAvailability(); if (val('date')) setErr('date', ''); }
      if (name === 'date' || name === 'time') { if (val('time')) setErr('time', ''); }
      updateSummary();
    });
    email.addEventListener('input', () => {
      if (!errs.email.box.hidden && EMAIL.test(email.value.trim())) setErr('email', '');
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      syncAvailability();
      const out = validate();
      if (out.length) {
        const target = errs[out[0][0]].first();
        if (target) target.focus();
        status.textContent = out.map(o => o[1]).join(' ');
        return;
      }
      status.textContent = '';
      showTicket();
    });
    $('#t-change').addEventListener('click', () => {
      ticket.hidden = true;
      form.hidden = false;
      (form.querySelector('input[name="date"]:checked') || dates.find(i => !i.disabled) || email).focus();
    });

    // "Reserve" on a low-tide session: pick that evening and the 20:30 slot.
    $$('.session__cta').forEach(a => a.addEventListener('click', e => {
      const input = form.querySelector(`input[name="date"][value="${a.dataset.date}"]`);
      if (!input || input.disabled) return;
      e.preventDefault();
      ticket.hidden = true;
      form.hidden = false;
      input.checked = true;
      syncAvailability();
      if (sessionInput && !sessionInput.disabled) sessionInput.checked = true;
      setErr('date', '');
      setErr('time', '');
      updateSummary();
      const h = $('#reserve-h');
      h.focus({ preventScroll: true });
      h.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
      if (window.history && history.replaceState) history.replaceState(null, '', '#reserve');
      status.textContent = `${dayLong(input.value)}, 20:30 low-tide session selected. Choose how many people, then add your email.`;
    }));

    syncAvailability();
    updateSummary();
  })();

  /* ------------------------------------------- Mobile dock & sticky header
     The dock appears once the hero button has scrolled away and steps aside
     when the booking form arrives, so it never covers the form itself. */
  (function chrome() {
    const dock = $('#dock'), heroCta = $('#hero-cta'), reserve = $('#reserve'), header = $('#site-header');
    let ticking = false;
    function update() {
      ticking = false;
      if (header) header.classList.toggle('is-stuck', window.scrollY > 4);
      if (!dock || !heroCta || !reserve) return;
      const passed = heroCta.getBoundingClientRect().bottom < 0;
      const reached = reserve.getBoundingClientRect().top < window.innerHeight - 40;
      dock.classList.toggle('is-on', passed && !reached);
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ------------------------------------------------------------------ Start */
  updateReadouts();
  Score.render(true);
  renderGhost();
  if ('ResizeObserver' in window) {
    // Width changes (rotation, resizing, the web font arriving) redraw the notes.
    if (Score.host) new ResizeObserver(() => Score.render(false)).observe(Score.host);
    const ghost = $('.title__ghost');
    if (ghost) new ResizeObserver(renderGhost).observe(ghost);
  } else {
    window.addEventListener('resize', () => { Score.render(false); renderGhost(); });
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', renderGhost);
  // A new reading every six minutes; check twice a minute.
  setInterval(() => {
    updateReadouts();
    Score.render(false);
    renderGhost();
  }, 30000);
})();
