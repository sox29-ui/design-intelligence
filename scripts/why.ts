// Provenance query: why does this rule exist?
// Usage: node scripts/why.ts <rule-id> [--json]
// Prints supporting references with their observations (type, statement/value, evidence pointers),
// counterexamples, validation results, external standards, confidence basis and history.
import { abs, readYaml } from './lib/io.ts';
import { loadCorpus, loadObservations, loadRules } from './validate.ts';

export function why(id: string) {
  const entry = loadRules().find((r) => r.rule.id === id);
  if (!entry) throw new Error(`rule ${id} not found`);
  const r = entry.rule as any;
  const obs = loadObservations();
  const names = new Map((loadCorpus()?.references ?? []).map((x: any) => [x.id, `${x.name} — ${x.url}`]));
  const sources = new Map((readYaml<{ sources: any[] }>(abs('provenance/sources.yaml')).sources ?? []).map((s) => [s.id, s]));
  const expand = (list: any[] = []) =>
    list.map((s) => ({
      ref: s.ref,
      site: names.get(s.ref) ?? null,
      note: s.note ?? null,
      result: s.result ?? undefined,
      observations: (s.observations ?? []).map((oid: string) => {
        const o: any = obs.get(oid);
        return o
          ? { id: oid, type: o.evidence_type, method: o.method, viewport: o.viewport, captured_at: o.captured_at, claim: o.statement ?? `${o.property} = ${JSON.stringify(o.value).slice(0, 160)}`, confidence: o.confidence, evidence: o.evidence }
          : { id: oid, missing: true };
      }),
    }));
  return {
    id: r.id,
    file: entry.file,
    kind: r.kind,
    status: r.status,
    statement: r.statement,
    confidence: r.confidence,
    confidence_basis: r.confidence_basis,
    when: r.when,
    avoid_when: r.avoid_when,
    supporting: expand(r.evidence.supporting),
    counterexamples: expand(r.evidence.counterexamples),
    validation: expand(r.evidence.validation),
    external: (r.evidence.external ?? []).map((x: any) => ({ ...x, source: sources.get(x.source_id) ?? null })),
    benchmark: r.evidence.benchmark ?? [],
    created: r.created,
    updated: r.updated,
    history: r.history,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: node scripts/why.ts <rule-id> [--json]');
    process.exit(2);
  }
  const w = why(id);
  if (process.argv.includes('--json')) console.log(JSON.stringify(w, null, 2));
  else {
    const L: string[] = [];
    L.push(`${w.id}  [${w.kind}, ${w.status}, confidence ${w.confidence}]`);
    L.push(`  ${w.statement}`);
    L.push(`  confidence basis: ${w.confidence_basis}`);
    L.push(`  created ${w.created}, updated ${w.updated}; file ${w.file}`);
    const block = (title: string, list: any[]) => {
      if (!list.length) return;
      L.push(`\n${title}:`);
      for (const s of list) {
        L.push(`  • ${s.ref} ${s.site ?? ''}${s.result ? ` → ${s.result}` : ''}${s.note ? `\n      note: ${s.note}` : ''}`);
        for (const o of s.observations) L.push(o.missing ? `      - ${o.id} (MISSING)` : `      - [${o.type}/${o.method} ${o.viewport}] ${o.claim} (conf ${o.confidence})`);
      }
    };
    block('Supporting evidence', w.supporting);
    block('Counterexamples', w.counterexamples);
    block('Validation', w.validation);
    if (w.external.length) {
      L.push('\nStandards / documentation:');
      for (const x of w.external) L.push(`  • ${x.source_id}: ${x.source?.title ?? '?'} (${x.source?.url ?? ''}, accessed ${x.source?.accessed ?? '?'})${x.note ? ` — ${x.note}` : ''}`);
    }
    if (w.benchmark.length) {
      L.push('\nBenchmark evidence:');
      for (const b of w.benchmark) L.push(`  • ${b.result_id}: ${b.note}`);
    }
    L.push('\nHistory:');
    for (const h of w.history ?? []) L.push(`  ${h.version} ${h.date}: ${h.change}${h.candidate ? ` (${h.candidate})` : ''}`);
    console.log(L.join('\n'));
  }
}
