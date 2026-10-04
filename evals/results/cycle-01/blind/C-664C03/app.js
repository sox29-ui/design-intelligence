/* دكّان القهوة — light progressive enhancement: cart, category filter, search,
   menu/cart sheets and the brew-guide carousel. No dependencies. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const FREE_SHIPPING = 199;
  const SHIPPING_FEE = 25;
  const MAX_QTY = 20;
  const STORAGE_KEY = 'dukkan-cart-v1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // One numeral system for the whole store: Western digits (latn), in Arabic text.
  const num = new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
  const money = (n) => `${num.format(n)}\u00a0ر.س`;

  // Arabic counted noun: منتج واحد / منتجان / 3–10 منتجات / 11+ منتجًا
  function countProducts(n) {
    if (n === 0) return 'لا منتجات';
    if (n === 1) return 'منتج واحد';
    if (n === 2) return 'منتجان';
    if (n >= 3 && n <= 10) return `${num.format(n)}\u00a0منتجات`;
    return `${num.format(n)}\u00a0منتجًا`;
  }

  // Search normalisation: strip tashkeel/tatweel, unify alef/yaa/taa marbuta, map Eastern digits.
  function normalise(value) {
    return String(value)
      .toLowerCase()
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Persian digits
      .replace(/[\u064b-\u065f\u0670\u0640]/g, '')            // tashkeel, dagger alef, tatweel
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[«»"'(),.،·–—\-/×:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Live region: clear first so repeated messages are announced again.
  const live = $('[data-live]');
  let liveTimer = 0;
  function say(message) {
    if (!live) return;
    live.textContent = '';
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => { live.textContent = message; }, 60);
  }

  /* ---------- Catalogue: the HTML is the single source of truth ---------- */
  const catalogue = new Map();
  $$('[data-products] > .product').forEach((el) => {
    const nameEl = $('.product-name', el);
    const notes = $('.product-notes', el);
    const name = nameEl.textContent.replace(/\s+/g, ' ').trim();
    catalogue.set(el.dataset.id, {
      id: el.dataset.id,
      el,
      name,
      nameHTML: nameEl.innerHTML,
      price: Number(el.dataset.price),
      cat: el.dataset.cat,
      tags: (el.dataset.tags || '').split(/\s+/).filter(Boolean),
      art: el.dataset.art || 'bag',
      style: el.getAttribute('style') || '',
      soldOut: el.hasAttribute('data-soldout'),
      keywords: normalise(`${name} ${el.dataset.keywords || ''} ${notes ? notes.textContent : ''}`),
    });
  });

  /* ---------- Cart state (survives reloads; storage may be unavailable) ---------- */
  const cart = new Map();
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    Object.entries(saved).forEach(([id, q]) => {
      const p = catalogue.get(id);
      const qty = Math.min(MAX_QTY, Math.floor(Number(q)) || 0);
      if (p && !p.soldOut && qty > 0) cart.set(id, qty);
    });
  } catch (_) { /* private mode or blocked storage: start with an empty cart */ }

  function saveCart() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cart))); } catch (_) { /* ignore */ }
  }

  function totals() {
    let count = 0;
    let subtotal = 0;
    cart.forEach((qty, id) => { count += qty; subtotal += qty * catalogue.get(id).price; });
    const shipping = count === 0 || subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
    return { count, subtotal, shipping, total: subtotal + shipping, remaining: Math.max(0, FREE_SHIPPING - subtotal) };
  }

  function shippingMessage(t) {
    if (t.count === 0) return `التوصيل مجاني للطلبات من ${money(FREE_SHIPPING)}`;
    if (t.remaining > 0) return `بقي ${money(t.remaining)} للتوصيل المجاني`;
    return 'التوصيل مجاني لطلبك';
  }

  /* ---------- Steppers ---------- */
  function buildStepper(p) {
    const wrap = document.createElement('div');
    wrap.className = 'stepper';
    wrap.dataset.id = p.id;
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', `كمية ${p.name}`);
    wrap.innerHTML =
      `<button type="button" class="step" data-step="-1" aria-label="إنقاص الكمية"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-minus"/></svg></button>` +
      `<span class="step-qty"><span class="sr-only">الكمية: </span><span data-step-num></span></span>` +
      `<button type="button" class="step" data-step="1" aria-label="زيادة الكمية"><svg class="i" aria-hidden="true" focusable="false"><use href="#i-plus"/></svg></button>`;
    return wrap;
  }

  function updateStepper(stepper, qty) {
    $('[data-step-num]', stepper).textContent = num.format(qty);
    const plus = $('[data-step="1"]', stepper);
    plus.setAttribute('aria-disabled', String(qty >= MAX_QTY));
  }

  function syncProductCard(p) {
    const holder = $('[data-qty]', p.el);
    if (!holder) return;
    const qty = cart.get(p.id) || 0;
    const add = $('[data-add]', holder);
    let stepper = $('.stepper', holder);
    if (qty > 0) {
      if (!stepper) {
        stepper = buildStepper(p);
        holder.append(stepper);
      }
      updateStepper(stepper, qty);
      stepper.hidden = false;
      add.hidden = true;
    } else {
      add.hidden = false;
      if (stepper) stepper.hidden = true;
    }
  }

  /* ---------- Cart sheet list (updated in place so focus is never dropped) ---------- */
  const cartList = $('[data-cart-items]');
  function cartItemFor(p) {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.dataset.cartId = p.id;
    li.setAttribute('style', p.style);
    li.innerHTML =
      `<div class="cart-item-media"><svg aria-hidden="true" focusable="false"><use href="#art-${escapeHTML(p.art)}"/></svg></div>` +
      `<div class="cart-item-info"><p class="cart-item-name">${p.nameHTML}</p><p class="cart-item-unit">${money(p.price)} للقطعة</p></div>` +
      `<div class="cart-item-ctrl"><p class="cart-item-total"></p></div>`;
    $('.cart-item-ctrl', li).prepend(buildStepper(p));
    return li;
  }

  function renderCartList(t) {
    const present = new Set();
    cart.forEach((qty, id) => {
      const p = catalogue.get(id);
      present.add(id);
      let li = cartList.querySelector(`[data-cart-id="${CSS.escape(id)}"]`);
      if (!li) {
        li = cartItemFor(p);
        cartList.append(li);
      }
      updateStepper($('.stepper', li), qty);
      $('.cart-item-total', li).textContent = money(qty * p.price);
    });
    $$('[data-cart-id]', cartList).forEach((li) => { if (!present.has(li.dataset.cartId)) li.remove(); });

    $('[data-cart-empty]').hidden = t.count > 0;
    $('[data-cart-summary]').hidden = t.count === 0;
    $('[data-subtotal]').textContent = money(t.subtotal);
    $('[data-shipping]').textContent = t.shipping === 0 ? 'مجاني' : money(t.shipping);
    $('[data-total]').textContent = money(t.total);
  }

  /* ---------- Render everything that depends on the cart ---------- */
  const countBadge = $('[data-cart-count]');
  const cartButton = $('[data-cart-button]');
  const cartBar = $('[data-cart-bar]');

  function render() {
    const t = totals();
    countBadge.textContent = num.format(t.count);
    countBadge.classList.toggle('is-empty', t.count === 0);
    cartButton.setAttribute('aria-label', t.count ? `السلة: ${countProducts(t.count)}، ${money(t.subtotal)}` : 'السلة فارغة');
    const menuLabel = $('[data-menu-cart-label]');
    if (menuLabel) {
      menuLabel.textContent = t.count ? `عرض السلة · ${countProducts(t.count)}` : 'السلة فارغة';
      // Filled (primary) only when there is something to check out.
      const menuCart = menuLabel.closest('.btn');
      menuCart.classList.toggle('btn--primary', t.count > 0);
      menuCart.classList.toggle('btn--outline', t.count === 0);
    }

    const msg = shippingMessage(t);
    $$('[data-ship-msg]').forEach((el) => { el.textContent = msg; });
    const pct = Math.min(100, Math.round((t.subtotal / FREE_SHIPPING) * 100));
    $$('[data-meter]').forEach((el) => {
      el.style.inlineSize = `${pct}%`;
      el.parentElement.classList.toggle('is-full', pct >= 100);
    });

    $('[data-bar-total]').textContent = t.count ? `${countProducts(t.count)} · ${money(t.subtotal)}` : '';
    const visible = t.count > 0;
    cartBar.classList.toggle('is-visible', visible);
    document.body.classList.toggle('has-cart-bar', visible);
    document.documentElement.classList.toggle('has-cart-bar', visible);

    renderCartList(t);
    catalogue.forEach(syncProductCard);
  }

  function setQty(id, qty) {
    const p = catalogue.get(id);
    if (!p || p.soldOut) return;
    const before = totals();
    const prev = cart.get(id) || 0;
    const next = Math.max(0, Math.min(MAX_QTY, qty));
    if (next === prev) return;
    if (next === 0) cart.delete(id); else cart.set(id, next);
    saveCart();
    render();

    const t = totals();
    let message;
    if (prev === 0) message = `أُضيف «${p.name}» إلى السلة.`;
    else if (next === 0) message = `أُزيل «${p.name}» من السلة.`;
    else message = `الكمية من «${p.name}»: ${num.format(next)}.`;
    if (t.count > 0) {
      message += ` في السلة ${countProducts(t.count)} بقيمة ${money(t.subtotal)}.`;
      if (before.remaining > 0 && t.remaining === 0) message += ' حصلت على توصيل مجاني.';
      else if (t.remaining > 0) message += ` بقي ${money(t.remaining)} للتوصيل المجاني.`;
    } else {
      message += ' السلة فارغة.';
    }
    say(message);

    if (next > prev && countBadge) {
      countBadge.classList.remove('is-bumped');
      void countBadge.offsetWidth; // restart the (reduced-motion-gated) bump
      countBadge.classList.add('is-bumped');
    }
  }

  /* ---------- Clicks: add, step, notify, checkout ---------- */
  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      const item = add.closest('.product');
      setQty(item.dataset.id, 1);
      const plus = $('.stepper [data-step="1"]', item);
      if (plus) plus.focus();
      return;
    }

    const step = event.target.closest('[data-step]');
    if (step) {
      if (step.getAttribute('aria-disabled') === 'true') return;
      const stepper = step.closest('.stepper');
      const id = stepper.dataset.id;
      const delta = Number(step.dataset.step);
      const inSheet = !!step.closest('[data-cart]');
      const sibling = inSheet ? step.closest('.cart-item') : null;
      const neighbour = sibling && (sibling.nextElementSibling || sibling.previousElementSibling);
      setQty(id, (cart.get(id) || 0) + delta);
      if (!cart.has(id)) {
        // Item removed: hand focus to something meaningful nearby.
        if (inSheet) {
          const target = neighbour && document.contains(neighbour) ? $('[data-step="-1"]', neighbour) : $('[data-cart] [data-close]');
          if (target) target.focus();
        } else {
          const addBtn = $('[data-add]', catalogue.get(id).el);
          if (addBtn) addBtn.focus();
        }
      }
      return;
    }

    const notify = event.target.closest('[data-notify]');
    if (notify) {
      const on = notify.getAttribute('aria-pressed') !== 'true';
      notify.setAttribute('aria-pressed', String(on));
      $('use', notify).setAttribute('href', on ? '#i-check' : '#i-bell');
      const name = catalogue.get(notify.closest('.product').dataset.id).name;
      say(on ? `سنُعلمك عند توفر «${name}».` : `ألغينا التنبيه لـ«${name}».`);
      return;
    }

    if (event.target.closest('[data-checkout]')) {
      const note = $('[data-checkout-note]');
      note.hidden = false;
      say(note.textContent);
    }
  });

  /* ---------- Category filter + search (one view state) ---------- */
  const statusEl = $('[data-results-status]');
  const clearBtn = $('[data-clear-filter]');
  const emptyEl = $('[data-empty]');
  const searchForm = $('[data-search]');
  const searchInput = $('[data-search-input]');
  const shopTitle = $('#shop-title');
  const LABELS = {
    beans: 'حبوب القهوة',
    drip: 'أكياس التقطير',
    tools: 'أدوات التحضير',
    gifts: 'صناديق الهدايا',
    harvest: 'محصول إثيوبيا الجديد',
  };
  const view = { filter: null, query: '' };

  function applyView() {
    const terms = normalise(view.query).split(' ').filter(Boolean);
    let shown = 0;
    catalogue.forEach((p) => {
      let ok = true;
      if (view.filter === 'harvest') ok = p.tags.includes('harvest');
      else if (view.filter) ok = p.cat === view.filter;
      if (ok && terms.length) ok = terms.every((term) => p.keywords.includes(term));
      p.el.hidden = !ok;
      if (ok) shown += 1;
    });

    $$('[data-cat-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.catFilter === view.filter)));

    // Status line; the query is isolated so Latin terms (e.g. V60) keep their order.
    const parts = [];
    if (view.query) {
      const bdi = document.createElement('bdi');
      bdi.textContent = view.query;
      parts.push('نتائج «', bdi, '»');
    } else {
      parts.push(view.filter ? LABELS[view.filter] : 'كل المنتجات');
    }
    parts.push(` · ${shown === 0 ? 'لا نتائج' : countProducts(shown)}`);
    statusEl.replaceChildren(...parts);

    clearBtn.hidden = !(view.filter || view.query);
    emptyEl.hidden = shown !== 0;
  }

  function setView(filter, query = '') {
    view.filter = filter;
    view.query = query;
    if (searchInput && searchInput.value.trim() !== query) searchInput.value = query;
    applyView();
  }

  function goToShop() {
    shopTitle.setAttribute('tabindex', '-1');
    $('#shop').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    shopTitle.focus({ preventScroll: true });
  }

  $$('[data-cat-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const f = button.dataset.catFilter;
      setView(view.filter === f ? null : f);
    });
  });

  clearBtn.addEventListener('click', () => {
    setView(null);
    shopTitle.setAttribute('tabindex', '-1');
    shopTitle.focus();
  });

  // Links that open a category (header nav, menu, footer, promo CTA).
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-filter]');
    if (!link) return;
    event.preventDefault();
    setView(link.dataset.filter);
    const sheet = link.closest('dialog');
    if (sheet && sheet.open) {
      sheet.dataset.noRestore = 'true';
      sheet.close();
    }
    goToShop();
  });

  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const q = searchInput.value.trim();
      if (q.length === 0 || q.length >= 2) setView(null, q);
    }, 180);
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    setView(null, searchInput.value.trim());
    // On phones the search row lives inside the pinned header: fold it away once results show,
    // and land on the results heading (the status line keeps the query and a clear button).
    if (header.classList.contains('is-search-open')) {
      setSearchOpen(false);
      goToShop();
    } else {
      $('#shop').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
  });
  $$('[data-suggest]', searchForm).forEach((b) => {
    b.addEventListener('click', () => {
      searchInput.value = b.dataset.suggest;
      searchForm.requestSubmit();
    });
  });

  /* ---------- Mobile search panel ---------- */
  const header = $('[data-header]');
  const searchToggle = $('[data-search-toggle]');
  function setSearchOpen(open) {
    header.classList.toggle('is-search-open', open);
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) searchInput.focus();
  }
  searchToggle.addEventListener('click', () => setSearchOpen(searchToggle.getAttribute('aria-expanded') !== 'true'));
  searchForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-search-open')) {
      setSearchOpen(false);
      searchToggle.focus();
    }
  });

  /* ---------- Sheets: native modal <dialog> (focus containment, Esc, inert page) ---------- */
  const menuSheet = $('[data-menu]');
  const cartSheet = $('[data-cart]');
  const menuToggle = $('[data-menu-toggle]');
  const returnFocus = new WeakMap();
  // The cart bar keeps `visibility: visible` while it slides away, so ask its state class too.
  const canFocus = (el) => !!el && el.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    !(el.closest('[data-cart-bar]') && !cartBar.classList.contains('is-visible'));

  function openSheet(sheet, trigger) {
    if (!sheet || typeof sheet.showModal !== 'function') return;
    $$('dialog[open]').forEach((d) => {
      if (d !== sheet) {
        d.dataset.noRestore = 'true';
        d.close();
      }
    });
    // A trigger inside another sheet hands focus back to the header control instead.
    const origin = trigger && !trigger.closest('dialog') ? trigger : (sheet === cartSheet ? cartButton : menuToggle);
    returnFocus.set(sheet, origin);
    sheet.showModal();
    if (sheet === menuSheet) menuToggle.setAttribute('aria-expanded', 'true');
  }

  [menuSheet, cartSheet].forEach((sheet) => {
    if (!sheet) return;
    sheet.addEventListener('close', () => {
      if (sheet === menuSheet) menuToggle.setAttribute('aria-expanded', 'false');
      if (sheet.dataset.noRestore) {
        delete sheet.dataset.noRestore;
        return;
      }
      // Return focus to the control that opened the sheet; if it has gone (e.g. the cart bar
      // hid because the cart was emptied), fall back to the header cart button.
      const origin = returnFocus.get(sheet);
      if (canFocus(origin)) origin.focus();
      else if (canFocus(cartButton)) cartButton.focus();
    });
    // Click on the backdrop closes the sheet.
    sheet.addEventListener('click', (event) => {
      if (event.target !== sheet) return;
      const r = sheet.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) sheet.close();
    });
    $$('[data-close]', sheet).forEach((b) => b.addEventListener('click', () => sheet.close()));
  });

  menuToggle.addEventListener('click', () => openSheet(menuSheet, menuToggle));
  $$('[data-open-cart]').forEach((b) => b.addEventListener('click', () => openSheet(cartSheet, b)));

  // Same-page links inside the menu (guide, delivery…) close it before jumping.
  $$('a[href^="#"]:not([data-filter])', menuSheet).forEach((a) => {
    a.addEventListener('click', () => {
      menuSheet.dataset.noRestore = 'true';
      menuSheet.close();
    });
  });

  /* ---------- Brew-guide carousel (RTL-aware scrolling) ---------- */
  const track = $('[data-track]');
  const prevBtn = $('[data-prev]');
  const nextBtn = $('[data-next]');
  if (track && prevBtn && nextBtn) {
    // In RTL, scrollLeft runs from 0 (start, right edge) to negative values.
    const sign = () => (getComputedStyle(track).direction === 'rtl' ? -1 : 1);
    const stepSize = () => {
      const first = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return first ? first.getBoundingClientRect().width + gap : track.clientWidth;
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const pos = Math.abs(track.scrollLeft);
      const scrollable = max > 2;
      prevBtn.setAttribute('aria-disabled', String(!scrollable || pos <= 2));
      nextBtn.setAttribute('aria-disabled', String(!scrollable || pos >= max - 2));
    };
    const go = (dir, button) => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      track.scrollBy({ left: dir * sign() * stepSize(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    };
    prevBtn.addEventListener('click', () => go(-1, prevBtn));
    nextBtn.addEventListener('click', () => go(1, nextBtn));
    let frame = 0;
    track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  render();
  applyView();
})();
