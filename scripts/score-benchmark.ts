// Automated scoring of benchmark outputs (evals/harness/PROTOCOL.md, step 1) and blinding (step 2).
//
//   node scripts/score-benchmark.ts <cycle> [--only control/A-1,...] [--no-lighthouse]
//       → research-artifacts/bench/<cycle>/<condition>/<run>/   full verify output + screenshots (git-ignored)
//       → evals/results/<cycle>/automated.json                  compact per-output results (committed)
//   node scripts/score-benchmark.ts <cycle> --blind [--seed <text>]
//       → evals/results/<cycle>/blind/<ID>/                     output copies, NOTES.md removed, condition-revealing comments stripped
//       → evals/results/<cycle>/blind-key.SEALED.json           ID → condition/run (do not open before scoring)
//
// Outputs are rendered sequentially so lab numbers stay comparable within a cycle (still environment-relative, D-009).
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { abs, readJson, writeJson } from './lib/io.ts';
import { summarize } from './lighthouse.ts';
import { verify } from '../.claude/skills/design-intelligence/scripts/verify-page.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.ics': 'text/calendar', '.txt': 'text/plain; charset=utf-8',
};

export type OutputRef = { condition: string; run: string; brief: string; dir: string };

export function listOutputs(cycle: string): OutputRef[] {
  const base = abs('evals', 'results', cycle, 'outputs');
  if (!existsSync(base)) return [];
  const out: OutputRef[] = [];
  for (const condition of readdirSync(base).sort()) {
    for (const run of readdirSync(join(base, condition)).sort()) {
      const dir = join(base, condition, run);
      if (statSync(dir).isDirectory() && existsSync(join(dir, 'index.html'))) out.push({ condition, run, brief: run.split('-')[0], dir });
    }
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!name.startsWith('.')) out.push(...walk(p)); } else out.push(p);
  }
  return out;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** Code-level facts that screenshots cannot show (system consistency, implementation hygiene, contract compliance). */
export function staticAnalysis(dir: string) {
  const files = walk(dir).filter((f) => !f.endsWith('NOTES.md'));
  const read = (ext: string) => files.filter((f) => f.endsWith(ext)).map((f) => readFileSync(f, 'utf8'));
  const html = read('.html').join('\n');
  const css = [...read('.css'), ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])].join('\n');
  const js = [...read('.js'), ...[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])].join('\n');
  const bytes = (ext: string) => files.filter((f) => f.endsWith(ext)).reduce((a, f) => a + statSync(f).size, 0);
  const urls = [...(html + css + js).matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/"'\s)?#:]|$)/gi)].map((m) => m[1].toLowerCase());
  const allowed = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.w3\.org|w3\.org)$/;
  const external = uniq(urls).filter((h) => !allowed.test(h) && !/\.(example|test|invalid|localhost)$/.test(h) && h !== 'example.com' && h !== 'example.org');
  const fontFamilies = uniq([...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g)].flatMap((m) =>
    [...m[1].replace(/&amp;/g, '&').matchAll(/family=([^&:]+)/g)].map((f) => decodeURIComponent(f[1].replace(/\+/g, ' ')))));
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const decl = (prop: string) => [...cssNoComments.matchAll(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[1].trim());
  const colorLiterals = uniq([...cssNoComments.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, '')));
  const logical = (cssNoComments.match(/\b(?:margin|padding|border)-(?:inline|block)(?:-start|-end)?\b|\binset-(?:inline|block)(?:-start|-end)?\b|\b(?:inline|block)-size\b|text-align\s*:\s*(?:start|end)\b/g) ?? []).length;
  const physical = (cssNoComments.match(/\b(?:margin|padding|border)-(?:left|right)\b|(?:^|[;{\s])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)\b|float\s*:\s*(?:left|right)/g) ?? []).length;
  const ruleIdMentions = (html + css + js).match(/\b(?:typography|layout|responsive|hierarchy|color|motion|components|accessibility|performance|rtl|process|antipattern|signature)\.[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? [];
  const htmlTag = /<html\b([^>]*)>/i.exec(html)?.[1] ?? '';
  return {
    files: files.map((f) => relative(dir, f)).sort(),
    bytes: { html: bytes('.html'), css: bytes('.css'), js: bytes('.js'), other: files.reduce((a, f) => a + statSync(f).size, 0) - bytes('.html') - bytes('.css') - bytes('.js') },
    lang: /\blang\s*=\s*"([^"]*)"/i.exec(htmlTag)?.[1] ?? null,
    dir: /\bdir\s*=\s*"([^"]*)"/i.exec(htmlTag)?.[1] ?? null,
    externalHosts: external,
    googleFontFamilies: fontFamilies,
    customPropertiesDeclared: uniq([...cssNoComments.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])).length,
    varUses: (cssNoComments.match(/var\(--/g) ?? []).length,
    distinctFontSizeDeclarations: uniq(decl('font-size')).length,
    distinctColorLiterals: colorLiterals.length,
    distinctRadii: uniq(decl('border-radius')).length,
    mediaQueries: uniq([...cssNoComments.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1].trim().replace(/\s+/g, ' '))).length,
    containerQueries: (cssNoComments.match(/@container\b/g) ?? []).length,
    clampUses: (cssNoComments.match(/clamp\(/g) ?? []).length,
    reducedMotion: /prefers-reduced-motion/.test(css + js),
    colorSchemeSupport: /prefers-color-scheme/.test(css + js),
    logicalProps: logical,
    physicalInlineProps: physical,
    diRuleIdMentions: ruleIdMentions.length,
  };
}

