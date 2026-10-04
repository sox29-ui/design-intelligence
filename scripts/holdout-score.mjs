// Holdout generalization score: pre-registered predictions vs. measured checks (run after validation-check.ts hol-*).
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('../datasets/holdout', import.meta.url).pathname;
const pred = JSON.parse(readFileSync(`${D}/predictions.json`, 'utf8')).predictions;
const out = { note: 'Pre-registered predictions (predictions.json, commit befde0b) vs. measured checks on holdout captures. Never used as rule evidence.', byRef: {}, byConfidence: {}, rows: [] };
const tally = (k, r) => { k[r] = (k[r] ?? 0) + 1; };
for (const p of pred) {
  const c = JSON.parse(readFileSync(`${D}/${p.ref}.checks.json`, 'utf8')).checks.find((x) => x.rule === p.rule && x.page === p.page);
  const result = c?.result ?? 'missing';
  out.rows.push({ ref: p.ref, rule: p.rule, confidence: p.confidence, basis: p.basis, result, note: c?.note ?? null, observations: c?.observations ?? [] });
  tally((out.byRef[p.ref] ??= {}), result);
  tally((out.byConfidence[p.confidence] ??= {}), result);
}
const decided = out.rows.filter((r) => r.result === 'consistent' || r.result === 'inconsistent');
out.overall = { predictions: out.rows.length, decided: decided.length, consistent: decided.filter((r) => r.result === 'consistent').length, hitRate: +(decided.filter((r) => r.result === 'consistent').length / decided.length).toFixed(3) };
writeFileSync(`${D}/results.json`, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ overall: out.overall, byRef: out.byRef, byConfidence: out.byConfidence }, null, 1));
for (const r of out.rows.filter((r) => r.result === 'inconsistent')) console.log('MISS', r.ref, r.rule, '|', r.note);
