// Skill contract: size limits, routing surface, file references, compiled-reference freshness,
// rule-ID integrity, holdout and model-identifier hygiene, deterministic packaging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ROOT, abs, listFiles } from '../scripts/lib/io.ts';
import { loadRules, COMPILED_STATUSES } from '../scripts/validate.ts';
import { buildZip, skillFiles, skillVersion } from '../scripts/package-skill.ts';

const SKILL = abs('.claude', 'skills', 'design-intelligence');
const skillMd = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
const fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(skillMd)![1]) as Record<string, any>;
const skillText = (): Array<[string, string]> =>
  listFiles('.claude/skills/design-intelligence').filter((f) => /\.(md|ts|js)$/.test(f)).map((f) => [f, readFileSync(abs(f), 'utf8')]);

test('SKILL.md stays within Claude Code and upload limits', () => {
  assert.ok(skillMd.split('\n').length <= 500, 'SKILL.md must stay under 500 lines');
  assert.equal(fm.name, 'design-intelligence');
  assert.match(fm.name, /^[a-z0-9-]{1,64}$/);
  const listing = `${fm.description ?? ''}${fm.when_to_use ?? ''}`;
  assert.ok(listing.length > 0 && listing.length <= 1536, `description + when_to_use = ${listing.length} chars (Claude Code cap 1536)`);
  assert.ok(String(fm.description).length <= 1024, 'description ≤ 1024 chars keeps the skill uploadable to claude.ai');
  assert.ok(!/[<>]/.test(String(fm.description)), 'description must not contain XML-like tags');
  assert.match(String(fm.metadata?.version), /^\d+\.\d+\.\d+$/);
});

test('every file SKILL.md and the workflows point to exists', () => {
  const docs = [join(SKILL, 'SKILL.md'), ...listFiles('.claude/skills/design-intelligence/workflows').map((f) => abs(f))];
  for (const doc of docs) {
    const text = readFileSync(doc, 'utf8');
    for (const m of text.matchAll(/`((?:references|workflows|scripts)\/[A-Za-z0-9_./-]+\.(?:md|ts|js))`/g)) {
      assert.ok(existsSync(join(SKILL, m[1])), `${doc} references missing ${m[1]}`);
    }
  }
});

test('compiled references are up to date with datasets/rules', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-skill.ts'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('each compiled rule appears exactly once as a rule card; hypotheses never do', () => {
  const rules = loadRules();
  const refs = listFiles('.claude/skills/design-intelligence/references', (p) => p.endsWith('.md') && !p.includes('/_framing/'));
  const all = refs.map((f) => readFileSync(abs(f), 'utf8')).join('\n');
  for (const { rule } of rules) {
    const n = all.split(`<!-- rule:${rule.id} -->`).length - 1;
    if (COMPILED_STATUSES.has(rule.status) && rule.kind !== 'hypothesis') assert.equal(n, 1, `${rule.id} cards: ${n}`);
    else assert.equal(n, 0, `${rule.id} (${rule.kind}/${rule.status}) must not compile as guidance`);
  }
});

test('rule IDs cited anywhere in the skill exist', () => {
  const ids = new Set(loadRules().map(({ rule }) => rule.id));
  const prefixes = ['typography', 'layout', 'responsive', 'hierarchy', 'color', 'motion', 'components', 'accessibility', 'performance', 'rtl', 'process', 'antipattern', 'signature', 'content', 'implementation'];
  const re = new RegExp(`\\b(?:${prefixes.join('|')})\\.[a-z0-9]+(?:-[a-z0-9]+)+\\b`, 'g');
  for (const [file, text] of skillText()) {
    if (!file.endsWith('.md')) continue;
    for (const m of text.matchAll(re)) assert.ok(ids.has(m[0]), `${file} cites unknown rule ${m[0]}`);
  }
});

test('skill never cites holdout references or model identifiers', () => {
  const model = /claude-(?:opus|sonnet|haiku|fable)-\d|\b(?:opus|sonnet|haiku) \d(?:\.\d)?\b/i;
  for (const [file, text] of skillText()) {
    assert.ok(!/\bhol-\d{3}\b/.test(text), `${file} cites a holdout reference`);
    assert.ok(!model.test(text), `${file} contains a model identifier`);
  }
});

test('routing surface: trigger cases hit description terms, skip cases hit none (lexical proxy)', () => {
  const spec = parseYaml(readFileSync(abs('evals', 'routing', 'cases.yaml'), 'utf8')) as { surface_terms: string[]; cases: Array<{ expect: string; prompt: string }> };
  const desc = String(fm.description).toLowerCase();
  const hits = (text: string) => spec.surface_terms.filter((t) => new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(text));
  for (const c of spec.cases) {
    const h = hits(c.prompt);
    if (c.expect === 'trigger') {
      const inDesc = h.filter((t) => desc.includes(t));
      assert.ok(inDesc.length > 0, `trigger case has no description term: "${c.prompt}" (matched: ${h.join(', ') || 'none'})`);
    } else {
      assert.deepEqual(h, [], `skip case matches surface terms: "${c.prompt}"`);
    }
  }
  assert.ok(spec.cases.filter((c) => c.expect === 'trigger').length >= 10 && spec.cases.filter((c) => c.expect === 'skip').length >= 10);
});

test('skill packaging is deterministic and excludes build-only inputs', () => {
  const files = skillFiles();
  assert.ok(files.includes('SKILL.md'));
  assert.ok(!files.some((f) => f.startsWith('references/_framing/')), 'framing sources are build inputs');
  const entries = files.map((f) => ({ name: `design-intelligence/${f}`, data: readFileSync(join(SKILL, f)) }));
  const a = buildZip(entries);
  const b = buildZip([...entries].reverse());
  assert.ok(a.equals(b), 'same inputs must give identical bytes regardless of order');
  assert.equal(a.readUInt32LE(0), 0x04034b50);
  assert.match(skillVersion(), /^\d+\.\d+\.\d+$/);
});
