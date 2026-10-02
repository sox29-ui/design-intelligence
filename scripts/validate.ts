// DI integrity validator: schemas + provenance + leakage + skill contract.
// Usage: node scripts/validate.ts [--quiet]
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import Ajv2020Module from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import YAML from 'yaml';
import { abs, listFiles, readJson, readText, readYaml, resolvePointer, sha256File } from './lib/io.ts';

const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module }).default ?? Ajv2020Module;
const addFormats = (addFormatsModule as unknown as { default: typeof addFormatsModule }).default ?? addFormatsModule;

export type Finding = { level: 'error' | 'warn'; where: string; msg: string };

type CorpusRef = {
  id: string;
  split: 'extraction' | 'validation' | 'holdout';
  url: string;
  dimensions: { studio: string; archetypes: string[] };
};
type Corpus = { status: string; references: CorpusRef[] };
type Obs = { id: string; ref_id: string; evidence_type: string; evidence: Array<Record<string, string>> };
type ObsFile = { ref_id: string; authorship: string; observations: Obs[] };
type RefEvidence = { ref: string; observations: string[]; note?: string };
type Rule = {
  id: string;
  kind: string;
  status: string;
  confidence: 'low' | 'medium' | 'high';
  evidence_count: number;
  evidence: {
    supporting: RefEvidence[];
    counterexamples: RefEvidence[];
    validation?: Array<{ ref: string; result: string; observations: string[] }>;
    external?: Array<{ source_id: string }>;
    benchmark?: Array<{ result_id: string }>;
  };
};

export const COMPILED_STATUSES = new Set(['provisional', 'accepted', 'weakened']);

function makeAjv() {
  const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
  (addFormats as any)(ajv);
  for (const f of listFiles('schemas', (p) => p.endsWith('.schema.json'))) {
    ajv.addSchema(readJson(abs(f)), basename(f));
  }
  return ajv;
}

function schemaErrors(ajv: any, schema: string, data: unknown): string[] {
  const validate = ajv.getSchema(schema);
  if (!validate) return [`schema ${schema} not found`];
  if (validate(data)) return [];
  return (validate.errors ?? []).slice(0, 12).map((e: any) => `${e.instancePath || '/'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`);
}

export function loadCorpus(): Corpus | null {
  const p = abs('datasets/corpus.yaml');
  return existsSync(p) ? readYaml<Corpus>(p) : null;
}

export function loadRules(): Array<{ file: string; rule: Rule; raw: string }> {
  return listFiles('datasets/rules', (p) => p.endsWith('.yaml')).map((file) => {
    const raw = readText(abs(file));
    return { file, rule: YAML.parse(raw) as Rule, raw };
  });
}

export function loadObservations(): Map<string, Obs & { file: string }> {
  const map = new Map<string, Obs & { file: string }>();
  for (const file of listFiles('datasets/observations', (p) => p.endsWith('.json'))) {
    const data = readJson<ObsFile>(abs(file));
    for (const o of data.observations ?? []) map.set(o.id, { ...o, file });
  }
  return map;
}

/** Max confidence permitted by evidence structure (D-006). */
export function confidenceCeiling(rule: Rule, studios: Map<string, string>, archetypes: Map<string, string[]>): 'low' | 'medium' | 'high' {
  const supporting = rule.evidence.supporting ?? [];
  const n = new Set(supporting.map((s) => studios.get(s.ref) ?? s.ref)).size;
  const arch = new Set(supporting.flatMap((s) => (archetypes.get(s.ref) ?? []).slice(0, 1)));
  const counterResolved = (rule.evidence.counterexamples ?? []).every((c) => (c.note ?? '').length > 0);
  const val = rule.evidence.validation ?? [];
  const valOk = val.some((v) => v.result === 'consistent') && !val.some((v) => v.result === 'inconsistent');
  const external = (rule.evidence.external ?? []).length;
  const bench = (rule.evidence.benchmark ?? []).length;
  if (n >= 4 && arch.size >= 2 && counterResolved && valOk) return 'high';
  if (n >= 3) return 'medium';
  if (rule.kind === 'invariant' && external >= 1) return n >= 2 && valOk ? 'high' : 'medium';
  if (rule.kind === 'anti-pattern' && [n > 0, external > 0, bench > 0].filter(Boolean).length >= 2) return 'medium';
  return 'low';
}

