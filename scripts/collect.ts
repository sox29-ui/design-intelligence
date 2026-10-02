// Collect raw evidence for corpus references.
// Usage:
//   node scripts/collect.ts ref-001 [ref-002 ...] [--page home] [--viewports mobile,desktop] [--allow-validation]
//   node scripts/collect.ts --split extraction
// Writes datasets/raw/<ref>/<page>/<capture_id>/ (committed, hashed) and research-artifacts/<ref>/<page>/<capture_id>/ (git-ignored).
import { existsSync } from 'node:fs';
import { request } from 'playwright';
import { abs, readYaml, rel, writeJson } from './lib/io.ts';
import { BENCHMARK_VIEWPORTS, TOOL_VERSION, inspectPage } from '../.claude/skills/design-intelligence/scripts/inspect-page.ts';

type Page = { id: string; url: string; locale?: string };
type Ref = { id: string; split: string; pages: Page[] };

export function captureId(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Minimal robots.txt evaluation for user-agent "*": longest-match wins, Allow wins ties. */
export function robotsVerdict(robots: string, path: string): { allowed: boolean; rule: string | null } {
  const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const groups: Array<{ agents: string[]; rules: Array<{ type: 'allow' | 'disallow'; path: string }> }> = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of lines) {
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ type: key, path: val });
    }
  }
  const star = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  const toRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  let best: { type: string; path: string } | null = null;
  for (const r of star) {
    if (r.type === 'disallow' && r.path === '') continue;
    if (!toRe(r.path).test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
  }
  return { allowed: !best || best.type === 'allow', rule: best ? `${best.type}: ${best.path}` : null };
}

async function checkRobots(url: string) {
  const u = new URL(url);
  const robotsUrl = `${u.origin}/robots.txt`;
  const ctx = await request.newContext(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  try {
    const res = await ctx.get(robotsUrl, { timeout: 20000, failOnStatusCode: false });
    if (res.status() === 404 || res.status() === 410) return { status: 'absent' as const, checked_url: robotsUrl, matched_rule: null };
    if (!res.ok()) return { status: 'unknown' as const, checked_url: robotsUrl, matched_rule: `http ${res.status()}` };
    const v = robotsVerdict(await res.text(), u.pathname + u.search);
    return { status: v.allowed ? ('allowed' as const) : ('disallowed' as const), checked_url: robotsUrl, matched_rule: v.rule };
  } catch (e) {
    return { status: 'unknown' as const, checked_url: robotsUrl, matched_rule: String((e as Error).message).slice(0, 80) };
  } finally {
    await ctx.dispose();
  }
}

export async function collectPage(ref: Ref, page: Page, viewportNames?: string[]) {
  const cid = captureId();
  const outDir = abs('datasets/raw', ref.id, page.id, cid);
  const artifactDir = abs('research-artifacts', ref.id, page.id, cid);
  const started = new Date().toISOString();
  console.error(`[collect] ${ref.id}/${page.id} ${page.url} → ${rel(outDir)}`);
  const robots = await checkRobots(page.url);
  const manifest: Record<string, unknown> = {
    capture_id: cid,
    ref_id: ref.id,
    page_id: page.id,
    url: page.url,
    final_url: null,
    started_at: started,
    finished_at: null,
    tool: { name: 'di-collect', version: TOOL_VERSION, playwright: '1.56.1', browser: 'chromium', axe: '4.13.0' },
    environment: { proxy: !!process.env.HTTPS_PROXY, platform: process.platform, note: 'Chromium via egress proxy; DPR 1; lab timings environment-relative (D-009)' },
    robots,
    consent: { action: 'not-applicable', detail: '' },
    blocked: false,
    blocked_reason: null,
    viewports: [],
    files: [],
    artifacts: [],
    errors: [],
  };
  if (robots.status === 'disallowed') {
    manifest.blocked = true;
    manifest.blocked_reason = `robots.txt ${robots.matched_rule}`;
    manifest.finished_at = new Date().toISOString();
    writeJson(`${outDir}/manifest.json`, manifest);
    console.error(`[collect] skipped by robots.txt (${robots.matched_rule})`);
    return manifest;
  }
  const res = await inspectPage({
    url: page.url,
    outDir,
    artifactDir,
    viewports: viewportNames ? BENCHMARK_VIEWPORTS.filter((v) => viewportNames.includes(v.name)) : BENCHMARK_VIEWPORTS,
    locale: page.locale,
    consent: 'reject',
    log: (m) => console.error(m),
  });
  manifest.final_url = res.finalUrl;
  manifest.finished_at = new Date().toISOString();
  manifest.tool = { ...(manifest.tool as object), browser: `chromium ${res.browserVersion}` };
  manifest.consent = res.consent;
  manifest.blocked = res.blocked;
  manifest.blocked_reason = res.blockedReason;
  manifest.viewports = res.viewports;
  manifest.files = res.files;
  manifest.artifacts = res.artifacts.map((a) => ({ ...a, file: rel(`${artifactDir}/${a.file}`) }));
  manifest.errors = res.errors;
  writeJson(`${outDir}/manifest.json`, manifest);
  console.error(`[collect] done ${ref.id}/${page.id}: ${res.viewports.map((v) => `${v.width}x${v.height}:${v.status}`).join(' ')} consent=${res.consent.action}${res.errors.length ? ' errors=' + res.errors.length : ''}`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const corpus = readYaml<{ references: Ref[] }>(abs('datasets/corpus.yaml'));
  const split = get('--split');
  const ids = split ? corpus.references.filter((r) => r.split === split).map((r) => r.id) : args.filter((a) => /^(ref|val|hol)-\d{3}$/.test(a));
  const pageFilter = get('--page');
  const vps = get('--viewports')?.split(',');
  for (const id of ids) {
    const ref = corpus.references.find((r) => r.id === id);
    if (!ref) throw new Error(`unknown ref ${id}`);
    if (ref.split === 'holdout' && !existsSync(abs('datasets/holdout/UNSEALED.yaml'))) {
      console.error(`[collect] REFUSED ${id}: holdout is sealed (datasets/holdout/SEALED.md)`);
      continue;
    }
    if (ref.split === 'validation' && !args.includes('--allow-validation')) {
      console.error(`[collect] REFUSED ${id}: validation refs are captured only after candidate rules exist (pass --allow-validation)`);
      continue;
    }
    for (const page of ref.pages.filter((p) => !pageFilter || p.id === pageFilter)) await collectPage(ref, page, vps);
  }
}
