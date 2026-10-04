import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePointer } from '../scripts/lib/io.ts';
import { confidenceCeiling } from '../scripts/validate.ts';

test('resolvePointer resolves nested objects/arrays and escapes', () => {
  const doc = { a: [{ 'b/c': 1, 'd~e': 2 }] };
  assert.deepEqual(resolvePointer(doc, '/a/0/b~1c'), { found: true, value: 1 });
  assert.deepEqual(resolvePointer(doc, '/a/0/d~0e'), { found: true, value: 2 });
  assert.equal(resolvePointer(doc, '/a/1').found, false);
  assert.equal(resolvePointer(doc, '/x').found, false);
});

const studios = new Map([
  ['ref-001', 'A'], ['ref-002', 'B'], ['ref-003', 'C'], ['ref-004', 'D'], ['ref-005', 'A'],
]);
const arch = new Map([
  ['ref-001', ['minimal']], ['ref-002', ['editorial']], ['ref-003', ['minimal']], ['ref-004', ['utilitarian']], ['ref-005', ['minimal']],
]);
const sup = (...refs: string[]) => refs.map((ref) => ({ ref, observations: ['x'] }));

test('confidence ceiling follows D-006 (studio de-duplication, validation, counterexample notes)', () => {
  const base = { id: 'x.y', kind: 'principle', status: 'provisional', confidence: 'low' as const, evidence_count: 0 };
  assert.equal(confidenceCeiling({ ...base, evidence: { supporting: sup('ref-001', 'ref-005'), counterexamples: [] } }, studios, arch), 'low');
  assert.equal(confidenceCeiling({ ...base, evidence: { supporting: sup('ref-001', 'ref-002', 'ref-003'), counterexamples: [] } }, studios, arch), 'medium');
  const four = sup('ref-001', 'ref-002', 'ref-003', 'ref-004');
  assert.equal(confidenceCeiling({ ...base, evidence: { supporting: four, counterexamples: [] } }, studios, arch), 'medium');
  assert.equal(
    confidenceCeiling({ ...base, evidence: { supporting: four, counterexamples: [], validation: [{ ref: 'val-001', result: 'consistent', observations: [] }] } }, studios, arch),
    'high',
  );
  assert.equal(
    confidenceCeiling({ ...base, evidence: { supporting: four, counterexamples: [{ ref: 'ref-005', observations: ['y'] }], validation: [{ ref: 'val-001', result: 'consistent', observations: [] }] } }, studios, arch),
    'medium',
  );
});

test('soft error pages served with HTTP 200 are recognised (text tested, never stored)', async () => {
  const { SOFT_ERROR_RE } = await import('../.claude/skills/design-intelligence/scripts/inspect-page.ts');
  for (const t of ['500\nحدث خطأ غير متوقع.\nيرجى المحاولة لاحقًا.', 'عذرًا! حدث خطأ ما', 'Oops, something went wrong', 'Error 503: Service Unavailable', 'Internal Server Error']) {
    assert.ok(SOFT_ERROR_RE.test(t), t);
  }
  for (const t of ['Shop 500+ products with free delivery', 'خصم 50% على العطور', 'Errors and omissions excepted']) {
    assert.ok(!SOFT_ERROR_RE.test(t), t);
  }
});
