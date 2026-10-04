// Validation of compiled rules against the validation split (D-006): for each validation page, decide per
// rule whether the rule's WHEN context applies and, where a mechanical check exists, whether the measured
// behaviour of this unseen site is consistent with the rule.
//
//   node scripts/validation-check.ts val-001 [val-002 …]            → datasets/validation/<val>.checks.json
//   node scripts/validation-check.ts val-001 … --apply               → also write auto results into rule evidence.validation
//   node scripts/validation-check.ts hol-001 … --predict             → datasets/holdout/predictions.json (before capture)
//   node scripts/validation-check.ts hol-001 …                       → datasets/holdout/<hol>.checks.json (never applied)
//
// Only VERIFIED measurements are used here. Rules without a mechanical check are left to analyst review
// (entries whose note starts with "analyst:"); --apply never touches those.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import { abs, readJson, readYaml, today, writeJson } from './lib/io.ts';
import { loadRules } from './validate.ts';

type Value = any;
type Check = { result: 'consistent' | 'inconsistent' | 'inconclusive'; obs: string[]; note: string };
type Ctx = { page_goal: string[]; content_density: string[]; language: string[]; device: string[]; motion_budget: string[]; engineering_budget: string[] };

interface Page { ref: string; page: string; ctx: Ctx; archetypes: string[]; get: (cat: string, vp: string, slug: string) => { id: string; value: Value } | null }

function loadPage(ref: string, pageId: string, corpusRef: any): Page {
  const file = abs('datasets', 'observations', ref, 'verified.json');
  const doc = readJson<any>(file);
  const arr: any[] = Array.isArray(doc) ? doc : doc.observations;
  const byId = new Map(arr.map((o) => [o.id, o]));
  const page = corpusRef.pages.find((p: any) => p.id === pageId);
  const d = corpusRef.dimensions;
  const lang = String(page?.locale ?? (d.languages ?? ['en'])[0]);
  const webgl = arr.some((o) => o.id.startsWith(`${ref}.implementation.${pageId}-1440-canvas-contexts`) && JSON.stringify(o.value).includes('webgl'));
  return {
    ref,
    page: pageId,
    archetypes: d.archetypes ?? [],
    ctx: {
      page_goal: d.objectives ?? [],
      content_density: [d.density],
      language: [/^ar/i.test(lang) ? 'ar' : 'latin'],
      device: [d.device_focus],
      motion_budget: [d.motion === 'high' ? 'expressive' : 'subtle'],
      engineering_budget: [webgl ? 'heavy-webgl' : 'light-js'],
    },
    get: (cat, vp, slug) => {
      const id = `${ref}.${cat}.${pageId}-${vp}-${slug}`;
      const o = byId.get(id);
      return o ? { id, value: o.value } : null;
    },
  };
}

function applies(when: Record<string, string[]>, ctx: Ctx): boolean {
  return Object.entries(when ?? {}).every(([k, vals]) => {
    if (!Array.isArray(vals) || vals.includes('any')) return true;
    const have = (ctx as any)[k] as string[] | undefined;
    if (!have) return true; // context key we cannot observe: do not exclude
    return vals.some((v) => have.includes(v));
  });
}

const C = (result: Check['result'], obs: Array<{ id: string } | null>, note: string): Check => ({ result, obs: obs.filter(Boolean).map((o) => o!.id), note });