function serveDir(dir: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolveP) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = join(dir, p);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolveP({ server, url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/` });
    });
  });
}

async function lighthouseLocal(dir: string, outFile: string) {
  const { server, url } = await serveDir(dir);
  const proxy = process.env.HTTPS_PROXY;
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    // Loopback is bypassed by Chrome's implicit rules; only external fonts go through the egress proxy.
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', ...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : [])],
  });
  try {
    const res = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] } as any);
    if (!res) throw new Error('lighthouse returned no result');
    writeFileSync(outFile, JSON.stringify(res.lhr));
    return summarize(res.lhr);
  } finally {
    await chrome.kill();
    server.close();
  }
}

/** Condition-neutral style features used for the cross-brief sameness measure. */
export function styleFeatures(summary: any, stat: ReturnType<typeof staticAnalysis>) {
  const fam = Object.keys(summary?.families ?? {}).map((f) => f.toLowerCase().replace(/["']/g, '').trim());
  return {
    families: fam.slice(0, 3),
    scheme: summary?.scheme ?? null,
    palette: (summary?.palette ?? []).slice(0, 3),
    displayPx1440: summary?.displaySize?.['1440x900'] ?? null,
    bodyPx1440: summary?.bodySize?.['1440x900'] ?? null,
    buttonRadius: summary?.buttonRadius ?? null,
    googleFonts: stat.googleFontFamilies,
  };
}

const rgb = (hex: string) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? ''); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null; };

/** 0 = nothing in common, 1 = same type families, palette, scheme and radius. A crude proxy for "same agency look". */
export function sameness(a: ReturnType<typeof styleFeatures>, b: ReturnType<typeof styleFeatures>) {
  const fa = new Set([...a.families, ...a.googleFonts.map((f) => f.toLowerCase())]);
  const fb = new Set([...b.families, ...b.googleFonts.map((f) => f.toLowerCase())]);
  const inter = [...fa].filter((x) => fb.has(x)).length;
  const fontJ = fa.size + fb.size - inter ? inter / (fa.size + fb.size - inter) : 0;
  const pd = (p: string[], q: string[]) => {
    const P = p.map(rgb).filter(Boolean) as number[][];
    const Q = q.map(rgb).filter(Boolean) as number[][];
    if (!P.length || !Q.length) return null;
    const d = P.map((x) => Math.min(...Q.map((y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / 441.7)));
    return 1 - d.reduce((s, v) => s + v, 0) / d.length;
  };
  const pal = pd(a.palette, b.palette);
  const scheme = a.scheme && b.scheme ? (a.scheme === b.scheme ? 1 : 0) : null;
  const rad = typeof a.buttonRadius === 'number' && typeof b.buttonRadius === 'number' ? 1 - Math.min(1, Math.abs(a.buttonRadius - b.buttonRadius) / 24) : null;
  const parts = [fontJ, pal, scheme, rad].filter((x): x is number => typeof x === 'number');
  return { fontJaccard: round(fontJ), palette: pal === null ? null : round(pal), scheme, radius: rad === null ? null : round(rad), overall: round(parts.reduce((s, v) => s + v, 0) / parts.length) };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

async function score(cycle: string, only: string[] | null, withLighthouse: boolean) {
  const outFile = abs('evals', 'results', cycle, 'automated.json');
  const prev = existsSync(outFile) ? readJson<any>(outFile) : { cycle, outputs: {} };
  const outputs = listOutputs(cycle).filter((o) => !only || only.includes(`${o.condition}/${o.run}`));
  for (const o of outputs) {
    const key = `${o.condition}/${o.run}`;
    const art = abs('research-artifacts', 'bench', cycle, o.condition, o.run);
    rmSync(art, { recursive: true, force: true });
    mkdirSync(art, { recursive: true });
    console.error(`[score] ${key}`);
    const v = await verify(o.dir, { out: art });
    const stat = staticAnalysis(o.dir);
    let lh: any = null;
    if (withLighthouse) {
      try { lh = await lighthouseLocal(o.dir, join(art, 'lighthouse-mobile.json')); } catch (e) { lh = { error: String((e as Error).message ?? e) }; }
    }
    prev.outputs[key] = {
      condition: o.condition,
      run: o.run,
      brief: o.brief,
      sourceSha256: createHash('sha256').update(walk(o.dir).filter((f) => !f.endsWith('NOTES.md')).sort().map((f) => readFileSync(f)).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0))).digest('hex'),
      gates: v.report.gates,
      failed: v.report.failed,
      signatures: v.report.signatures.filter((s: any) => s.present).map((s: any) => ({ id: s.id, evidence: s.evidence })),
      summary: v.report.summary,
      focus: Object.fromEntries(Object.entries(v.vpData).map(([vp, d]: [string, any]) => [vp, d.interactions?.focus ? { share: d.interactions.focus.indicatorShare, hidden: d.interactions.focus.offscreenOrHidden, skipFirst: d.interactions.focus.firstIsSkipLink } : null])),
      axe: Object.fromEntries(Object.entries(v.vpData).map(([vp, d]: [string, any]) => [vp, d.axe?.byImpact ?? null])),
      static: stat,
      style: styleFeatures(v.report.summary, stat),
      lighthouseMobile: lh,
      scoredAt: new Date().toISOString(),
    };
    writeJson(outFile, prev);
  }
  // Cross-brief sameness within each condition and generation index (lower = more brief-specific looks).
  const all = Object.values(prev.outputs) as any[];
  const diversity: Record<string, any> = {};
  for (const cond of uniq(all.map((x) => x.condition))) {
    const pairs: number[] = [];
    const byGen: Record<string, any[]> = {};
    for (const x of all.filter((x) => x.condition === cond)) (byGen[x.run.split('-')[1]] ??= []).push(x);
    for (const group of Object.values(byGen)) {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        if (group[i].brief !== group[j].brief) pairs.push(sameness(group[i].style, group[j].style).overall);
      }
    }
    diversity[cond] = { crossBriefPairs: pairs.length, meanSameness: pairs.length ? round(pairs.reduce((a, b) => a + b, 0) / pairs.length) : null };
  }
  prev.diversity = diversity;
  prev.notes = 'Lab values from a proxied container (D-009); compare within this cycle only. Sameness is a crude proxy (fonts, palette, scheme, radius).';
  writeJson(outFile, prev);
  console.log(`scored ${outputs.length} output(s) → ${relative(abs(), outFile)}`);
}

// Blinding removes only comments that could reveal the condition (DI / skill / rule-ID mentions);
// everything else in the code is left untouched so the blind copy renders exactly like the original.
const REVEALING = /design[- ]intelligence|\bDI\b|SKILL\.md|\b(?:typography|layout|responsive|hierarchy|color|motion|components|accessibility|performance|rtl|process|antipattern|signature)\.[a-z0-9]+(?:-[a-z0-9]+)+\b/i;
export function stripRevealingComments(file: string, text: string) {
  const drop = (m: string) => (REVEALING.test(m) ? '' : m);
  if (file.endsWith('.html')) text = text.replace(/<!--[\s\S]*?-->/g, drop);
  if (/\.(html|css|js)$/.test(file)) text = text.replace(/\/\*[\s\S]*?\*\//g, drop);
  if (/\.(html|js)$/.test(file)) text = text.replace(/(^|[^:"'`\\])(\/\/[^\n]*)/g, (m, pre, c) => (REVEALING.test(c) ? pre : m));
  return text;
}

