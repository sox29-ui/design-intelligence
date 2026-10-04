// Handoff manifest: every tracked file grouped by component, with size and SHA-256, so a migration can be
// verified file by file.   node scripts/handoff-manifest.ts   → handoff/MANIFEST.json
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { abs, sha256 } from './lib/io.ts';
import { skillVersion } from './package-skill.ts';

export const COMPONENTS: Array<{ name: string; description: string; match: RegExp }> = [
  { name: 'skill', description: 'Agent skill: router, contract, compiled references, workflows, runtime verifier', match: /^\.claude\/skills\/design-intelligence\// },
  { name: 'knowledge', description: 'Rules (source of truth), corpus, provenance sources, selection record', match: /^(datasets\/rules\/|datasets\/corpus\.yaml$|datasets\/candidates\.yaml$|provenance\/)/ },
  { name: 'candidates', description: 'Proposed changes for v0.2 (never applied automatically)', match: /^datasets\/candidates\// },
  { name: 'evidence', description: 'Derived capture data (no page copy) and VERIFIED/OBSERVED/INFERRED observations', match: /^datasets\/(raw\/|observations\/|corpus-matrix)/ },
  { name: 'validation-holdout', description: 'Validation checks, sealed-holdout predictions and results', match: /^datasets\/(validation|holdout)\// },
  { name: 'evaluation', description: 'Briefs, rubric, protocol, routing cases, cycle-01 prompts, outputs, scores, critic results, report', match: /^evals\// },
  { name: 'tooling', description: 'Repository scripts, schemas and project configuration', match: /^(scripts\/|schemas\/|package\.json$|package-lock\.json$|tsconfig\.json$|\.gitignore$|dist\/\.gitkeep$)/ },
  { name: 'tests', description: 'Unit, integrity, contract and browser fixture tests', match: /^tests\// },
  { name: 'docs', description: 'Architecture, decisions, evidence taxonomy, ethics, evolution, journal, report extraction', match: /^(docs\/|README\.md$|CHANGELOG\.md$|datasets\/README\.md$)/ },
  { name: 'handoff', description: 'Handoff guide, integration guide, knowledge export, packaged skill', match: /^handoff\// },
];

export function buildManifest() {
  const files = spawnSync('git', ['ls-files'], { cwd: abs(), encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
    .filter((f) => f !== 'handoff/MANIFEST.json').sort();
  const components: Record<string, { description: string; files: Array<{ path: string; bytes: number; sha256: string }>; total_bytes: number }> = {};
  const unassigned: string[] = [];
  for (const f of files) {
    const c = COMPONENTS.find((x) => x.match.test(f));
    if (!c) { unassigned.push(f); continue; }
    const entry = (components[c.name] ??= { description: c.description, files: [], total_bytes: 0 });
    const buf = readFileSync(abs(f));
    entry.files.push({ path: f, bytes: statSync(abs(f)).size, sha256: sha256(buf) });
    entry.total_bytes += buf.length;
  }
  return { format: 'di-handoff-manifest', di_version: skillVersion(), file_count: files.length, components, unassigned };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = buildManifest();
  writeFileSync(abs('handoff', 'MANIFEST.json'), JSON.stringify(m, null, 2) + '\n');
  console.log(`manifest: ${m.file_count} tracked files; ${Object.entries(m.components).map(([k, v]) => `${k} ${v.files.length}`).join(', ')}${m.unassigned.length ? `; unassigned: ${m.unassigned.join(', ')}` : ''}`);
}