/** Mechanical checks. Each returns null when the needed measurements are missing. */
const CHECKS: Record<string, (p: Page) => Check | null> = {
  'typography.display-steps-then-caps': (p) => {
    const c = p.get('responsive', 'xvp', 'display-size-curve');
    if (!c) return null;
    const v = c.value;
    const r = v['390x844'] / v['1440x900'];
    const w = v['1920x1080'] / v['1440x900'];
    if (!(r > 0) || !(w > 0)) return null;
    const scale = p.get('typography', '1440', 'scale-range');
    if (scale && scale.value > 15) return C('inconclusive', [c, scale], `type-as-image scale (${scale.value}×) falls under AVOID WHEN`);
    const ok = r >= 0.5 && r <= 0.85 && w <= 1.15;
    return C(ok ? 'consistent' : 'inconsistent', [c], `390/1440 = ${r.toFixed(2)}, 1920/1440 = ${w.toFixed(2)} (rule: ≈0.6–0.75 and ≈1.0)`);
  },
  'typography.modest-scale-for-dense-pages': (p) => {
    const s = p.get('typography', '1440', 'scale-range');
    if (!s) return null;
    return C(s.value <= 4 ? 'consistent' : 'inconsistent', [s], `scale range ${s.value}× at 1440 (rule: ≈2–3.5×)`);
  },
  'typography.extreme-scale-needs-a-reason': (p) => {
    const s = p.get('typography', '1440', 'scale-range');
    if (!s) return null;
    return s.value >= 6 ? C('consistent', [s], `extreme scale ${s.value}× used in a low-density brand/story context`) : C('inconclusive', [s], `rule permits but does not require extreme scale; measured ${s.value}×`);
  },
  'typography.reading-text-16-to-20': (p) => {
    const c = p.get('responsive', 'xvp', 'body-size-curve');
    if (!c) return null;
    const vals = Object.values(c.value as Record<string, number>).filter((x) => typeof x === 'number');
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const ok = min >= 16 && max <= 20 && max - min <= 1;
    return C(ok ? 'consistent' : 'inconsistent', [c], `dominant body size ${min === max ? min : `${min}–${max}`} px across viewports (rule: 16–20 px, constant)`);
  },
  'typography.families-with-roles': (p) => {
    const f = p.get('typography', '1440', 'family-share');
    if (!f) return null;
    const groups = new Map<string, number>();
    for (const [name, share] of Object.entries(f.value as Record<string, number>)) {
      if (share < 0.02) continue;
      const g = name.toLowerCase().replace(/["']/g, '').split(/[\s_-]+/)[0];
      groups.set(g, (groups.get(g) ?? 0) + share);
    }
    // Rule text: one or two families, a third only for a functional role (monospace) or a single accent.
    const mono = [...groups.keys()].filter((g) => /mono|code|courier/.test(g)).length;
    const accents = [...groups.values()].filter((v) => v < 0.06).length;
    const core = groups.size - mono;
    const ok = core <= 2 || (core === 3 && accents >= 1);
    return C(ok ? 'consistent' : 'inconsistent', [f], `${groups.size} rendered family group(s) ≥ 2% (${[...groups.entries()].map(([g, v]) => `${g} ${Math.round(v * 100)}%`).join(', ')})`);
  },
  'typography.tighten-large-grotesk': (p) => {
    const t = p.get('typography', '1440', 'display-tracking');
    const s = p.get('typography', '1440', 'display-size');
    if (!t || !s || s.value < 40) return null;
    return t.value < 0 ? C('consistent', [t, s], `display ${s.value}px tracked ${t.value}em`) : C('inconclusive', [t, s], `display ${s.value}px at ${t.value}em; face classification (grotesk vs serif) not automated`);
  },
  'typography.reading-measure': (p) => {
    const m = p.get('typography', '1440', 'reading-chars-per-line');
    const v = typeof m?.value === 'number' ? m.value : m?.value?.median;
    if (!m || typeof v !== 'number') return null;
    return C(v >= 45 && v <= 85 ? 'consistent' : v > 90 || v < 35 ? 'inconsistent' : 'inconclusive', [m], `median reading measure ${Math.round(v)} characters per line at 1440 (rule: ≈45–80)`);
  },
  'layout.cap-content-width': (p) => {
    const c = p.get('responsive', 'xvp', 'container-curve');
    if (!c) return null;
    const a = c.value['1440x900'];
    const b = c.value['1920x1080'];
    if (!(a > 0 && b > 0)) return null;
    const capped = b / a <= 1.05;
    if (p.archetypes.some((x) => /immersive|cinematic|gallery/.test(x))) {
      // AVOID WHEN cases cannot confirm or refute the rule's main claim.
      return C('inconclusive', [c], `AVOID WHEN case (immersive/image-led page): container ${a} → ${b} px from 1440 to 1920`);
    }
    return C(capped ? 'consistent' : 'inconsistent', [c], `dominant container ${a} → ${b} px from 1440 to 1920`);
  },
  'motion.honour-reduced-motion': (p) => {
    const r = p.get('motion', '1440', 'reduced-motion-response');
    if (!r) return null;
    const v = r.value;
    const reduces = (v.runningAnimationsNormal > 0 && v.runningAnimationsReduced < v.runningAnimationsNormal) || v.cssReducedMotionRules > 0 || v.jsReducedMotionQueries > 0 || (v.rafCallsNormal > 20 && v.rafCallsReduced < 0.5 * v.rafCallsNormal);
    const anything = v.runningAnimationsNormal > 0 || v.rafCallsNormal > 20;
    if (reduces) return C('consistent', [r], `reduced-motion handling detected (${JSON.stringify(v)})`);
    return anything ? C('inconsistent', [r], `motion runs unchanged under prefers-reduced-motion (${JSON.stringify(v)})`) : C('inconclusive', [r], 'no running animation to reduce');
  },
  'motion.duration-by-purpose': (p) => {
    const d = p.get('motion', '1440', 'transition-duration');
    if (!d || !d.value?.n) return null;
    const story = p.ctx.page_goal.some((g) => g === 'storytelling' || g === 'brand-expression') && p.ctx.content_density.includes('low');
    const med = d.value.median;
    if (story) return C(med >= 150 ? 'consistent' : 'inconclusive', [d], `median transition ${med} ms on a story/brand page`);
    return C(med >= 100 && med <= 400 ? 'consistent' : 'inconsistent', [d], `median transition ${med} ms on a task/information/commerce page (rule: ≈200–300 ms)`);
  },
  'motion.scroll-narrative-for-stories-only': (p) => {
    const s = p.get('motion', '1440', 'scroll-linked-changes');
    if (!s) return null;
    return C(s.value.changedAfterScroll > 0 ? 'consistent' : 'inconclusive', [s], `${s.value.changedAfterScroll} of ${s.value.sampledElements} sampled elements change with scroll`);
  },
  'performance.weight-follows-goal': (p) => {
    const b = p.get('performance', '390', 'transfer-bytes');
    if (!b) return null;
    const mb = b.value / 1e6;
    return C(mb <= 4 ? 'consistent' : mb > 8 ? 'inconsistent' : 'inconclusive', [b], `${mb.toFixed(1)} MB transferred on mobile for a task/information/commerce goal (rule: keep it light)`);
  },
  'accessibility.visible-focus': (p) => {
    const f = p.get('accessibility', '1440', 'focus-indicator-share');
    if (!f || typeof f.value !== 'number') return null;
    return C(f.value >= 0.95 ? 'consistent' : f.value < 0.8 ? 'inconsistent' : 'inconclusive', [f], `visible indicator on ${Math.round(f.value * 100)}% of sampled tab stops`);
  },
  'accessibility.semantic-skeleton': (p) => {
    const h = p.get('hierarchy', '1440', 'h1-count');
    const l = p.get('accessibility', '1440', 'landmarks');
    if (!h || !l) return null;
    const ok = h.value === 1 && l.value.main === 1 && (l.value.header ?? 0) >= 1 && (l.value.nav ?? 0) >= 1;
    return C(ok ? 'consistent' : 'inconsistent', [h, l], `h1 × ${h.value}; landmarks ${JSON.stringify(l.value)}`);
  },
  'color.text-contrast-floor': (p) => {
    const a = p.get('accessibility', '1440', 'axe-violations');
    const m = p.get('accessibility', '390', 'axe-violations');
    if (!a) return null;
    const nodes = (x: any) => ((x?.value ?? []) as any[]).filter((v) => v.id === 'color-contrast').reduce((s, v) => s + (v.nodes ?? 0), 0);
    const n = nodes(a) + nodes(m);
    return C(n === 0 ? 'consistent' : 'inconsistent', [a, m], `axe color-contrast nodes: ${nodes(a)} at 1440, ${nodes(m)} at 390`);
  },
  'rtl.root-direction': (p) => {
    const d = p.get('rtl', '1440', 'html-dir');
    if (!d) return null;
    return C(d.value === 'rtl' ? 'consistent' : 'inconsistent', [d], `html dir = ${JSON.stringify(d.value)}`);
  },
  'rtl.numerals-one-system': (p) => {
    const d = p.get('rtl', '1440', 'digits');
    if (!d || d.value.western + d.value.arabicIndic === 0) return null;
    const mixed = d.value.western > 0 && d.value.arabicIndic > 0;
    return C(mixed ? 'inconsistent' : 'consistent', [d], `digits: ${d.value.western} Western, ${d.value.arabicIndic} Arabic-Indic`);
  },
  'rtl.no-tracking-no-case-arabic': (p) => {
    const t = p.get('typography', '1440', 'display-tracking');
    const s = p.get('typography', '1440', 'display-script');
    if (!t || !s || !/arabic/.test(String(s.value))) return null;
    return C(t.value === 0 ? 'consistent' : 'inconsistent', [t, s], `Arabic display tracking ${t.value}em`);
  },
  'rtl.logical-properties': (p) => {
    const l = p.get('rtl', '1440', 'logical-properties');
    const ph = p.get('rtl', '1440', 'physical-inline-properties');
    if (!l || !ph || l.value + ph.value === 0) return null; // stylesheets not readable (cross-origin): no measurement
    const share = l.value / Math.max(1, l.value + ph.value);
    return C(share >= 0.5 ? 'consistent' : share < 0.2 ? 'inconsistent' : 'inconclusive', [l, ph], `${l.value} logical vs ${ph.value} physical inline declarations (readable CSS)`);
  },
  'rtl.arabic-needs-more-leading': (p) => {
    const r = p.get('typography', '1440', 'reading-line-height');
    const d = p.get('typography', '1440', 'display-line-height');
    const s = p.get('typography', '1440', 'display-script');
    const body = typeof r?.value === 'number' ? r.value : null;
    const disp = s && /arabic/.test(String(s.value)) && typeof d?.value === 'number' ? d.value : null;
    if (body === null && disp === null) return null;
    const ok = (body === null || body >= 1.55) && (disp === null || disp >= 1.2);
    const bad = (body !== null && body < 1.45) || (disp !== null && disp < 1.1);
    return C(ok ? 'consistent' : bad ? 'inconsistent' : 'inconclusive', [r, disp !== null ? d : null], `Arabic line-height: reading ${body ?? 'n/a'}, display ${disp ?? 'n/a'} (rule: body ≈1.6–1.8, display ≈1.25–1.35)`);
  },
  'rtl.isolate-mixed-runs': (p) => {
    const m = p.get('rtl', '1440', 'mixed-runs');
    const d = p.get('rtl', '1440', 'dir-attributes');
    const b = p.get('rtl', '1440', 'bdi-bdo');
    if (!m || !d) return null;
    if (!(m.value > 0)) return C('inconclusive', [m], 'no mixed-direction runs detected');
    const isolated = (d.value.ltr ?? 0) + (d.value.auto ?? 0) + (b?.value ?? 0);
    return C(isolated > 0 ? 'consistent' : 'inconsistent', [m, d, b], `${m.value} mixed runs; ${isolated} isolating elements (dir=ltr/auto, bdi/bdo)`);
  },
  'components.mobile-menu-sheet': (p) => {
    const m = p.get('components', '390', 'menu');
    if (!m || !m.value?.found) return null;
    const v = m.value;
    const aria = v.ariaExpandedAfter === 'true' || v.dialogs > 0;
    return C(aria && v.escapeCloses ? 'consistent' : 'inconsistent', [m], `menu: aria-expanded ${v.ariaExpandedBefore}→${v.ariaExpandedAfter}, dialogs ${v.dialogs}, Escape closes: ${v.escapeCloses}`);
  },
  'antipattern.glass-floating-nav': (p) => {
    const h = p.get('components', '1440', 'header');
    const e = p.get('components', '1440', 'effects');
    if (!h || !e) return null;
    const glass = !!h.value.backdropFilter && ['fixed', 'sticky'].includes(h.value.position);
    return glass ? C('inconclusive', [h, e], 'blurred floating header present — justification needs analyst review') : C('consistent', [h, e], `header ${h.value.position}, backdrop ${h.value.backdropFilter ?? 'none'}: the generic pattern is absent`);
  },
  'antipattern.gradient-hero-imitation': (p) => {
    const g = p.get('color', '1440', 'gradient-area');
    if (!g) return null;
    return g.value < 0.15 ? C('consistent', [g], `gradient area ${g.value} of the page: no gradient-led hero`) : C('inconclusive', [g], `gradient area ${g.value}: analyst must judge whether it is identity or imitation`);
  },
  'antipattern.rounded-card-grid-default': (p) => {
    const c = p.get('components', '1440', 'card-groups');
    if (!c) return null;
    const rounded = (c.value.items ?? []).filter((g: any) => (g.radius ?? 0) >= 16 && (g.shadow || g.border || g.filled)).length;
    return rounded >= 2 ? C('inconclusive', [c], `${rounded} large-radius card groups — analyst must judge whether identity justifies them`) : C('consistent', [c], `${rounded} large-radius card groups`);
  },
  'antipattern.late-injected-banners': (p) => {
    const a = p.get('performance', '390', 'cls-before-interaction');
    const b = p.get('performance', '1440', 'cls-before-interaction');
    if (!a && !b) return null;
    const max = Math.max(a?.value ?? 0, b?.value ?? 0);
    // The cause (a late banner) cannot be confirmed mechanically; an analyst entry may upgrade this.
    return C('inconclusive', [a, b], max > 0.1 ? `layout shift before interaction ${max.toFixed(3)}; cause not verified` : `no significant early layout shift (max ${max.toFixed(3)})`);
  },
};

/** Checks of a rule's AVOID WHEN side, run when the rule's WHEN does not apply but the page is in an avoid context. */
const inAvoidContext = (p: Page) => p.ctx.content_density.includes('high') || p.ctx.page_goal.some((g) => g === 'task-completion' || g === 'data-interaction');
const AVOID_CHECKS: Record<string, (p: Page) => Check | null> = {
  'typography.extreme-scale-needs-a-reason': (p) => {
    if (!inAvoidContext(p)) return null;
    const s = p.get('typography', '1440', 'scale-range');
    if (!s) return null;
    return C(s.value >= 6 ? 'inconsistent' : 'consistent', [s], `avoid context (dense or task page): scale ${s.value}× at 1440`);
  },
  'motion.scroll-narrative-for-stories-only': (p) => {
    if (!inAvoidContext(p)) return null;
    const s = p.get('motion', '1440', 'scroll-linked-changes');
    if (!s) return null;
    return C(s.value.changedAfterScroll > 0 ? 'inconsistent' : 'consistent', [s], `avoid context (dense or task page): ${s.value.changedAfterScroll} of ${s.value.sampledElements} sampled elements change with scroll`);
  },
};

/** Context from corpus dimensions only (no observations) — used to pre-register holdout predictions. */
function contextOnly(cref: any, pageId: string): Partial<Ctx> {
  const page = cref.pages.find((p: any) => p.id === pageId);
  const d = cref.dimensions;
  const lang = String(page?.locale ?? (d.languages ?? ['en'])[0]);
  const ctx: Partial<Ctx> = {
    page_goal: d.objectives ?? [],
    content_density: [d.density],
    language: [/^ar/i.test(lang) ? 'ar' : 'latin'],
    device: [d.device_focus],
    motion_budget: [d.motion === 'high' ? 'expressive' : 'subtle'],
  };
  if ((d.tech_hints ?? []).some((t: string) => /webgl|three/i.test(t))) ctx.engineering_budget = ['heavy-webgl'];
  return ctx;
}

function main() {
  const args = process.argv.slice(2);
  const refs = args.filter((a) => /^(val|hol)-\d{3}$/.test(a));
  const apply = args.includes('--apply');
  const predict = args.includes('--predict');
  if (!refs.length) {
    console.error('usage: node scripts/validation-check.ts val-001 [val-002 …] [--apply] | hol-001 … [--predict]');
    process.exit(2);
  }
  const corpus = readYaml<any>(abs('datasets', 'corpus.yaml'));
  const rules = loadRules().filter(({ rule }) => ['provisional', 'accepted', 'weakened', 'candidate'].includes(rule.status) && rule.kind !== 'signature');
  const holdout = refs.every((r) => r.startsWith('hol-'));
  if (!holdout && refs.some((r) => r.startsWith('hol-'))) throw new Error('do not mix validation and holdout references in one run');
  if (holdout) {
    if (!existsSync(abs('datasets', 'holdout', 'UNSEALED.yaml'))) throw new Error('holdout is sealed (datasets/holdout/UNSEALED.yaml missing)');
    if (apply) throw new Error('holdout results are never applied to rules');
  }
  if (predict) {
    if (!holdout) throw new Error('--predict is for holdout references');
    const out: any[] = [];
    for (const ref of refs) {
      const cref = corpus.references.find((r: any) => r.id === ref);
      for (const pg of cref.pages) {
        const ctx = contextOnly(cref, pg.id);
        for (const { rule } of rules) {
          if (rule.status === 'candidate' || rule.id === 'antipattern.late-injected-banners') continue; // that check can never confirm (cause unverifiable)
          const ok = applies((rule as any).when, ctx as Ctx);
          const avoidCtx = (ctx.content_density ?? []).includes('high') || (ctx.page_goal ?? []).some((g) => g === 'task-completion' || g === 'data-interaction');
          if (ok && CHECKS[rule.id]) out.push({ ref, page: pg.id, rule: rule.id, confidence: rule.confidence, predicted: 'consistent', basis: 'WHEN applies' });
          else if (!ok && AVOID_CHECKS[rule.id] && avoidCtx) out.push({ ref, page: pg.id, rule: rule.id, confidence: rule.confidence, predicted: 'consistent', basis: 'AVOID WHEN context' });
        }
      }
    }
    writeJson(abs('datasets', 'holdout', 'predictions.json'), { note: 'Pre-registered before any holdout capture: for each rule with a measured check whose WHEN (or AVOID WHEN context) matches the holdout page, DI predicts the measured behaviour will be consistent with the rule.', contexts: Object.fromEntries(refs.map((r) => { const c = corpus.references.find((x: any) => x.id === r); return [r, Object.fromEntries(c.pages.map((p: any) => [p.id, contextOnly(c, p.id)]))]; })), predictions: out });
    console.log(`pre-registered ${out.length} predictions for ${refs.join(', ')}`);
    return;
  }
  const perRule = new Map<string, Array<{ ref: string; result: string; observations: string[]; note: string }>>();
  for (const ref of refs) {
    const cref = corpus.references.find((r: any) => r.id === ref);
    if (!cref || cref.split !== (holdout ? 'holdout' : 'validation')) throw new Error(`${ref} is not a ${holdout ? 'holdout' : 'validation'} reference`);
    const out: any[] = [];
    for (const pg of cref.pages) {
      if (!existsSync(abs('datasets', 'observations', ref, 'verified.json'))) throw new Error(`${ref}: no verified observations (run normalize first)`);
      const page = loadPage(ref, pg.id, cref);
      for (const { rule } of rules) {
        const check = CHECKS[rule.id];
        const ok = applies((rule as any).when, page.ctx);
        if (!ok) {
          const av = AVOID_CHECKS[rule.id]?.(page) ?? null;
          if (!av) { out.push({ rule: rule.id, page: pg.id, applies: false }); continue; }
          out.push({ rule: rule.id, page: pg.id, applies: 'avoid-when', result: av.result, observations: av.obs, note: av.note });
          const list = perRule.get(rule.id) ?? [];
          list.push({ ref, result: av.result, observations: av.obs, note: `auto (${pg.id}, AVOID WHEN): ${av.note}` });
          perRule.set(rule.id, list);
          continue;
        }
        if (!check) { out.push({ rule: rule.id, page: pg.id, applies: true, result: 'needs-analyst' }); continue; }
        const r = check(page);
        if (!r) { out.push({ rule: rule.id, page: pg.id, applies: true, result: 'no-measurement' }); continue; }
        out.push({ rule: rule.id, page: pg.id, applies: true, result: r.result, observations: r.obs, note: r.note });
        const list = perRule.get(rule.id) ?? [];
        list.push({ ref, result: r.result, observations: r.obs, note: `auto (${pg.id}): ${r.note}` });
        perRule.set(rule.id, list);
      }
    }
    const dest = holdout ? abs('datasets', 'holdout', `${ref}.checks.json`) : abs('datasets', 'validation', `${ref}.checks.json`);
    writeJson(dest, { ref, generated_by: 'scripts/validation-check.ts', context: Object.fromEntries(cref.pages.map((pg: any) => [pg.id, loadPage(ref, pg.id, cref).ctx])), checks: out });
    const tally = out.reduce((m: Record<string, number>, x) => ((m[x.applies ? x.result : 'not-applicable'] = (m[x.applies ? x.result : 'not-applicable'] ?? 0) + 1), m), {});
    console.log(`${ref}: ${JSON.stringify(tally)}`);
  }
  if (!apply) return;
  for (const { file, rule } of loadRules()) {
    const fresh = perRule.get(rule.id);
    const existing = (rule.evidence.validation ?? []) as any[];
    const kept = existing.filter((v) => !(refs.includes(v.ref) && String(v.note ?? '').startsWith('auto')));
    if (!fresh && kept.length === existing.length) continue;
    const next = [...kept, ...(fresh ?? [])].sort((a, b) => a.ref.localeCompare(b.ref));
    const doc = YAML.parseDocument(readFileSync(abs(file), 'utf8'));
    doc.setIn(['evidence', 'validation'], next);
    doc.set('updated', today());
    writeFileSync(abs(file), doc.toString({ lineWidth: 0 }));
  }
  console.log(`applied automatic validation results for ${perRule.size} rule(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
