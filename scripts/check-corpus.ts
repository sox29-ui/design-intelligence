// Corpus diversity / split / studio checks (report P5–P9).
// Usage: node scripts/check-corpus.ts [--fix-weights]
import { abs, readYaml } from './lib/io.ts';
import { readFileSync, writeFileSync } from 'node:fs';

type Ref = {
  id: string;
  split: string;
  discovery: { source: string; signal_status: string };
  dimensions: Record<string, unknown> & { studio: string; motion: string; density: string; direction: string; device_focus: string; scheme: string };
  selection: { scores: Record<string, number>; weighted_total: number };
};

export const WEIGHTS: Record<string, number> = {
  quality_signal: 0.25,
  archetype_coverage: 0.2,
  interaction_diversity: 0.15,
  mobile_quality: 0.15,
  a11y_perf_contrast: 0.1,
  rtl_localization: 0.1,
  implementation_diversity: 0.05,
};

export function weightedTotal(scores: Record<string, number>): number {
  return Math.round(Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * (scores[k] ?? 0), 0) * 100) / 100;
}

const REQUIRED = {
  industry: ['saas', 'fintech', 'ecommerce', 'luxury', 'editorial', 'media', 'agency', 'portfolio', 'culture', 'enterprise', 'public-sector'],
  archetypes: ['minimal', 'editorial', 'swiss-grid', 'cinematic', 'maximalist', 'brutalist', 'illustrative', 'utilitarian'],
  objectives: ['conversion', 'storytelling', 'task-completion', 'information-consumption', 'data-interaction'],
  density: ['low', 'medium', 'high'],
  motion: ['low', 'medium', 'high'],
  device_focus: ['mobile-first', 'desktop-immersive'],
};

export function checkCorpus(refs: Ref[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dist = (key: string, list = refs) => {
    const m = new Map<string, number>();
    for (const r of list) {
      const v = r.dimensions[key];
      for (const x of Array.isArray(v) ? v : [v]) m.set(String(x), (m.get(String(x)) ?? 0) + 1);
    }
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };
  const report: Record<string, unknown> = {};
  for (const key of ['industry', 'archetypes', 'motion', 'objectives', 'density', 'device_focus', 'direction', 'scheme', 'languages']) report[key] = dist(key);
  report.source = Object.fromEntries(
    [...refs.reduce((m, r) => m.set(r.discovery.source, (m.get(r.discovery.source) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]),
  );
  for (const [key, values] of Object.entries(REQUIRED)) {
    const d = report[key] as Record<string, number>;
    for (const v of values) if (!d[v]) errors.push(`coverage: no reference with ${key}=${v}`);
  }
  const splits = { extraction: 12, validation: 3, holdout: 3 } as Record<string, number>;
  for (const [s, n] of Object.entries(splits)) {
    const list = refs.filter((r) => r.split === s);
    if (list.length !== n) errors.push(`split ${s}: ${list.length} refs (expected ${n})`);
    if (!list.some((r) => r.dimensions.direction !== 'ltr')) errors.push(`split ${s}: needs an Arabic/RTL reference`);
    if (!list.some((r) => r.dimensions.motion === 'high')) errors.push(`split ${s}: needs a high-motion reference`);
    if (!list.some((r) => r.dimensions.motion === 'low')) errors.push(`split ${s}: needs a low-motion reference`);
  }
  const motion = report.motion as Record<string, number>;
  for (const level of ['low', 'medium', 'high']) if ((motion[level] ?? 0) !== 6) warnings.push(`motion ${level}=${motion[level] ?? 0} (report target 6/6/6)`);
  const studios = new Map<string, number>();
  for (const r of refs) studios.set(r.dimensions.studio.toLowerCase(), (studios.get(r.dimensions.studio.toLowerCase()) ?? 0) + 1);
  for (const [s, n] of studios) if (n > 2) errors.push(`studio ${s} used ${n}× (max 2)`);
  const awwwards = refs.filter((r) => r.discovery.source === 'awwwards').length;
  if (awwwards > refs.length / 2) warnings.push(`awwwards dominates (${awwwards}/${refs.length})`);
  for (const r of refs) {
    const wt = weightedTotal(r.selection.scores);
    if (Math.abs(wt - r.selection.weighted_total) > 0.005) errors.push(`${r.id}: weighted_total ${r.selection.weighted_total} != ${wt}`);
  }
  report.unverified_signals = refs.filter((r) => r.discovery.signal_status !== 'VERIFIED').map((r) => r.id);
  return { errors, warnings, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = abs('datasets/corpus.yaml');
  if (process.argv.includes('--fix-weights')) {
    // Rewrite weighted_total values in place (text-level edit keeps comments/formatting).
    const corpus = readYaml<{ references: Ref[] }>(path);
    let text = readFileSync(path, 'utf8');
    for (const r of corpus.references) {
      const block = text.indexOf(`id: ${r.id}`);
      const at = text.indexOf('weighted_total:', block);
      const end = text.indexOf('\n', at);
      text = text.slice(0, at) + `weighted_total: ${weightedTotal(r.selection.scores).toFixed(2)}` + text.slice(end);
    }
    writeFileSync(path, text);
  }
  const corpus = readYaml<{ references: Ref[] }>(path);
  const { errors, warnings, report } = checkCorpus(corpus.references);
  console.log(JSON.stringify(report, null, 2));
  for (const w of warnings) console.log(`WARN ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`corpus: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
