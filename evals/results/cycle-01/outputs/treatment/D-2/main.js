// The Lighthouse Review — two small behaviours, no dependencies.
// 1. Mobile menu: an in-flow panel with real aria-expanded state; Escape closes and returns focus.
// 2. Newsletter form: inline validation with an associated error and a polite status message.

(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');

  if (toggle && nav) {
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

    const setOpen = (open, moveFocus = false) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      if (open && moveFocus) {
        const first = nav.querySelector('a');
        if (first) first.focus();
      }
    };

    toggle.addEventListener('click', () => setOpen(!isOpen(), !isOpen()));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Choosing a destination closes the panel.
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a') && isOpen()) setOpen(false);
    });

    // The panel is a phone layout only; reset it when the inline navigation takes over.
    const wide = window.matchMedia('(min-width: 47.5rem)');
    wide.addEventListener('change', () => {
      if (wide.matches) setOpen(false);
    });
  }

  const form = document.querySelector('.signup');
  if (form) {
    const input = form.querySelector('#email');
    const error = form.querySelector('#email-error');
    const status = form.querySelector('.form-status');
    const looksValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const clearError = () => {
      error.hidden = true;
      error.textContent = '';
      input.removeAttribute('aria-invalid');
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      status.textContent = '';

      if (!looksValid(value)) {
        error.textContent = value
          ? 'That doesn’t look like an email address. Check for a missing “@” or full stop.'
          : 'Enter your email address to sign up.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }

      clearError();
      form.reset();
      status.textContent = `Thank you. A confirmation link is on its way to ${value}.`;
    });

    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true' && looksValid(input.value.trim())) clearError();
    });
  }
})();
