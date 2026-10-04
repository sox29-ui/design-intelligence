/* The Lighthouse Review — Issue 14, “Shade”
   Two small enhancements. The page is complete without them.
   1. Cover: the title’s shadow follows the sun — the reader’s local time,
      or a slider. Nothing animates; values are set once per change.
   2. Newsletter: inline validation and a confirmation message. */

(function () {
  'use strict';

  /* 1. The cover sun ----------------------------------------------------- */

  var panel = document.querySelector('[data-cover]');
  var control = document.querySelector('[data-sun-control]');

  if (panel && control) {
    var input = control.querySelector('input[type="range"]');
    var readout = control.querySelector('[data-sun-value]');
    var timeLabel = document.querySelector('[data-cover-time]');

    var DEG = Math.PI / 180;
    var MAX_ALT = 78;   // the sun at noon, high as in a hot-climate summer
    var MAX_AZ = 85;    // furthest swing east or west of due south
    var LOOK = 0.42;    // foreshortening of the ground as seen on the cover
    var MAX_LEN = 2.4;  // longest shadow, per unit of height

    var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var formatTime = function (t) {
      var mins = Math.round(t * 60);
      return pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
    };

    /* A simplified summer sun for a hot city: it rises at 06:00 and sets
       at 19:00, stays low and to one side for most of the morning and
       afternoon, and stands almost overhead at noon, when there is
       hardly any shade at all. A shadow points away from the sun and is
       1 / tan(altitude) times as long as the thing that casts it. */
    var setSun = function (t) {
      var p = clamp((t - 6) / 13, 0, 1);
      var u = 2 * p - 1;
      var alt = Math.max(4, MAX_ALT * Math.pow(Math.sin(Math.PI * p), 1.6));
      var az = (u < 0 ? -1 : 1) * MAX_AZ * Math.pow(Math.abs(u), 0.45);
      var len = Math.min(MAX_LEN, 1 / Math.tan(alt * DEG));
      var style = panel.style;

      style.setProperty('--shear', (Math.sin(az * DEG) * len).toFixed(3));
      style.setProperty('--depth', (-Math.cos(az * DEG) * len * LOOK).toFixed(3));
      style.setProperty('--sun-x', (50 + u * 36).toFixed(2) + '%');
      style.setProperty('--sun-y', (100 - (alt / MAX_ALT) * 80).toFixed(2) + '%');
      style.setProperty('--glow', (1 - alt / MAX_ALT).toFixed(3));

      var label = formatTime(t);
      input.setAttribute('aria-valuetext', label);
      readout.textContent = label;
      return label;
    };

    var now = new Date();
    var local = now.getHours() + now.getMinutes() / 60;
    var daylight = local >= 6.5 && local <= 18.75;
    var start = daylight ? Math.round(local * 4) / 4 : 16;

    input.value = String(start);
    var startLabel = setSun(start);
    if (timeLabel) {
      timeLabel.textContent = daylight ? startLabel + ', the time where you are' : startLabel;
    }
    control.hidden = false;

    input.addEventListener('input', function () {
      var label = setSun(parseFloat(input.value));
      if (timeLabel) timeLabel.textContent = label;
    });
  }


  /* 2. Newsletter sign-up ------------------------------------------------ */

  var form = document.querySelector('[data-signup]');

  if (form) {
    var email = form.querySelector('input[type="email"]');
    var error = form.querySelector('[data-signup-error]');
    var status = form.querySelector('[data-signup-status]');
    var pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    // We show our own messages, so switch off the browser’s bubbles.
    form.setAttribute('novalidate', '');

    var showError = function (message) {
      error.textContent = message;
      error.hidden = false;
      email.setAttribute('aria-invalid', 'true');
      email.focus();
    };

    var clearError = function () {
      error.textContent = '';
      error.hidden = true;
      email.removeAttribute('aria-invalid');
    };

    email.addEventListener('input', function () {
      if (email.getAttribute('aria-invalid') === 'true' && pattern.test(email.value.trim())) {
        clearError();
      }
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = email.value.trim();
      email.value = value;
      status.textContent = '';

      if (!value) {
        showError('Please enter your email address.');
        return;
      }
      if (!email.validity.valid || !pattern.test(value)) {
        showError('Please enter a full email address, like name@example.com.');
        return;
      }

      clearError();
      // No server in this prototype: confirm in place.
      status.textContent = 'Thank you. We have sent a confirmation link to ' + value +
        '. The next letter goes out on Sunday.';
      form.reset();
    });
  }
})();
