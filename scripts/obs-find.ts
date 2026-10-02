// Find observations by id/statement regex: node scripts/obs-find.ts <regex> [--type OBSERVED|INFERRED|VERIFIED]
import { loadObservations } from './validate.ts';
const re = new RegExp(process.argv[2] ?? '.', 'i');
const ti = process.argv.indexOf('--type');
const type = ti >= 0 ? process.argv[ti + 1] : null;
for (const [id, o] of loadObservations()) {
  const any = o as any;
  if (type && any.evidence_type !== type) continue;
  const text = `${id} ${any.statement ?? ''}`;
  if (!re.test(text)) continue;
  console.log(`${id} [${any.evidence_type}${any.assessment !== 'neutral' ? ',' + any.assessment : ''}] ${(any.statement ?? JSON.stringify(any.value)).slice(0, 150)}`);
}
