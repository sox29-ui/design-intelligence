/* Tidewrack — progressive enhancement.
   Without this file the page is complete: static content, plain #reserve links.
   With it: the moving tide score, an optional sound sketch, the floating ticket
   button and an interactive reservation form. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } },
  };
  const TAU = Math.PI * 2;
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

  /* ================= Motion preference ================= */
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionOn = store.get('tw-motion') ? store.get('tw-motion') === 'on' : !reduceMQ.matches;
  const motionButtons = $$('[data-motion-toggle]');
  let score = null;

  function setMotion(on, remember) {
    motionOn = on;
    root.dataset.motion = on ? 'on' : 'off';
    motionButtons.forEach((b) => {
      b.dataset.state = on ? 'playing' : 'paused';
      $('[data-label]', b).textContent = on ? 'Pause motion' : 'Play motion';
    });
    if (remember) store.set('tw-motion', on ? 'on' : 'off');
    if (score) score.sync();
  }
  const onReduceChange = (e) => { if (!store.get('tw-motion')) setMotion(!e.matches, false); };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);

  /* ================= Tide model ================= */
  // A plausible semi-diurnal estuary tide in metres, from a few harmonic
  // constituents. It drives the sketch on this page; it is not a forecast.
  const CONSTITUENTS = [
    // amplitude (m), period (h), phase (rad)
    [1.16, 12.4206, 0.0],  // M2  principal lunar
    [0.40, 12.0, 0.35],    // S2  principal solar (springs and neaps)
    [0.10, 6.2103, 1.2],   // M4  shallow-water overtide: the estuary's lopsided rise and fall
    [0.08, 23.9345, 2.3],  // K1
    [0.06, 25.8193, 0.8],  // O1
  ];
  const MEAN = 2.2, H_MIN = 0.4, H_MAX = 4.0;
  const STEP = 6;               // minutes between gauge readings
  const SEC_PER_READING = 0.8;  // the sketch plays one reading every 0.8 s
  const tide = (min) => {
    let h = MEAN;
    for (let k = 0; k < CONSTITUENTS.length; k++) {
      const c = CONSTITUENTS[k];
      h += c[0] * Math.cos((TAU * min) / (c[1] * 60) + c[2]);
    }
    return h;
  };
  const rateAt = (min) => (tide(min + 3) - tide(min - 3)) / 6; // metres per minute
  const RATE_MAX = (() => {
    let m = 0;
    for (let t = 0; t < 21600; t += STEP) m = Math.max(m, Math.abs(rateAt(t)));
    return m * 0.92;
  })();
  // staff position: 0 = bottom line, 8 = top line, -2 and 10 = first ledger lines
  const staffPos = (h) => -2 + ((h - H_MIN) / (H_MAX - H_MIN)) * 12;

  // One reading becomes notes: height -> pitch, speed -> density, slack water -> silence.
  function reading(i) {
    const t = i * STEP;
    const h = tide(t) + (hash(i) - 0.5) * 0.05;
    const rate = rateAt(t);
    const d = Math.min(1, Math.abs(rate) / RATE_MAX);
    let n = d < 0.24 ? 0 : d < 0.58 ? 1 : d < 0.86 ? 2 : 3;
    if (n > 1 && hash(i * 1.7 + 4.1) > 0.55 + d * 0.4) n -= 1; // let the texture breathe
    const p = Math.max(-2, Math.min(10, Math.round(staffPos(h))));
    const dir = p >= 4 ? -2 : 2; // chords stack toward the middle of the staff
    const notes = [];
    for (let k = 0; k < n; k++) notes.push(p + dir * k);
    return { i, t, h, rate, d, notes };
  }

  // Open the sketch mid-flood: the last low water's rest behind, the notes thickening toward now.
  function startMinutes() {
    let best = 0, low = Infinity;
    for (let t = 2000; t < 2760; t++) { const h = tide(t); if (h < low) { low = h; best = t; } }
    return best + 150;
  }

  /* ================= Sound sketch (Web Audio, nothing to download) ================= */
  const F0 = 41.2; // E1: notes are its natural harmonics 6–18, slightly "out of tune" by design

  class Sketch {
    constructor() { this.ctx = null; this.playing = false; this.sleepTimer = 0; }
    static get supported() { return !!(window.AudioContext || window.webkitAudioContext); }

    setup() {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      // notes go dry + through a long generated reverb: a large, hard room
      this.bus = ctx.createGain();
      const dry = ctx.createGain(); dry.gain.value = 0.5;
      const wet = ctx.createGain(); wet.gain.value = 0.65;
      const verb = ctx.createConvolver();
      verb.buffer = this.impulse(4.2, 2.6);
      this.bus.connect(dry); dry.connect(this.master);
      this.bus.connect(verb); verb.connect(wet); wet.connect(this.master);

      // the water itself: low filtered noise that swells with the current and vanishes at slack
      const noise = ctx.createBufferSource();
      noise.buffer = this.brown(4);
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      this.bed = ctx.createGain();
      this.bed.gain.value = 0;
      noise.connect(lp); lp.connect(this.bed); this.bed.connect(this.master);
      noise.start();
    }

    impulse(seconds, decay) {
      const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    brown(seconds) {
      const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      return buf;
    }

    start() {
      if (!this.ctx) this.setup();
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS only */ }
      clearTimeout(this.sleepTimer);
      const resumed = this.ctx.resume();
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.9, t + 1.5);
      this.playing = true;
      return resumed;
    }

    stop() {
      if (!this.ctx || !this.playing) return;
      this.playing = false;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.6);
      this.bed.gain.setTargetAtTime(0, t, 0.2);
      this.sleepTimer = setTimeout(() => { if (!this.playing) this.ctx.suspend(); }, 900);
    }

    play(r) {
      if (!this.playing) return;
      const ctx = this.ctx, t0 = ctx.currentTime + 0.04;
      this.bed.gain.setTargetAtTime(0.06 * r.d * r.d, t0, 0.9);
      const level = 0.12 / Math.sqrt(Math.max(1, r.notes.length));
      r.notes.forEach((p, k) => {
        const when = t0 + hash(r.i * 3.1 + k) * 0.22 + k * 0.07;
        const pan = (hash(r.i * 5.3 + k * 2.2) - 0.5) * 1.6;
        this.voice(F0 * (8 + p), when, level, pan);
      });
    }

    voice(freq, when, level, pan) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(level, when + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
      osc.connect(env);
      if (ctx.createStereoPanner) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = pan;
        env.connect(sp); sp.connect(this.bus);
      } else {
        env.connect(this.bus);
      }
      osc.start(when);
      osc.stop(when + 2.7);
    }
  }
  const sound = new Sketch();

  /* ================= The score (canvas) ================= */
  class TideScore {
    constructor(stage) {
      this.stage = stage;
      this.canvas = $('canvas', stage);
      this.ctx = this.canvas.getContext('2d');
      this.readout = $('[data-readout]', stage);
      this.minutes = startMinutes();
      this.index = Math.floor(this.minutes / STEP);
      this.visible = true;
      this.running = false;
      this.lastFrame = 0;
      this.lastDraw = 0;
      this.onReading = null;
      this.tick = this.tick.bind(this);

      const cs = getComputedStyle(root);
      this.colour = {
        text: cs.getPropertyValue('--text').trim() || '#e9e4d8',
        accent: cs.getPropertyValue('--accent').trim() || '#f0a54a',
      };

      stage.classList.add('is-live');
      this.resize();
      this.showReading(reading(this.index));
      this.draw();

      if ('ResizeObserver' in window) {
        new ResizeObserver(() => { this.resize(); this.draw(); }).observe(stage);
      } else {
        window.addEventListener('resize', () => { this.resize(); this.draw(); });
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          this.visible = entries[entries.length - 1].isIntersecting;
          this.sync();
        }).observe(stage);
      }
      document.addEventListener('visibilitychange', () => this.sync());
      this.sync();
    }

    resize() {
      const box = this.stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = box.width;
      this.H = box.height;
      this.dpr = dpr;
      this.canvas.width = Math.round(box.width * dpr);
      this.canvas.height = Math.round(box.height * dpr);
      const narrow = this.W < 600;
      const s = Math.max(13, Math.min(24, this.H * 0.085)); // staff space
      this.L = {
        s,
        top: Math.round(this.H / 2 - 1.5 * s),
        px: Math.round(this.W * (narrow ? 0.7 : 0.64)),
        ppm: (narrow ? 7.5 : Math.max(8, Math.min(10.5, this.W / 140))) / STEP,
        rx: narrow ? 3.1 : 3.8,
        ry: narrow ? 2.3 : 2.75,
      };
      this.stage.style.setProperty('--px', this.L.px + 'px');
    }

    yOf(p) { return this.L.top + 4 * this.L.s - p * (this.L.s / 2); }

    sync() {
      const want = !document.hidden && ((motionOn && this.visible) || sound.playing);
      if (want && !this.running) {
        this.running = true;
        this.lastFrame = 0;
        this.raf = requestAnimationFrame(this.tick);
      } else if (!want && this.running) {
        this.running = false;
        cancelAnimationFrame(this.raf);
      }
    }

    tick(ts) {
      if (!this.running) return;
      const dt = this.lastFrame ? Math.min(ts - this.lastFrame, 100) : 0;
      this.lastFrame = ts;
      this.minutes += (dt / 1000) * (STEP / SEC_PER_READING);
      const idx = Math.floor(this.minutes / STEP);
      while (this.index < idx) {
        this.index += 1;
        const r = reading(this.index);
        if (motionOn) this.showReading(r);
        if (this.onReading) this.onReading(r);
      }
      if (motionOn && this.visible && ts - this.lastDraw > 30) { // ~30 fps is plenty for a tide
        this.draw();
        this.lastDraw = ts;
      }
      this.raf = requestAnimationFrame(this.tick);
    }

    showReading(r) {
      const slack = Math.abs(r.rate) < RATE_MAX * 0.14;
      const word = slack ? 'slack water' : r.rate > 0 ? 'rising' : 'falling';
      const arrow = slack ? '' : r.rate > 0 ? ' ↑' : ' ↓';
      this.readout.innerHTML = `${r.h.toFixed(2)} m${arrow}<small>${word}</small>`;
    }

    draw() {
      const { ctx, W, H, dpr, L, colour } = this;
      if (!ctx || !W || !H) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const now = this.minutes;
      const X = (t) => L.px + (t - now) * L.ppm;
      const tL = now - L.px / L.ppm - STEP;
      const tR = now + (W - L.px) / L.ppm + STEP;
      const top = L.top, bottom = L.top + 4 * L.s;
      const yH = (h) => this.yOf(staffPos(h));

      // staff
      ctx.strokeStyle = colour.text;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.17;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const y = Math.round(top + k * L.s) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      }
      ctx.stroke();

      // bar lines: one bar per hour, ten readings to the bar
      for (let t = Math.ceil(tL / 60) * 60; t <= tR; t += 60) {
        const bx = Math.round(X(t)) + 0.5;
        ctx.globalAlpha = t <= now ? 0.24 : 0.1;
        ctx.beginPath();
        ctx.moveTo(bx, Math.round(top) + 0.5);
        ctx.lineTo(bx, Math.round(bottom) + 0.5);
        ctx.stroke();
      }

      // the tide line: recorded (solid) behind the playhead, predicted (dotted) ahead
      const nowY = yH(tide(now));
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(X(tL), yH(tide(tL)));
      for (let t = Math.ceil(tL / 2) * 2; t < now; t += 2) ctx.lineTo(X(t), yH(tide(t)));
      ctx.lineTo(L.px, nowY);
      ctx.stroke();
      ctx.setLineDash([2, 5]);
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(L.px, nowY);
      for (let t = Math.ceil(now / 2) * 2; t <= tR; t += 2) ctx.lineTo(X(t), yH(tide(t)));
      ctx.stroke();
      ctx.setLineDash([]);

      // slack water: a rest under a fermata. The tide holds; the music waits.
      const R = Math.max(6, L.s * 0.42);
      for (let i = Math.floor(tL / STEP); i <= Math.ceil(tR / STEP); i++) {
        const a = tide(i * STEP) - tide((i - 1) * STEP);
        const b = tide((i + 1) * STEP) - tide(i * STEP);
        if (a * b >= 0) continue;
        const fx = X(i * STEP);
        const fy = this.yOf(10) - L.s * 0.55;
        ctx.globalAlpha = i * STEP <= now ? 0.85 : 0.3;
        ctx.strokeStyle = colour.text;
        ctx.fillStyle = colour.text;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(fx, fy, R, Math.PI, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(fx, fy - R * 0.2, 1.6, 0, TAU); ctx.fill();
        // whole rest, hanging from the second line
        ctx.fillRect(Math.round(fx - L.rx * 1.2), Math.round(top + L.s) + 1, Math.round(L.rx * 2.4), Math.max(3, Math.round(L.ry * 1.5)));
      }

      // notes, stems and beams: only behind the playhead. The tide has to reach them first.
      const fresh = 1.6 * (STEP / SEC_PER_READING); // model minutes in 1.6 s
      const i0 = Math.ceil(tL / STEP), i1 = Math.floor(now / STEP);
      const GROUP = 5; // readings per beam: half an hour
      const stemLen = L.s * 2;
      const beamW = Math.max(2, L.s * 0.16);
      const fadeOf = (r) => Math.max(0.3, 0.95 - ((now - r.t) * L.ppm) / (L.px * 1.3));
      for (let g = Math.floor(i0 / GROUP); g <= Math.floor(i1 / GROUP); g++) {
        // geometry comes from the whole group (future readings too), so beams don't jump as notes arrive
        const all = [];
        for (let i = g * GROUP; i < (g + 1) * GROUP; i++) { const r = reading(i); if (r.notes.length) all.push(r); }
        const drawn = all.filter((r) => r.i >= i0 && r.i <= i1);
        if (!drawn.length) continue;
        let sum = 0, cnt = 0;
        all.forEach((r) => r.notes.forEach((p) => { sum += p; cnt += 1; }));
        const up = sum / cnt < 4;
        const sx = (r) => X(r.t) + (up ? L.rx * 0.85 : -L.rx * 0.85);
        const tipY = (r) => this.yOf(up ? Math.max(...r.notes) : Math.min(...r.notes));
        const baseY = (r) => this.yOf(up ? Math.min(...r.notes) : Math.max(...r.notes));
        const first = all[0], last = all[all.length - 1];
        let slope = 0;
        if (all.length > 1) slope = Math.max(-0.14, Math.min(0.14, (tipY(last) - tipY(first)) / (sx(last) - sx(first))));
        let a = up ? Infinity : -Infinity;
        all.forEach((r) => {
          const v = tipY(r) + (up ? -stemLen : stemLen) - slope * sx(r);
          a = up ? Math.min(a, v) : Math.max(a, v);
        });
        const beamY = (x) => a + slope * x;

        drawn.forEach((r) => {
          const nx = X(r.t);
          const age = now - r.t;
          const fade = fadeOf(r);
          ctx.strokeStyle = colour.text;
          ctx.lineWidth = 1;
          ctx.globalAlpha = fade * 0.6;
          ctx.beginPath();
          ctx.moveTo(sx(r), baseY(r));
          ctx.lineTo(sx(r), beamY(sx(r)));
          ctx.stroke();
          r.notes.forEach((p) => {
            const ny = this.yOf(p);
            if (p <= -2 || p >= 10) {
              const ly = Math.round(this.yOf(p <= -2 ? -2 : 10)) + 0.5;
              ctx.globalAlpha = fade * 0.7;
              ctx.beginPath();
              ctx.moveTo(nx - L.rx * 1.75, ly);
              ctx.lineTo(nx + L.rx * 1.75, ly);
              ctx.stroke();
            }
            ctx.globalAlpha = fade;
            ctx.fillStyle = colour.text;
            ctx.beginPath();
            ctx.ellipse(nx, ny, L.rx, L.ry, -0.35, 0, TAU);
            ctx.fill();
            if (age < fresh) {
              ctx.globalAlpha = 1 - age / fresh;
              ctx.fillStyle = colour.accent;
              ctx.beginPath();
              ctx.ellipse(nx, ny, L.rx + 0.5, L.ry + 0.5, -0.35, 0, TAU);
              ctx.fill();
            }
          });
        });

        ctx.fillStyle = colour.text;
        if (all.length > 1 && drawn.length > 1) {
          const b0 = sx(drawn[0]) - 0.5, b1 = sx(drawn[drawn.length - 1]) + 0.5;
          const off = up ? 0 : -beamW;
          ctx.globalAlpha = 0.85 * (fadeOf(drawn[0]) + fadeOf(drawn[drawn.length - 1])) / 2;
          ctx.beginPath();
          ctx.moveTo(b0, beamY(b0) + off);
          ctx.lineTo(b1, beamY(b1) + off);
          ctx.lineTo(b1, beamY(b1) + off + beamW);
          ctx.lineTo(b0, beamY(b0) + off + beamW);
          ctx.closePath();
          ctx.fill();
        }
      }

      // the playhead: now
      ctx.strokeStyle = colour.accent;
      ctx.fillStyle = colour.accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(L.px + 0.5, 0);
      ctx.lineTo(L.px + 0.5, H);
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.beginPath(); ctx.arc(L.px, nowY, 10, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(L.px, nowY, 3.8, 0, TAU); ctx.fill();

      // soften both edges
      ctx.globalCompositeOperation = 'destination-out';
      let g = ctx.createLinearGradient(0, 0, W * 0.16, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.16, H);
      g = ctx.createLinearGradient(W * 0.88, 0, W, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g; ctx.fillRect(W * 0.88, 0, W * 0.12 + 1, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /* ================= Wire up the score + controls ================= */
  root.dataset.motion = motionOn ? 'on' : 'off';
  const stage = $('[data-score]');
  if (stage && stage.querySelector('canvas').getContext) {
    score = new TideScore(stage);
    score.onReading = (r) => sound.play(r);
  }

  const controls = $('[data-controls]');
  if (controls) controls.hidden = false;
  $$('[data-motion-controls]').forEach((el) => { el.hidden = false; });
  motionButtons.forEach((b) => b.addEventListener('click', () => setMotion(!motionOn, true)));
  setMotion(motionOn, false);

  const dock = $('[data-dock]');
  const soundBtn = $('[data-sound-toggle]');
  const soundMini = $('[data-sound-mini]'); // a stop button that follows you down the page
  const setSoundUI = () => {
    if (!soundBtn) return;
    soundBtn.dataset.state = sound.playing ? 'playing' : 'stopped';
    $('[data-label]', soundBtn).textContent = sound.playing ? 'Stop sound' : 'Listen to a sketch';
    if (soundMini) soundMini.hidden = !sound.playing;
    if (dock) dock.classList.toggle('has-sound', sound.playing);
  };
  if (soundBtn) {
    if (!Sketch.supported || !score) {
      soundBtn.hidden = true;
    } else {
      soundBtn.addEventListener('click', () => {
        if (sound.playing) {
          sound.stop();
        } else {
          Promise.resolve(sound.start()).catch(() => { sound.stop(); setSoundUI(); });
        }
        setSoundUI();
        score.sync();
      });
      if (soundMini) {
        soundMini.addEventListener('click', () => { sound.stop(); setSoundUI(); score.sync(); });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && sound.playing) { sound.stop(); setSoundUI(); score.sync(); }
      });
      setSoundUI();
    }
  }

  /* ================= Floating ticket button ================= */
  if (dock && 'IntersectionObserver' in window) {
    const heroCta = $('[data-hero-cta]');
    const zones = [heroCta, $('#visit'), $('.site-footer')].filter(Boolean);
    const inView = new Map(zones.map((z) => [z, z === heroCta]));
    dock.hidden = false;
    const update = () => {
      const show = !Array.from(inView.values()).some(Boolean);
      dock.classList.toggle('is-shown', show);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => inView.set(e.target, e.isIntersecting));
      update();
    });
    zones.forEach((z) => io.observe(z));
  }

  /* ================= Reservation ================= */
  const form = $('[data-form]');
  const reserve = $('#reserve');
  if (!form || !reserve) return;

  const ticket = $('[data-ticket]');
  const summary = $('[data-summary]');
  const sessionSlot = $('[data-session-slot]');
  const sessionInput = $('input', sessionSlot);
  const email = $('#email');
  const SESSIONS = { '2026-11-28': '20:42', '2026-12-06': '19:58', '2026-12-13': '20:16', '2026-12-20': '21:03' };
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const longDate = (iso) => { const d = toDate(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const shortDate = (iso) => { const d = toDate(iso); return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
  const picked = (name) => { const el = form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; };
  const visitors = (n) => (n === '1' ? '1 visitor' : `${n} visitors`);

  // during the run, days already gone (Lisbon time) can't be booked
  let todayLisbon = '';
  try { todayLisbon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date()); } catch (e) { /* old engine */ }
  if (/^\d{4}-\d{2}-\d{2}$/.test(todayLisbon)) {
    $$('input[name="date"]', form).forEach((input) => {
      if (input.value < todayLisbon) { input.disabled = true; input.closest('.day').classList.add('day--past'); }
    });
  }

  const submitBtn = $('button[type="submit"]', form);
  summary.id = 'reserve-summary';
  submitBtn.setAttribute('aria-describedby', 'reserve-summary');

  function syncSessionSlot() {
    const isSession = Boolean(SESSIONS[picked('date')]);
    sessionSlot.hidden = !isSession;
    if (!isSession && sessionInput.checked) sessionInput.checked = false;
  }

  function updateSummary() {
    const date = picked('date'), time = picked('time'), party = picked('party') || '1';
    if (!date && !time) { summary.textContent = 'Choose a day and an entry time.'; return; }
    const day = date ? `<strong>${shortDate(date)}</strong>` : 'Choose a day';
    const at = time ? `<strong>${time === '20:30' ? '20:30 low-tide session' : time}</strong>` : 'choose an entry time';
    summary.innerHTML = `${day} · ${at} · ${visitors(party)}`;
  }

  function setError(name, msg) {
    const field = form.querySelector(`[data-field="${name}"]`);
    const err = $('.err', field);
    err.textContent = msg;
    err.hidden = !msg;
    const inputs = name === 'email' ? [email] : $$('input', field);
    inputs.forEach((i) => (msg ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid')));
  }

  form.addEventListener('change', (e) => {
    const name = e.target.name;
    if (name === 'date') { syncSessionSlot(); setError('date', ''); }
    if (name === 'time') setError('time', '');
    updateSummary();
  });
  email.addEventListener('input', () => {
    if (email.getAttribute('aria-invalid') === 'true' && email.checkValidity()) setError('email', '');
  });

  function arrive() {
    reserve.scrollIntoView({ behavior: reduceMQ.matches ? 'auto' : 'smooth', block: 'start' });
    reserve.focus({ preventScroll: true });
    if (!reduceMQ.matches) {
      reserve.classList.remove('is-arrived');
      void reserve.offsetWidth; // restart the highlight
      reserve.classList.add('is-arrived');
    }
    if (location.hash !== '#reserve' && history.pushState) history.pushState(null, '', '#reserve');
  }

  function showForm() {
    ticket.hidden = true;
    form.hidden = false;
  }

  // every "Reserve" link lands on the form and moves focus there
  $$('a[href="#reserve"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const date = a.dataset.session;
      if (date) {
        // a low-tide session row: pre-select its evening and the 20:30 slot
        showForm();
        const day = form.querySelector(`input[name="date"][value="${date}"]`);
        if (day && !day.disabled) {
          day.checked = true;
          syncSessionSlot();
          sessionInput.checked = true;
          setError('date', '');
          setError('time', '');
          updateSummary();
        }
      }
      arrive();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = picked('date'), time = picked('time');
    const address = email.value.trim();
    setError('date', date ? '' : 'Choose a day.');
    setError('time', time ? '' : 'Choose an entry time.');
    const emailMsg = !address
      ? 'Enter your email address so we can send your ticket.'
      : !email.checkValidity() ? 'Check the email address. It should look like name@example.com.' : '';
    setError('email', emailMsg);
    const firstBad = !date ? form.querySelector('input[name="date"]:not(:disabled)')
      : !time ? form.querySelector('input[name="time"]')
      : emailMsg ? email : null;
    if (firstBad) { firstBad.focus(); return; }
    showTicket({ date, time, party: picked('party') || '1', email: address });
  });

  let booked = null;
  function showTicket(res) {
    booked = res;
    const isSession = res.time === '20:30';
    $('[data-ticket-title]', ticket).textContent = `${longDate(res.date)}, ${res.time}`;
    $('[data-t="entry"]', ticket).textContent = isSession
      ? `Low-tide session at 20:30. Low water is predicted at ${SESSIONS[res.date]}.`
      : `Timed entry at ${res.time}`;
    $('[data-t="party"]', ticket).textContent = visitors(res.party);
    $('[data-t="email"]', ticket).textContent = res.email;
    form.hidden = true;
    ticket.hidden = false;
    $('[data-ticket-title]', ticket).focus();
  }

  $('[data-again]', ticket).addEventListener('click', () => {
    form.reset();
    ['date', 'time', 'email'].forEach((n) => setError(n, ''));
    syncSessionSlot();
    updateSummary();
    showForm();
    reserve.focus();
  });

  // a calendar file for the reservation (Lisbon is on UTC+0 in November and December)
  $('[data-ics]', ticket).addEventListener('click', () => {
    if (!booked) return;
    const ymd = booked.date.replace(/-/g, '');
    const [hh, mm] = booked.time.split(':').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const end = hh * 60 + mm + 60;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const isSession = booked.time === '20:30';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidewrack//Reservation prototype//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${ymd}${pad(hh)}${pad(mm)}-${Math.random().toString(36).slice(2, 10)}@tidewrack.example`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${pad(hh)}${pad(mm)}00Z`,
      `DTEND:${ymd}T${pad(Math.floor(end / 60))}${pad(end % 60)}00Z`,
      `SUMMARY:Tidewrack${isSession ? ' – low-tide session' : ''}`,
      'LOCATION:Armazém 7\\, Cais do Sodré\\, Lisbon',
      `DESCRIPTION:Free timed entry\\, ${visitors(booked.party)}.`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tidewrack-${booked.date}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  syncSessionSlot();
  updateSummary();
})();
