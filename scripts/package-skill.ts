// Package the design-intelligence skill as a deterministic ZIP in dist/.
//   node scripts/package-skill.ts            → dist/design-intelligence-v<version>.zip (+ .sha256)
// Refuses to package when validation fails or compiled references are stale.
// The archive holds one top-level folder `design-intelligence/` (the layout skill uploads expect),
// excludes build-only inputs (references/_framing/) and adds a package.json for the verify scripts.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { parse as parseYaml } from 'yaml';
import { ROOT, abs, listFiles, rel, sha256 } from './lib/io.ts';
import { validateAll } from './validate.ts';

const SKILL_DIR = abs('.claude', 'skills', 'design-intelligence');
const EXCLUDE = [/^references\/_framing\//, /(^|\/)\.di-verify\//, /(^|\/)node_modules\//, /(^|\/)\.DS_Store$/];

export interface ZipEntry { name: string; data: Buffer }

// Minimal ZIP writer (deflate, fixed 1980-01-01 timestamps, sorted entries) so the same
// inputs always produce the same bytes.
export function buildZip(entries: ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  for (const e of sorted) {
    const name = Buffer.from(e.name, 'utf8');
    const deflated = deflateRawSync(e.data, { level: 9 });
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const crc = crc32(e.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(useDeflate ? 8 : 0, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(e.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(0x031e, 4); // made by: unix, 3.0
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += header.length + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cdBuf, end]);
}

export function skillVersion(): string {
  const text = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) throw new Error('SKILL.md has no frontmatter');
  const fm = parseYaml(m[1]) as { metadata?: { version?: string } };
  const v = fm.metadata?.version;
  if (!v || !/^\d+\.\d+\.\d+$/.test(String(v))) throw new Error('SKILL.md metadata.version missing or not semver');
  return String(v);
}

export function skillFiles(): string[] {
  const prefix = rel(SKILL_DIR) + '/';
  return listFiles(rel(SKILL_DIR))
    .map((f) => f.slice(prefix.length))
    .filter((f) => !EXCLUDE.some((re) => re.test(f)))
    .sort();
}

function runtimePackageJson(version: string): string {
  const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  const pick = ['playwright', '@axe-core/playwright', 'axe-core'];
  const dependencies = Object.fromEntries(pick.map((k) => [k, root.dependencies[k]]));
  return JSON.stringify({
    name: 'design-intelligence-skill',
    version,
    private: true,
    description: 'Runtime dependencies for the design-intelligence skill verification scripts (scripts/verify-page.ts).',
    type: 'module',
    engines: { node: '>=22.18' },
    dependencies,
  }, null, 2) + '\n';
}

function main(): void {
  const errors = validateAll().filter((i) => i.level === 'error');
  if (errors.length) {
    for (const e of errors.slice(0, 20)) console.error(`ERROR ${e.where}: ${e.msg}`);
    console.error(`package-skill: refusing to package — ${errors.length} validation error(s)`);
    process.exit(1);
  }
  const check = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-skill.ts'), '--check'], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write(check.stdout + check.stderr);
    console.error('package-skill: compiled references are stale — run npm run skill:build');
    process.exit(1);
  }
  const version = skillVersion();
  const files = skillFiles();
  const entries: ZipEntry[] = files.map((f) => ({ name: `design-intelligence/${f}`, data: readFileSync(join(SKILL_DIR, f)) }));
  if (files.includes('package.json')) throw new Error('skill folder must not contain package.json (generated at packaging time)');
  entries.push({ name: 'design-intelligence/package.json', data: Buffer.from(runtimePackageJson(version)) });
  const zip = buildZip(entries);
  const outDir = abs('dist');
  mkdirSync(outDir, { recursive: true });
  const name = `design-intelligence-v${version}.zip`;
  writeFileSync(join(outDir, name), zip);
  const digest = sha256(zip);
  writeFileSync(join(outDir, `${name}.sha256`), `${digest}  ${name}\n`);
  console.log(`packaged ${entries.length} files → dist/${name} (${zip.length} bytes)\nsha256 ${digest}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