export function validateAll(): Finding[] {
  const findings: Finding[] = [];
  const err = (where: string, msg: string) => findings.push({ level: 'error', where, msg });
  const warn = (where: string, msg: string) => findings.push({ level: 'warn', where, msg });
  const ajv = makeAjv();

  // ---------- corpus ----------
  const corpus = loadCorpus();
  const refs = new Map<string, CorpusRef>();
  const studios = new Map<string, string>();
  const archetypes = new Map<string, string[]>();
  if (!corpus) warn('datasets/corpus.yaml', 'missing (ok before Phase B)');
  else {
    for (const e of schemaErrors(ajv, 'corpus.schema.json', corpus)) err('datasets/corpus.yaml', e);
    const urls = new Set<string>();
    const studioCount = new Map<string, number>();
    for (const r of corpus.references ?? []) {
      if (refs.has(r.id)) err('datasets/corpus.yaml', `duplicate id ${r.id}`);
      refs.set(r.id, r);
      studios.set(r.id, r.dimensions?.studio ?? r.id);
      archetypes.set(r.id, r.dimensions?.archetypes ?? []);
      const prefix = { extraction: 'ref', validation: 'val', holdout: 'hol' }[r.split];
      if (!r.id.startsWith(prefix + '-')) err('datasets/corpus.yaml', `${r.id}: split ${r.split} requires prefix ${prefix}-`);
      if (urls.has(r.url)) err('datasets/corpus.yaml', `duplicate url ${r.url}`);
      urls.add(r.url);
      const s = (r.dimensions?.studio ?? '').toLowerCase();
      studioCount.set(s, (studioCount.get(s) ?? 0) + 1);
    }
    for (const [s, c] of studioCount) if (c > 2) err('datasets/corpus.yaml', `studio "${s}" used ${c} times (max 2, report P8)`);
    if (corpus.status === 'frozen') {
      const count = (split: string) => (corpus.references ?? []).filter((r) => r.split === split).length;
      if (count('extraction') !== 12 || count('validation') !== 3 || count('holdout') !== 3)
        err('datasets/corpus.yaml', `frozen corpus must be 12/3/3, got ${count('extraction')}/${count('validation')}/${count('holdout')}`);
    }
  }

  // ---------- capture manifests ----------
  const artifactHashes = new Map<string, Set<string>>(); // ref -> hashes
  for (const mf of listFiles('datasets/raw', (p) => p.endsWith('manifest.json'))) {
    const m = readJson<any>(abs(mf));
    for (const e of schemaErrors(ajv, 'capture-manifest.schema.json', m)) err(mf, e);
    const dir = dirname(mf);
    for (const f of m.files ?? []) {
      const p = abs(dir, f.path);
      if (!existsSync(p)) err(mf, `listed file missing: ${f.path}`);
      else if (sha256File(p) !== f.sha256) err(mf, `hash mismatch: ${f.path}`);
    }
    const set = artifactHashes.get(m.ref_id) ?? new Set<string>();
    for (const a of m.artifacts ?? []) set.add(a.sha256);
    artifactHashes.set(m.ref_id, set);
    if (refs.size && !refs.has(m.ref_id) && !String(m.ref_id).startsWith('bench-')) err(mf, `unknown ref ${m.ref_id}`);
  }

  // ---------- observations ----------
  const holdoutUnsealed = existsSync(abs('datasets/holdout/UNSEALED.yaml'));
  const sources = existsSync(abs('provenance/sources.yaml'))
    ? new Set((readYaml<{ sources: Array<{ id: string }> }>(abs('provenance/sources.yaml')).sources ?? []).map((s) => s.id))
    : new Set<string>();
  const obsIds = new Map<string, Obs & { file: string }>();
  const rawCache = new Map<string, unknown>();
  for (const file of listFiles('datasets/observations', (p) => p.endsWith('.json'))) {
    const data = readJson<ObsFile>(abs(file));
    for (const e of schemaErrors(ajv, 'observation.schema.json', data)) err(file, e);
    const dirRef = basename(dirname(file));
    if (data.ref_id !== dirRef) err(file, `ref_id ${data.ref_id} does not match directory ${dirRef}`);
    if (dirRef.startsWith('hol-') && !holdoutUnsealed) err(file, 'holdout observations exist while holdout is sealed (D-008)');
    const expected = basename(file) === 'verified.json' ? 'normalizer' : 'analyst';
    if (data.authorship !== expected) err(file, `authorship must be ${expected}`);
    for (const o of data.observations ?? []) {
      if (obsIds.has(o.id)) err(file, `duplicate observation id ${o.id}`);
      obsIds.set(o.id, { ...o, file });
      if (o.ref_id !== data.ref_id) err(file, `${o.id}: ref_id mismatch`);
      if (!o.id.startsWith(o.ref_id + '.')) err(file, `${o.id}: id must start with ref id`);
      if (data.authorship === 'normalizer' && o.evidence_type !== 'VERIFIED') err(file, `${o.id}: normalizer may only emit VERIFIED`);
    }
  }
  for (const [id, o] of obsIds) {
    for (const ev of o.evidence ?? []) {
      if ('path' in ev) {
        if (!ev.path.startsWith(`datasets/raw/${o.ref_id}/`)) err(o.file, `${id}: evidence path outside its reference raw dir`);
        const p = abs(ev.path);
        if (!existsSync(p)) {
          err(o.file, `${id}: evidence file missing ${ev.path}`);
          continue;
        }
        if (!rawCache.has(p)) rawCache.set(p, JSON.parse(readFileSync(p, 'utf8')));
        if (!resolvePointer(rawCache.get(p), ev.pointer).found) err(o.file, `${id}: pointer ${ev.pointer} not found in ${ev.path}`);
      } else if ('artifact' in ev) {
        if (!(artifactHashes.get(o.ref_id) ?? new Set()).has(ev.sha256)) err(o.file, `${id}: artifact hash not in any manifest of ${o.ref_id}`);
      } else if ('observation' in ev) {
        const base = obsIds.get(ev.observation);
        if (!base) err(o.file, `${id}: based-on observation ${ev.observation} not found`);
        else if (base.ref_id !== o.ref_id) err(o.file, `${id}: based-on observation from another reference`);
      } else if ('source_id' in ev) {
        if (!sources.has(ev.source_id)) err(o.file, `${id}: source ${ev.source_id} not in provenance/sources.yaml`);
      }
    }
  }

  // ---------- rules ----------
  const ruleIds = new Set<string>();
  for (const { file, rule, raw } of loadRules()) {
    for (const e of schemaErrors(ajv, 'principle.schema.json', rule)) err(file, e);
    if (!rule?.id) continue;
    if (ruleIds.has(rule.id)) err(file, `duplicate rule id ${rule.id}`);
    ruleIds.add(rule.id);
    if (basename(file) !== `${rule.id}.yaml`) err(file, `file name must be ${rule.id}.yaml`);
    if (/\bhol-[0-9]{3}\b/.test(raw)) err(file, 'rule cites a holdout reference (leakage, D-008)');
    const ev = rule.evidence ?? { supporting: [], counterexamples: [] };
    for (const s of ev.supporting ?? []) {
      if (!s.ref.startsWith('ref-')) err(file, `supporting evidence must come from extraction refs, got ${s.ref}`);
    }
    const checkObs = (group: string, list: RefEvidence[] | undefined) => {
      for (const s of list ?? []) {
        if (refs.size && !refs.has(s.ref)) err(file, `${group}: unknown ref ${s.ref}`);
        for (const oid of s.observations ?? []) {
          const o = obsIds.get(oid);
          if (!o) err(file, `${group}: observation ${oid} not found`);
          else if (o.ref_id !== s.ref) err(file, `${group}: observation ${oid} belongs to ${o.ref_id}, not ${s.ref}`);
        }
      }
    };
    checkObs('supporting', ev.supporting);
    checkObs('counterexamples', ev.counterexamples);
    checkObs('validation', ev.validation as RefEvidence[] | undefined);
    for (const x of ev.external ?? []) if (!sources.has(x.source_id)) err(file, `external source ${x.source_id} not in provenance/sources.yaml`);
    const n = new Set((ev.supporting ?? []).map((s) => studios.get(s.ref) ?? s.ref)).size;
    if (rule.evidence_count !== n) err(file, `evidence_count ${rule.evidence_count} != independent supporting refs ${n}`);
    const rank = { low: 0, medium: 1, high: 2 };
    const ceiling = confidenceCeiling(rule, studios, archetypes);
    if (rank[rule.confidence] > rank[ceiling]) err(file, `confidence ${rule.confidence} exceeds evidence ceiling ${ceiling} (D-006)`);
    const external = (ev.external ?? []).length;
    const bench = (ev.benchmark ?? []).length;
    if (rule.kind === 'principle' && n < 2) err(file, 'principle needs ≥ 2 independent supporting references (else signature/hypothesis)');
    if (rule.kind === 'invariant' && external < 1 && n < 2) err(file, 'invariant needs an external standard or ≥ 2 references');
    if (rule.kind === 'signature' && n !== 1) err(file, 'signature must cite exactly one studio');
    if (rule.kind === 'anti-pattern' && n + external + bench + (ev.counterexamples ?? []).length === 0) err(file, 'anti-pattern needs evidence');
    if (rule.kind === 'hypothesis' && COMPILED_STATUSES.has(rule.status)) warn(file, 'hypothesis compiled into skill: must be presented as unverified');
  }

  // ---------- candidates ----------
  for (const file of listFiles('datasets/candidates', (p) => p.endsWith('.yaml'))) {
    for (const e of schemaErrors(ajv, 'candidate-change.schema.json', readYaml(abs(file)))) err(file, e);
  }

  // ---------- eval results ----------
  for (const file of listFiles('evals/results', (p) => /result-[^/]+\.json$/.test(p))) {
    for (const e of schemaErrors(ajv, 'eval-result.schema.json', readJson(abs(file)))) err(file, e);
  }

  // ---------- skill contract ----------
  const skillDir = '.claude/skills/design-intelligence';
  const skillPath = abs(skillDir, 'SKILL.md');
  if (existsSync(skillPath)) {
    const text = readText(skillPath);
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) err(`${skillDir}/SKILL.md`, 'missing YAML frontmatter');
    else {
      const fm = YAML.parse(m[1]) ?? {};
      if (fm.name !== 'design-intelligence') err(`${skillDir}/SKILL.md`, 'frontmatter name must be design-intelligence');
      const listing = `${fm.description ?? ''}${fm.when_to_use ?? ''}`;
      if (!fm.description) err(`${skillDir}/SKILL.md`, 'description required');
      if (listing.length > 1536) err(`${skillDir}/SKILL.md`, `description+when_to_use is ${listing.length} chars (> 1536 listing cap)`);
    }
    const lines = text.split('\n').length;
    if (lines >= 500) err(`${skillDir}/SKILL.md`, `${lines} lines (keep < 500)`);
    for (const ref of text.matchAll(/`((?:references|workflows|scripts)\/[A-Za-z0-9_./-]+)`/g)) {
      if (!existsSync(abs(skillDir, ref[1]))) err(`${skillDir}/SKILL.md`, `references missing file ${ref[1]}`);
    }
    // Every rule id cited in references must exist and be compiled; every compiled rule must be cited.
    const compiled = new Set(loadRules().filter((r) => COMPILED_STATUSES.has(r.rule.status)).map((r) => r.rule.id));
    const cited = new Set<string>();
    for (const f of listFiles(`${skillDir}/references`, (p) => p.endsWith('.md'))) {
      for (const mm of readText(abs(f)).matchAll(/<!-- rule:([a-z0-9.-]+) -->/g)) {
        cited.add(mm[1]);
        if (!compiled.has(mm[1])) err(f, `cites rule ${mm[1]} that is missing or not in a compiled status`);
      }
    }
    for (const id of compiled) if (!cited.has(id)) err(`${skillDir}/references`, `compiled rule ${id} not present in any reference (run npm run skill:build)`);
  }

  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const findings = validateAll();
  const errors = findings.filter((f) => f.level === 'error');
  const quiet = process.argv.includes('--quiet');
  for (const f of findings) if (!quiet || f.level === 'error') console.log(`${f.level.toUpperCase()} ${f.where}: ${f.msg}`);
  console.log(`validate: ${errors.length} error(s), ${findings.length - errors.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
