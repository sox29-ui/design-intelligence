// The Lighthouse Review — progressive enhancement only.
// Without this script the navigation is simply visible and the form uses native validation.
(() => {
  'use strict';

  /* Mobile navigation: an in-flow disclosure panel (no scroll lock, no focus trap). */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');

  if (toggle && nav) {
    const wide = window.matchMedia('(min-width: 64rem)');
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };

    toggle.addEventListener('click', () => setOpen(!isOpen()));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    // In-page links close the panel so the reader lands on the section, not on an open menu.
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a') && !wide.matches) setOpen(false);
    });

    wide.addEventListener('change', () => setOpen(false));
  }

  /* Newsletter sign-up: accessible inline validation; no data leaves the page. */
  const form = document.querySelector('.signup');

  if (form) {
    const input = form.querySelector('.signup__input');
    const error = form.querySelector('.signup__error');
    const status = form.querySelector('.signup__status');
    const hintId = 'email-hint';
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    form.noValidate = true;

    const showError = (message) => {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${error.id} ${hintId}`);
      status.textContent = '';
      input.focus();
    };

    const clearError = () => {
      error.textContent = '';
      error.hidden = true;
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', hintId);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();

      if (!value) {
        showError('Enter your email address to sign up.');
        return;
      }
      if (!pattern.test(value)) {
        showError('Enter an email address like name@example.com.');
        return;
      }

      clearError();
      status.textContent = `Thank you. We have sent a confirmation link to ${value}.`;
      form.reset();
    });

    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') clearError();
    });
  }
})();
