// Repository integrity: everything committed must pass the DI validator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAll } from '../scripts/validate.ts';

test('repository passes DI validation (schemas, provenance, leakage, skill contract)', () => {
  const errors = validateAll().filter((f) => f.level === 'error');
  assert.deepEqual(errors, [], errors.map((e) => `${e.where}: ${e.msg}`).join('\n'));
});