function blind(cycle: string, seed: string) {
  const outputs = listOutputs(cycle);
  const base = abs('evals', 'results', cycle, 'blind');
  rmSync(base, { recursive: true, force: true });
  const key: Record<string, { condition: string; run: string }> = {};
  const ids = outputs.map((o) => ({ o, id: createHash('sha256').update(`${seed}:${o.condition}/${o.run}`).digest('hex').slice(0, 6).toUpperCase() }));
  for (const { o, id } of ids) {
    const dst = join(base, `${o.brief}-${id}`);
    cpSync(o.dir, dst, { recursive: true, filter: (src) => !src.endsWith('NOTES.md') && !/\/\.[^/]+$/.test(src) });
    for (const f of walk(dst)) if (/\.(html|css|js)$/.test(f)) writeFileSync(f, stripRevealingComments(f, readFileSync(f, 'utf8')));
    key[`${o.brief}-${id}`] = { condition: o.condition, run: o.run };
  }
  writeJson(abs('evals', 'results', cycle, 'blind-key.SEALED.json'), { note: 'Do not open before critic and human scoring are complete.', seedSha256: createHash('sha256').update(seed).digest('hex'), key });
  console.log(`blinded ${ids.length} output(s) → evals/results/${cycle}/blind/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cycle = args.find((a) => !a.startsWith('--') && !['--only', '--seed'].includes(args[args.indexOf(a) - 1]));
  if (!cycle) { console.error('usage: node scripts/score-benchmark.ts <cycle> [--only c/r,...] [--no-lighthouse] | --blind [--seed s]'); process.exit(2); }
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--blind')) blind(cycle, get('--seed') ?? `${cycle}-${Date.now()}`);
  else await score(cycle, get('--only')?.split(',') ?? null, !args.includes('--no-lighthouse'));
}
