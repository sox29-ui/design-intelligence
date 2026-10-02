// Validity checks for the skill's browser verifier: known-good and known-bad fixture pages must
// produce the expected gates, focus measurements and signatures. Needs Chromium (Playwright).
//   npm run test:browser
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abs } from '../../scripts/lib/io.ts';
import { verify } from '../../.claude/skills/design-intelligence/scripts/verify-page.ts';

const work = mkdtempSync(join(tmpdir(), 'di-verify-test-'));
test.after(() => rmSync(work, { recursive: true, force: true }));

test('known-good fixture passes every gate and focus is measured after scrolling settles', { timeout: 240_000 }, async () => {
  const { report, vpData } = await verify(abs('tests', 'fixtures', 'verify-good'), { out: join(work, 'good'), quick: true });
  assert.equal(report.failed, false, JSON.stringify(report.gates));
  for (const vp of ['390x844', '1440x900']) {
    const f = vpData[vp].interactions.focus;
    assert.equal(f.indicatorShare, 1, `${vp} focus sequence ${f.sequence}`);
    assert.equal(f.offscreenOrHidden, 0, `${vp}: smooth scrolling must not count as hidden focus`);
    assert.ok(f.firstIsSkipLink, `${vp}: skip link first`);
    assert.ok(f.indicatorProps.some(([p]: [string]) => p === 'ancestor'), `${vp}: :has(:focus-visible) indicator on the card must be detected`);
  }
  const present = report.signatures.filter((s) => s.present).map((s) => s.id);
  assert.deepEqual(present, [], `no generic signatures expected, got ${present}`);
});

test('known-bad fixture fails the expected gates and shows the generic signatures', { timeout: 240_000 }, async () => {
  const { report } = await verify(abs('tests', 'fixtures', 'verify-bad'), { out: join(work, 'bad'), quick: true });
  assert.equal(report.failed, true);
  const failed = new Set(report.gates.filter((g) => g.level === 'FAIL').map((g) => g.id));
  for (const id of ['broken-mobile', 'keyboard-unusable', 'lang-missing', 'rtl-direction']) assert.ok(failed.has(id), `expected FAIL ${id}; got ${[...failed]}`);
  const present = new Set(report.signatures.filter((s) => s.present).map((s) => s.id));
  for (const id of ['gradient-backgrounds', 'glassmorphism']) assert.ok(present.has(id), `expected signature ${id}; got ${[...present]}`);
});
