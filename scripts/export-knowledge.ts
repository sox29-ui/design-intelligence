// Export DI's knowledge as one self-contained JSON document (schemas/knowledge-export.schema.json),
// for systems that consume DI without reading this repository's layout (e.g. a framework knowledge store).
//   node scripts/export-knowledge.ts [--out handoff/di-knowledge-v<version>.json] [--with-observations] [--commit <sha>]
// Deterministic for a given commit: no timestamps, sorted keys and lists.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { abs, readJson, readYaml, rel } from './lib/io.ts';
import { COMPILED_STATUSES, loadObservations, loadRules } from './validate.ts';
import { skillVersion } from './package-skill.ts';

const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);

export function buildExport(opts: { commit?: string; withObservations?: boolean } = {}) {
  const principle = readJson<any>(abs('schemas', 'principle.schema.json'));
  const observation = readJson<any>(abs('schemas', 'observation.schema.json'));
  const skillText = readFileSync(abs('.claude', 'skills', 'design-intelligence', 'SKILL.md'), 'utf8');
  const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(skillText)![1]) as any;
  const corpus = readYaml<any>(abs('datasets', 'corpus.yaml'));
  const sources = readYaml<any>(abs('provenance', 'sources.yaml'));
  const rules = loadRules().map(({ rule }) => rule as any).sort((a, b) => a.id.localeCompare(b.id));
  const candidates = existsSync(abs('datasets', 'candidates'))
    ? readdirSync(abs('datasets', 'candidates')).filter((f) => f.endsWith('.yaml')).sort().map((f) => readYaml<any>(abs('datasets', 'candidates', f)))
    : [];
  const holdout = existsSync(abs('datasets', 'holdout', 'results.json')) ? readJson<any>(abs('datasets', 'holdout', 'results.json')) : null;
  const unsealed = existsSync(abs('datasets', 'holdout', 'UNSEALED.yaml')) ? readYaml<any>(abs('datasets', 'holdout', 'UNSEALED.yaml')) : null;
  const bench = existsSync(abs('evals', 'results', 'cycle-01', 'summary.json')) ? readJson<any>(abs('evals', 'results', 'cycle-01', 'summary.json')) : null;
  const commit = opts.commit ?? spawnSync('git', ['rev-parse', 'HEAD'], { cwd: abs(), encoding: 'utf8' }).stdout.trim();
  const ctx: Record<string, Set<string>> = {
    page_goal: new Set(['conversion', 'storytelling', 'brand-expression', 'task-completion', 'information-consumption', 'data-interaction']),
    content_density: new Set(['low', 'medium', 'high']),
    language: new Set(['latin', 'ar', 'bilingual']),
    device: new Set(['mobile-first', 'desktop-immersive', 'responsive-general', 'dashboard']),
    motion_budget: new Set(['none', 'subtle', 'expressive']),
    engineering_budget: new Set(['static', 'light-js', 'heavy-webgl']),
  };
  const doc: any = {
    format: 'di-knowledge',
    format_version: 1,
    di_version: skillVersion(),
    source_commit: commit,
    skill: { name: fm.name, version: String(fm.metadata?.version), description: String(fm.description).trim(), entrypoint: '.claude/skills/design-intelligence/SKILL.md' },
    vocabulary: {
      context: Object.fromEntries(Object.entries(ctx).map(([k, v]) => [k, [...v]])),
      kinds: principle.properties.kind.enum,
      statuses: principle.properties.status.enum,
      compiled_statuses: [...COMPILED_STATUSES],
      confidence: principle.properties.confidence.enum,
      domains: principle.properties.domain.enum,
      depends_on: principle.properties.depends_on.items.enum,
      evidence_classes: observation.properties.type?.enum ?? ['VERIFIED', 'OBSERVED', 'INFERRED', 'UNVERIFIED'],
    },
    rules: rules.map((r) => ({ ...r, compiled: COMPILED_STATUSES.has(r.status) && r.kind !== 'hypothesis' })),
    references: corpus.references.map((r: any) => ({
      id: r.id, name: r.name, url: r.url, split: r.split, pages: r.pages, dimensions: r.dimensions,
      ...(r.capture_status ? { capture_status: r.capture_status } : {}), ...(r.replaces ? { replaces: r.replaces } : {}),
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    sources: (sources.sources ?? sources).slice().sort((a: any, b: any) => a.id.localeCompare(b.id)),
    candidates,
    evaluation: {
      freeze_commit: unsealed?.freeze_commit ?? null,
      validation: Object.fromEntries(rules.filter((r) => (r.evidence.validation ?? []).length).map((r) => [r.id, r.evidence.validation.map((v: any) => ({ ref: v.ref, result: v.result }))])),
      holdout: holdout ? { overall: holdout.overall, byConfidence: holdout.byConfidence, byRef: holdout.byRef, note: holdout.note } : null,
      benchmark_cycle_01: bench ? { byCondition: bench.byCondition, byBrief: bench.byBrief, diversity: bench.diversity } : null,
    },
  };
  if (opts.withObservations) {
    doc.observations = [...loadObservations().values()].map(({ file, ...o }: any) => o).sort((a: any, b: any) => a.id.localeCompare(b.id));
  }
  return sortKeys(doc);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const doc = buildExport({ commit: get('--commit'), withObservations: args.includes('--with-observations') });
  const out = get('--out') ? resolve(get('--out')!) : abs('handoff', `di-knowledge-v${doc.di_version}${args.includes('--with-observations') ? '.full' : ''}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`exported ${doc.rules.length} rules, ${doc.references.length} references, ${doc.candidates.length} candidates${doc.observations ? `, ${doc.observations.length} observations` : ''} → ${rel(out)}`);
}
