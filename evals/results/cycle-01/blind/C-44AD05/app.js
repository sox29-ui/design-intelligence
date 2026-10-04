/* دكّان القهوة — progressive enhancement (the page is fully readable without JS).
   Cart + free-shipping progress, category/search/sort filtering, drawers, brew rail. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const FREE_SHIPPING = 199;
  const MAX_QTY = 20;
  const STORE_KEY = 'dukkan-cart-v1';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Numerals: Western digits (0–9) everywhere, matching the static HTML. */
  const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const sar = (n) => `${num(n)}\u00A0ر.س`; // no-break space keeps number and currency together

  /* Arabic plural forms (zero/one/two/few/many/other). */
  const pluralRules = new Intl.PluralRules('ar');
  const FORMS = {
    product: { zero: 'لا توجد منتجات', one: 'منتج واحد', two: 'منتجان', few: '{n}\u00A0منتجات', many: '{n}\u00A0منتجًا', other: '{n}\u00A0منتج' },
    piece: { zero: 'لا قطع', one: 'قطعة واحدة', two: 'قطعتان', few: '{n}\u00A0قطع', many: '{n}\u00A0قطعة', other: '{n}\u00A0قطعة' },
  };
  const plural = (n, kind) => FORMS[kind][pluralRules.select(n)].replace('{n}', String(n));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Search normalisation: hamza/alef forms, taa marbuta, alef maqsura, tashkeel, tatweel, Arabic-Indic digits. */
  const normalize = (s) => String(s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const stripArticle = (t) => (t.length > 4 && t.startsWith('ال') ? t.slice(2) : t);

  /* Live announcements for screen readers */
  const announcer = $('#announcer');
  let announceTimer;
  const announce = (msg) => {
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announceTimer = setTimeout(() => { announcer.textContent = msg; }, 80);
  };

  /* ---------- Products (read from the server-rendered cards) ---------- */
  const CAT_NAMES = { beans: 'حبوب القهوة', drip: 'أكياس التقطير', tools: 'أدوات التحضير', gifts: 'صناديق الهدايا' };
  const grid = $('#grid');
  const products = new Map();

  $$('.card', grid).forEach((el) => {
    const nameEl = $('.card__name', el);
    const name = nameEl.textContent.replace(/\s+/g, ' ').trim();
    const p = {
      id: el.dataset.id,
      el,
      name,
      nameHTML: nameEl.innerHTML,
      price: Number(el.dataset.price),
      cat: el.dataset.cat,
      tags: (el.dataset.tags || '').split(/\s+/).filter(Boolean),
      rating: Number(el.dataset.rating),
      rank: Number(el.dataset.rank),
      inStock: el.dataset.stock !== 'out',
      size: (($('.card__size [aria-hidden]', el) || $('.card__size', el)) || {}).textContent || '',
      style: el.getAttribute('style') || '',
      art: ($('.card__art use', el) || { getAttribute: () => '#art-bag' }).getAttribute('href'),
    };
    p.hay = normalize([name, ($('.card__notes', el) || {}).textContent, el.dataset.keywords, CAT_NAMES[p.cat]].join(' '));

    if (p.inStock) {
      p.addBtn = $('[data-add]', el);
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      stepper.hidden = true;
      stepper.setAttribute('role', 'group');
      stepper.setAttribute('aria-label', `الكمية في السلة: ${name}`);
      stepper.innerHTML =
        '<button type="button" data-dec><svg class="i" aria-hidden="true"><use href="#i-minus"/></svg></button>' +
        '<span class="stepper__qty">1</span>' +
        `<button type="button" data-inc aria-label="زيادة كمية ${esc(name)}"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>`;
      $('.card__action', el).append(stepper);
      p.stepper = stepper;
    }
    products.set(p.id, p);
  });

  /* ---------- Cart state ---------- */
  let cart = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    Object.entries(saved).forEach(([id, q]) => {
      const p = products.get(id);
      if (p && p.inStock && Number.isInteger(q) && q > 0) cart[id] = Math.min(q, MAX_QTY);
    });
  } catch (_) { cart = {}; }
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(cart)); } catch (_) { /* private mode */ } };

  const totals = () => {
    let pieces = 0;
    let sum = 0;
    Object.entries(cart).forEach(([id, q]) => { pieces += q; sum += products.get(id).price * q; });
    return { pieces, sum };
  };

  const cartToggle = $('#cart-toggle');
  const cartBar = $('#cart-bar');
  const cartSheet = $('#cart-sheet');
  const cartList = $('#cart-list');
  const cartEmpty = $('#cart-empty');
  const cartFoot = $('#cart-foot');

  function stepperMarkup(p, q) {
    const decLabel = q === 1 ? `إزالة ${p.name} من السلة` : `إنقاص كمية ${p.name}`;
    return (
      `<div class="stepper" role="group" aria-label="الكمية: ${esc(p.name)}">` +
      `<button type="button" data-dec aria-label="${esc(decLabel)}"><svg class="i" aria-hidden="true"><use href="${q === 1 ? '#i-trash' : '#i-minus'}"/></svg></button>` +
      `<span class="stepper__qty">${q}</span>` +
      `<button type="button" data-inc aria-label="زيادة كمية ${esc(p.name)}"${q >= MAX_QTY ? ' disabled' : ''}><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg></button>` +
      '</div>'
    );
  }

  function syncStepper(stepper, p, q) {
    const dec = $('[data-dec]', stepper);
    const inc = $('[data-inc]', stepper);
    $('.stepper__qty', stepper).textContent = String(q);
    dec.setAttribute('aria-label', q === 1 ? `إزالة ${p.name} من السلة` : `إنقاص كمية ${p.name}`);
    $('use', dec).setAttribute('href', q === 1 ? '#i-trash' : '#i-minus');
    inc.disabled = q >= MAX_QTY;
  }

  /* Keyed update of the drawer list, so focus survives quantity changes. */
  function renderDrawerList() {
    const ids = Object.keys(cart);
    $$('.cart-item', cartList).forEach((li) => { if (!cart[li.dataset.id]) li.remove(); });
    ids.forEach((id) => {
      const p = products.get(id);
      const q = cart[id];
      let li = $(`.cart-item[data-id="${id}"]`, cartList);
      if (!li) {
        li = document.createElement('li');
        li.className = 'cart-item';
        li.dataset.id = id;
        li.innerHTML =
          `<span class="cart-item__art" style="${esc(p.style)}"><svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><use href="${esc(p.art)}"/></svg></span>` +
          '<div class="cart-item__info">' +
          `<p class="cart-item__name">${p.nameHTML}</p>` +
          `<p class="cart-item__meta">${esc(p.size)} · ${sar(p.price)} للقطعة</p>` +
          `<div class="cart-item__row">${stepperMarkup(p, q)}<p class="cart-item__price"></p></div>` +
          '</div>';
        cartList.append(li);
      }
      syncStepper($('.stepper', li), p, q);
      $('.cart-item__price', li).textContent = sar(p.price * q);
    });
  }

  function render() {
    const { pieces, sum } = totals();
    const remaining = Math.max(0, FREE_SHIPPING - sum);

    $$('[data-cart-count]').forEach((b) => {
      b.textContent = String(pieces);
      b.classList.toggle('is-empty', pieces === 0);
    });
    cartToggle.setAttribute('aria-label', pieces ? `السلة، ${plural(pieces, 'piece')}` : 'السلة، فارغة');
    $('[data-cart-heading-count]').textContent = pieces ? `(${plural(pieces, 'piece')})` : '';

    products.forEach((p) => {
      if (!p.inStock) return;
      const q = cart[p.id] || 0;
      p.addBtn.hidden = q > 0;
      p.stepper.hidden = q === 0;
      if (q) syncStepper(p.stepper, p, q);
    });

    let shipHTML;
    if (sum === 0) shipHTML = `التوصيل مجاني للطلبات فوق <strong>${sar(FREE_SHIPPING)}</strong>`;
    else if (remaining > 0) shipHTML = `أضف <strong>${sar(remaining)}</strong> ليصبح التوصيل مجانيًا`;
    else shipHTML = '<strong>رائع! توصيل طلبك مجاني</strong>';
    $$('[data-ship-msg]').forEach((el) => { el.innerHTML = shipHTML; });
    const pct = Math.min(100, (sum / FREE_SHIPPING) * 100);
    $$('[data-ship-meter]').forEach((el) => { el.style.setProperty('inline-size', `${pct}%`); });

    cartBar.hidden = pieces === 0;
    $$('[data-cart-total]').forEach((el) => { el.textContent = sar(sum); });
    $$('[data-cart-subtotal]').forEach((el) => { el.textContent = sar(sum); });
    $$('[data-cart-shipping]').forEach((el) => { el.textContent = remaining === 0 ? 'مجاني' : 'من 19 ر.س'; });
    $$('[data-tabby]').forEach((el) => { el.textContent = num(Math.round((sum / 4) * 100) / 100); });

    cartEmpty.hidden = pieces > 0;
    cartFoot.hidden = pieces === 0;
    renderDrawerList();
  }

  const badge = $('[data-cart-count]');
  function bumpBadge() {
    if (reduceMotion.matches) return;
    badge.classList.remove('bump');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('bump');
  }

  function setQty(id, q, reason) {
    const p = products.get(id);
    if (!p || !p.inStock) return;
    const before = totals().sum;
    const next = Math.max(0, Math.min(MAX_QTY, q));
    if (next === 0) delete cart[id];
    else cart[id] = next;
    persist();
    render();

    const { pieces, sum } = totals();
    let msg;
    if (next === 0) msg = `تمت إزالة ${p.name} من السلة.`;
    else if (reason === 'add') msg = `تمت إضافة ${p.name} إلى السلة.`;
    else msg = `الكمية الآن ${next}: ${p.name}.`;
    msg += pieces ? ` في سلتك ${plural(pieces, 'piece')} بمجموع ${sar(sum)}.` : ' سلتك فارغة.';
    if (before < FREE_SHIPPING && sum >= FREE_SHIPPING) msg += ' أصبح التوصيل مجانيًا.';
    announce(msg);
    if (next > 0 && reason !== 'dec') bumpBadge();
  }

  /* Card controls */
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const p = products.get((btn.closest('.card') || {}).dataset?.id);
    if (!p) return;

    if (btn.matches('[data-add]')) {
      setQty(p.id, 1, 'add');
      $('[data-inc]', p.stepper).focus();
    } else if (btn.matches('[data-inc]')) {
      setQty(p.id, (cart[p.id] || 0) + 1, 'inc');
    } else if (btn.matches('[data-dec]')) {
      const q = (cart[p.id] || 0) - 1;
      setQty(p.id, q, 'dec');
      if (q <= 0) p.addBtn.focus();
    } else if (btn.matches('[data-notify]')) {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      $('use', btn).setAttribute('href', on ? '#i-check' : '#i-bell');
      announce(on ? `سنُعلمك فور توفر ${p.name}.` : `ألغينا تنبيه توفر ${p.name}.`);
    }
  });

  /* Drawer controls */
  cartList.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const li = btn && btn.closest('.cart-item');
    if (!li) return;
    const id = li.dataset.id;
    if (btn.matches('[data-inc]')) {
      setQty(id, cart[id] + 1, 'inc');
    } else if (btn.matches('[data-dec]')) {
      const q = cart[id] - 1;
      const neighbour = li.nextElementSibling || li.previousElementSibling;
      setQty(id, q, 'dec');
      if (q <= 0) {
        const target = neighbour && neighbour.isConnected ? $('[data-dec]', neighbour) : $('#cart-empty .btn');
        if (target) target.focus();
      }
    }
  });

  /* ---------- Drawers ---------- */
  const root = document.documentElement;
  function openSheet(dialog) {
    if (!dialog || dialog.open) return;
    closeSearch(false);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    root.classList.add('is-locked');
  }
  function closeSheet(dialog) {
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); root.classList.remove('is-locked'); }
  }
  $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => openSheet(document.getElementById(btn.dataset.open))));
  $$('dialog.sheet').forEach((dialog) => {
    dialog.addEventListener('close', () => root.classList.remove('is-locked'));
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) { closeSheet(dialog); return; } // backdrop
      const closer = e.target.closest('[data-close], a[href^="#"]');
      if (closer && !closer.matches('a[href="#"]')) closeSheet(dialog);
    });
  });

  /* ---------- Filtering, search, sort ---------- */
  const state = { cat: 'all', tag: '', q: '', sort: 'popular' };
  const resultCount = $('#result-count');
  const activeFilters = $('#active-filters');
  const emptyBox = $('#empty');
  const catButtons = $$('.cat');
  const sortSelect = $('#sort');
  const searchInput = $('#q');
  const searchStatus = $('#search-status');

  const SORTERS = {
    popular: (a, b) => a.rank - b.rank,
    'price-asc': (a, b) => (b.inStock - a.inStock) || (a.price - b.price) || (a.rank - b.rank),
    'price-desc': (a, b) => (b.inStock - a.inStock) || (b.price - a.price) || (a.rank - b.rank),
    rating: (a, b) => (b.inStock - a.inStock) || (b.rating - a.rating) || (a.rank - b.rank),
  };

  function applyFilters({ announceResult = false } = {}) {
    const tokens = normalize(state.q).split(' ').filter(Boolean).map(stripArticle);
    const list = Array.from(products.values()).sort(SORTERS[state.sort] || SORTERS.popular);
    let shown = 0;
    const frag = document.createDocumentFragment();
    list.forEach((p) => {
      const ok = (state.cat === 'all' || p.cat === state.cat)
        && (!state.tag || p.tags.includes(state.tag))
        && tokens.every((t) => p.hay.includes(t));
      p.el.hidden = !ok;
      if (ok) shown += 1;
      frag.append(p.el); // DOM order = visual order = focus order
    });
    grid.append(frag);

    catButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === state.cat)));
    resultCount.textContent = plural(shown, 'product');
    emptyBox.hidden = shown > 0;

    const chips = [];
    if (state.tag === 'new') chips.push({ key: 'tag', html: 'المحصول الجديد', label: 'المحصول الجديد' });
    if (state.q) chips.push({ key: 'q', html: `البحث: «<bdi>${esc(state.q)}</bdi>»`, label: `البحث: ${state.q}` });
    activeFilters.innerHTML = chips.map((c) =>
      `<button class="chip-x" type="button" data-clear="${c.key}" aria-label="إزالة التصفية: ${esc(c.label)}"><span>${c.html}</span><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button>`
    ).join('');
    activeFilters.hidden = chips.length === 0;

    if (announceResult) announce(shown ? `يُعرض ${plural(shown, 'product')}.` : 'لا توجد منتجات تطابق اختيارك.');
    return shown;
  }

  const scrollToShop = () => {
    $('#shop').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  };

  catButtons.forEach((btn) => btn.addEventListener('click', () => {
    state.cat = btn.dataset.cat;
    state.tag = '';
    applyFilters({ announceResult: true });
  }));

  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    applyFilters({ announceResult: true });
  });

  activeFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    if (btn.dataset.clear === 'tag') state.tag = '';
    if (btn.dataset.clear === 'q') { state.q = ''; searchInput.value = ''; updateSearchStatus(); }
    applyFilters({ announceResult: true });
    resultCount.focus({ preventScroll: true });
  });

  $('[data-clear-all]').addEventListener('click', () => {
    Object.assign(state, { cat: 'all', tag: '', q: '' });
    searchInput.value = '';
    updateSearchStatus();
    applyFilters({ announceResult: true });
    resultCount.focus({ preventScroll: true });
  });

  /* Links that jump to the shop with a preset filter (hero CTA, menus, footer). */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-cat-link], [data-filter-tag]');
    if (!link) return;
    state.cat = link.dataset.catLink || 'all';
    state.tag = link.dataset.filterTag || '';
    state.q = '';
    searchInput.value = '';
    updateSearchStatus();
    applyFilters();
  });

  /* Placeholder links (pages outside this prototype) do nothing instead of jumping to the top. */
  document.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#"]')) e.preventDefault();
  });

  /* Search */
  const searchToggle = $('#search-toggle');
  const searchPanel = $('#search-panel');
  const searchForm = $('#search-form');

  function updateSearchStatus(count) {
    if (!state.q) { searchStatus.textContent = ''; return; }
    searchStatus.textContent = count
      ? `${plural(count, 'product')} — اضغط «بحث» لعرض النتائج`
      : 'لا نتائج، جرّب كلمة أخرى';
  }
  function openSearch() {
    searchPanel.hidden = false;
    searchToggle.setAttribute('aria-expanded', 'true');
    searchInput.focus();
  }
  function closeSearch(returnFocus) {
    if (searchPanel.hidden) return;
    searchPanel.hidden = true;
    searchToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) searchToggle.focus();
  }
  searchToggle.addEventListener('click', () => (searchPanel.hidden ? openSearch() : closeSearch(true)));
  searchPanel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(true); });

  let typingTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      state.q = searchInput.value.trim();
      if (state.q) { state.cat = 'all'; state.tag = ''; }
      updateSearchStatus(applyFilters());
    }, 120);
  });
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(typingTimer);
    state.q = searchInput.value.trim();
    if (state.q) { state.cat = 'all'; state.tag = ''; }
    const shown = applyFilters();
    updateSearchStatus(shown);
    closeSearch(false);
    scrollToShop();
    resultCount.focus({ preventScroll: true });
    announce(shown ? `نتائج البحث: ${plural(shown, 'product')}.` : 'لا توجد نتائج لبحثك.');
  });
  $$('[data-q]').forEach((btn) => btn.addEventListener('click', () => {
    searchInput.value = btn.dataset.q;
    searchForm.requestSubmit();
  }));

  /* ---------- Brew rail: RTL-aware prev/next ---------- */
  const rail = $('#brew-rail');
  if (rail) {
    const prev = $('[data-rail-prev]');
    const next = $('[data-rail-next]');
    const dots = $$('.rail-dots span');
    const slides = $$('.brew-card', rail);
    const isRTL = () => getComputedStyle(rail).direction === 'rtl';
    const step = () => slides[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(rail).columnGap) || 0);

    const go = (dir) => {
      const btn = dir > 0 ? next : prev;
      if (btn.getAttribute('aria-disabled') === 'true') return;
      // In RTL, "next" moves toward the inline-end (left): scrollLeft runs 0 → negative.
      rail.scrollBy({ left: dir * step() * (isRTL() ? -1 : 1), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));

    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const pos = Math.abs(rail.scrollLeft);
      prev.setAttribute('aria-disabled', String(pos <= 2));
      next.setAttribute('aria-disabled', String(pos >= max - 2));
      const index = pos >= max - 2 ? slides.length - 1 : Math.min(slides.length - 1, Math.round(pos / step()));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    };
    let frame;
    rail.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- Init ---------- */
  render();
  applyFilters();
})();
