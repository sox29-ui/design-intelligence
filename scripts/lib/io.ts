// Shared filesystem / data helpers for DI repository tooling.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function abs(...parts: string[]): string {
  return join(ROOT, ...parts);
}

export function rel(p: string): string {
  return relative(ROOT, p).split('\\').join('/');
}

export function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

export function readJson<T = unknown>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function readYaml<T = unknown>(p: string): T {
  return YAML.parse(readFileSync(p, 'utf8')) as T;
}

export function writeJson(p: string, data: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function writeYaml(p: string, data: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, YAML.stringify(data, { lineWidth: 0 }));
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256File(p: string): string {
  return sha256(readFileSync(p));
}

/** Recursively list files under a directory (relative to ROOT), optionally filtered by predicate. */
export function listFiles(dir: string, pred: (p: string) => boolean = () => true): string[] {
  const out: string[] = [];
  const start = abs(dir);
  if (!existsSync(start)) return out;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (pred(p)) out.push(rel(p));
    }
  };
  walk(start);
  return out.sort();
}

/** Resolve an RFC 6901 JSON pointer. Returns {found, value}. */
export function resolvePointer(doc: unknown, pointer: string): { found: boolean; value?: unknown } {
  if (pointer === '' || pointer === '/') return { found: true, value: doc };
  const parts = pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = doc;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return { found: false };
    if (Array.isArray(cur)) {
      const i = Number(part);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { found: false };
      cur = cur[i];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, part)) return { found: false };
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return { found: true, value: cur };
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
