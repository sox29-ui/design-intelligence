import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robotsVerdict, captureId } from '../scripts/collect.ts';

test('robots: longest match wins, allow wins ties, other agents ignored', () => {
  const txt = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /search\nAllow: /search/public\nDisallow: /*.pdf$\n`;
  assert.equal(robotsVerdict(txt, '/').allowed, true);
  assert.equal(robotsVerdict(txt, '/search?q=x').allowed, false);
  assert.equal(robotsVerdict(txt, '/search/public/a').allowed, true);
  assert.equal(robotsVerdict(txt, '/doc.pdf').allowed, false);
  assert.equal(robotsVerdict(txt, '/doc.pdf?x=1').allowed, true);
});

test('robots: empty disallow allows everything; grouped agents share rules', () => {
  assert.equal(robotsVerdict('User-agent: *\nDisallow:\n', '/x').allowed, true);
  assert.equal(robotsVerdict('User-agent: a\nUser-agent: *\nDisallow: /p\n', '/p/1').allowed, false);
});

test('capture id format', () => {
  assert.match(captureId(new Date('2026-10-02T16:01:02.345Z')), /^20261002T160102Z$/);
});
