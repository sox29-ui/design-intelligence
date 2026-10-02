// Deterministic normalizer: raw captures → VERIFIED observations (datasets/observations/<ref>/verified.json).
// Every observation's value is read back through its JSON pointer, so values cannot drift from evidence.
// Usage: node scripts/normalize.ts ref-001 [ref-002 ...] | --all
import { existsSync, readdirSync } from 'node:fs';
import { abs, readJson, readYaml, resolvePointer, writeJson } from './lib/io.ts';

export const NORMALIZER_VERSION = '0.1.0';
const VP_SHORT: Record<string, string> = { '390x844': '390', '768x1024': '768', '1440x900': '1440', '1920x1080': '1920' };
const FULL_VPS = new Set(['390x844', '1440x900']);

type Obs = Record<string, unknown> & { id: string };
type Spec = {
  cat: string;
  slug: string;
  ptr: string;
  unit?: string;
  method?: string;
  conf?: number;
  weakIf?: (v: any) => boolean;
  tags?: string[];
  subset?: boolean; // also emitted for tablet/wide
  rtlOnly?: boolean;
  statement?: (v: any) => string;
};

const S = (cat: string, slug: string, ptr: string, o: Partial<Spec> = {}): Spec => ({ cat, slug, ptr, ...o });
const PER_VP: Spec[] = [
  S('typography', 'body-size', '/metrics/typography/dominantBodySize', { unit: 'px', subset: true }),
  S('typography', 'max-size', '/metrics/typography/maxSize', { unit: 'px', subset: true }),
  S('typography', 'scale-range', '/metrics/typography/scaleRange', { subset: true, statement: (v) => `largest text is ${v}× the dominant body size` }),
  S('typography', 'distinct-sizes', '/metrics/typography/distinctSizes'),
  S('typography', 'family-share', '/metrics/typography/familyShare'),
  S('typography', 'weights', '/metrics/typography/distinctWeights'),
  S('typography', 'uppercase-share', '/metrics/typography/uppercaseShare'),
  S('typography', 'display-size', '/metrics/displayText/size', { unit: 'px', subset: true }),
  S('typography', 'display-size-vw', '/metrics/displayText/sizeVw', { unit: 'vw', subset: true }),
  S('typography', 'display-line-height', '/metrics/displayText/lineHeightRatio'),
  S('typography', 'display-tracking', '/metrics/displayText/letterSpacingEm', { unit: 'em' }),
  S('typography', 'display-weight', '/metrics/displayText/weight'),
  S('typography', 'display-lines', '/metrics/displayText/lines', { subset: true, conf: 0.95 }),
  S('typography', 'display-chars-per-line', '/metrics/displayText/charsPerLine', { conf: 0.9 }),
  S('typography', 'display-family', '/metrics/displayText/family'),
  S('typography', 'display-transform', '/metrics/displayText/textTransform'),
  S('typography', 'display-wrap', '/metrics/displayText/textWrap'),
  S('typography', 'display-script', '/metrics/displayText/script'),
  S('typography', 'display-is-heading', '/metrics/displayText/tag'),
  S('typography', 'reading-chars-per-line', '/metrics/reading/charsPerLine', { conf: 0.9 }),
  S('typography', 'reading-line-height', '/metrics/reading/lineHeightRatio'),
  S('typography', 'reading-size', '/metrics/reading/fontSize', { unit: 'px' }),
  S('typography', 'webfonts', '/metrics/fonts/loadedFamilies'),
  S('typography', 'font-display', '/metrics/fonts/fontDisplayValues'),
  S('typography', 'rendered-fonts', '/renderedFonts', { method: 'computed-style' }),
  S('hierarchy', 'h1-count', '/metrics/headings/h1Count', { method: 'dom', weakIf: (v) => v !== 1, tags: ['heading-structure'] }),
  S('hierarchy', 'heading-count', '/metrics/headings/count', { method: 'dom' }),
  S('hierarchy', 'heading-outline', '/metrics/headings/outline', { method: 'dom' }),
  S('hierarchy', 'skipped-heading-levels', '/metrics/headings/skippedLevels', { method: 'dom', weakIf: (v) => v > 0 }),
  S('layout', 'dominant-container', '/metrics/layout/dominantContainer', { unit: 'px', method: 'layout-measurement', conf: 0.9, subset: true }),
  S('layout', 'widest-container', '/metrics/layout/widestContainer', { unit: 'px', method: 'layout-measurement', conf: 0.9, subset: true }),
  S('layout', 'text-left-edges', '/metrics/layout/textLeftEdges', { method: 'layout-measurement', conf: 0.9 }),
  S('layout', 'distinct-text-edges', '/metrics/layout/distinctTextEdges', { method: 'layout-measurement', conf: 0.9 }),
  S('layout', 'grid-containers', '/metrics/layout/gridContainers'),
  S('layout', 'grid-columns', '/metrics/layout/gridColumnCounts', { subset: true }),
  S('layout', 'gaps', '/metrics/layout/gaps', { unit: 'px' }),
  S('layout', 'sticky-elements', '/metrics/layout/stickyElements'),
  S('layout', 'fixed-elements', '/metrics/layout/fixedElements'),
  S('layout', 'page-height-vh', '/metrics/layout/pageHeightVh', { method: 'layout-measurement', subset: true }),
  S('layout', 'section-padding-top', '/metrics/layout/sections/paddingTop', { unit: 'px' }),
  S('layout', 'text-over-media', '/metrics/layout/textOverMedia', { method: 'layout-measurement', conf: 0.9 }),
  S('layout', 'horizontal-overflow', '/metrics/document/horizontalOverflowPx', { unit: 'px', method: 'layout-measurement', subset: true, weakIf: (v) => v > 0, tags: ['wcag-1-4-10'] }),
  S('color', 'scheme', '/metrics/color/scheme', { subset: true }),
  S('color', 'root-background', '/metrics/color/rootBackground'),
  S('color', 'background-palette', '/metrics/color/backgroundPalette', { conf: 0.9 }),
  S('color', 'text-colors', '/metrics/color/textColors'),
  S('color', 'button-backgrounds', '/metrics/color/buttonBackgrounds', { conf: 0.9 }),
  S('color', 'gradient-area', '/metrics/color/gradientAreaRatio', { conf: 0.9 }),
  S('color', 'low-contrast-normal-share', '/metrics/color/contrast/lowContrastNormalShare', { conf: 0.9, weakIf: (v) => v > 0.05, tags: ['wcag-1-4-3'] }),
  S('color', 'low-contrast-large-share', '/metrics/color/contrast/lowContrastLargeShare', { conf: 0.9, weakIf: (v) => v > 0.05, tags: ['wcag-1-4-3'] }),
  S('color', 'contrast-uncertain-share', '/metrics/color/contrast/uncertainShare', { conf: 0.9 }),
  S('color', 'contrast-ratio', '/metrics/color/contrast/ratio', { conf: 0.9 }),
  S('color', 'root-tokens', '/metrics/tokens/colorTokens', { method: 'cssom' }),
  S('components', 'header', '/metrics/components/header', { conf: 0.9, subset: true }),
  S('components', 'buttons', '/metrics/components/buttons', { conf: 0.9 }),
  S('components', 'card-groups', '/metrics/components/cardGroups', { conf: 0.9 }),
  S('components', 'media', '/metrics/components/media', { method: 'dom' }),
  S('components', 'forms', '/metrics/components/forms', { method: 'dom' }),
  S('components', 'effects', '/metrics/effects', { conf: 0.9 }),
  S('components', 'menu', '/interactions/menu', { method: 'dom', conf: 0.9 }),
  S('motion', 'transition-elements', '/metrics/motion/transitionElements'),
  S('motion', 'transition-duration', '/metrics/motion/transitionDuration', { unit: 'ms' }),
  S('motion', 'transition-easing', '/metrics/motion/transitionEasing'),
  S('motion', 'animations', '/metrics/motion/animations', { method: 'web-animations-api' }),
  S('motion', 'hover-feedback', '/interactions/hover', { conf: 0.9 }),
  S('motion', 'reduced-motion-css', '/metrics/cssom/reducedMotionRules', { method: 'cssom' }),
  S('accessibility', 'landmarks', '/metrics/accessibility/landmarks', { method: 'dom' }),
  S('accessibility', 'lang-present', '/metrics/accessibility/langPresent', { method: 'dom', weakIf: (v) => v === false, tags: ['wcag-3-1-1'] }),
  S('accessibility', 'images-missing-alt', '/metrics/accessibility/images/missingAlt', { method: 'dom', weakIf: (v) => v > 0, tags: ['wcag-1-1-1'] }),
  S('accessibility', 'links-without-name', '/metrics/accessibility/linksWithoutName', { method: 'dom', conf: 0.9, weakIf: (v) => v > 0, tags: ['wcag-2-4-4'] }),
  S('accessibility', 'buttons-without-name', '/metrics/accessibility/buttonsWithoutName', { method: 'dom', conf: 0.9, weakIf: (v) => v > 0, tags: ['wcag-4-1-2'] }),
  S('accessibility', 'inputs-without-label', '/metrics/accessibility/inputsWithoutLabel', { method: 'dom', conf: 0.9, weakIf: (v) => v > 0, tags: ['wcag-1-3-1'] }),
  S('accessibility', 'small-tap-targets', '/metrics/accessibility/smallTapTargets', { method: 'layout-measurement', conf: 0.9 }),
  S('accessibility', 'aria-hidden-focusable', '/metrics/accessibility/ariaHiddenWithFocusable', { method: 'dom', weakIf: (v) => v > 0 }),
  S('accessibility', 'axe-by-impact', '/axe/byImpact', { method: 'axe', weakIf: (v) => (v?.critical || 0) + (v?.serious || 0) > 0 }),
  S('accessibility', 'axe-violations', '/axe/violations', { method: 'axe' }),
  S('accessibility', 'focus-indicator-share', '/interactions/focus/indicatorShare', { method: 'computed-style', conf: 0.9, weakIf: (v) => v !== null && v < 0.8, tags: ['wcag-2-4-7'] }),
  S('accessibility', 'focus-offscreen', '/interactions/focus/offscreenOrHidden', { method: 'layout-measurement', conf: 0.9, weakIf: (v) => v > 0, tags: ['wcag-2-4-11'] }),
  S('accessibility', 'skip-link-first', '/interactions/focus/firstIsSkipLink', { method: 'dom' }),
  S('accessibility', 'focus-visible-rules', '/metrics/cssom/focusVisibleRules', { method: 'cssom' }),
  S('accessibility', 'aria-roles', '/aria/roles', { method: 'accessibility-tree' }),
  S('performance', 'lcp', '/metrics/performance/lcp', { method: 'performance-api' }),
  S('performance', 'cls-before-interaction', '/preInteraction/cls', { method: 'performance-api', weakIf: (v) => v > 0.1, tags: ['core-web-vitals'], statement: (v) => `layout shift accumulated before any capture interaction: ${v}` }),
  S('performance', 'cls-session', '/metrics/performance/cls', { method: 'performance-api', conf: 0.9, statement: () => 'CLS over the capture session; includes shifts after DI consent/scroll interactions (>500 ms after input)' }),
  S('performance', 'long-tasks', '/metrics/performance/longTasks', { method: 'performance-api' }),
  S('performance', 'dom-elements', '/metrics/performance/domElements', { method: 'dom' }),
  S('performance', 'transfer-bytes', '/network/totalBytes', { unit: 'bytes', method: 'network' }),
  S('performance', 'requests', '/network/requests', { method: 'network' }),
  S('performance', 'bytes-by-type', '/network/byType', { method: 'network' }),
  S('performance', 'third-party', '/network/thirdParty', { method: 'network' }),
  S('performance', 'console-errors', '/console', { method: 'dom', weakIf: (v) => (v?.pageErrors || 0) > 0 }),
  S('assets', 'image-formats', '/network/imageFormats', { method: 'network' }),
  S('assets', 'font-files', '/network/fonts', { method: 'network' }),
  S('implementation', 'library-evidence', '/network/libraryEvidence', { method: 'network' }),
  S('implementation', 'globals', '/metrics/implementation/globals', { method: 'dom' }),
  S('implementation', 'canvas-contexts', '/metrics/implementation/instrumentation/canvasContexts', { method: 'instrumentation' }),
  S('implementation', 'js-observers', '/metrics/implementation/instrumentation/intersectionObservers', { method: 'instrumentation' }),
  S('implementation', 'scroll-listeners', '/metrics/implementation/instrumentation/scrollListeners', { method: 'instrumentation' }),
  S('implementation', 'wheel-listeners', '/metrics/implementation/instrumentation/wheelListeners', { method: 'instrumentation' }),
  S('implementation', 'raf-calls', '/metrics/implementation/instrumentation/rafCalls', { method: 'instrumentation' }),
  S('implementation', 'media-queries-js', '/metrics/implementation/instrumentation/matchMediaQueries', { method: 'instrumentation' }),
  S('implementation', 'generator', '/metrics/implementation/generator', { method: 'dom' }),
  S('implementation', 'cssom-coverage', '/metrics/cssom/inaccessibleSheets', { method: 'cssom' }),
  S('responsive', 'breakpoints', '/metrics/cssom/breakpoints', { method: 'cssom' }),
  S('responsive', 'clamp-uses', '/metrics/cssom/clampUses', { method: 'cssom' }),
  S('responsive', 'vw-font-sizes', '/metrics/cssom/vwFontSizes', { method: 'cssom' }),
  S('responsive', 'container-queries', '/metrics/cssom/containerRules', { method: 'cssom' }),
  S('color', 'dark-scheme-css', '/metrics/cssom/colorSchemeRules', { method: 'cssom' }),
  S('content', 'text-volume', '/metrics/typography/totalChars', { method: 'dom', subset: true }),
  S('content', 'script-chars', '/metrics/typography/scriptChars', { method: 'dom' }),
  S('rtl', 'html-dir', '/metrics/rtl/htmlDir', { method: 'dom', rtlOnly: true }),
  S('rtl', 'computed-direction', '/metrics/rtl/computedDirection', { rtlOnly: true, subset: true }),
  S('rtl', 'main-direction', '/metrics/rtl/mainDirection', { rtlOnly: true }),
  S('rtl', 'text-align', '/metrics/rtl/textAlign', { rtlOnly: true }),
  S('rtl', 'mixed-runs', '/metrics/rtl/mixedRunNodes', { method: 'dom', rtlOnly: true }),
  S('rtl', 'digits', '/metrics/rtl/digits', { method: 'dom', rtlOnly: true }),
  S('rtl', 'dir-attributes', '/metrics/rtl/dirAttributes', { method: 'dom', rtlOnly: true }),
  S('rtl', 'bdi-bdo', '/metrics/rtl/bdiBdo', { method: 'dom', rtlOnly: true }),
  S('rtl', 'mirrored-icons', '/metrics/rtl/horizontallyMirroredIcons', { conf: 0.9, rtlOnly: true }),
  S('rtl', 'icons-in-controls', '/metrics/rtl/iconsInControls', { method: 'dom', conf: 0.9, rtlOnly: true }),
  S('rtl', 'logical-properties', '/metrics/cssom/logicalProps', { method: 'cssom', rtlOnly: true }),
  S('rtl', 'physical-inline-properties', '/metrics/cssom/physicalInlineProps', { method: 'cssom', rtlOnly: true }),
  S('rtl', 'arabic-subset-faces', '/metrics/fonts/arabicSubsetFaces', { method: 'dom', rtlOnly: true }),
];

