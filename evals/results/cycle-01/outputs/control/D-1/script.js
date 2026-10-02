/* The Lighthouse Review — Issue 14: Shade
   Two small enhancements; the page is complete without them. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     1. Sundial cover
     The light through the arcade is cast for the reader's local time.
     Morning light leans one way, evening light the other; at midday
     the sun is high and the patches of light sit lower on the wall.
     Outside daylight hours the cover shows 14:00, the hottest hour.
     Nothing animates, so there is nothing to reduce for motion.
     --------------------------------------------------------------- */
  var art = document.querySelector('[data-sundial]');
  var caption = document.querySelector('[data-sundial-caption]');

  function tile(theta, drop) {
    var ys = 150 + drop;
    var d = '';
    for (var o = -200; o <= 200; o += 100) {
      d += 'M' + (o + 18) + ' 310V' + ys + 'A32 32 0 0 1 ' + (o + 82) + ' ' + ys + 'V310Z';
    }
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 300' width='100' height='300' preserveAspectRatio='none'>" +
      "<g transform='translate(0 300) skewX(" + theta.toFixed(1) + ") translate(0 -300)'><path d='" + d + "'/></g></svg>";
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  if (art) {
    var now = new Date();
    var h = now.getHours() + now.getMinutes() / 60;
    var daylight = h >= 6.5 && h <= 19.5;
    var hour = daylight ? h : 14;
    var theta = Math.max(-38, Math.min(38, ((hour - 13) / 6.5) * 34));
    var altitude = Math.max(0, Math.sin(Math.PI * (hour - 6) / 14));
    var drop = Math.round(altitude * 46);

    art.style.setProperty('--arcade', 'url("data:image/svg+xml,' + encodeURIComponent(tile(theta, drop)).replace(/'/g, '%27') + '")');

    if (caption && daylight) {
      var stamp = pad(now.getHours()) + ':' + pad(now.getMinutes());
      caption.innerHTML = 'Cover drawing: light falling through an arcade at <time datetime="' + stamp + '">' + stamp +
        '</time>, cast for the moment you opened this page.';
    }
  }

  /* ---------------------------------------------------------------
     2. Newsletter sign-up
     Native validation stays on if this script never runs; here we
     replace it with inline, announced messages.
     --------------------------------------------------------------- */
  var form = document.querySelector('[data-signup]');
  if (!form) return;

  var input = form.querySelector('input[type="email"]');
  var error = form.querySelector('.signup__error');
  var status = form.querySelector('[role="status"]');
  var hintId = 'signup-hint';

  form.noValidate = true;

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id + ' ' + hintId);
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', hintId);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = input.value.trim();
    input.value = value;
    status.textContent = '';

    if (!value) {
      showError('Please enter your email address.');
      input.focus();
      return;
    }
    if (!input.checkValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      showError('That address doesn’t look quite right. Check it has an “@” and a domain, like name@example.org.');
      input.focus();
      return;
    }

    clearError();
    form.reset();
    status.textContent = 'Thank you. Please check your inbox to confirm, and the next letter will arrive on Sunday.';
  });

  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid') === 'true' && input.checkValidity() && input.value.trim()) {
      clearError();
    }
  });
})();
