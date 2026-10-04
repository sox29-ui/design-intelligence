/* دكّان القهوة — progressive enhancement: menu sheet, live search, cart with free-delivery meter.
   Numbers are always formatted with Western digits (ar-SA, numbering system "latn"). */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const FREE_DELIVERY = 199;
  const DELIVERY_FEE = 19;
  const num = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 0 });
  const plural = new Intl.PluralRules('ar');
  const sar = (n) => `${num.format(n)} ر.س`; // no-break space keeps amount and currency together
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Arabic count agreement (zero / one / two / few 3–10 / many 11–99 / other)
  const ITEMS = { zero: 'لا توجد منتجات', one: 'منتج واحد', two: 'منتجان', few: '# منتجات', many: '# منتجًا', other: '# منتج' };
  const RESULTS = { zero: 'لا توجد نتائج', one: 'نتيجة واحدة', two: 'نتيجتان', few: '# نتائج', many: '# نتيجة', other: '# نتيجة' };
  const phrase = (n, forms) => forms[plural.select(n)].replace('#', num.format(n));

  // ---------- live announcements ----------
  const live = $('#live');
  let liveTimer = 0;
  const announce = (msg) => {
    if (!live) return;
    clearTimeout(liveTimer);
    live.textContent = '';
    liveTimer = setTimeout(() => { live.textContent = msg; }, 80);
  };

  // ---------- catalogue (read from the markup) ----------
  const catalog = new Map();
  const norm = (s) => s
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ̀-ͯ]/g, '') // harakat, hamza marks, tatweel, Latin accents
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[–\-·،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  $$('.product[data-id]').forEach((el) => {
    const name = $('.p-name', el);
    const group = el.closest('.group');
    catalog.set(el.dataset.id, {
      id: el.dataset.id,
      el,
      name: el.dataset.name,
      nameHTML: name ? name.innerHTML : el.dataset.name,
      price: Number(el.dataset.price),
      soldOut: el.hasAttribute('data-soldout'),
      slot: $('.qty-slot', el),
      index: norm([el.dataset.name, name && name.textContent, $('.p-meta', el)?.textContent, group && $('h2', group)?.textContent, el.dataset.keywords].join(' ')),
    });
  });

  // ---------- storage (per-viewer convenience only; the page works without it) ----------
  const CART_KEY = 'dukkan-cart-v1';
  const NOTIFY_KEY = 'dukkan-notify-v1';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  };

  const cart = {};
  Object.entries(read(CART_KEY, {}) || {}).forEach(([id, q]) => {
    const p = catalog.get(id);
    if (p && !p.soldOut && Number.isInteger(q) && q > 0 && q < 100) cart[id] = q;
  });
  const notify = new Set((read(NOTIFY_KEY, []) || []).filter((id) => catalog.has(id)));

  const totals = () => {
    let count = 0;
    let sub = 0;
    for (const [id, q] of Object.entries(cart)) {
      count += q;
      sub += catalog.get(id).price * q;
    }
    return { count, sub };
  };

  // ---------- product row controls ----------
  const icon = (id) => `<svg class="i" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
  const addHTML = (p) => `<button type="button" class="btn-add" data-add="${p.id}">${icon('i-plus')}أضف<span class="sr-only"> ${p.name} إلى السلة</span></button>`;
  const stepperHTML = (p, q, scope) => `<div class="stepper" role="group" aria-label="كمية ${p.name}">`
    + `<button type="button" data-${scope}dec="${p.id}" aria-label="إنقاص الكمية">${icon('i-minus')}</button>`
    + `<output>${num.format(q)}</output>`
    + `<button type="button" data-${scope}inc="${p.id}" aria-label="زيادة الكمية">${icon('i-plus')}</button>`
    + '</div>';

  function renderSlot(p, focus) {
    if (!p.slot || p.soldOut) return;
    const q = cart[p.id] || 0;
    const stepper = $('.stepper', p.slot);
    if (q > 0 && stepper) {
      $('output', stepper).textContent = num.format(q);
    } else if (q > 0) {
      p.slot.innerHTML = stepperHTML(p, q, '');
      if (focus) $('[data-inc]', p.slot).focus();
    } else if (stepper || !$('[data-add]', p.slot)) {
      p.slot.innerHTML = addHTML(p);
      if (focus) $('[data-add]', p.slot).focus();
    }
  }

  // ---------- header count + cart sheet ----------
  const badge = $('.cart-count');
  const cartLabel = $('[data-cart-label]');

  function renderCount(bump) {
    const { count } = totals();
    $$('[data-cart-count]').forEach((el) => { el.textContent = num.format(count); });
    if (badge) {
      badge.textContent = num.format(count);
      badge.toggleAttribute('data-zero', count === 0);
      if (bump && !reduceMotion.matches) {
        badge.classList.remove('bump');
        void badge.offsetWidth; // restart the animation
        badge.classList.add('bump');
      }
    }
    if (cartLabel) cartLabel.textContent = `السلة، ${phrase(count, ITEMS)}`;
  }

  function deliveryMessage(sub) {
    if (sub <= 0) return `توصيل مجاني للطلبات فوق ${sar(FREE_DELIVERY)}`;
    if (sub >= FREE_DELIVERY) return 'طلبك مؤهل للتوصيل المجاني';
    return `باقي ${sar(FREE_DELIVERY - sub)} على التوصيل المجاني`;
  }

  const cartDialog = $('#cart');
  const cartList = $('#cart-items');

  function renderCart() {
    if (!cartDialog) return;
    const { count, sub } = totals();
    const active = document.activeElement;
    const keep = active && cartDialog.contains(active)
      ? ['data-cdec', 'data-cinc', 'data-remove'].map((a) => (active.hasAttribute(a) ? `[${a}="${active.getAttribute(a)}"]` : '')).find(Boolean)
      : '';

    cartList.innerHTML = Object.entries(cart).map(([id, q]) => {
      const p = catalog.get(id);
      return `<li class="cart-item">`
        + `<p class="ci-name">${p.nameHTML}</p>`
        + `<p class="ci-price"><span class="sr-only">المجموع </span>${sar(p.price * q)}</p>`
        + stepperHTML(p, q, 'c')
        + `<button type="button" class="ci-remove" data-remove="${id}">حذف<span class="sr-only"> ${p.name}</span></button>`
        + '</li>';
    }).join('');

    $('#cart-empty').hidden = count > 0;
    $('#cart-summary').hidden = count === 0;
    const free = sub >= FREE_DELIVERY;
    $('#cart-subtotal').textContent = sar(sub);
    $('#cart-shipping').textContent = free ? 'مجاني' : sar(DELIVERY_FEE);
    $('#cart-total').textContent = sar(sub + (free || count === 0 ? 0 : DELIVERY_FEE));
    $('#ship-msg').textContent = deliveryMessage(sub);
    $('#ship-bar').style.inlineSize = `${Math.min(100, (sub / FREE_DELIVERY) * 100)}%`;

    if (keep) {
      const again = $(keep, cartDialog);
      (again || $('#cart-title')).focus();
    }
  }

  function setQty(id, q, { focus = false } = {}) {
    const p = catalog.get(id);
    if (!p || p.soldOut) return;
    const prev = cart[id] || 0;
    const next = Math.max(0, Math.min(99, q));
    if (next === prev) return;
    if (next === 0) delete cart[id]; else cart[id] = next;
    write(CART_KEY, cart);

    renderSlot(p, focus);
    renderCount(next > prev);
    renderCart();

    const { count, sub } = totals();
    const tail = count === 0 ? 'السلة فارغة.' : `في السلة ${phrase(count, ITEMS)}. ${deliveryMessage(sub)}.`;
    if (prev === 0) announce(`أُضيف ${p.name} إلى السلة. ${tail}`);
    else if (next === 0) announce(`حُذف ${p.name} من السلة. ${tail}`);
    else announce(`الكمية ${num.format(next)}. ${tail}`);
  }

  // ---------- notify-me (out of stock) ----------
  function renderNotify(btn) {
    btn.setAttribute('aria-pressed', String(notify.has(btn.dataset.notify)));
  }

  // ---------- in-page navigation that lands focus where the eye lands ----------
  function goTo(hash, { flash = false } = {}) {
    let target = null;
    try { target = document.querySelector(hash); } catch { target = null; }
    if (!target) return;
    const focusEl = target.matches('article, h2, h3') ? target : $('h2, h3', target) || target;
    if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    focusEl.focus({ preventScroll: true });
    if (history.replaceState) history.replaceState(null, '', hash);
    if (flash && target.classList.contains('product')) {
      target.classList.remove('is-flash');
      void target.offsetWidth;
      target.classList.add('is-flash');
      setTimeout(() => target.classList.remove('is-flash'), 1800);
    }
  }

  // ---------- dialogs: menu + cart ----------
  const menuDialog = $('#menu');
  const menuBtn = $('.menu-toggle');
  const cartBtn = $('.cart-btn');

  const openMenu = () => {
    if (!menuDialog || menuDialog.open) return;
    menuDialog.showModal();
    menuBtn.setAttribute('aria-expanded', 'true');
  };
  const openCart = () => {
    if (!cartDialog || cartDialog.open) return;
    renderCart();
    cartDialog.showModal();
  };

  if (menuDialog && menuBtn) {
    menuBtn.addEventListener('click', openMenu);
    menuDialog.addEventListener('close', () => menuBtn.setAttribute('aria-expanded', 'false'));
  }
  if (cartBtn) cartBtn.addEventListener('click', openCart);

  $$('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) { dlg.close(); return; } // backdrop
      if (e.target.closest('[data-close]')) { dlg.close(); return; }
      if (e.target.closest('[data-open-cart]')) { dlg.close(); openCart(); return; }
      const link = e.target.closest('a[href^="#"]');
      if (link && link.getAttribute('href').length > 1) {
        e.preventDefault();
        dlg.close();
        goTo(link.getAttribute('href'));
      }
    });
  });

  // ---------- search ----------
  const form = $('#search');
  const input = $('#q');
  const results = $('#search-results');
  const list = $('#search-list');
  const status = $('#search-status');
  const searchToggle = $('.search-toggle');
  let hits = [];

  function setSearchOpen(open, { returnFocus = false } = {}) {
    if (!form || !searchToggle) return;
    searchToggle.setAttribute('aria-expanded', String(open));
    form.classList.toggle('is-open', open);
    if (open) input.focus();
    else {
      results.hidden = true;
      if (returnFocus) searchToggle.focus();
    }
  }

  function runSearch() {
    const q = norm(input.value);
    if (!q) { results.hidden = true; hits = []; return; }
    const terms = q.split(' ');
    hits = [...catalog.values()].filter((p) => terms.every((t) => p.index.includes(t)));
    list.innerHTML = hits.slice(0, 6).map((p) => `<li><a href="#${p.el.id}"><span>${p.nameHTML}</span>`
      + `<span class="hit-price">${p.soldOut ? 'نفدت الكمية' : sar(p.price)}</span></a></li>`).join('');
    status.textContent = phrase(hits.length, RESULTS);
    results.hidden = false;
  }

  if (form && input) {
    input.addEventListener('input', runSearch);
    input.addEventListener('focus', () => { if (input.value.trim()) runSearch(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runSearch();
      if (hits.length) {
        const first = hits[0];
        results.hidden = true;
        if (form.classList.contains('is-open')) setSearchOpen(false);
        goTo(`#${first.el.id}`, { flash: true });
      }
    });
    list.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      results.hidden = true;
      if (form.classList.contains('is-open')) setSearchOpen(false);
      goTo(a.getAttribute('href'), { flash: true });
    });
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!results.hidden) { results.hidden = true; input.focus(); e.preventDefault(); return; }
      if (form.classList.contains('is-open')) { setSearchOpen(false, { returnFocus: true }); e.preventDefault(); }
    });
    document.addEventListener('click', (e) => {
      if (!results.hidden && !form.contains(e.target)) results.hidden = true;
    });
  }
  if (searchToggle) {
    searchToggle.addEventListener('click', () => setSearchOpen(searchToggle.getAttribute('aria-expanded') !== 'true'));
  }

  // ---------- one delegated listener for product + cart controls ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) {
      const d = btn.dataset;
      if (d.add) { setQty(d.add, (cart[d.add] || 0) + 1, { focus: true }); return; }
      if (d.inc) { setQty(d.inc, (cart[d.inc] || 0) + 1, { focus: true }); return; }
      if (d.dec) { setQty(d.dec, (cart[d.dec] || 0) - 1, { focus: true }); return; }
      if (d.cinc) { setQty(d.cinc, (cart[d.cinc] || 0) + 1); return; }
      if (d.cdec) { setQty(d.cdec, (cart[d.cdec] || 0) - 1); return; }
      if (d.remove) { setQty(d.remove, 0); return; }
      if (d.notify) {
        const p = catalog.get(d.notify);
        if (notify.has(d.notify)) notify.delete(d.notify); else notify.add(d.notify);
        write(NOTIFY_KEY, [...notify]);
        renderNotify(btn);
        announce(notify.has(d.notify) ? `سنُبلغك عند توفر ${p ? p.name : 'المنتج'}.` : 'أُلغي التنبيه.');
        return;
      }
    }
    // product links outside dialogs (promo CTA, brew guide) land on the product row
    const link = e.target.closest('a[href^="#p-"]');
    if (link && !link.closest('dialog, #search')) {
      e.preventDefault();
      goTo(link.getAttribute('href'), { flash: true });
    }
  });

  // ---------- initial state ----------
  catalog.forEach((p) => { if (cart[p.id]) renderSlot(p, false); });
  $$('[data-notify]').forEach(renderNotify);
  renderCount(false);
  renderCart();
})();
