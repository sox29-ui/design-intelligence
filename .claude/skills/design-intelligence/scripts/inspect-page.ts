// DI capture engine: render a URL at benchmark viewports and record measurements, interaction
// behaviour, accessibility and network facts. Used for research (scripts/collect.ts) and for
// verifying DI's own outputs (verify-page.ts).
//
// CLI:  node inspect-page.ts <url> --out <dir> [--artifacts <dir>] [--viewports mobile,desktop] [--no-extras]
// Writes: viewport-<w>x<h>.json per viewport, extras-<w>x<h>.json, screenshots (JPEG) to artifacts.
// Never stores page copy: probe returns measurements and text *scripts/lengths* only.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import AxeBuilderModule from '@axe-core/playwright';

const AxeBuilder = ((AxeBuilderModule as unknown as { default?: unknown }).default ?? AxeBuilderModule) as typeof AxeBuilderModule;
const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE_SRC = readFileSync(join(HERE, 'lib', 'probe.browser.js'), 'utf8').replace(/^\/\/.*$/gm, '');
const INSTRUMENT_SRC = readFileSync(join(HERE, 'lib', 'instrument.browser.js'), 'utf8');
export const TOOL_VERSION = '0.1.0';

export type ViewportSpec = { name: string; width: number; height: number; mobile?: boolean; touch?: boolean };
export const BENCHMARK_VIEWPORTS: ViewportSpec[] = [
  { name: 'mobile', width: 390, height: 844, mobile: true, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];

export type FileRecord = { path: string; sha256: string; bytes: number };
export type ArtifactRecord = { file: string; sha256: string; bytes: number; kind: string; viewport: string | null; state: string | null };
export type InspectOptions = {
  url: string;
  outDir: string;
  artifactDir: string;
  viewports?: ViewportSpec[];
  interactionViewports?: string[];
  extrasViewport?: string | null;
  axe?: boolean;
  consent?: 'reject' | 'none';
  settleMs?: number;
  locale?: string;
  /** Serve this directory at LOCAL_ORIGIN via request interception (no local server, works behind the egress proxy). */
  localDir?: string;
  log?: (m: string) => void;
};
export const LOCAL_ORIGIN = 'http://di-local.test';
export type InspectResult = {
  finalUrl: string | null;
  blocked: boolean;
  blockedReason: string | null;
  consent: { action: string; detail: string };
  viewports: Array<{ name: string; width: number; height: number; status: string; http_status: number | null; error: string | null }>;
  files: FileRecord[];
  artifacts: ArtifactRecord[];
  errors: string[];
  browserVersion: string;
};

const CHALLENGE_RE = /just a moment|attention required|access denied|captcha|verify you are human|are you a robot|request unsuccessful|pardon our interruption/i;
const CONSENT_CONTAINER = '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], #onetrust-banner-sdk, #onetrust-consent-sdk, #CybotCookiebotDialog, [id*="didomi" i], [id*="usercentrics" i], [aria-label*="cookie" i], [role="dialog"], [role="alertdialog"]';
const REJECT_RE = /reject|decline|refuse|deny|disagree|only (necessary|essential|required)|(necessary|essential|required) only|continue without|رفض|ارفض|الضرورية فقط/i;
const MENU_HINT_RE = /menu|navigation|nav|burger|القائمة|قائمة/i;
const LIBRARY_PATTERNS: Array<[string, RegExp]> = [
  ['gsap', /gsap|greensock|ScrollTrigger/i],
  ['three.js', /three(\.module)?(\.min)?\.js|\/three@|three\.core/i],
  ['lenis', /lenis/i],
  ['locomotive-scroll', /locomotive-scroll/i],
  ['swiper', /swiper/i],
  ['lottie', /lottie|bodymovin/i],
  ['barba', /barba/i],
  ['webflow', /webflow\.(com|io)|website-files\.com/i],
  ['framer', /framer(usercontent)?\.com|framerstatic/i],
  ['next.js', /\/_next\//],
  ['nuxt', /\/_nuxt\//],
  ['gatsby', /gatsby/i],
  ['wordpress', /wp-content|wp-includes/i],
  ['shopify-cdn', /cdn\.shopify\.com/i],
  ['google-tag-manager', /googletagmanager\.com/i],
  ['rive', /rive\.app|@rive-app|\.riv(\?|$)/i],
  ['spline', /spline(tool)?\.design|splinecode/i],
  ['pixi', /pixi(\.min)?\.js/i],
  ['vimeo', /vimeocdn|player\.vimeo/i],
  ['youtube', /youtube\.com\/(embed|iframe_api)|ytimg/i],
  ['mux', /mux\.com/i],
  ['cloudinary', /cloudinary\.com/i],
  ['imgix', /imgix\.net/i],
  ['typekit', /use\.typekit\.net|typekit/i],
  ['google-fonts', /fonts\.(googleapis|gstatic)\.com/i],
];

function sha256(buf: Buffer | string) {
  return createHash('sha256').update(buf).digest('hex');
}

function registrableHost(host: string): string {
  const parts = host.split('.');
  const twoLevel = /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

type NetEntry = { host: string; type: string; status: number; bytes: number; mime: string; ext: string; failed?: boolean; lib: string[] };

async function settle(page: Page, ms: number) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function handleConsent(page: Page, policy: 'reject' | 'none'): Promise<{ action: string; detail: string }> {
  const containers = page.locator(CONSENT_CONTAINER);
  const n = Math.min(await containers.count().catch(() => 0), 12);
  let bannerVisible = false;
  for (let i = 0; i < n; i++) {
    const c = containers.nth(i);
    if (!(await c.isVisible().catch(() => false))) continue;
    bannerVisible = true;
    if (policy !== 'reject') continue;
    const buttons = c.locator('button, a, [role="button"], input[type="button"], input[type="submit"]');
    const bn = Math.min(await buttons.count().catch(() => 0), 20);
    for (let j = 0; j < bn; j++) {
      const b = buttons.nth(j);
      const name = ((await b.getAttribute('aria-label').catch(() => null)) || (await b.innerText().catch(() => '')) || '').trim();
      if (name.length < 60 && REJECT_RE.test(name) && (await b.isVisible().catch(() => false))) {
        await b.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(700);
        return { action: 'rejected-nonessential', detail: 'clicked a visible reject/necessary-only control inside a consent container' };
      }
    }
  }
  // Fallback: a reject control inside any fixed/sticky layer (hashed class names defeat the selectors above).
  if (policy === 'reject') {
    const tagged = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, 'i');
      for (const b of document.querySelectorAll('button, a, [role="button"]')) {
        const name = ((b.getAttribute('aria-label') || (b as HTMLElement).innerText || '') as string).trim();
        if (!name || name.length > 60 || !re.test(name)) continue;
        const r = b.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        for (let e: Element | null = b; e; e = e.parentElement) {
          const pos = getComputedStyle(e).position;
          if (pos === 'fixed' || pos === 'sticky') {
            b.setAttribute('data-di-consent', 'reject');
            return true;
          }
        }
      }
      return false;
    }, REJECT_RE.source).catch(() => false);
    if (tagged) {
      await page.locator('[data-di-consent="reject"]').first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(700);
      return { action: 'rejected-nonessential', detail: 'clicked a reject/necessary-only control inside a fixed consent layer' };
    }
  }
  return bannerVisible ? { action: 'left-as-is', detail: 'consent-like container visible; no privacy-preserving control found' } : { action: 'none-found', detail: 'no visible consent container detected' };
}

async function shot(page: Page, artifactDir: string, name: string, opts: Parameters<Page['screenshot']>[0] = {}): Promise<ArtifactRecord & { buf?: Buffer }> {
  const file = `${name}.jpg`;
  const buf = await page.screenshot({ type: 'jpeg', quality: 70, timeout: 20000, ...opts });
  writeFileSync(join(artifactDir, file), buf);
  return { file, sha256: sha256(buf), bytes: buf.length, kind: name.includes('frame') ? 'frame' : 'screenshot', viewport: name.split('-')[0], state: name.split('-').slice(1).join('-') };
}

async function scrollThrough(page: Page, vh: number, artifactDir: string, prefix: string, artifacts: ArtifactRecord[]) {
  const start = await page.evaluate(() => document.documentElement.scrollHeight);
  const cap = vh * 25;
  const marks = [0.25, 0.5, 0.75, 1];
  let markIdx = 0;
  let method = 'wheel';
  let stuck = 0;
  for (let step = 0; step < 80 && markIdx < marks.length; step++) {
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, Math.round(vh * 0.8));
    await page.waitForTimeout(160);
    let { y, h } = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
    if (y <= before + 1) {
      stuck++;
      if (stuck >= 2) {
        method = 'scrollTo';
        await page.evaluate((d) => window.scrollTo(0, window.scrollY + d), Math.round(vh * 0.8));
        await page.waitForTimeout(160);
        ({ y, h } = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight })));
        if (y <= before + 1) break; // scroll is not driven by the document (custom container / scroll-jacking)
      }
    } else stuck = 0;
    const maxScroll = Math.min(h, cap) - vh;
    while (markIdx < marks.length && y >= maxScroll * marks[markIdx] - 2) {
      await page.waitForTimeout(900);
      artifacts.push(await shot(page, artifactDir, `${prefix}-scroll-${Math.round(marks[markIdx] * 100)}`));
      markIdx++;
    }
  }
  const end = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  return { method, marksCaptured: markIdx, startHeight: start, endHeight: end.h, reachedY: end.y, heightGrowth: end.h - start, documentScrolls: end.y > 0 };
}