const METHOD_BY_CAT: Record<string, string> = {
  typography: 'computed-style',
  hierarchy: 'dom',
  layout: 'computed-style',
  color: 'computed-style',
  components: 'computed-style',
  motion: 'computed-style',
  accessibility: 'dom',
  performance: 'performance-api',
  assets: 'network',
  implementation: 'dom',
  responsive: 'cssom',
  content: 'dom',
  rtl: 'computed-style',
};

function latestCaptures(ref: string): Array<{ page: string; capture: string; dir: string }> {
  const base = abs('datasets/raw', ref);
  if (!existsSync(base)) return [];
  const out = [];
  for (const page of readdirSync(base)) {
    const caps = readdirSync(`${base}/${page}`)
      .filter((c) => existsSync(`${base}/${page}/${c}/manifest.json`))
      .sort();
    for (let i = caps.length - 1; i >= 0; i--) {
      const m = readJson<{ blocked: boolean; files: unknown[] }>(`${base}/${page}/${caps[i]}/manifest.json`);
      if (!m.blocked && m.files.length) {
        out.push({ page, capture: caps[i], dir: `datasets/raw/${ref}/${page}/${caps[i]}` });
        break;
      }
    }
  }
  return out;
}

const empty = (v: unknown) => v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

export function normalizeRef(ref: string): Obs[] {
  const obs: Obs[] = [];
  const seen = new Set<string>();
  for (const cap of latestCaptures(ref)) {
    const manifest = readJson<{ url: string; started_at: string; capture_id: string; files: Array<{ path: string }>; tool?: { version?: string } }>(abs(cap.dir, 'manifest.json'));
    // Probe 0.1.0 counted text over <img>/<video> media as contrast against white: lower confidence.
    const legacyContrast = (manifest.tool?.version ?? '0.1.0') === '0.1.0';
    const vpFiles = manifest.files.map((f) => f.path).filter((p) => /^viewport-\d+x\d+\.json$/.test(p));
    const data = new Map<string, any>();
    for (const f of vpFiles) data.set(f.match(/(\d+x\d+)/)![1], readJson(abs(cap.dir, f)));
    const isRtl = [...data.values()].some((d) => d.metrics?.rtl?.computedDirection === 'rtl' || (d.metrics?.typography?.scriptChars?.arabic ?? 0) > 50);
    const base = (id: string, vp: string, cat: string, prop: string, value: unknown, evidence: Array<{ path: string; pointer: string }>, o: Partial<Spec> = {}, extra: Record<string, unknown> = {}) => {
      if (seen.has(id)) return;
      seen.add(id);
      const weak = o.weakIf ? (() => { try { return !!o.weakIf!(value); } catch { return false; } })() : false;
      obs.push({
        id,
        ref_id: ref,
        page: cap.page,
        source_url: manifest.url,
        capture_id: manifest.capture_id,
        captured_at: manifest.started_at,
        viewport: vp,
        category: cat,
        property: prop,
        value,
        ...(o.unit ? { unit: o.unit } : {}),
        evidence_type: 'VERIFIED',
        method: o.method ?? METHOD_BY_CAT[cat] ?? 'dom',
        evidence,
        ...(o.statement ? { statement: o.statement(value) } : {}),
        confidence: o.conf ?? 1,
        assessment: weak ? 'weakness' : 'neutral',
        ...(o.tags ? { tags: o.tags } : {}),
        ...extra,
      });
    };
    // Per-viewport observations.
    for (const [vp, d] of data) {
      const short = VP_SHORT[vp] ?? vp;
      const file = `${cap.dir}/viewport-${vp}.json`;
      for (const spec of PER_VP) {
        if (!FULL_VPS.has(vp) && !spec.subset) continue;
        if (spec.rtlOnly && !isRtl) continue;
        const r = resolvePointer(d, spec.ptr);
        if (!r.found || empty(r.value)) continue;
        const adj = legacyContrast && /^low-contrast/.test(spec.slug) ? { ...spec, conf: 0.9, weakIf: undefined, tags: ['legacy-contrast-estimate'], statement: () => 'estimate from probe 0.1.0 — text over <img>/<video> was compared against white, so this over-counts low contrast on image-led pages; use axe color-contrast for decisions' } : spec;
        base(`${ref}.${spec.cat}.${cap.page}-${short}-${spec.slug}`, vp, spec.cat, spec.slug, r.value, [{ path: file, pointer: spec.ptr }], adj);
      }
    }
    // Cross-viewport (responsive) observations: value is a map viewport → measured value.
    const curve = (slug: string, cat: string, ptr: string, o: Partial<Spec> = {}) => {
      const value: Record<string, unknown> = {};
      const ev: Array<{ path: string; pointer: string }> = [];
      for (const [vp, d] of [...data.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        const r = resolvePointer(d, ptr);
        if (!r.found || r.value === null || r.value === undefined) continue;
        value[vp] = r.value;
        ev.push({ path: `${cap.dir}/viewport-${vp}.json`, pointer: ptr });
      }
      if (ev.length >= 2) base(`${ref}.${cat}.${cap.page}-xvp-${slug}`, 'cross-viewport', cat, slug, value, ev, { ...o, method: o.method ?? 'computed-style' });
    };
    curve('display-size-curve', 'responsive', '/metrics/displayText/size', { unit: 'px' });
    curve('display-lines-curve', 'responsive', '/metrics/displayText/lines', { conf: 0.95 });
    curve('body-size-curve', 'responsive', '/metrics/typography/dominantBodySize', { unit: 'px' });
    curve('scale-range-curve', 'responsive', '/metrics/typography/scaleRange');
    curve('container-curve', 'responsive', '/metrics/layout/widestContainer', { unit: 'px', method: 'layout-measurement', conf: 0.9 });
    curve('page-height-curve', 'responsive', '/metrics/layout/pageHeightVh', { method: 'layout-measurement' });
    curve('header-toggles-curve', 'responsive', '/metrics/components/header/expandableToggles', { method: 'dom', conf: 0.9 });
    curve('header-interactive-curve', 'responsive', '/metrics/components/header/visibleInteractive', { method: 'dom', conf: 0.9 });
    curve('header-position-curve', 'responsive', '/metrics/components/header/position');
    curve('text-volume-curve', 'responsive', '/metrics/typography/totalChars', { method: 'dom' });
    curve('overflow-curve', 'responsive', '/metrics/document/horizontalOverflowPx', { method: 'layout-measurement', unit: 'px', weakIf: (v) => Object.values(v).some((x) => (x as number) > 0) });
    // Extras (desktop): reduced motion, dark scheme, scroll-linked change, entrance frames.
    const extrasFile = manifest.files.map((f) => f.path).find((p) => p.startsWith('extras-'));
    if (extrasFile) {
      const vp = extrasFile.match(/(\d+x\d+)/)![1];
      const ex = readJson<any>(abs(cap.dir, extrasFile));
      const p = `${cap.dir}/${extrasFile}`;
      const vpData = data.get(vp);
      if (ex.scrollLinked && !ex.scrollLinked.error)
        base(`${ref}.motion.${cap.page}-${VP_SHORT[vp]}-scroll-linked-changes`, vp, 'motion', 'scroll-linked-changes', ex.scrollLinked, [{ path: p, pointer: '/scrollLinked' }], { method: 'computed-style', conf: 0.9, statement: (v) => `${v.changedAfterScroll} of ${v.sampledElements} sampled elements changed transform/opacity/clip-path within 140 ms of a 300 px wheel scroll` });
      if (ex.reducedMotion && vpData) {
        const normal = vpData.metrics?.motion?.animations?.running ?? null;
        const reduced = ex.reducedMotion.motion?.animations?.running ?? null;
        const jsQueries = Object.keys(vpData.metrics?.implementation?.instrumentation?.matchMediaQueries ?? {}).filter((q) => /reduced-motion/.test(q)).length;
        base(`${ref}.motion.${cap.page}-${VP_SHORT[vp]}-reduced-motion-response`, vp, 'motion', 'reduced-motion-response', { runningAnimationsNormal: normal, runningAnimationsReduced: reduced, cssReducedMotionRules: ex.reducedMotion.cssom?.reducedMotionRules ?? null, jsReducedMotionQueries: jsQueries, rafCallsReduced: ex.reducedMotion.instrumentation?.rafCalls ?? null, rafCallsNormal: vpData.metrics?.implementation?.instrumentation?.rafCalls ?? null }, [
          { path: `${cap.dir}/viewport-${vp}.json`, pointer: '/metrics/motion/animations/running' },
          { path: p, pointer: '/reducedMotion/motion/animations/running' },
          { path: p, pointer: '/reducedMotion/cssom/reducedMotionRules' },
          { path: `${cap.dir}/viewport-${vp}.json`, pointer: '/metrics/implementation/instrumentation/matchMediaQueries' },
        ], { method: 'web-animations-api', conf: 0.9 });
      }
      if (ex.darkScheme && vpData) {
        const supports = ex.darkScheme.bodyBackground !== undefined && JSON.stringify(ex.darkScheme) !== JSON.stringify({}) && vpData.metrics?.color?.rootBackground !== undefined;
        base(`${ref}.color.${cap.page}-${VP_SHORT[vp]}-dark-scheme-response`, vp, 'color', 'dark-scheme-response', { ...ex.darkScheme, lightRootBackground: vpData.metrics?.color?.rootBackground ?? null, evaluated: supports }, [
          { path: p, pointer: '/darkScheme' },
          { path: `${cap.dir}/viewport-${vp}.json`, pointer: '/metrics/color/rootBackground' },
        ], { method: 'computed-style', conf: 0.9 });
      }
      if (Array.isArray(ex.entranceFrames))
        base(`${ref}.motion.${cap.page}-${VP_SHORT[vp]}-entrance-frames-captured`, vp, 'motion', 'entrance-frames-captured', ex.entranceFrames, [{ path: p, pointer: '/entranceFrames' }], { method: 'dom' });
    }
    // Lighthouse summary (optional).
    const lh = manifest.files.map((f) => f.path).find((p) => p.startsWith('lighthouse-'));
    if (lh) {
      const lhd = readJson<any>(abs(cap.dir, lh));
      base(`${ref}.performance.${cap.page}-xvp-lighthouse-${lh.replace(/^lighthouse-|\.json$/g, '')}`, 'cross-viewport', 'performance', 'lighthouse', lhd.summary ?? lhd, [{ path: `${cap.dir}/${lh}`, pointer: lhd.summary ? '/summary' : '' }], { method: 'lighthouse', conf: 0.9 });
    }
  }
  return obs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const corpus = readYaml<{ references: Array<{ id: string }> }>(abs('datasets/corpus.yaml'));
  const ids = args.includes('--all') ? corpus.references.map((r) => r.id).filter((id) => existsSync(abs('datasets/raw', id))) : args;
  for (const id of ids) {
    const obs = normalizeRef(id);
    if (!obs.length) {
      console.error(`[normalize] ${id}: no usable captures`);
      continue;
    }
    writeJson(abs('datasets/observations', id, 'verified.json'), {
      ref_id: id,
      authorship: 'normalizer',
      generator: `scripts/normalize.ts@${NORMALIZER_VERSION}`,
      generated_at: new Date().toISOString(),
      notes: 'Generated deterministically from datasets/raw. Do not edit by hand (D-004).',
      observations: obs,
    });
    console.error(`[normalize] ${id}: ${obs.length} VERIFIED observations (${obs.filter((o) => o.assessment === 'weakness').length} threshold weaknesses)`);
  }
}
