import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abs, readYaml } from '../scripts/lib/io.ts';
import { checkCorpus, weightedTotal } from '../scripts/check-corpus.ts';

test('corpus satisfies split, coverage, studio cap and score consistency', () => {
  const corpus = readYaml<{ references: any[] }>(abs('datasets/corpus.yaml'));
  const { errors } = checkCorpus(corpus.references);
  assert.deepEqual(errors, []);
});

test('weighted total uses report P9 weights', () => {
  assert.equal(weightedTotal({ quality_signal: 5, archetype_coverage: 5, interaction_diversity: 5, mobile_quality: 5, a11y_perf_contrast: 5, rtl_localization: 5, implementation_diversity: 5 }), 5);
  assert.equal(weightedTotal({ quality_signal: 4, archetype_coverage: 0, interaction_diversity: 0, mobile_quality: 0, a11y_perf_contrast: 0, rtl_localization: 0, implementation_diversity: 0 }), 1);
});
