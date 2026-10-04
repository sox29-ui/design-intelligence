/* Tidewrack — progressive enhancement only. The page is complete without this file. */
(() => {
  'use strict';
  const doc = document;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- reservation form ---------- */
  const SESSION_DAYS = { '2026-11-28': '20:42', '2026-12-06': '19:58', '2026-12-13': '20:16', '2026-12-20': '21:03' };
  const form = doc.querySelector('[data-form]');

  if (form) {
    const { day, time, email, tickets } = form.elements;
    const sessionOpt = time.querySelector('[data-session]');
    const status = form.querySelector('[data-status]');
    const errFor = (el) => doc.getElementById(`${el.id}-err`);
    const setErr = (el, msg) => { el.setAttribute('aria-invalid', 'true'); errFor(el).textContent = msg; };
    const clearErr = (el) => { el.removeAttribute('aria-invalid'); const e = errFor(el); if (e) e.textContent = ''; };
    const syncTimes = () => {
      const isSession = Object.prototype.hasOwnProperty.call(SESSION_DAYS, day.value);
      sessionOpt.disabled = !isSession;
      sessionOpt.hidden = !isSession;
      if (!isSession && time.value === '20:30') time.value = '';
    };

    form.noValidate = true;
    syncTimes();
    day.addEventListener('change', () => { syncTimes(); clearErr(day); status.textContent = ''; });
    time.addEventListener('change', () => { clearErr(time); status.textContent = ''; });
    email.addEventListener('input', () => clearErr(email));

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = '';
      const invalid = [];
      if (!day.value) { setErr(day, 'Choose a day.'); invalid.push(day); }
      if (!time.value) { setErr(time, 'Choose an entry time.'); invalid.push(time); }
      if (!email.value.trim() || !email.validity.valid) { setErr(email, 'Enter an email address, for example name@example.com.'); invalid.push(email); }
      if (invalid.length) { invalid[0].focus(); return; }

      const dayText = day.options[day.selectedIndex].text.replace(' · low-tide session', '');
      const n = Number(tickets.value);
      const low = SESSION_DAYS[day.value];
      const what = time.value === '20:30' ? `the low-tide session at 20:30 (predicted low water ${low})` : `entry at ${time.value}`;
      const p = doc.createElement('p');
      const strong = doc.createElement('strong');
      strong.textContent = `${dayText}, ${what}, ${n} ${n === 1 ? 'ticket' : 'tickets'}.`;
      p.append('Held for you: ', strong);
      const small = doc.createElement('small');
      small.textContent = 'This page is a design study: no booking was made and no email was sent.';
      status.replaceChildren(p, small);
    });

    // "Reserve" on a low-tide session pre-fills the form with that evening.
    doc.querySelectorAll('a[data-day]').forEach((link) => {
      link.addEventListener('click', () => {
        day.value = link.dataset.day;
        syncTimes();
        time.value = link.dataset.time;
        clearErr(day);
        clearErr(time);
        status.textContent = '';
        window.setTimeout(() => doc.getElementById('reserve').focus({ preventScroll: true }), 0);
      });
    });
  }

  /* ---------- listen: a one-minute sketch of the mapping ----------
     The same tide model that drew the score. Height → pitch (harmonics of a low A),
     speed → number of notes, slack water → silence. Sound only ever starts on request. */
  const AC = window.AudioContext || window.webkitAudioContext;
  const listenWrap = doc.querySelector('[data-listen]');
  const band = doc.querySelector('[data-score]');
  const figure = band && band.closest('figure');
  if (!AC || !listenWrap || !band || !figure) return;

  const T = 12.42;
  const OMEGA = (2 * Math.PI) / T;
  const level = (t) => 2.15 - 1.45 * Math.cos(OMEGA * t) + 0.12 * Math.cos(2 * OMEGA * t + 0.9);
  const speed = (t) => (level(t + 0.01) - level(t - 0.01)) / 0.02;
  const SLACK = 0.12;
  const N = 124;
  const STEP = 0.5;                       // seconds of sound per six-minute reading
  const VB_W = 1488;
  const VB = `0 0 ${VB_W} 184`;
  const xOf = (i) => 6 + 12 * i;
  const yOf = (m) => 92 - (m - 2.15) * 36;
  const tOf = (i) => -10.67 + 0.1 * i;  // hours from low water: high water at 36 %, low water at 86 %

  const button = listenWrap.querySelector('[data-listen-button]');
  const label = listenWrap.querySelector('[data-listen-label]');
  const clock = listenWrap.querySelector('[data-listen-time]');
  const svgs = band.querySelectorAll('svg');
  const playhead = band.querySelector('.playhead');
  const ring = playhead && playhead.querySelector('circle');
  const total = N * STEP;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const idleLabel = label.textContent;
  const idleClock = `Plays sound · ${fmt(total)}`;

  let ctx = null, bus = null, master = null, startAt = 0, nextIndex = 0, timer = 0, frame = 0, camera = VB_W / 2;

  // deterministic "speaker" for each note: 40 speakers, 8 across the room
  const speakerPan = (i, k) => {
    const s = (i * 7 + k * 13 + 3) % 40;
    return ((s % 8) / 7) * 1.6 - 0.8;
  };

  const voice = (when, freq, pan, amp, dur) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = freq * 2.003;
    const sg = ctx.createGain();
    sg.gain.value = 0.08;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(amp, when + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(env);
    shimmer.connect(sg).connect(env);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      env.connect(p).connect(bus);
    } else {
      env.connect(bus);
    }
    osc.start(when); shimmer.start(when);
    osc.stop(when + dur + 0.05); shimmer.stop(when + dur + 0.05);
  };

  const partialOf = (m) => Math.round(6 + ((m - 0.7) / 3.0) * 12); // 0.7 m → 6th harmonic, 3.7 m → 18th
  const F0 = 55;

  const schedule = () => {
    const horizon = ctx.currentTime + 1.2;
    while (nextIndex < N && startAt + nextIndex * STEP < horizon) {
      const i = nextIndex;
      const t = tOf(i);
      const v = speed(t);
      if (Math.abs(v) >= SLACK) {
        const notes = 1 + (Math.abs(v) >= 0.32 ? 1 : 0) + (Math.abs(v) >= 0.55 ? 1 : 0);
        for (let k = 0; k < notes; k++) {
          const tt = t + (0.1 * k) / notes;
          const p = partialOf(level(tt)) + (k ? Math.sign(v) * k : 0);
          const when = startAt + i * STEP + (STEP * k) / notes;
          voice(when, F0 * Math.max(4, p), speakerPan(i, k), k ? 0.05 : 0.085, k ? 1.4 : 2.4);
        }
      }
      nextIndex += 1;
    }
    if (nextIndex >= N && ctx.currentTime > startAt + total + 0.4) { stop(); return; }
    timer = window.setTimeout(schedule, 250);
  };

  const setViewBox = (x) => {
    const vb = `${Math.round(x - VB_W / 2)} 0 ${VB_W} 184`;
    svgs.forEach((s) => s.setAttribute('viewBox', vb));
  };

  const draw = () => {
    if (!ctx) return;
    const elapsed = Math.max(0, ctx.currentTime - startAt);
    const pos = Math.min(N - 1, elapsed / STEP);
    const i = reduceMotion.matches ? Math.floor(pos) : pos;  // reduced motion: step, don't glide
    const x = xOf(i);
    const y = yOf(level(tOf(i)));
    playhead.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
    ring.setAttribute('cy', y.toFixed(1));
    clock.textContent = `${fmt(elapsed)} / ${fmt(total)}`;

    // On narrow screens the stave is cropped: keep the playhead in view.
    const r = band.getBoundingClientRect();
    const scale = Math.max(r.width / VB_W, r.height / 184);
    const visible = r.width / scale;
    if (visible < VB_W * 0.9) {   // only pan when the stave is noticeably cropped (phones, small tablets)
      const half = visible / 2;
      if (reduceMotion.matches) {
        // turn the page only when the playhead reaches the edge
        if (x > camera + half - 12 || x < camera - half) camera = Math.min(VB_W - half, Math.max(half, x + half - 24));
      } else {
        camera = Math.min(VB_W - half, Math.max(half, x));
      }
      setViewBox(camera);
    }
    frame = window.requestAnimationFrame(draw);
  };

  const start = async () => {
    try {
      ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch (e) {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    bus = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.37;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.36;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    bus.connect(master);
    bus.connect(delay);
    delay.connect(tone);
    tone.connect(feedback).connect(delay);
    tone.connect(wet).connect(master);
    master.connect(comp).connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.3);

    startAt = ctx.currentTime + 0.15;
    nextIndex = 0;
    camera = VB_W / 2;
    figure.setAttribute('data-playing', '');
    label.textContent = 'Stop the sketch';
    schedule();
    draw();
  };

  const stop = () => {
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    if (ctx) {
      const c = ctx;
      try {
        master.gain.cancelScheduledValues(c.currentTime);
        master.gain.setTargetAtTime(0.0001, c.currentTime, 0.08);
      } catch (e) { /* already closing */ }
      window.setTimeout(() => { if (c.close) c.close().catch(() => {}); }, 500);
    }
    ctx = null;
    figure.removeAttribute('data-playing');
    svgs.forEach((s) => s.setAttribute('viewBox', VB));
    label.textContent = idleLabel;
    clock.textContent = idleClock;
  };

  listenWrap.hidden = false;
  clock.textContent = idleClock;
  button.addEventListener('click', () => (ctx ? stop() : start()));
  doc.addEventListener('visibilitychange', () => { if (doc.hidden && ctx) stop(); });
})();