async function renderedFonts(page: Page, probeKeys: string[]) {
  const out: Record<string, Array<{ family: string; postScriptName?: string; custom: boolean; glyphs: number }>> = {};
  try {
    const client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const { root } = (await client.send('DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } };
    for (const key of probeKeys) {
      const { nodeId } = (await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-di-probe="${key}"]` })) as { nodeId: number };
      if (!nodeId) continue;
      const { fonts } = (await client.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: Array<{ familyName: string; postScriptName?: string; isCustomFont: boolean; glyphCount: number }> };
      out[key] = fonts.map((f) => ({ family: f.familyName.replace(/[\u0000-\u001f\u007f]/g, ''), postScriptName: (f.postScriptName || '').replace(/[\u0000-\u001f\u007f]/g, ''), custom: f.isCustomFont, glyphs: f.glyphCount }));
    }
    await client.detach();
  } catch (e) {
    out.__error = [{ family: String((e as Error).message).slice(0, 80), custom: false, glyphs: 0 }];
  }
  return out;
}

async function focusWalk(page: Page, steps = 16) {
  await page.evaluate(() => {
    const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomWidth', 'backgroundColor', 'color', 'textDecorationLine'];
    const base = new WeakMap();
    for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')) {
      const s = getComputedStyle(el);
      base.set(el, Object.fromEntries(props.map((p) => [p, (s as any)[p]])));
    }
    (window as any).__DI_FOCUS_BASE__ = { base, props };
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Reset the sequential focus navigation starting point to the document start
    // (consent clicks would otherwise make the walk begin mid-page).
    const start = document.createElement('span');
    start.tabIndex = -1;
    document.body.prepend(start);
    start.focus();
    start.remove();
    window.scrollTo(0, 0);
  });
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(140);
    results.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { tag: 'body' };
        const { base, props } = (window as any).__DI_FOCUS_BASE__;
        const s = getComputedStyle(el);
        const b = base.get(el) || {};
        const changed = props.filter((p: string) => b[p] !== undefined && b[p] !== (s as any)[p]);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          indicator: outline || changed.length > 0,
          indicatorProps: outline ? ['outline', ...changed] : changed,
          inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0 && r.height > 0,
          size: [Math.round(r.width), Math.round(r.height)],
          skipLink: el.tagName === 'A' && (el.getAttribute('href') || '').startsWith('#'),
        };
      }),
    );
  }
  const real = results.filter((r) => r.tag !== 'body');
  return {
    steps,
    focusedSteps: real.length,
    withIndicator: real.filter((r) => r.indicator).length,
    indicatorShare: real.length ? Math.round((real.filter((r) => r.indicator).length / real.length) * 100) / 100 : null,
    offscreenOrHidden: real.filter((r) => !r.inViewport).length,
    firstIsSkipLink: !!(real[0] && real[0].skipLink),
    indicatorProps: Object.entries(
      real.flatMap((r) => r.indicatorProps as string[]).reduce((m: Record<string, number>, p) => ((m[p] = (m[p] || 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
    sequence: real.map((r) => `${r.tag}${r.role ? '[' + r.role + ']' : ''}${r.indicator ? '' : '!'}${r.inViewport ? '' : '~'}`),
  };
}

async function hoverProbe(page: Page, artifactDir: string, prefix: string, artifacts: ArtifactRecord[]) {
  const handles = await page.$$('header a[href], header button, main a[href], main button, a[href], button');
  const results: Array<Record<string, unknown>> = [];
  let shotTaken = false;
  for (const h of handles.slice(0, 60)) {
    if (results.length >= 5) break;
    const box = await h.boundingBox().catch(() => null);
    if (!box || box.y < 0 || box.y + box.height > 900 || box.width < 20 || box.height < 12) continue;
    const props = ['color', 'backgroundColor', 'opacity', 'transform', 'textDecorationLine', 'boxShadow', 'borderTopColor', 'filter', 'letterSpacing'];
    const read = () => h.evaluate((el, ps) => { const s = getComputedStyle(el); return Object.fromEntries(ps.map((p: string) => [p, (s as any)[p]])); }, props).catch(() => null);
    const before = await read();
    await h.hover({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    const after = await read();
    if (!before || !after) continue;
    const changed = props.filter((p) => before[p] !== after[p]);
    const childChanged = await h.evaluate((el) => [...el.querySelectorAll('*')].some((c) => getComputedStyle(c).transform !== 'none')).catch(() => false);
    const transition = await h.evaluate((el) => getComputedStyle(el).transitionDuration).catch(() => null);
    results.push({ tag: await h.evaluate((el) => el.tagName.toLowerCase()), changed, childTransformed: childChanged, transitionDuration: transition });
    if (!shotTaken && changed.length) {
      artifacts.push(await shot(page, artifactDir, `${prefix}-hover`));
      shotTaken = true;
    }
    await page.mouse.move(2, 2);
    await page.waitForTimeout(200);
  }
  return { sampled: results.length, withFeedback: results.filter((r) => (r.changed as string[]).length > 0).length, items: results };
}

async function menuProbe(page: Page, artifactDir: string, prefix: string, artifacts: ArtifactRecord[]) {
  const candidates = await page.$$('header button, header [role="button"], nav button, button[aria-expanded], button[aria-controls], [class*="burger" i], [class*="menu-toggle" i], [aria-label*="menu" i]');
  for (const c of candidates.slice(0, 25)) {
    const box = await c.boundingBox().catch(() => null);
    const inBanner = await c.evaluate((el) => !!el.closest('header, [role="banner"], nav')).catch(() => false);
    if (!box || (!inBanner && box.y > 250) || box.y > 700 || box.width < 12 || box.height < 12) continue;
    const meta = await c.evaluate((el) => ({ expanded: el.getAttribute('aria-expanded'), controls: !!el.getAttribute('aria-controls'), label: (el.getAttribute('aria-label') || '') + ' ' + (el.className && typeof el.className === 'string' ? el.className : '') + ' ' + (el.textContent || '').trim().slice(0, 30) }));
    if (meta.expanded === null && !meta.controls && !MENU_HINT_RE.test(meta.label)) continue;
    const countLinks = () => page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && (a as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false; }).length);
    const before = await countLinks();
    await c.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const after = await countLinks();
    const state = await page.evaluate(() => ({
      bodyLocked: ['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY) || ['hidden', 'clip'].includes(getComputedStyle(document.documentElement).overflowY),
      activeTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
      dialogs: [...document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')].filter((d) => (d as HTMLElement).getBoundingClientRect().width > 0).length,
    }));
    const expandedAfter = await c.getAttribute('aria-expanded').catch(() => null);
    artifacts.push(await shot(page, artifactDir, `${prefix}-menu-open`));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const expandedEsc = await c.getAttribute('aria-expanded').catch(() => null);
    const afterEsc = await countLinks();
    if (expandedEsc === 'true' || afterEsc > before) {
      await c.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    return { found: true, ariaExpandedBefore: meta.expanded, ariaExpandedAfter: expandedAfter, hasAriaControls: meta.controls, visibleLinksBefore: before, visibleLinksAfter: after, escapeCloses: expandedEsc === 'false' || afterEsc <= before, ...state };
  }
  return { found: false };
}

async function scrollLinkedChanges(page: Page, vh: number) {
  await page.evaluate((y) => window.scrollTo(0, y), vh);
  await page.waitForTimeout(1200);
  const snap = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('body *')].slice(0, 4000);
    (window as any).__DI_SNAP_ELS__ = (window as any).__DI_SNAP_ELS__ || els;
    return ((window as any).__DI_SNAP_ELS__ as Element[]).map((el) => { const s = getComputedStyle(el); return s.transform + '|' + s.opacity + '|' + s.clipPath; });
  });
  const a = await snap();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(140);
  const b = await snap();
  let changed = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) changed++;
  await page.evaluate(() => { delete (window as any).__DI_SNAP_ELS__; window.scrollTo(0, 0); });
  return { sampledElements: a.length, changedAfterScroll: changed };
}

function summarizeNetwork(entries: NetEntry[], pageHost: string) {
  const site = registrableHost(pageHost);
  const by = (k: keyof NetEntry) => {
    const m: Record<string, { count: number; bytes: number }> = {};
    for (const e of entries) {
      const key = String(e[k]);
      m[key] = m[key] || { count: 0, bytes: 0 };
      m[key].count++;
      m[key].bytes += e.bytes;
    }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15));
  };
  const third = entries.filter((e) => registrableHost(e.host) !== site);
  const libs: Record<string, number> = {};
  for (const e of entries) for (const l of e.lib) libs[l] = (libs[l] || 0) + 1;
  const fonts = entries.filter((e) => e.type === 'font');
  return {
    requests: entries.length,
    failed: entries.filter((e) => e.failed).length,
    totalBytes: entries.reduce((s, e) => s + e.bytes, 0),
    byType: by('type'),
    imageFormats: (() => {
      const m: Record<string, { count: number; bytes: number }> = {};
      for (const e of entries.filter((x) => x.type === 'image')) {
        const k = e.mime || e.ext || 'unknown';
        m[k] = m[k] || { count: 0, bytes: 0 };
        m[k].count++;
        m[k].bytes += e.bytes;
      }
      return m;
    })(),
    fonts: { count: fonts.length, bytes: fonts.reduce((s, e) => s + e.bytes, 0), formats: [...new Set(fonts.map((f) => f.ext || f.mime))] },
    thirdParty: { requests: third.length, bytes: third.reduce((s, e) => s + e.bytes, 0), hosts: [...new Set(third.map((e) => e.host))].length },
    topHosts: Object.entries(entries.reduce((m: Record<string, number>, e) => ((m[e.host] = (m[e.host] || 0) + e.bytes), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host, bytes]) => ({ host, bytes })),
    libraryEvidence: libs,
  };
}

function ariaSummary(snapshot: string) {
  const roles: Record<string, number> = {};
  for (const m of snapshot.matchAll(/^\s*- ([a-z]+)/gm)) roles[m[1]] = (roles[m[1]] || 0) + 1;
  return { lines: snapshot.split('\n').length, roles: Object.fromEntries(Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 25)) };
}

function contextOptions(vp: ViewportSpec, extra: Record<string, unknown> = {}) {
  const mobileUA = devices['Pixel 7'].userAgent;
  return {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.touch,
    ...(vp.mobile ? { userAgent: mobileUA } : {}),
    reducedMotion: 'no-preference' as const,
    colorScheme: 'light' as const,
    ...extra,
  };
}

const LOCAL_MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.md': 'text/plain' };

async function prepareContext(ctx: BrowserContext, localDir?: string) {
  await ctx.addInitScript({ content: INSTRUMENT_SRC });
  if (!localDir) return;
  const root = resolve(localDir);
  await ctx.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const u = new URL(route.request().url());
    let file = join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root)) return route.fulfill({ status: 403, body: 'forbidden' });
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    const ext = (file.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    return route.fulfill({ status: 200, contentType: LOCAL_MIME[ext] ?? 'application/octet-stream', body: readFileSync(file) });
  });
}

function proxyFor(_url: string) {
  // Always route through the egress proxy when one is configured (web fonts on local pages need it);
  // local pages bypass it.
  if (!process.env.HTTPS_PROXY) return undefined;
  return { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' };
}

export async function inspectPage(o: InspectOptions): Promise<InspectResult> {
  const log = o.log ?? ((m: string) => console.error(m));
  const viewports = o.viewports ?? BENCHMARK_VIEWPORTS;
  const interactionVps = new Set(o.interactionViewports ?? ['mobile', 'desktop']);
  const extrasVp = o.extrasViewport === undefined ? 'desktop' : o.extrasViewport;
  const settleMs = o.settleMs ?? 2500;
  mkdirSync(o.outDir, { recursive: true });
  mkdirSync(o.artifactDir, { recursive: true });
  const files: FileRecord[] = [];
  const artifacts: ArtifactRecord[] = [];
  const errors: string[] = [];
  const vpResults: InspectResult['viewports'] = [];
  let finalUrl: string | null = null;
  let blocked = false;
  let blockedReason: string | null = null;
  let consent = { action: 'not-applicable', detail: '' };
  const writeOut = (name: string, data: unknown) => {
    const text = JSON.stringify(data, null, 2) + '\n';
    writeFileSync(join(o.outDir, name), text);
    files.push({ path: name, sha256: sha256(text), bytes: Buffer.byteLength(text) });
  };
  const proxy = proxyFor(o.url);
  const browser: Browser = await chromium.launch({ ...(proxy ? { proxy } : {}) });
  const browserVersion = browser.version();
  const pageHost = o.localDir ? 'di-local.test' : o.url.startsWith('file:') ? 'local' : new URL(o.url).hostname;
  try {
    for (const vp of viewports) {
      const tag = `${vp.width}x${vp.height}`;
      log(`  viewport ${tag}`);
      const ctx: BrowserContext = await browser.newContext(contextOptions(vp, o.locale ? { locale: o.locale } : {}));
      await prepareContext(ctx, o.localDir);
      const page = await ctx.newPage();
      const net: NetEntry[] = [];
      let consoleErrors = 0;
      let pageErrors = 0;
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors++; });
      page.on('pageerror', () => pageErrors++);
      page.on('requestfinished', async (req) => {
        try {
          const res = await req.response();
          const sizes = await req.sizes();
          const u = new URL(req.url());
          const ext = (u.pathname.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '';
          const mime = (res?.headers()['content-type'] || '').split(';')[0];
          net.push({ host: u.hostname, type: req.resourceType(), status: res?.status() ?? 0, bytes: sizes.responseBodySize + sizes.responseHeadersSize, mime, ext: ext.toLowerCase(), lib: LIBRARY_PATTERNS.filter(([, re]) => re.test(u.hostname + u.pathname)).map(([n]) => n) });
        } catch (e) { /* ignore */ }
      });
      page.on('requestfailed', (req) => {
        try {
          const u = new URL(req.url());
          net.push({ host: u.hostname, type: req.resourceType(), status: 0, bytes: 0, mime: '', ext: '', failed: true, lib: [] });
        } catch (e) { /* ignore */ }
      });
      let http: number | null = null;
      try {
        const res = await page.goto(o.url, { waitUntil: 'load', timeout: 60000 }).catch(async (e) => {
          log(`    load timeout/error: ${String(e.message).split('\n')[0]}`);
          return null;
        });
        http = res ? res.status() : null;
        await settle(page, settleMs);
        finalUrl = page.url();
        const title = await page.title().catch(() => '');
        const bodyLen = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
        if (CHALLENGE_RE.test(title) || (http !== null && http >= 400 && bodyLen < 400)) {
          blocked = true;
          blockedReason = `challenge or error page (http ${http})`;
          vpResults.push({ name: vp.name, width: vp.width, height: vp.height, status: 'blocked', http_status: http, error: blockedReason });
          await ctx.close();
          break;
        }
        // Layout shift before any DI interaction (consent clicks, scrolling) — avoids measuring our own induced shifts.
        const preInteraction = await page.evaluate(() => new Promise((res) => {
          const shifts: number[] = [];
          try {
            const po = new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) shifts.push(e.value); });
            po.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => { po.disconnect(); res({ cls: Math.round(shifts.reduce((a, b) => a + b, 0) * 10000) / 10000, shifts: shifts.length, atMs: Math.round(performance.now()) }); }, 150);
          } catch (e) { res({ cls: null, shifts: 0, atMs: Math.round(performance.now()) }); }
        })).catch(() => null);
        const c = await handleConsent(page, o.consent ?? 'reject');
        if (consent.action === 'not-applicable' || c.action === 'rejected-nonessential') consent = c;
        artifacts.push(await shot(page, o.artifactDir, `${tag}-top`));
        const scroll = await scrollThrough(page, vp.height, o.artifactDir, tag, artifacts);
        const metrics = await page.evaluate(`(${PROBE_SRC})(${JSON.stringify({})})`);
        const m = metrics as { headings?: { items?: Array<{ probe: string }> }; displayText?: { probe: string } | null };
        const keys = [m.headings?.items?.[0]?.probe, m.headings?.items?.[1]?.probe, m.displayText?.probe].filter(Boolean) as string[];
        const probeKeys = await page.evaluate(() => [...document.querySelectorAll('[data-di-probe]')].map((e) => e.getAttribute('data-di-probe') as string).filter((k) => /^(para|button|header)-/.test(k)));
        const fonts = await renderedFonts(page, [...new Set([...keys, ...probeKeys])]);
        artifacts.push(await shot(page, o.artifactDir, `${tag}-long`, { fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: Math.min(await page.evaluate(() => document.documentElement.scrollHeight), vp.height * 6) } }));
        const interactions: Record<string, unknown> = {};
        let axeSummary: unknown = null;
        let aria: unknown = null;
        if (interactionVps.has(vp.name)) {
          interactions.menu = await menuProbe(page, o.artifactDir, tag, artifacts).catch((e) => ({ error: String(e.message).slice(0, 120) }));
          await page.evaluate(() => window.scrollTo(0, 0));
          interactions.focus = await focusWalk(page).catch((e) => ({ error: String(e.message).slice(0, 120) }));
          artifacts.push(await shot(page, o.artifactDir, `${tag}-focus`));
          if (!vp.touch) interactions.hover = await hoverProbe(page, o.artifactDir, tag, artifacts).catch((e) => ({ error: String(e.message).slice(0, 120) }));
          if (o.axe !== false) {
            try {
              const r = await new (AxeBuilder as any)({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
              const full = JSON.stringify(r);
              const fname = `${tag}-axe.json`;
              writeFileSync(join(o.artifactDir, fname), full);
              artifacts.push({ file: fname, sha256: sha256(full), bytes: Buffer.byteLength(full), kind: 'axe-full', viewport: tag, state: null });
              axeSummary = {
                engine: r.testEngine?.version,
                violations: r.violations.map((v: any) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
                counts: { violations: r.violations.length, incomplete: r.incomplete.length, passes: r.passes.length },
                byImpact: r.violations.reduce((m: Record<string, number>, v: any) => ((m[v.impact] = (m[v.impact] || 0) + v.nodes.length), m), {}),
              };
            } catch (e) {
              axeSummary = { error: String((e as Error).message).slice(0, 160) };
            }
          }
          try {
            const snap = await page.locator('body').ariaSnapshot({ timeout: 15000 });
            const fname = `${tag}-aria.yml`;
            writeFileSync(join(o.artifactDir, fname), snap);
            artifacts.push({ file: fname, sha256: sha256(snap), bytes: Buffer.byteLength(snap), kind: 'aria-snapshot', viewport: tag, state: null });
            aria = ariaSummary(snap);
          } catch (e) {
            aria = { error: String((e as Error).message).slice(0, 160) };
          }
        }
        writeOut(`viewport-${tag}.json`, {
          viewport: { name: vp.name, width: vp.width, height: vp.height, mobileEmulation: !!vp.mobile, touch: !!vp.touch, dpr: 1 },
          http_status: http,
          preInteraction,
          scroll,
          metrics,
          renderedFonts: fonts,
          interactions,
          axe: axeSummary,
          aria,
          network: summarizeNetwork(net, pageHost),
          console: { errors: consoleErrors, pageErrors },
        });
        vpResults.push({ name: vp.name, width: vp.width, height: vp.height, status: 'ok', http_status: http, error: null });

        if (extrasVp === vp.name) {
          const extras: Record<string, unknown> = {};
          extras.scrollLinked = await scrollLinkedChanges(page, vp.height).catch((e) => ({ error: String(e.message).slice(0, 120) }));
          // Entrance choreography frames (fresh context).
          const fctx = await browser.newContext(contextOptions(vp));
          await prepareContext(fctx, o.localDir);
          const fpage = await fctx.newPage();
          const t0 = Date.now();
          await fpage.goto(o.url, { waitUntil: 'commit', timeout: 60000 }).catch(() => null);
          const frames: number[] = [];
          for (const at of [400, 900, 1600, 2600, 4200]) {
            const wait = at - (Date.now() - t0);
            if (wait > 0) await fpage.waitForTimeout(wait);
            try {
              artifacts.push(await shot(fpage, o.artifactDir, `${tag}-frame-entrance-${at}`, { timeout: 8000 }));
              frames.push(at);
            } catch (e) { /* page not paintable yet */ }
          }
          extras.entranceFrames = frames;
          await fctx.close();
          // Reduced motion.
          const rctx = await browser.newContext(contextOptions(vp, { reducedMotion: 'reduce' }));
          await prepareContext(rctx, o.localDir);
          const rpage = await rctx.newPage();
          await rpage.goto(o.url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
          await settle(rpage, settleMs);
          await handleConsent(rpage, o.consent ?? 'reject');
          artifacts.push(await shot(rpage, o.artifactDir, `${tag}-reduced-motion-top`));
          const rm = (await rpage.evaluate(`(${PROBE_SRC})({})`)) as Record<string, any>;
          extras.reducedMotion = { motion: rm.motion, effects: rm.effects, instrumentation: rm.implementation?.instrumentation, media: rm.components?.media, cssom: { reducedMotionRules: rm.cssom?.reducedMotionRules } };
          await rctx.close();
          // Dark colour scheme.
          const dctx = await browser.newContext(contextOptions(vp, { colorScheme: 'dark' }));
          await prepareContext(dctx, o.localDir);
          const dpage = await dctx.newPage();
          await dpage.goto(o.url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
          await settle(dpage, 1500);
          await handleConsent(dpage, o.consent ?? 'reject');
          artifacts.push(await shot(dpage, o.artifactDir, `${tag}-dark-scheme-top`));
          extras.darkScheme = await dpage.evaluate(() => {
            const bg = getComputedStyle(document.body).backgroundColor;
            const root = getComputedStyle(document.documentElement).backgroundColor;
            const fg = getComputedStyle(document.body).color;
            return { bodyBackground: bg, rootBackground: root, bodyColor: fg, colorSchemeProperty: getComputedStyle(document.documentElement).colorScheme };
          });
          await dctx.close();
          writeOut(`extras-${tag}.json`, extras);
        }
      } catch (e) {
        const msg = String((e as Error).message).split('\n')[0].slice(0, 200);
        errors.push(`${tag}: ${msg}`);
        vpResults.push({ name: vp.name, width: vp.width, height: vp.height, status: 'error', http_status: http, error: msg });
      }
      await ctx.close().catch(() => {});
    }
  } finally {
    await browser.close();
  }
  return { finalUrl, blocked, blockedReason, consent, viewports: vpResults, files, artifacts, errors, browserVersion };
}

// ---------------- CLI ----------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (!url) {
    console.error('usage: node inspect-page.ts <url> --out <dir> [--artifacts <dir>] [--viewports mobile,desktop] [--no-extras] [--no-axe]');
    process.exit(2);
  }
  const out = resolve(get('--out') ?? 'di-inspect');
  const names = get('--viewports')?.split(',');
  const res = await inspectPage({
    url,
    outDir: out,
    artifactDir: resolve(get('--artifacts') ?? join(out, 'artifacts')),
    viewports: names ? BENCHMARK_VIEWPORTS.filter((v) => names.includes(v.name)) : BENCHMARK_VIEWPORTS,
    extrasViewport: args.includes('--no-extras') ? null : 'desktop',
    axe: !args.includes('--no-axe'),
  });
  writeFileSync(join(out, 'inspect-result.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ blocked: res.blocked, viewports: res.viewports, files: res.files.length, artifacts: res.artifacts.length, errors: res.errors }, null, 2));
}
