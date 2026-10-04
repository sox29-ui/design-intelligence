// The knowledge export is the integration contract for other systems: it must be valid and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { readJson } from '../scripts/lib/io.ts';
import { buildExport } from '../scripts/export-knowledge.ts';
import { loadRules } from '../scripts/validate.ts';

test('knowledge export validates against its schema and is deterministic for a commit', () => {
  const a = buildExport({ commit: 'test' });
  const b = buildExport({ commit: 'test' });
  assert.deepEqual(a, b);
  const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
  const validate = ajv.compile(readJson(new URL('../schemas/knowledge-export.schema.json', import.meta.url).pathname));
  assert.ok(validate(a), JSON.stringify(validate.errors));
  assert.equal(a.rules.length, loadRules().length);
  assert.ok(a.rules.every((r: any) => typeof r.compiled === 'boolean'));
  assert.ok(!a.rules.some((r: any) => JSON.stringify(r.evidence.supporting ?? []).includes('hol-')), 'rules never cite holdout references');
});
