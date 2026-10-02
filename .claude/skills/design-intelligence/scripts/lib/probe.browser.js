// DI in-page measurement probe. Evaluated as an expression: `(${source})(options)`.
// Returns measurements only: sizes, styles, counts, scripts of text — never the text itself.
// Elements of interest are tagged with data-di-probe="<key>" so the caller can query
// rendered fonts through CDP (CSS.getPlatformFontsForNode).
async (opts) => {
  const o = Object.assign({ maxElements: 9000, maxTextNodes: 9000 }, opts || {});
  const instr = JSON.parse(JSON.stringify(window.__DI_INSTR__ || null)); // snapshot before probe uses canvas
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sy = window.scrollY;
  const doc = document.documentElement;
  const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
  const csCache = new Map();
  const cs = (el) => {
    let s = csCache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      csCache.set(el, s);
    }
    return s;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return false;
    if (el.checkVisibility) return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const s = cs(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0;
  };
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const quantiles = (arr) => {
    const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return null;
    const q = (p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
    return { n: a.length, min: round(a[0]), p25: round(q(0.25)), median: round(q(0.5)), p75: round(q(0.75)), max: round(a[a.length - 1]) };
  };
  const histArr = (arr) => {
    const m = new Map();
    for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([value, count]) => ({ value, count }));
  };
  const hist = (arr, keyFn = (x) => x) => {
    const m = {};
    for (const x of arr) {
      const k = String(keyFn(x));
      m[k] = (m[k] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 25));
  };

  // ---------- colour ----------
  const colorCache = new Map();
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 1;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  const parseColor = (str) => {
    if (!str) return null;
    if (colorCache.has(str)) return colorCache.get(str);
    let res = null;
    const m = str.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      res = { r: +m[1], g: +m[2], b: +m[3], a };
    } else if (str === 'transparent') res = { r: 0, g: 0, b: 0, a: 0 };
    else {
      // Any other CSS colour (oklch, lab, color()) → rasterise one pixel (sRGB-clamped).
      const am = str.match(/\/\s*([\d.]+%?)\s*\)$/);
      const alpha = am ? (am[1].endsWith('%') ? parseFloat(am[1]) / 100 : parseFloat(am[1])) : 1;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = str;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      res = { r: d[0], g: d[1], b: d[2], a: alpha, approx: true };
    }
    colorCache.set(str, res);
    return res;
  };
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : null);
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const blend = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  };
  const hsl = (c) => {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  };
  /** Effective background behind an element: walk up compositing solid backgrounds; flag images/gradients. */
  const effectiveBg = (el) => {
    let color = { r: 0, g: 0, b: 0, a: 0 };
    let uncertain = false;
    for (let e = el; e; e = e.parentElement) {
      const s = cs(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') uncertain = true;
      const c = parseColor(s.backgroundColor);
      if (c && c.a > 0) {
        color = blend(color, c);
        if (color.a >= 0.99) break;
      }
    }
    if (color.a < 0.99) color = blend(color, { r: 255, g: 255, b: 255, a: 1 }); // canvas default
    return { color, uncertain };
  };

  // ---------- text scripts (never store text) ----------
  const reArabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
  const reLatin = /[A-Za-zÀ-ɏ]/g;
  const reWestDigit = /[0-9]/g;
  const reArabicDigit = /[٠-٩۰-۹]/g;
  const countRe = (s, re) => (s.match(re) || []).length;
  const scriptOf = (s) => {
    const ar = countRe(s, reArabic);
    const la = countRe(s, reLatin);
    if (ar && la) return 'mixed';
    if (ar) return 'arabic';
    if (la) return 'latin';
    if (countRe(s, reWestDigit) || countRe(s, reArabicDigit)) return 'digits';
    return s.trim() ? 'other' : 'none';
  };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const lineInfo = (el) => {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      const tops = [];
      for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < r.height * 0.5)) tops.push(r.top);
      return { lines: Math.max(1, tops.length) };
    } catch (e) {
      return { lines: null };
    }
  };

  let tagN = 0;
  const tag = (el, key) => {
    if (!el.getAttribute('data-di-probe')) el.setAttribute('data-di-probe', `${key}-${tagN++}`);
    return el.getAttribute('data-di-probe');
  };

  const all = [...document.querySelectorAll('body *')];
  const elements = all.slice(0, o.maxElements);
  const out = { truncated: all.length > o.maxElements, elementCount: all.length };

  // ---------- document ----------
  const metaContent = (name) => {
    const m = document.querySelector(`meta[name="${name}"]`);
    return m ? (m.getAttribute('content') || '').slice(0, 160) : null;
  };
  const generator = metaContent('generator');
  out.document = {
    lang: doc.getAttribute('lang'),
    dirAttr: doc.getAttribute('dir'),
    dirComputed: cs(doc).direction,
    bodyDir: document.body ? cs(document.body).direction : null,
    titleLength: document.title.length,
    metaViewport: metaContent('viewport'),
    themeColor: metaContent('theme-color'),
    colorSchemeMeta: metaContent('color-scheme'),
    generator: generator ? generator.slice(0, 60) : null,
    viewport: { width: vw, height: vh },
    scrollY: sy,
    docHeight: doc.scrollHeight,
    docWidth: doc.scrollWidth,
    horizontalOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
    rootFontSize: px(cs(doc).fontSize),
    bodyFont: document.body ? { family: cs(document.body).fontFamily.slice(0, 160), size: px(cs(document.body).fontSize), lineHeight: cs(document.body).lineHeight } : null,
    scrollBehavior: cs(doc).scrollBehavior,
    overflowY: { html: cs(doc).overflowY, body: document.body ? cs(document.body).overflowY : null },
  };

  // ---------- fonts ----------
  const faces = [];
  try {
    for (const f of document.fonts) faces.push({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, status: f.status, display: f.display, unicodeRange: (f.unicodeRange || '').slice(0, 80) });
  } catch (e) {}
  const loaded = faces.filter((f) => f.status === 'loaded');
  out.fonts = {
    documentFontsStatus: document.fonts ? document.fonts.status : null,
    declaredFaces: faces.length,
    loadedFaces: loaded.length,
    loadedFamilies: [...new Set(loaded.map((f) => f.family))].slice(0, 30),
    loadedDetail: loaded.slice(0, 60),
    fontDisplayValues: hist(faces.map((f) => f.display)),
    arabicSubsetFaces: faces.filter((f) => /U\+06|U\+6[0-9a-f]{2}\b|U\+FB5|U\+FE7/i.test(f.unicodeRange)).length,
  };

  // ---------- text style clusters ----------
  const clusters = new Map();
  const scriptChars = { arabic: 0, latin: 0, westDigits: 0, arabicIndicDigits: 0 };
  let mixedRunNodes = 0;
  let textNodes = 0;
  const textEls = new Set();
  const walker = document.createTreeWalker(document.body || doc, NodeFilter.SHOW_TEXT);
  const visCache = new Map();
  const isVis = (el) => {
    if (!visCache.has(el)) visCache.set(el, visible(el));
    return visCache.get(el);
  };
  while (walker.nextNode() && textNodes < o.maxTextNodes) {
    const node = walker.currentNode;
    const t = norm(node.nodeValue || '');
    if (!t) continue;
    const el = node.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg'].includes(el.tagName) || !isVis(el)) continue;
    textNodes++;
    textEls.add(el);
    const s = cs(el);
    const ar = countRe(t, reArabic);
    const la = countRe(t, reLatin);
    scriptChars.arabic += ar;
    scriptChars.latin += la;
    scriptChars.westDigits += countRe(t, reWestDigit);
    scriptChars.arabicIndicDigits += countRe(t, reArabicDigit);
    if (ar && la) mixedRunNodes++;
    const size = px(s.fontSize);
    const lh = s.lineHeight === 'normal' ? 'normal' : round(px(s.lineHeight) / size, 2);
    const key = [s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size, s.fontWeight, lh, s.letterSpacing, s.textTransform, s.fontStyle].join('|');
    let c = clusters.get(key);
    if (!c) {
      const r = el.getBoundingClientRect();
      c = { family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), stack: s.fontFamily.slice(0, 120), size, weight: s.fontWeight, lineHeightRatio: lh, letterSpacing: s.letterSpacing, textTransform: s.textTransform, fontStyle: s.fontStyle, chars: 0, nodes: 0, firstDocY: Math.round(r.top + sy), scripts: {}, colors: {} };
      clusters.set(key, c);
    }
    c.chars += t.length;
    c.nodes++;
    const sc = scriptOf(t);
    c.scripts[sc] = (c.scripts[sc] || 0) + t.length;
    const col = hex(parseColor(s.color));
    c.colors[col] = (c.colors[col] || 0) + t.length;
  }
  const clusterList = [...clusters.values()].sort((a, b) => b.chars - a.chars);
  const totalChars = clusterList.reduce((s, c) => s + c.chars, 0);
  const sizeChars = {};
  const familyChars = {};
  for (const c of clusterList) {
    sizeChars[c.size] = (sizeChars[c.size] || 0) + c.chars;
    familyChars[c.family] = (familyChars[c.family] || 0) + c.chars;
  }
  const sizes = Object.keys(sizeChars).map(Number).sort((a, b) => a - b);
  const bodyCluster = clusterList[0] || null;
  out.typography = {
    textNodes,
    totalChars,
    scriptChars,
    mixedRunNodes,
    distinctFamilies: Object.keys(familyChars).length,
    familyShare: Object.fromEntries(Object.entries(familyChars).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, round(v / Math.max(1, totalChars), 3)])),
    distinctSizes: sizes.length,
    sizeShare: Object.fromEntries(sizes.map((s) => [s, round(sizeChars[s] / Math.max(1, totalChars), 3)])),
    minSize: sizes[0] ?? null,
    maxSize: sizes[sizes.length - 1] ?? null,
    dominantBodySize: bodyCluster ? bodyCluster.size : null,
    scaleRange: sizes.length && bodyCluster ? round(sizes[sizes.length - 1] / bodyCluster.size, 2) : null,
    distinctWeights: [...new Set(clusterList.map((c) => c.weight))].sort(),
    uppercaseShare: round(clusterList.filter((c) => c.textTransform === 'uppercase').reduce((s, c) => s + c.chars, 0) / Math.max(1, totalChars), 3),
    clusters: clusterList.slice(0, 20).map((c) => ({ ...c, share: round(c.chars / Math.max(1, totalChars), 3) })),
  };

  // ---------- headings ----------
  const headingEls = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(isVis);
  const describeText = (el, key) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const t = norm(el.textContent || '');
    const li = lineInfo(el);
    const size = px(s.fontSize);
    return {
      probe: tag(el, key),
      tag: el.tagName.toLowerCase(),
      level: el.tagName.match(/^H(\d)$/) ? +el.tagName[1] : +(el.getAttribute('aria-level') || 0) || null,
      family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      size,
      sizeVw: round((size / vw) * 100, 2),
      weight: s.fontWeight,
      lineHeightRatio: s.lineHeight === 'normal' ? 'normal' : round(px(s.lineHeight) / size, 2),
      letterSpacingEm: s.letterSpacing === 'normal' ? 0 : round(px(s.letterSpacing) / size, 3),
      textTransform: s.textTransform,
      textAlign: s.textAlign,
      textWrap: s.textWrap || s.textWrapStyle || null,
      chars: t.length,
      words: t ? t.split(' ').length : 0,
      script: scriptOf(t),
      lines: li.lines,
      charsPerLine: li.lines ? round(t.length / li.lines, 1) : null,
      box: { x: Math.round(r.left), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) },
      aboveFold: r.top + sy < vh,
      color: hex(parseColor(s.color)),
    };
  };
  out.headings = {
    count: headingEls.length,
    h1Count: headingEls.filter((h) => h.tagName === 'H1').length,
    outline: headingEls.slice(0, 80).map((h) => (h.tagName.match(/^H(\d)$/) ? +h.tagName[1] : 'r' + (h.getAttribute('aria-level') || '?'))),
    skippedLevels: (() => {
      let prev = 0, n = 0;
      for (const h of headingEls) {
        const m = h.tagName.match(/^H(\d)$/);
        if (!m) continue;
        const l = +m[1];
        if (prev && l > prev + 1) n++;
        prev = l;
      }
      return n;
    })(),
    items: headingEls.slice(0, 40).map((h) => describeText(h, 'heading')),
  };

  // Largest text above the fold (visual "display" element, may not be a heading).
  let display = null;
  for (const el of textEls) {
    const r = el.getBoundingClientRect();
    if (r.top + sy > vh * 1.2) continue;
    const size = px(cs(el).fontSize);
    if (!display || size > display.size) display = { el, size };
  }
  out.displayText = display ? describeText(display.el, 'display') : null;

  // ---------- paragraphs / reading measure ----------
  const paraEls = [...document.querySelectorAll('p, li, dd, blockquote')].filter((el) => isVis(el) && norm(el.textContent || '').length >= 80).slice(0, 60);
  const paras = paraEls.map((el) => {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const t = norm(el.textContent || '');
    const li = lineInfo(el);
    const size = px(s.fontSize);
    const fg = parseColor(s.color);
    const bg = effectiveBg(el);
    return {
      size,
      lineHeightRatio: s.lineHeight === 'normal' ? null : round(px(s.lineHeight) / size, 2),
      width: Math.round(r.width),
      widthEm: round(r.width / size, 1),
      lines: li.lines,
      charsPerLine: li.lines ? round(t.length / li.lines, 1) : null,
      script: scriptOf(t),
      textAlign: s.textAlign,
      contrast: fg ? round(contrast(blend(fg, bg.color), bg.color), 2) : null,
      contrastUncertain: bg.uncertain,
    };
  });
  if (paraEls[0]) tag(paraEls[0], 'para');
  out.reading = {
    sampled: paras.length,
    fontSize: quantiles(paras.map((p) => p.size)),
    lineHeightRatio: quantiles(paras.map((p) => p.lineHeightRatio)),
    charsPerLine: quantiles(paras.map((p) => p.charsPerLine)),
    widthEm: quantiles(paras.map((p) => p.widthEm)),
    justified: paras.filter((p) => p.textAlign === 'justify').length,
    scripts: hist(paras.map((p) => p.script)),
  };

  // ---------- colour roles & contrast ----------
  const bgArea = {};
  const vpArea = vw * vh;
  let gradientArea = 0;
  const gradientColorArea = {};
  let imageBgCount = 0;
  // The canvas background comes from <html>, or from <body> when <html> has none (CSS propagation).
  // It covers the whole document, so page-level gradients and colours count at full area (probe 0.1.2+).
  {
    const docArea = Math.max(1, doc.scrollHeight * vw);
    const htmlS = cs(doc);
    const bodyS = document.body ? cs(document.body) : null;
    const htmlHas = (parseColor(htmlS.backgroundColor)?.a ?? 0) > 0 || htmlS.backgroundImage !== 'none';
    const canvas = htmlHas || !bodyS ? htmlS : bodyS;
    const c = parseColor(canvas.backgroundColor);
    if (c && c.a > 0.5) bgArea[hex(c)] = (bgArea[hex(c)] || 0) + docArea;
    if (/gradient\(/.test(canvas.backgroundImage)) {
      gradientArea += docArea;
      for (const m of canvas.backgroundImage.matchAll(/rgba?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)/g)) {
        const gc = parseColor(m[0]);
        if (gc && gc.a > 0.3) gradientColorArea[hex(gc)] = (gradientColorArea[hex(gc)] || 0) + docArea;
      }
    }
  }
  for (const el of elements) {
    const s = cs(el);
    const r = el.getBoundingClientRect();
    const area = Math.max(0, r.width) * Math.max(0, r.height);
    if (area < vpArea * 0.01 || !isVis(el)) continue;
    const c = parseColor(s.backgroundColor);
    if (c && c.a > 0.5) {
      const k = hex(c);
      bgArea[k] = (bgArea[k] || 0) + area;
    }
    if (/gradient\(/.test(s.backgroundImage)) {
      gradientArea += area;
      for (const m of s.backgroundImage.matchAll(/rgba?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)/g)) {
        const c = parseColor(m[0]);
        if (c && c.a > 0.3) {
          const k = hex(c);
          gradientColorArea[k] = (gradientColorArea[k] || 0) + area;
        }
      }
    }
    else if (/url\(/.test(s.backgroundImage)) imageBgCount++;
  }
  const rootBg = effectiveBg(document.body || doc).color;
  const textColorChars = {};
  for (const c of clusterList) for (const [k, v] of Object.entries(c.colors)) textColorChars[k] = (textColorChars[k] || 0) + v;
  // Contrast over all visible text elements (char-weighted). Text whose box overlaps a replaced
  // media element (img/video/canvas/picture/svg) that is not its ancestor is counted as uncertain.
  const mediaRects = [...document.querySelectorAll('img, video, canvas, picture, svg')]
    .filter((m) => { const r = m.getBoundingClientRect(); return r.width > 40 && r.height > 40; })
    .map((m) => ({ m, r: m.getBoundingClientRect() }));
  const overMedia = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return mediaRects.some(({ m, r: mr }) => !m.contains(el) && cx >= mr.left && cx <= mr.right && cy >= mr.top && cy <= mr.bottom);
  };
  let lowNormal = 0, lowLarge = 0, uncertainChars = 0, checkedChars = 0;
  const contrastSamples = [];
  for (const el of textEls) {
    const s = cs(el);
    const t = norm([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' '));
    if (!t) continue;
    const fg = parseColor(s.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    if (!bg.uncertain && overMedia(el)) bg.uncertain = true;
    const ratio = contrast(blend(fg, bg.color), bg.color);
    const size = px(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    checkedChars += t.length;
    if (bg.uncertain) uncertainChars += t.length;
    else if (large ? ratio < 3 : ratio < 4.5) {
      if (large) lowLarge += t.length;
      else lowNormal += t.length;
    }
    if (contrastSamples.length < 400) contrastSamples.push(ratio);
  }
  const accentCandidates = {};
  const buttonLike = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]')].filter(isVis);
  for (const el of buttonLike) {
    const c = parseColor(cs(el).backgroundColor);
    if (c && c.a > 0.5) {
      const k = hex(c);
      accentCandidates[k] = (accentCandidates[k] || 0) + 1;
    }
  }
  const palette = Object.entries(bgArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, a]) => ({ color: k, areaShare: round(a / Math.max(1, Object.values(bgArea).reduce((x, y) => x + y, 0)), 3) }));
  const satur = (k) => {
    const m = k.match(/^#(..)(..)(..)$/);
    if (!m) return null;
    return hsl({ r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) });
  };
  out.color = {
    rootBackground: hex(rootBg),
    rootBackgroundLuminance: round(lum(rootBg), 3),
    scheme: lum(rootBg) < 0.2 ? 'dark' : 'light',
    backgroundPalette: palette.map((p) => ({ ...p, hsl: (() => { const h = satur(p.color); return h ? { h: Math.round(h.h), s: round(h.s, 2), l: round(h.l, 2) } : null; })() })),
    textColors: Object.entries(textColorChars).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ color: k, share: round(v / Math.max(1, totalChars), 3) })),
    buttonBackgrounds: Object.entries(accentCandidates).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ color: k, count: n })),
    gradientAreaRatio: round(gradientArea / Math.max(1, doc.scrollHeight * vw), 3),
    gradientColors: Object.entries(gradientColorArea).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k),
    imageBackgrounds: imageBgCount,
    contrast: {
      method: 'computed colour vs nearest opaque ancestor background; text over CSS images/gradients or overlapping img/video/canvas/svg counted as uncertain (probe 0.1.1+)',
      checkedChars,
      lowContrastNormalShare: round(lowNormal / Math.max(1, checkedChars), 3),
      lowContrastLargeShare: round(lowLarge / Math.max(1, checkedChars), 3),
      uncertainShare: round(uncertainChars / Math.max(1, checkedChars), 3),
      ratio: quantiles(contrastSamples),
    },
  };

  // ---------- layout ----------
  const containers = [];
  const leftEdges = {};
  const rightEdges = {};
  let gridCount = 0, flexCount = 0, stickyCount = 0, fixedCount = 0;
  const gridCols = [];
  const gaps = [];
  for (const el of elements) {
    const s = cs(el);
    if (s.display === 'grid' || s.display === 'inline-grid') {
      gridCount++;
      const cols = s.gridTemplateColumns && s.gridTemplateColumns !== 'none' ? s.gridTemplateColumns.split(' ').filter((x) => /px$/.test(x)).length : 0;
      if (cols && isVis(el)) gridCols.push(cols);
      const g = px(s.columnGap);
      if (g) gaps.push(g);
    } else if (s.display === 'flex' || s.display === 'inline-flex') {
      flexCount++;
      const g = px(s.columnGap);
      if (g) gaps.push(g);
    }
    if (s.position === 'sticky') stickyCount++;
    if (s.position === 'fixed') fixedCount++;
    if (!isVis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= vw * 0.4 && r.width <= vw * 0.96 && r.height > 120 && Math.abs(r.left - (vw - r.right)) <= 2) containers.push(Math.round(r.width));
  }
  for (const el of textEls) {
    const r = el.getBoundingClientRect();
    if (r.width < 40) continue;
    const l = Math.round(r.left / 4) * 4;
    const rr = Math.round((vw - r.right) / 4) * 4;
    leftEdges[l] = (leftEdges[l] || 0) + 1;
    rightEdges[rr] = (rightEdges[rr] || 0) + 1;
  }
  const majorEdges = (m) => Object.entries(m).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([x, n]) => ({ x: +x, n }));
  const main = document.querySelector('main') || document.body;
  const sections = [...(main ? main.children : [])].filter((el) => isVis(el) && el.getBoundingClientRect().height > 40);
  out.layout = {
    containerWidths: histArr(containers),
    dominantContainer: containers.length ? histArr(containers)[0].value : null,
    widestContainer: containers.length ? Math.max(...containers) : null,
    textLeftEdges: majorEdges(leftEdges),
    textRightEdges: majorEdges(rightEdges),
    distinctTextEdges: Object.keys(leftEdges).length,
    gridContainers: gridCount,
    flexContainers: flexCount,
    gridColumnCounts: histArr(gridCols),
    gaps: quantiles(gaps),
    stickyElements: stickyCount,
    fixedElements: fixedCount,
    sections: {
      count: sections.length,
      heightsVh: quantiles(sections.map((el) => el.getBoundingClientRect().height / vh)),
      paddingTop: quantiles(sections.map((el) => px(cs(el).paddingTop))),
      paddingBottom: quantiles(sections.map((el) => px(cs(el).paddingBottom))),
    },
    pageHeightVh: round(doc.scrollHeight / vh, 2),
  };

  // Text over media (overlap of large text with img/video/canvas boxes).
  const mediaEls = [...document.querySelectorAll('img, video, canvas, picture, svg')].filter((el) => isVis(el) && el.getBoundingClientRect().width > vw * 0.3);
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  out.layout.textOverMedia = headingEls.filter((h) => mediaEls.some((m) => !m.contains(h) && !h.contains(m) && overlaps(h.getBoundingClientRect(), m.getBoundingClientRect()))).length;

  // ---------- components ----------
  const header = [...document.querySelectorAll('header, [role="banner"]')].find((h) => isVis(h) && h.getBoundingClientRect().width >= vw * 0.8 && h.getBoundingClientRect().top + sy < 260) || null;
  const navs = [...document.querySelectorAll('nav, [role="navigation"]')];
  const headerInfo = header
    ? (() => {
        const s = cs(header);
        const r = header.getBoundingClientRect();
        const links = [...header.querySelectorAll('a, button')].filter(isVis);
        const toggles = [...header.querySelectorAll('button, [role="button"]')].filter((b) => isVis(b) && (b.hasAttribute('aria-expanded') || b.hasAttribute('aria-controls')));
        return {
          position: s.position,
          height: Math.round(r.height),
          top: Math.round(r.top),
          background: hex(parseColor(s.backgroundColor)),
          backgroundAlpha: parseColor(s.backgroundColor) ? round(parseColor(s.backgroundColor).a, 2) : null,
          backdropFilter: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter.slice(0, 40) : null,
          borderRadius: px(s.borderTopLeftRadius),
          insetFromEdges: Math.round(r.left) > 4 && Math.round(vw - r.right) > 4,
          visibleInteractive: links.length,
          expandableToggles: toggles.length,
        };
      })()
    : null;
  if (header) tag(header, 'header');
  const radius = (el) => px(cs(el).borderTopLeftRadius) || 0;
  const btnInfo = buttonLike
    .filter((el) => {
      const s = cs(el);
      const c = parseColor(s.backgroundColor);
      return (c && c.a > 0.3) || (px(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none');
    })
    .slice(0, 80);
  if (btnInfo[0]) tag(btnInfo[0], 'button');
  out.components = {
    header: headerInfo,
    navCount: navs.length,
    buttons: {
      count: btnInfo.length,
      radius: quantiles(btnInfo.map(radius)),
      pillShare: round(btnInfo.filter((el) => radius(el) >= el.getBoundingClientRect().height / 2 - 1).length / Math.max(1, btnInfo.length), 2),
      height: quantiles(btnInfo.map((el) => el.getBoundingClientRect().height)),
      fontSize: quantiles(btnInfo.map((el) => px(cs(el).fontSize))),
      textTransform: hist(btnInfo.map((el) => cs(el).textTransform)),
      fontWeight: hist(btnInfo.map((el) => cs(el).fontWeight)),
    },
    forms: {
      forms: document.querySelectorAll('form').length,
      inputs: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(isVis).length,
    },
    media: {
      images: [...document.querySelectorAll('img')].filter(isVis).length,
      imagesTotal: document.querySelectorAll('img').length,
      lazyImages: document.querySelectorAll('img[loading="lazy"]').length,
      srcsetImages: document.querySelectorAll('img[srcset], picture source[srcset]').length,
      videos: document.querySelectorAll('video').length,
      autoplayVideos: document.querySelectorAll('video[autoplay]').length,
      videosWithControls: document.querySelectorAll('video[controls]').length,
      inlineSvgs: document.querySelectorAll('svg').length,
      canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height), fixed: cs(c).position === 'fixed' })).slice(0, 10),
      iframes: document.querySelectorAll('iframe').length,
    },
  };

  // Repeated card-like sibling groups.
  const cardGroups = [];
  for (const parent of elements) {
    const kids = [...parent.children].filter(isVis);
    if (kids.length < 3) continue;
    const boxes = kids.map((k) => k.getBoundingClientRect());
    const w0 = boxes[0].width;
    if (w0 < 120 || w0 > vw * 0.6) continue;
    if (!boxes.every((b) => Math.abs(b.width - w0) < 4)) continue;
    const withContent = kids.filter((k) => k.querySelector('img, picture, svg, h2, h3, h4') || cs(k).backgroundColor !== 'rgba(0, 0, 0, 0)');
    if (withContent.length < 3) continue;
    const k0 = kids[0];
    const s = cs(k0);
    cardGroups.push({ items: kids.length, width: Math.round(w0), radius: radius(k0), shadow: s.boxShadow !== 'none', border: px(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none', filled: (parseColor(s.backgroundColor) || { a: 0 }).a > 0.3 });
    if (cardGroups.length >= 30) break;
  }
  out.components.cardGroups = { count: cardGroups.length, items: cardGroups.slice(0, 12), radius: quantiles(cardGroups.map((g) => g.radius)) };

  // ---------- effects (generic-signature inputs) ----------
  let backdropBlur = 0, filterBlur = 0, glow = 0, textGradient = 0, blendCount = 0, roundedBoxes = 0, boxes = 0, radius24 = 0, hiddenOpacity = 0, transformed = 0;
  for (const el of elements) {
    const s = cs(el);
    if (s.backdropFilter && s.backdropFilter.includes('blur')) backdropBlur++;
    if (s.filter && s.filter.includes('blur')) filterBlur++;
    if (s.boxShadow && s.boxShadow !== 'none') {
      const m = s.boxShadow.match(/rgba?\([^)]*\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/);
      if (m && +m[3] >= 24) {
        const c = parseColor(s.boxShadow.match(/rgba?\([^)]*\)/)[0]);
        if (c && hsl(c).s > 0.3) glow++;
      }
    }
    if (s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text') textGradient++;
    if (s.mixBlendMode && s.mixBlendMode !== 'normal') blendCount++;
    const hasBox = (parseColor(s.backgroundColor) || { a: 0 }).a > 0.2 || (px(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none');
    if (hasBox && isVis(el)) {
      boxes++;
      const rr = radius(el);
      if (rr >= 12) roundedBoxes++;
      if (rr >= 24) radius24++;
    }
    if (parseFloat(s.opacity) === 0) hiddenOpacity++;
    if (s.transform && s.transform !== 'none') transformed++;
  }
  out.effects = {
    gradientAreaRatio: out.color.gradientAreaRatio,
    backdropBlurElements: backdropBlur,
    filterBlurElements: filterBlur,
    coloredGlowShadows: glow,
    textGradients: textGradient,
    blendModeElements: blendCount,
    boxedElements: boxes,
    roundedBoxShare12: round(roundedBoxes / Math.max(1, boxes), 3),
    roundedBoxShare24: round(radius24 / Math.max(1, boxes), 3),
    opacityZeroElements: hiddenOpacity,
    transformedElements: transformed,
  };

  // ---------- motion (static state) ----------
  const transitions = [];
  for (const el of elements) {
    const s = cs(el);
    const durs = s.transitionDuration.split(',').map((d) => parseFloat(d) * (d.includes('ms') ? 1 : 1000));
    const maxDur = Math.max(...durs);
    if (maxDur > 0) transitions.push({ d: Math.round(maxDur), e: s.transitionTimingFunction.split(/,(?![^(]*\))/)[0].trim().slice(0, 48), p: s.transitionProperty.split(',')[0].trim() });
  }
  let anims = [];
  try {
    anims = document.getAnimations().map((a) => {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      return { type: a.constructor.name, duration: typeof t.duration === 'number' ? Math.round(t.duration) : String(t.duration), iterations: t.iterations === Infinity ? 'infinite' : t.iterations, easing: (t.easing || '').slice(0, 40), playState: a.playState, scrollTimeline: !!(a.timeline && a.timeline.constructor && /Scroll|View/.test(a.timeline.constructor.name)) };
    });
  } catch (e) {}
  out.motion = {
    transitionElements: transitions.length,
    transitionDuration: quantiles(transitions.map((t) => t.d)),
    transitionEasing: hist(transitions.map((t) => t.e)),
    transitionProperty: hist(transitions.map((t) => t.p)),
    animations: {
      total: anims.length,
      running: anims.filter((a) => a.playState === 'running').length,
      infinite: anims.filter((a) => a.iterations === 'infinite').length,
      scrollDriven: anims.filter((a) => a.scrollTimeline).length,
      byType: hist(anims.map((a) => a.type)),
      duration: quantiles(anims.map((a) => (typeof a.duration === 'number' ? a.duration : NaN))),
      easing: hist(anims.map((a) => a.easing)),
    },
  };

  // ---------- CSSOM (same-origin sheets only) ----------
  const cssom = { sheets: 0, inaccessibleSheets: 0, rules: 0, mediaQueries: {}, breakpoints: [], reducedMotionRules: 0, colorSchemeRules: 0, containerRules: 0, clampUses: 0, vwFontSizes: 0, logicalProps: 0, physicalInlineProps: 0, focusVisibleRules: 0, fontFaceRules: 0, scrollTimelineUses: 0, customPropertiesDeclared: 0, hoverMediaRules: 0 };
  const visit = (rules) => {
    for (const r of rules) {
      cssom.rules++;
      const text = r.cssText || '';
      if (r.media && r.conditionText !== undefined && r.constructor.name === 'CSSMediaRule') {
        const q = r.conditionText.slice(0, 80);
        cssom.mediaQueries[q] = (cssom.mediaQueries[q] || 0) + 1;
        for (const m of q.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)) cssom.breakpoints.push(m[1] + ':' + m[2] + m[3]);
        if (/prefers-reduced-motion/.test(q)) cssom.reducedMotionRules++;
        if (/prefers-color-scheme/.test(q)) cssom.colorSchemeRules++;
        if (/hover:\s*hover/.test(q)) cssom.hoverMediaRules++;
      }
      if (r.constructor.name === 'CSSContainerRule') cssom.containerRules++;
      if (r.constructor.name === 'CSSFontFaceRule') cssom.fontFaceRules++;
      if (r.style) {
        cssom.clampUses += (text.match(/clamp\(/g) || []).length;
        if (/font-size:\s*[^;]*\dvw/.test(text)) cssom.vwFontSizes++;
        cssom.logicalProps += (text.match(/(margin|padding|inset|border)-(inline|block)(-start|-end)?\s*:|text-align:\s*(start|end)|inset-inline|float:\s*inline-/g) || []).length;
        cssom.physicalInlineProps += (text.match(/(margin|padding)-(left|right)\s*:|text-align:\s*(left|right)|\b(left|right)\s*:/g) || []).length;
        cssom.scrollTimelineUses += (text.match(/animation-timeline|scroll-timeline|view-timeline/g) || []).length;
        cssom.customPropertiesDeclared += (text.match(/--[\w-]+\s*:/g) || []).length;
        if (r.selectorText && /:focus-visible/.test(r.selectorText)) cssom.focusVisibleRules++;
      }
      if (r.cssRules) visit(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    cssom.sheets++;
    try {
      visit(sheet.cssRules);
    } catch (e) {
      cssom.inaccessibleSheets++;
    }
  }
  cssom.breakpoints = hist(cssom.breakpoints);
  cssom.mediaQueries = Object.fromEntries(Object.entries(cssom.mediaQueries).sort((a, b) => b[1] - a[1]).slice(0, 25));
  out.cssom = cssom;

  // Custom properties on :root (derived tokens; values only for colour/length-like tokens, capped).
  const rootStyle = cs(doc);
  const rootProps = [];
  for (let i = 0; i < rootStyle.length; i++) {
    const name = rootStyle[i];
    if (name.startsWith('--')) rootProps.push([name, rootStyle.getPropertyValue(name).trim().slice(0, 60)]);
  }
  const isColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i.test(v);
  const isLength = (v) => /^-?[\d.]+(px|rem|em|vw|vh|%)$|^clamp\(|^calc\(/.test(v);
  out.tokens = {
    rootCustomProperties: rootProps.length,
    colorTokens: rootProps.filter(([, v]) => isColor(v)).length,
    lengthTokens: rootProps.filter(([, v]) => isLength(v)).length,
    colorSample: rootProps.filter(([, v]) => isColor(v)).slice(0, 24).map(([n, v]) => ({ name: n.slice(0, 40), value: v })),
    lengthSample: rootProps.filter(([, v]) => isLength(v)).slice(0, 24).map(([n, v]) => ({ name: n.slice(0, 40), value: v })),
  };

  // ---------- accessibility structure ----------
  const accName = (el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    if (norm(el.textContent || '')) return true;
    const img = el.querySelector('img[alt]:not([alt=""]), svg[aria-label], [role="img"][aria-label]');
    return !!img;
  };
  const links = [...document.querySelectorAll('a[href]')].filter(isVis);
  const buttons = [...document.querySelectorAll('button, [role="button"]')].filter(isVis);
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter(isVis);
  const labelled = (el) => !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.getAttribute('title') || el.getAttribute('placeholder'));
  const imgs = [...document.querySelectorAll('img')];
  const focusables = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')];
  const firstFocusable = focusables.find((el) => !el.disabled);
  out.accessibility = {
    landmarks: {
      header: document.querySelectorAll('header, [role="banner"]').length,
      nav: navs.length,
      main: document.querySelectorAll('main, [role="main"]').length,
      footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
      aside: document.querySelectorAll('aside, [role="complementary"]').length,
      search: document.querySelectorAll('[role="search"], search').length,
    },
    langPresent: !!doc.getAttribute('lang'),
    images: { total: imgs.length, missingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length, emptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length },
    linksVisible: links.length,
    linksWithoutName: links.filter((l) => !accName(l)).length,
    buttonsVisible: buttons.length,
    buttonsWithoutName: buttons.filter((b) => !accName(b)).length,
    inputsVisible: inputs.length,
    inputsWithoutLabel: inputs.filter((i) => !labelled(i)).length,
    placeholderOnlyLabels: inputs.filter((i) => i.getAttribute('placeholder') && !(i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.closest('label') || (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)))).length,
    positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])').length,
    ariaHiddenWithFocusable: [...document.querySelectorAll('[aria-hidden="true"]')].filter((el) =>
      [...el.querySelectorAll('a[href]:not([tabindex="-1"]), button:not([tabindex="-1"]):not([disabled]), input:not([tabindex="-1"]):not([disabled]):not([type=hidden]), select:not([tabindex="-1"]), textarea:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])')].some((f) => f.getClientRects().length > 0 && cs(f).visibility !== 'hidden' && !f.closest('[inert]')),
    ).length,
    skipLinkFirst: !!(firstFocusable && firstFocusable.tagName === 'A' && (firstFocusable.getAttribute('href') || '').startsWith('#')),
    smallTapTargets: [...links, ...buttons].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width < 24 || r.height < 24)) return false;
      const p = el.parentElement;
      const inline = cs(el).display === 'inline' && p && norm(p.textContent || '').length > norm(el.textContent || '').length + 10;
      return !inline;
    }).length,
    focusableCount: focusables.length,
  };

  // ---------- RTL / bidi ----------
  const dirEls = document.querySelectorAll('[dir]');
  const alignCounts = {};
  for (const el of textEls) {
    const a = cs(el).textAlign;
    alignCounts[a] = (alignCounts[a] || 0) + 1;
  }
  let mirroredIcons = 0, iconsInControls = 0;
  for (const el of [...links, ...buttons]) {
    for (const ic of el.querySelectorAll('svg, img, i, [class*="icon"]')) {
      iconsInControls++;
      const t = cs(ic).transform;
      const m = t && t.match(/^matrix\(([-\d.e]+),/);
      if (m && +m[1] < 0) mirroredIcons++;
    }
  }
  out.rtl = {
    htmlDir: doc.getAttribute('dir'),
    computedDirection: cs(doc).direction,
    mainDirection: main ? cs(main).direction : null,
    dirAttributes: { rtl: [...dirEls].filter((e) => e.getAttribute('dir') === 'rtl').length, ltr: [...dirEls].filter((e) => e.getAttribute('dir') === 'ltr').length, auto: [...dirEls].filter((e) => e.getAttribute('dir') === 'auto').length },
    bdiBdo: document.querySelectorAll('bdi, bdo').length,
    textAlign: alignCounts,
    mixedRunNodes,
    digits: { western: scriptChars.westDigits, arabicIndic: scriptChars.arabicIndicDigits },
    iconsInControls,
    horizontallyMirroredIcons: mirroredIcons,
  };

  // ---------- performance (Performance API, lab, environment-relative) ----------
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const observe = (type) =>
    new Promise((res) => {
      const entries = [];
      try {
        const po = new PerformanceObserver((l) => entries.push(...l.getEntries()));
        po.observe({ type, buffered: true });
        setTimeout(() => {
          po.disconnect();
          res(entries);
        }, 120);
      } catch (e) {
        res(entries);
      }
    });
  const [lcp, shifts, longTasks] = await Promise.all([observe('largest-contentful-paint'), observe('layout-shift'), observe('longtask')]);
  const lastLcp = lcp[lcp.length - 1];
  out.performance = {
    caveat: 'lab values in DI capture environment (egress proxy); compare only within the same environment',
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    load: nav ? Math.round(nav.loadEventEnd) : null,
    transferSize: nav ? nav.transferSize : null,
    firstContentfulPaint: paint['first-contentful-paint'] ?? null,
    lcp: lastLcp ? { time: Math.round(lastLcp.startTime), element: lastLcp.element ? lastLcp.element.tagName.toLowerCase() : null, size: lastLcp.size } : null,
    cls: round(shifts.filter((s) => !s.hadRecentInput).reduce((s, e) => s + e.value, 0), 4),
    longTasks: { count: longTasks.length, totalMs: Math.round(longTasks.reduce((s, t) => s + t.duration, 0)) },
    domElements: all.length,
  };

  // ---------- implementation evidence (globals; VERIFIED presence only) ----------
  const g = (k) => {
    try {
      return typeof window[k] !== 'undefined';
    } catch (e) {
      return false;
    }
  };
  out.implementation = {
    globals: Object.fromEntries(
      ['gsap', 'ScrollTrigger', 'THREE', 'Lenis', 'lenis', 'LocomotiveScroll', 'Swiper', 'lottie', 'barba', 'Webflow', '__NEXT_DATA__', '__NUXT__', '__nuxt', 'Shopify', 'jQuery', 'Alpine', 'Vue', '__VUE__', 'wp', 'Framer', '__framer_importFromPackage', 'PIXI', 'BABYLON', 'Splide', 'anime', 'Motion', 'Rive', 'gtag', 'dataLayer']
        .filter(g)
        .map((k) => [k, true]),
    ),
    reactRoot: !!document.querySelector('[data-reactroot], #__next, #root') || g('__REACT_DEVTOOLS_GLOBAL_HOOK__'),
    nextRoot: !!document.querySelector('#__next') || g('__NEXT_DATA__') || !!document.querySelector('script[src*="/_next/"]'),
    nuxtRoot: !!document.querySelector('#__nuxt') || g('__NUXT__'),
    astroIslands: document.querySelectorAll('astro-island').length,
    webflowAttr: !!doc.getAttribute('data-wf-page'),
    framerAttr: !!document.querySelector('[data-framer-name], [data-framer-component-type]'),
    generator: out.document.generator,
    instrumentation: instr,
  };

  return out;
}
