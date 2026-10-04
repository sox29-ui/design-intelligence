/* دكّان القهوة — Dukkan Al-Qahwa · home page behaviour
   Vanilla JS, no dependencies. Arabic (RTL) is the source language in the HTML;
   English is applied on demand from the dictionary below and fully reversible. */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FREE_SHIPPING = 199;
  const MAX_QTY = 10;
  const CITIES = {
    riyadh: { fee: 15, sameDay: true },
    jeddah: { fee: 25 }, makkah: { fee: 25 }, madinah: { fee: 25 }, dammam: { fee: 25 }, other: { fee: 25 }
  };

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep working in memory */ }
    }
  };

  /* ------------------------------------------------------------------
     Strings
     ------------------------------------------------------------------ */
  // Dynamic strings (both languages).
  const STR = {
    ar: {
      title: 'دكّان القهوة | قهوة مختصة محمّصة في الرياض',
      description: 'دكّان القهوة: محمصة قهوة مختصة في الرياض. حبوب طازجة وأكياس تقطير وأدوات تحضير وصناديق هدايا، توصيل في اليوم نفسه داخل الرياض ومجاني للطلبات فوق 199 ر.س.',
      cartEmpty: 'السلة فارغة',
      cartLabel: 'السلة: {items}',
      added: 'أُضيف {name} إلى السلة. في السلة الآن {items}.',
      removed: 'حُذف {name} من السلة.',
      qty: 'الكمية {qty}',
      maxQty: 'الحد الأقصى {qty} لكل منتج.',
      qtyOf: 'كمية {name}',
      inc: 'زيادة الكمية',
      dec: 'إنقاص الكمية',
      removeItem: 'حذف {name} من السلة',
      notifyOn: 'سنُعلمك عند التوفر',
      notifyOff: 'أعلمني عند التوفر',
      notifyOnMsg: 'تم، سنرسل لك تنبيهًا فور توفر {name}.',
      notifyOffMsg: 'ألغينا تنبيه {name}.',
      shipIdle: 'التوصيل مجاني للطلبات فوق {free}',
      shipLeft: 'باقي {left} وتحصل على توصيل مجاني',
      shipDone: 'رائع! طلبك مؤهّل للتوصيل المجاني',
      shipShortLeft: 'باقي {left} للتوصيل المجاني',
      shipShortDone: 'التوصيل مجاني لطلبك',
      free: 'مجاني',
      etaRiyadh: 'يصلك اليوم إذا طلبت قبل 2 ظهرًا',
      etaOther: 'يصلك خلال 2 إلى 4 أيام عمل',
      demoLink: 'هذه الصفحة غير متاحة في النسخة التجريبية.',
      demoCheckout: 'الدفع غير مفعّل في هذه النسخة التجريبية.',
      noResults: 'لا توجد نتائج',
      searchFor: 'نتائج البحث عن',
      quote: q => `«${q}»`,
      rating: 'التقييم {r} من 5، {reviews}',
      priceNow: 'السعر: ',
      priceSale: 'السعر بعد الخصم: ',
      priceWas: 'بدلًا من ',
      currencySr: ' ريال سعودي',
      unitEach: '{price} للقطعة',
      otherLang: 'English',
      otherLangShort: 'EN'
    },
    en: {
      title: 'Dukkan Al-Qahwa | Specialty coffee roasted in Riyadh',
      description: 'Dukkan Al-Qahwa is a specialty coffee roaster in Riyadh: fresh beans, drip bags, brewing tools and gift boxes, with same-day delivery in Riyadh and free delivery over SAR 199.',
      cartEmpty: 'Cart is empty',
      cartLabel: 'Cart: {items}',
      added: '{name} added to cart. {items} in cart.',
      removed: '{name} removed from cart.',
      qty: 'Quantity {qty}',
      maxQty: 'Limit of {qty} per product.',
      qtyOf: 'Quantity of {name}',
      inc: 'Increase quantity',
      dec: 'Decrease quantity',
      removeItem: 'Remove {name} from cart',
      notifyOn: 'We’ll notify you',
      notifyOff: 'Notify me',
      notifyOnMsg: 'Done — we’ll let you know when {name} is back.',
      notifyOffMsg: 'Alert for {name} cancelled.',
      shipIdle: 'Free delivery on orders over {free}',
      shipLeft: '{left} away from free delivery',
      shipDone: 'Nice! Your order ships free',
      shipShortLeft: '{left} to free delivery',
      shipShortDone: 'Your delivery is free',
      free: 'Free',
      etaRiyadh: 'Arrives today if you order before 2 PM',
      etaOther: 'Arrives in 2 to 4 business days',
      demoLink: 'This page isn’t available in the demo.',
      demoCheckout: 'Checkout is disabled in this demo.',
      noResults: 'No results',
      searchFor: 'Results for',
      quote: q => `“${q}”`,
      rating: 'Rated {r} out of 5, {reviews}',
      priceNow: 'Price: ',
      priceSale: 'Sale price: ',
      priceWas: 'was ',
      currencySr: ' Saudi riyals',
      unitEach: '{price} each',
      otherLang: 'العربية',
      otherLangShort: 'عربي'
    }
  };

  // Arabic plural categories: zero / one / two / few (3–10) / many (11–99) / other (100+).
  const PLURALS = {
    ar: {
      items: { zero: 'لا توجد منتجات', one: 'منتج واحد', two: 'منتجان', few: '{n} منتجات', many: '{n} منتجًا', other: '{n} منتج' },
      reviews: { zero: 'لا توجد مراجعات', one: 'مراجعة واحدة', two: 'مراجعتان', few: '{n} مراجعات', many: '{n} مراجعة', other: '{n} مراجعة' }
    },
    en: {
      items: { one: '{n} item', other: '{n} items' },
      reviews: { one: '{n} review', other: '{n} reviews' }
    }
  };

  // Static copy for [data-i18n], [data-i18n-html] and [data-i18n-attr] keys (Arabic lives in the HTML).
  const EN = {
    'skip': 'Skip to main content',
    'announce': 'Free delivery over SAR 199 · Same-day in Riyadh',
    'menu.open': 'Open menu',
    'logo.label': 'Dukkan Al-Qahwa – Home',
    'search.label': 'Search the store',
    'search.ph': 'Search beans, tools or V60',
    'search.submit': 'Search',
    'search.clear': 'Clear search',
    'nav.label': 'Shop sections',
    'nav.harvest': 'Ethiopian harvest',
    'nav.brew': 'Brew guide',
    'nav.trust': 'Payment & returns',
    'nav.support': 'Customer care',
    'cat.beans': 'Coffee beans',
    'cat.drip': 'Drip bags',
    'cat.tools': 'Brewing tools',
    'cat.gifts': 'Gift boxes',
    'hero.eyebrow': 'Harvest season · 2026 crop',
    'hero.title': 'The new Ethiopian harvest has landed',
    'hero.text': 'This year’s Guji and Yirgacheffe lots, roasted fresh every week in Riyadh. Blueberry, jasmine and citrus in every cup.',
    'hero.cta': 'Shop the Ethiopian harvest',
    'hero.f1': 'Limited lots',
    'hero.f2': 'Free drip bag with harvest orders',
    'promise.title': 'Delivery & shipping',
    'promise.ryd.label': 'Within Riyadh',
    'promise.ryd.value': 'Same-day delivery',
    'promise.ryd.note': 'Order before 2 PM',
    'promise.ryd.fee': 'Delivery fee SAR 15',
    'promise.ksa.label': 'Rest of the Kingdom',
    'promise.ksa.value': '2 to 4 business days',
    'promise.ksa.note': 'Tracked, to your door',
    'promise.ksa.fee': 'Shipping fee SAR 25',
    'cats.title': 'Shop by category',
    'shop.title': 'Best sellers',
    'shop.vat': 'Prices include VAT',
    'shop.filter': 'Filter products by category',
    'chip.all': 'All',
    'sort.label': 'Sort by',
    'sort.popular': 'Best selling',
    'sort.priceAsc': 'Price: low to high',
    'sort.priceDesc': 'Price: high to low',
    'sort.rating': 'Top rated',
    'badge.new': 'New harvest',
    'badge.sale': '20% off',
    'badge.out': 'Sold out',
    'cta.add': 'Add to cart',
    'cta.notify': 'Notify me',
    'p.goji': 'Ethiopia Guji – Natural',
    'p.goji.meta': '250 g · Blueberry & jasmine',
    'p.yirga': 'Ethiopia Yirgacheffe – Washed',
    'p.yirga.meta': '250 g · Lemon & orange blossom',
    'p.v60': 'V60 ceramic dripper',
    'p.v60.meta': 'Size 02 · weighs 410 g',
    'p.dripEth': 'Drip bags – Ethiopia',
    'p.dripEth.meta': '10 bags × 12 g',
    'p.khawlani': 'Jazan Khawlani – Natural',
    'p.khawlani.meta': '200 g · Date & cinnamon',
    'p.espresso': 'Dukkan Blend – Espresso',
    'p.espresso.meta': '500 g · Dark chocolate & hazelnut',
    'p.giftRiyadh': '“Riyadh Morning” gift box',
    'p.giftRiyadh.meta': '3 origins × 125 g + gift card',
    'p.kettle': 'Gooseneck pour-over kettle',
    'p.kettle.meta': '0.8 L capacity · weighs 1.1 kg',
    'p.colombia': 'Colombia Huila – Pink Bourbon',
    'p.colombia.meta': '250 g · Strawberry & caramel',
    'p.dripMix': 'Drip bag Discovery set',
    'p.dripMix.meta': '12 bags from 4 origins',
    'p.grinder': 'Hand burr grinder',
    'p.grinder.meta': '25 g capacity · weighs 480 g',
    'p.giftStarter': 'Pour-over starter box',
    'p.giftStarter.meta': 'V60, filters & 250 g coffee',
    'empty.title': 'No matching products',
    'empty.text': 'Try another word or browse everything.',
    'empty.reset': 'Show all products',
    'brew.title': 'Brew guide',
    'brew.sub': 'Three easy ways to brew specialty coffee at home, with exact ratios and clear steps.',
    'brew.region': 'Brewing methods',
    'carousel.prev': 'Previous method',
    'carousel.next': 'Next method',
    'brew.v60.t': 'V60 pour-over',
    'brew.v60.d': 'A clean cup that brings out the floral notes of Ethiopian coffees.',
    'brew.v60.time': '3 min',
    'brew.v60.grind': 'Medium grind',
    'brew.ratio': 'Coffee-to-water ratio',
    'brew.read': 'Read the method',
    'brew.cold.t': 'Cold brew',
    'brew.cold.d': 'Smooth and refreshing for Riyadh summers, steeped overnight in the fridge.',
    'brew.cold.time': '12 hours',
    'brew.cold.grind': 'Coarse grind',
    'brew.saudi.t': 'Saudi coffee',
    'brew.saudi.d': 'Light roast with cardamom and saffron, Najdi style, served with dates.',
    'brew.saudi.time': '15 min',
    'brew.saudi.extra': 'Cardamom & saffron',
    'brew.all': 'All brew guides',
    'trust.title': 'Shop with confidence',
    'trust.pay.t': 'Secure, flexible payment',
    'trust.pay.d': 'Pay with mada, Apple Pay or your credit card — or split it into 4 interest-free payments with Tabby.',
    'trust.pay.list': 'Accepted payment methods',
    'trust.ret.t': 'Easy returns & exchanges',
    'trust.ret.d': 'Return unused tools within 14 days of delivery for a full refund. If your coffee arrives damaged or wrong, we replace it free.',
    'trust.ret.link': 'Returns policy',
    'trust.care.t': 'Customer care',
    'trust.care.week': 'Saturday – Thursday',
    'trust.care.weekHours': '9 AM – 11 PM',
    'trust.care.fri': 'Friday',
    'trust.care.friHours': '4 PM – 11 PM',
    'trust.care.wa': 'WhatsApp',
    'trust.care.mail': 'Email',
    'trust.care.note': 'We usually reply within 10 minutes.',
    'footer.about': 'A small specialty roastery in Riyadh. We roast every week and deliver across the Kingdom.',
    'footer.nav': 'Site links',
    'footer.shop': 'Shop',
    'footer.help': 'Help',
    'footer.shipping': 'Shipping & delivery',
    'footer.returns': 'Returns & exchanges',
    'footer.faq': 'FAQ',
    'footer.contact': 'Contact us',
    'footer.about.h': 'About Dukkan',
    'footer.story': 'Our story',
    'footer.terms': 'Terms & conditions',
    'footer.privacy': 'Privacy policy',
    'footer.follow': 'Follow us',
    'social.ig': 'Instagram',
    'social.x': 'X',
    'social.tt': 'TikTok',
    'social.sc': 'Snapchat',
    'footer.cr': 'Commercial Registration:',
    'footer.vat': 'VAT No.:',
    'footer.copy': '© 2026 Dukkan Al-Qahwa. All rights reserved.',
    'cartbar.view': 'View cart',
    'menu.title': 'Menu',
    'menu.close': 'Close menu',
    'menu.nav': 'Main menu',
    'menu.all': 'All products',
    'menu.new': 'New',
    'menu.hours': 'Customer care daily until 11 PM',
    'cart.title': 'Your cart',
    'cart.close': 'Close cart',
    'cart.empty.t': 'Your cart is empty',
    'cart.empty.d': 'Start with the new Ethiopian harvest, roasted this week.',
    'cart.empty.cta': 'Shop the harvest',
    'cart.gift': 'Harvest gift: a free Ethiopia drip bag with your order',
    'cart.city': 'Delivery city',
    'city.riyadh': 'Riyadh',
    'city.jeddah': 'Jeddah',
    'city.makkah': 'Makkah',
    'city.madinah': 'Madinah',
    'city.dammam': 'Dammam & Khobar',
    'city.other': 'Other city',
    'cart.subtotal': 'Subtotal',
    'cart.delivery': 'Delivery',
    'cart.total': 'Total',
    'cart.vat': 'VAT included',
    'cart.checkout': 'Checkout'
  };

  let lang = 'ar';
  const S = () => STR[lang];
  const fill = (tpl, vars = {}) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
  const t = (key, vars) => fill(S()[key], vars);

  // One numeral system everywhere: Western digits. `ar-SA` alone would give ٠١٢…, so pin `nu-latn`.
  const fmt = {};
  const num = (n) => {
    const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
    fmt[locale] = fmt[locale] || new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    return fmt[locale].format(n);
  };
  const plural = (n, key) => {
    const forms = PLURALS[lang][key];
    const cat = new Intl.PluralRules(lang).select(n);
    return (forms[cat] || forms.other).replace('{n}', num(n));
  };
  const money = (n) => (lang === 'ar' ? `${num(n)} ر.س` : `SAR ${num(n)}`);
  const moneyHTML = (n) => (lang === 'ar'
    ? `${num(n)} <span class="cur" aria-hidden="true">ر.س</span><span class="sr-only">${S().currencySr}</span>`
    : `<span class="cur" aria-hidden="true">SAR</span> ${num(n)}<span class="sr-only">${S().currencySr}</span>`);
  // Unicode isolates keep a Latin-ending product name from reordering the Arabic sentence around it.
  const isolate = (s) => `\u2068${s}\u2069`; // FSI ... PDI
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------------
     Product registry (read from the server-rendered cards)
     ------------------------------------------------------------------ */
  const products = new Map();
  $$('.product').forEach((li, index) => {
    const media = $('.card__media', li);
    products.set(li.dataset.id, {
      id: li.dataset.id,
      li,
      index,
      cat: li.dataset.cat,
      tags: (li.dataset.tags || '').split(/\s+/).filter(Boolean),
      price: Number(li.dataset.price),
      was: li.dataset.was ? Number(li.dataset.was) : null,
      rating: Number(li.dataset.rating),
      reviews: Number(li.dataset.reviews),
      soldOut: li.hasAttribute('data-soldout'),
      art: $('use', media).getAttribute('href'),
      mediaStyle: media.getAttribute('style'),
      nameEl: $('.card__title', li),
      metaEl: $('.card__meta', li),
      priceEl: $('[data-price]', li),
      ratingEl: $('.rating', li),
      buy: $('.buy', li),
      addBtn: $('[data-add]', li),
      stepper: null
    });
  });
  const nameOf = (id) => products.get(id).nameEl.textContent.trim();
  const metaOf = (id) => products.get(id).metaEl.textContent.trim();

  /* ------------------------------------------------------------------
     Arabic-aware search: strips tashkeel/tatweel, unifies alef/hamza forms,
     ta marbuta and alef maqsura, and reads ٠–٩ as 0–9 ("٦٠" finds "V60").
     ------------------------------------------------------------------ */
  const normalise = (s) => String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '') // marks, tashkeel, tatweel
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)) // Arabic-Indic digits -> 0-9
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x6f0)) // Persian digits -> 0-9
    .replace(/\u0649/g, '\u064a') // alef maqsura -> ya
    .replace(/\u0629/g, '\u0647') // ta marbuta -> ha
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const catLabels = {};
  $$('.chip[data-filter]').forEach((chip) => {
    catLabels[chip.dataset.filter] = `${chip.textContent} ${EN[chip.dataset.i18n] || ''}`;
  });
  const stripTags = (s) => s.replace(/<[^>]*>/g, '');
  products.forEach((p) => {
    const keyBase = p.nameEl.dataset.i18n || p.nameEl.dataset.i18nHtml;
    const metaKey = p.metaEl.dataset.i18n || p.metaEl.dataset.i18nHtml;
    p.index_ = normalise([
      p.nameEl.textContent, p.metaEl.textContent,
      stripTags(EN[keyBase] || ''), stripTags(EN[metaKey] || ''),
      p.li.dataset.kw || '', catLabels[p.cat] || '',
      ...p.tags.map((tag) => catLabels[tag] || '')
    ].join(' '));
  });

  /* ------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */
  const sanitizeCart = (raw) => {
    const out = {};
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([id, q]) => {
        const p = products.get(id);
        const n = Math.floor(Number(q));
        if (p && !p.soldOut && n > 0) out[id] = Math.min(MAX_QTY, n);
      });
    }
    return out;
  };
  let cart = sanitizeCart(store.get('dq-cart', {}));
  let city = store.get('dq-city', 'riyadh');
  if (typeof city !== 'string' || !Object.prototype.hasOwnProperty.call(CITIES, city)) city = 'riyadh';
  const savedNotify = store.get('dq-notify', []);
  const notify = new Set(Array.isArray(savedNotify) ? savedNotify.filter((id) => products.has(id)) : []);
  const view = { filter: 'all', query: '', sort: 'popular' };

  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = () => Object.entries(cart).reduce((sum, [id, q]) => sum + products.get(id).price * q, 0);

  /* ------------------------------------------------------------------
     Live region + toast
     ------------------------------------------------------------------ */
  const statusEl = $('[data-status]');
  let statusTimer;
  const announce = (msg) => {
    clearTimeout(statusTimer);
    statusEl.textContent = '';
    statusTimer = setTimeout(() => { statusEl.textContent = msg; }, 60);
  };
  const toastEl = $('[data-toast]');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.classList.remove('is-in');
    void toastEl.offsetWidth; // restart the entrance animation
    toastEl.classList.add('is-in');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3400);
    announce(msg);
  };

  /* ------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------ */
  const priceHTML = (p) => {
    if (p.was) {
      return `<span class="price__now"><span class="sr-only">${S().priceSale}</span>${moneyHTML(p.price)}</span>`
        + ` <del class="price__was"><span class="sr-only">${S().priceWas}</span>${moneyHTML(p.was)}</del>`;
    }
    return `<span class="price__now"><span class="sr-only">${S().priceNow}</span>${moneyHTML(p.price)}</span>`;
  };

  const renderStatic = () => {
    products.forEach((p) => {
      p.priceEl.innerHTML = priceHTML(p);
      p.priceEl.classList.toggle('price--sale', Boolean(p.was));
      p.ratingEl.setAttribute('aria-label', t('rating', { r: num(p.rating), reviews: plural(p.reviews, 'reviews') }));
      $$('[aria-hidden="true"]', p.ratingEl).forEach((span) => {
        if (span.classList.contains('rating__count')) span.textContent = `(${num(p.reviews)})`;
        else if (span.tagName === 'SPAN') span.textContent = num(p.rating);
      });
    });
  };

  const stepperHTML = (id, qty, ctx) => {
    const name = nameOf(id);
    const last = qty <= 1;
    const atMax = qty >= MAX_QTY;
    return `<div class="stepper${ctx === 'cart' ? ' stepper--sm' : ''}" role="group" aria-label="${esc(t('qtyOf', { name }))}">`
      + `<button type="button" class="stepper__btn" data-dec="${id}" data-focus-key="${ctx}-dec-${id}" aria-label="${esc(last ? t('removeItem', { name }) : S().dec)}">`
      + `<svg class="icon icon--sm" aria-hidden="true"><use href="#${last ? 'i-trash' : 'i-minus'}"/></svg></button>`
      + `<span class="stepper__qty">${num(qty)}</span>`
      + `<button type="button" class="stepper__btn" data-inc="${id}" data-focus-key="${ctx}-inc-${id}" aria-label="${esc(S().inc)}"${atMax ? ' aria-disabled="true"' : ''}>`
      + '<svg class="icon icon--sm" aria-hidden="true"><use href="#i-plus"/></svg></button>'
      + '</div>';
  };

  const renderCards = () => {
    products.forEach((p) => {
      if (p.soldOut) return;
      const qty = cart[p.id] || 0;
      if (!p.stepper) {
        p.stepper = doc.createElement('div');
        p.stepper.className = 'buy__stepper';
        p.buy.append(p.stepper);
      }
      p.stepper.innerHTML = qty ? stepperHTML(p.id, qty, 'card') : '';
      p.stepper.hidden = qty === 0;
      p.addBtn.hidden = qty > 0;
      p.li.classList.toggle('in-cart', qty > 0);
    });
  };

  const renderNotify = () => {
    $$('[data-notify]').forEach((btn) => {
      const on = notify.has(btn.dataset.notify);
      btn.classList.toggle('is-on', on);
      $('[data-notify-label]', btn).textContent = on ? S().notifyOn : S().notifyOff;
      $('use', btn).setAttribute('href', on ? '#i-check' : '#i-bell');
    });
  };

  const renderBadge = (bump) => {
    const n = count();
    $$('[data-cart-count]').forEach((el) => {
      el.textContent = num(n);
      el.classList.toggle('is-zero', n === 0);
      if (bump && !reduceMotion.matches) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
    const label = n ? t('cartLabel', { items: plural(n, 'items') }) : S().cartEmpty;
    $$('.cart-btn').forEach((b) => b.setAttribute('aria-label', label));
    $('[data-cart-title-count]').textContent = n ? `(${num(n)})` : '';
  };

  const renderShipping = () => {
    const sub = subtotal();
    const left = Math.max(0, FREE_SHIPPING - sub);
    const pct = Math.min(100, (sub / FREE_SHIPPING) * 100);
    const msg = sub === 0 ? t('shipIdle', { free: money(FREE_SHIPPING) })
      : left > 0 ? t('shipLeft', { left: money(left) }) : S().shipDone;
    $$('[data-ship]').forEach((el) => {
      $('[data-ship-msg]', el).textContent = msg;
      $('.meter__bar', el).style.inlineSize = `${pct}%`;
      el.classList.toggle('is-idle', sub === 0);
      el.classList.toggle('is-done', sub > 0 && left === 0);
    });
    const bar = $('[data-cartbar]');
    $('[data-ship-short]', bar).textContent = left > 0 ? t('shipShortLeft', { left: money(left) }) : S().shipShortDone;
    $('.meter__bar', bar).style.inlineSize = `${pct}%`;
    bar.classList.toggle('is-done', left === 0);
  };

  const renderCartbar = () => {
    const bar = $('[data-cartbar]');
    const n = count();
    bar.hidden = n === 0;
    doc.body.classList.toggle('has-cartbar', n > 0);
    root.classList.toggle('has-cartbar', n > 0);
    if (n) {
      $('[data-cartbar-count]', bar).textContent = plural(n, 'items');
      $('[data-cartbar-total]', bar).innerHTML = moneyHTML(subtotal());
    }
  };

  const renderCart = () => {
    const list = $('[data-cart-list]');
    list.textContent = '';
    Object.entries(cart).forEach(([id, qty]) => {
      const p = products.get(id);
      const li = doc.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `<div class="cart-item__thumb" style="${esc(p.mediaStyle)}"><svg viewBox="0 0 120 120" aria-hidden="true"><use href="${esc(p.art)}"/></svg></div>`
        + '<div class="cart-item__info"><p class="cart-item__name"></p><p class="cart-item__meta"></p>'
        + `<div class="cart-item__row"><p class="cart-item__price">${moneyHTML(p.price * qty)}</p>${stepperHTML(id, qty, 'cart')}</div></div>`;
      $('.cart-item__name', li).textContent = nameOf(id);
      $('.cart-item__meta', li).textContent = `${metaOf(id)} · ${t('unitEach', { price: money(p.price) })}`;
      list.append(li);
    });

    const n = count();
    const sub = subtotal();
    const fee = sub >= FREE_SHIPPING ? 0 : CITIES[city].fee;
    $('[data-cart-empty]').hidden = n > 0;
    $$('[data-cart-filled]').forEach((el) => { el.hidden = n === 0; });
    $('[data-sub]').innerHTML = moneyHTML(sub);
    const feeEl = $('[data-fee]');
    if (fee === 0) { feeEl.textContent = S().free; feeEl.classList.add('is-free'); } else { feeEl.innerHTML = moneyHTML(fee); feeEl.classList.remove('is-free'); }
    $('[data-total]').innerHTML = moneyHTML(sub + fee);
    $('[data-cart-eta]').textContent = CITIES[city].sameDay ? S().etaRiyadh : S().etaOther;
    $('[data-city]').value = city;
    $('[data-cart-gift]').hidden = !Object.keys(cart).some((id) => products.get(id).tags.includes('ethiopia'));
  };

  // Re-render everything that depends on the cart, keeping keyboard focus where it was.
  const renderAll = ({ bump = false } = {}) => {
    const active = doc.activeElement;
    const key = active && active.dataset ? active.dataset.focusKey : null;
    renderCards();
    renderBadge(bump);
    renderShipping();
    renderCartbar();
    renderCart();
    renderNotify();
    if (key) {
      const again = $(`[data-focus-key="${key}"]`);
      if (again && !again.closest('[hidden]')) again.focus({ preventScroll: true });
    }
  };

  /* ------------------------------------------------------------------
     Cart actions
     ------------------------------------------------------------------ */
  const save = () => store.set('dq-cart', cart);
  const setQty = (id, qty) => {
    if (qty <= 0) delete cart[id]; else cart[id] = Math.min(MAX_QTY, qty);
    save();
  };

  const addToCart = (id, trigger) => {
    const p = products.get(id);
    if (!p || p.soldOut) return;
    const qty = (cart[id] || 0) + 1;
    if (qty > MAX_QTY) { announce(t('maxQty', { qty: num(MAX_QTY) })); return; }
    setQty(id, qty);
    renderAll({ bump: true });
    announce(t('added', { name: isolate(nameOf(id)), items: plural(count(), 'items') }));
    if (trigger && trigger.matches('[data-add]')) {
      const inc = $(`[data-focus-key="card-inc-${id}"]`);
      if (inc) inc.focus({ preventScroll: true });
    }
  };

  const changeQty = (id, delta, trigger) => {
    const current = cart[id] || 0;
    const next = current + delta;
    if (delta > 0 && next > MAX_QTY) { announce(t('maxQty', { qty: num(MAX_QTY) })); return; }
    const inCart = trigger && trigger.closest('#cart');
    const name = nameOf(id);
    let fallback = null;
    if (next <= 0 && inCart) {
      const item = trigger.closest('.cart-item');
      const sibling = item && (item.nextElementSibling || item.previousElementSibling);
      fallback = sibling ? $('[data-dec]', sibling) : $('#cart [data-close]');
      if (fallback && fallback.dataset.focusKey) fallback = fallback.dataset.focusKey;
    }
    setQty(id, next);
    renderAll({ bump: true });
    if (next <= 0) {
      announce(t('removed', { name: isolate(name) }));
      if (inCart) {
        const target = typeof fallback === 'string' ? $(`[data-focus-key="${fallback}"]`) : fallback;
        (target || $('#cart [data-close]')).focus({ preventScroll: true });
      } else {
        products.get(id).addBtn.focus({ preventScroll: true });
      }
    } else {
      announce(`${name}: ${t('qty', { qty: num(next) })}`);
    }
  };

  const toggleNotify = (btn) => {
    const id = btn.dataset.notify;
    const on = !notify.has(id);
    if (on) notify.add(id); else notify.delete(id);
    store.set('dq-notify', Array.from(notify));
    renderNotify();
    toast(t(on ? 'notifyOnMsg' : 'notifyOffMsg', { name: isolate(nameOf(id)) }));
  };

  /* ------------------------------------------------------------------
     Filtering, search and sorting
     ------------------------------------------------------------------ */
  const grid = $('#grid');
  const resultsEl = $('[data-results]');
  const summary = $('[data-search-summary]');
  const searchInput = $('#q');

  const applyFilters = () => {
    const tokens = normalise(view.query).split(' ').filter(Boolean);
    let shown = 0;
    products.forEach((p) => {
      const inCategory = view.filter === 'all' || p.cat === view.filter || p.tags.includes(view.filter);
      const matches = tokens.every((tk) => p.index_.includes(tk));
      p.li.hidden = !(inCategory && matches);
      if (!p.li.hidden) shown += 1;
    });
    const text = shown ? plural(shown, 'items') : S().noResults;
    if (resultsEl.textContent !== text) resultsEl.textContent = text;
    $('[data-empty]').hidden = shown > 0;
    $$('.chip[data-filter]').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === view.filter)));

    const q = view.query.trim();
    summary.hidden = !q;
    if (q) {
      const p = $('[data-search-summary-text]', summary);
      const bdi = doc.createElement('bdi');
      bdi.textContent = S().quote(q);
      p.textContent = `${S().searchFor} `;
      p.append(bdi);
    }
  };

  const applySort = () => {
    const list = Array.from(products.values());
    const byIndex = (a, b) => a.index - b.index;
    const soldLast = (a, b) => Number(a.soldOut) - Number(b.soldOut);
    const sorters = {
      popular: byIndex,
      'price-asc': (a, b) => soldLast(a, b) || a.price - b.price || byIndex(a, b),
      'price-desc': (a, b) => soldLast(a, b) || b.price - a.price || byIndex(a, b),
      rating: (a, b) => soldLast(a, b) || b.rating - a.rating || b.reviews - a.reviews
    };
    list.sort(sorters[view.sort] || byIndex).forEach((p) => grid.append(p.li));
  };

  const setFilter = (filter) => {
    view.filter = filter;
    applyFilters();
  };

  const focusSection = (selector) => {
    const target = $(selector);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    const heading = target.matches('h1, h2, h3') ? target : $('h1, h2, h3', target) || target;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  };

  // The header search covers the whole catalogue; category chips can then narrow the results.
  const setQuery = (value) => {
    if (value.trim() && value.trim() !== view.query.trim()) view.filter = 'all';
    view.query = value;
    applyFilters();
  };
  $('[data-search]').addEventListener('submit', (e) => {
    e.preventDefault();
    setQuery(searchInput.value);
    focusSection('#shop');
  });
  // An empty dir=auto field renders its Arabic placeholder LTR in Chromium, so inherit the page
  // direction while empty and let the typed text pick its own direction (e.g. "V60" vs "قمع").
  const syncSearchDir = () => {
    if (searchInput.value.trim()) searchInput.setAttribute('dir', 'auto');
    else searchInput.removeAttribute('dir');
  };
  let searchTimer;
  searchInput.addEventListener('input', () => {
    syncSearchDir();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setQuery(searchInput.value), 160);
  });
  $('[data-sort]').addEventListener('change', (e) => { view.sort = e.target.value; applySort(); });
  $('[data-city]').addEventListener('change', (e) => {
    city = Object.prototype.hasOwnProperty.call(CITIES, e.target.value) ? e.target.value : 'riyadh';
    store.set('dq-city', city);
    renderCart();
  });

  /* ------------------------------------------------------------------
     Drawers (native <dialog>: focus containment, Esc, inert background)
     ------------------------------------------------------------------ */
  let lastOpener = null;
  const openSheet = (id, opener) => {
    const dlg = doc.getElementById(id);
    if (!dlg || dlg.open) return;
    $$('dialog[open]').forEach((d) => d.close());
    lastOpener = opener || null;
    dlg.showModal();
    root.classList.add('is-locked');
  };
  const closeSheet = (dlg, after) => {
    if (!dlg || !dlg.open) { if (after) after(); return; }
    if (after) lastOpener = null; // navigation will place focus itself
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dlg.classList.remove('is-closing');
      dlg.close();
      if (after) after();
    };
    if (reduceMotion.matches) { finish(); return; }
    dlg.classList.add('is-closing');
    dlg.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 320);
  };
  $$('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg); });
    dlg.addEventListener('close', () => {
      root.classList.remove('is-locked');
      const opener = lastOpener;
      lastOpener = null;
      if (opener && opener.isConnected && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
      const note = $('[data-cart-note]', dlg);
      if (note) note.remove();
    });
  });

  const checkout = (btn) => {
    let note = $('[data-cart-note]');
    if (!note) {
      note = doc.createElement('p');
      note.className = 'cart-note';
      note.setAttribute('data-cart-note', '');
      note.setAttribute('role', 'status');
      btn.after(note);
    }
    note.textContent = S().demoCheckout;
  };

  /* ------------------------------------------------------------------
     Carousel (brew guide): logical prev/next, correct in RTL and LTR.
     In RTL, scrollLeft runs 0 → negative, so we work with |scrollLeft|.
     ------------------------------------------------------------------ */
  const carousels = $$('[data-carousel]').map((wrap) => {
    const section = wrap.closest('section');
    const track = $('.carousel__track', wrap);
    const items = Array.from(track.children);
    const prev = $('[data-carousel-prev]', section);
    const next = $('[data-carousel-next]', section);
    const nav = $('[data-carousel-nav]', section);
    const dots = $$('.carousel__dots span', wrap);
    const isRTL = () => getComputedStyle(track).direction === 'rtl';
    const step = () => {
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return items[0].getBoundingClientRect().width + gap;
    };
    const go = (dir) => {
      track.scrollBy({ left: (isRTL() ? -dir : dir) * step(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const pos = Math.abs(track.scrollLeft);
      const scrollable = max > 4;
      nav.hidden = !scrollable;
      wrap.classList.toggle('is-static', !scrollable);
      prev.setAttribute('aria-disabled', String(pos <= 4));
      next.setAttribute('aria-disabled', String(pos >= max - 4));
      const active = pos >= max - 4 ? items.length - 1 : Math.round(pos / step());
      dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
    };
    prev.addEventListener('click', () => { if (prev.getAttribute('aria-disabled') !== 'true') go(-1); });
    next.addEventListener('click', () => { if (next.getAttribute('aria-disabled') !== 'true') go(1); });
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);
    update();
    return { update, reset: () => { track.scrollLeft = 0; update(); } };
  });

  /* ------------------------------------------------------------------
     Language: Arabic (source) ⇄ English. Switches lang + dir on <html>.
     ------------------------------------------------------------------ */
  let textCache = null;
  let attrCache = null;
  const cacheArabic = () => {
    textCache = new Map();
    attrCache = new Map();
    $$('[data-i18n], [data-i18n-html]').forEach((el) => textCache.set(el, el.innerHTML));
    $$('[data-i18n-attr]').forEach((el) => {
      const saved = {};
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr] = pair.split(':');
        saved[attr] = el.getAttribute(attr);
      });
      attrCache.set(el, saved);
    });
  };

  const setLang = (next, { updateUrl = true } = {}) => {
    if (next !== 'ar' && next !== 'en') return;
    if (!textCache) cacheArabic();
    lang = next;
    root.lang = next;
    root.dir = next === 'ar' ? 'rtl' : 'ltr';

    textCache.forEach((arHTML, el) => {
      if (next === 'ar') { el.innerHTML = arHTML; return; }
      const value = EN[el.dataset.i18n || el.dataset.i18nHtml];
      if (value != null) el.textContent = value;
    });
    attrCache.forEach((saved, el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        const value = next === 'ar' ? saved[attr] : EN[key];
        if (value != null) el.setAttribute(attr, value);
      });
    });

    doc.title = S().title;
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute('content', S().description);
    const other = next === 'ar' ? 'en' : 'ar';
    $$('[data-lang-toggle]').forEach((a) => {
      a.setAttribute('lang', other);
      a.setAttribute('hreflang', other);
      a.setAttribute('href', other === 'en' ? '?lang=en' : './');
      $('[data-lang-label]', a).textContent = S().otherLang;
      const short = $('[data-lang-short]', a);
      if (short) short.textContent = S().otherLangShort;
      if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', S().otherLang);
    });

    // Drop transient messages written in the previous language
    toastEl.hidden = true;
    toastEl.textContent = '';
    clearTimeout(statusTimer);
    statusEl.textContent = '';
    const note = $('[data-cart-note]');
    if (note) note.remove();

    renderStatic();
    renderAll();
    applyFilters();
    carousels.forEach((c) => c.reset());

    if (updateUrl) {
      try {
        const url = new URL(window.location.href);
        if (next === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
        window.history.replaceState(null, '', url);
      } catch { /* file:// or sandboxed contexts */ }
    }
  };

  /* ------------------------------------------------------------------
     Global click handling (event delegation)
     ------------------------------------------------------------------ */
  doc.addEventListener('click', (e) => {
    const el = e.target.closest('button, a');
    if (!el) return;

    if (el.matches('[aria-disabled="true"]')) { e.preventDefault(); return; }
    if (el.matches('[data-add]')) { addToCart(el.dataset.add, el); return; }
    if (el.matches('[data-inc]')) { changeQty(el.dataset.inc, 1, el); return; }
    if (el.matches('[data-dec]')) { changeQty(el.dataset.dec, -1, el); return; }
    if (el.matches('[data-notify]')) { toggleNotify(el); return; }
    if (el.matches('[data-open]')) { openSheet(el.dataset.open, el); return; }
    if (el.matches('[data-close]')) { closeSheet(el.closest('dialog')); return; }
    if (el.matches('[data-checkout]')) { checkout(el); return; }
    if (el.matches('[data-lang-toggle]')) { e.preventDefault(); setLang(lang === 'ar' ? 'en' : 'ar'); return; }
    if (el.matches('[data-clear-search]') || el.matches('[data-reset]')) {
      searchInput.value = '';
      syncSearchDir();
      view.query = '';
      if (el.matches('[data-reset]')) view.filter = 'all';
      applyFilters();
      $('#shop-title').focus({ preventScroll: true });
      return;
    }
    if (el.matches('button.chip[data-filter]')) { setFilter(el.dataset.filter); return; }

    if (el.matches('a[data-filter]')) setFilter(el.dataset.filter);
    if (el.matches('a[href^="#"]')) {
      const href = el.getAttribute('href');
      if (href === '#') { e.preventDefault(); toast(S().demoLink); return; }
      const dlg = el.closest('dialog');
      if (dlg) {
        e.preventDefault();
        closeSheet(dlg, () => focusSection(href));
      }
    }
  });

  /* ------------------------------------------------------------------
     Sticky header: expose its real height for scroll-padding, add a shadow when scrolled
     ------------------------------------------------------------------ */
  const header = $('.site-header');
  const setHeaderHeight = () => root.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
  if ('ResizeObserver' in window) new ResizeObserver(setHeaderHeight).observe(header);
  setHeaderHeight();
  let scrollRaf = 0;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => header.classList.toggle('is-scrolled', window.scrollY > 40));
  }, { passive: true });

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */
  renderStatic();
  renderAll();
  applyFilters();
  let initialLang = 'ar';
  try { initialLang = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ar'; } catch { /* ignore */ }
  if (initialLang === 'en') setLang('en', { updateUrl: false });
})();
