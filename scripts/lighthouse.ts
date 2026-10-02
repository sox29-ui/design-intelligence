// Lab Lighthouse run for a captured page; appends a summary to the latest capture manifest.
// Usage: node scripts/lighthouse.ts ref-001 [--page home] [--runs 1] [--form-factor mobile|desktop]
// Summary (committed): category scores, key metrics, stable facts (bytes, requests, DOM size), failing a11y audits.
// Full LHR JSON goes to research-artifacts (git-ignored). Values are environment-relative (D-009).
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { abs, readJson, readYaml, rel, sha256, writeJson } from './lib/io.ts';

type LHR = any;

export function summarize(lhr: LHR) {
  const a = lhr.audits;
  const num = (id: string) => (a[id] && typeof a[id].numericValue === 'number' ? Math.round(a[id].numericValue) : null);
  return {
    lighthouseVersion: lhr.lighthouseVersion,
    formFactor: lhr.configSettings?.formFactor,
    throttlingMethod: lhr.configSettings?.throttlingMethod,
    fetchTime: lhr.fetchTime,
    runWarnings: (lhr.runWarnings || []).length,
    scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]: [string, any]) => [k, v.score])),
    metrics: {
      fcp: num('first-contentful-paint'),
      lcp: num('largest-contentful-paint'),
      tbt: num('total-blocking-time'),
      cls: a['cumulative-layout-shift'] ? Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000 : null,
      speedIndex: num('speed-index'),
      tti: num('interactive'),
    },
    stable: {
      totalByteWeight: num('total-byte-weight'),
      domSize: num('dom-size'),
      requests: a['network-requests']?.details?.items?.length ?? null,
      mainThreadWorkMs: num('mainthread-work-breakdown'),
      bootupTimeMs: num('bootup-time'),
      unusedJsBytes: a['unused-javascript']?.details?.overallSavingsBytes ?? null,
      fontDisplayPass: a['font-display'] ? a['font-display'].score === 1 : null,
    },
    failedAccessibilityAudits: Object.values(lhr.categories.accessibility?.auditRefs || [])
      .map((r: any) => a[r.id])
      .filter((x: any) => x && x.score !== null && x.score < 1 && x.scoreDisplayMode === 'binary')
      .map((x: any) => x.id),
  };
}

export async function runLighthouse(url: string, formFactor: 'mobile' | 'desktop') {
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [])],
  });
  try {
    const flags: any = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] };
    const config = formFactor === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
    const res = await lighthouse(url, flags, config);
    if (!res) throw new Error('lighthouse returned no result');
    return res.lhr;
  } finally {
    await chrome.kill();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const formFactor = (get('--form-factor') ?? 'mobile') as 'mobile' | 'desktop';
  const runs = Number(get('--runs') ?? 1);
  const corpus = readYaml<{ references: Array<{ id: string; pages: Array<{ id: string; url: string }> }> }>(abs('datasets/corpus.yaml'));
  for (const id of args.filter((a) => /^(ref|val|hol)-\d{3}$/.test(a))) {
    const ref = corpus.references.find((r) => r.id === id)!;
    for (const page of ref.pages.filter((p) => !get('--page') || p.id === get('--page'))) {
      const pageDir = abs('datasets/raw', id, page.id);
      if (!existsSync(pageDir)) continue;
      const cap = readdirSync(pageDir).sort().pop()!;
      const capDir = `${pageDir}/${cap}`;
      const manifest = readJson<any>(`${capDir}/manifest.json`);
      if (manifest.blocked) continue;
      const summaries = [];
      for (let i = 0; i < runs; i++) {
        console.error(`[lighthouse] ${id}/${page.id} ${formFactor} run ${i + 1}/${runs}`);
        try {
          const lhr = await runLighthouse(page.url, formFactor);
          const artDir = abs('research-artifacts', id, page.id, cap);
          mkdirSync(artDir, { recursive: true });
          const full = JSON.stringify(lhr);
          const fname = `lighthouse-${formFactor}-${i + 1}.json`;
          writeFileSync(`${artDir}/${fname}`, full);
          manifest.artifacts = manifest.artifacts.filter((x: any) => !x.file.endsWith(fname));
          manifest.artifacts.push({ file: rel(`${artDir}/${fname}`), sha256: sha256(full), bytes: Buffer.byteLength(full), kind: 'lighthouse-report', viewport: formFactor, state: null });
          summaries.push(summarize(lhr));
        } catch (e) {
          console.error(`[lighthouse] failed: ${(e as Error).message}`);
          manifest.errors.push(`lighthouse ${formFactor} run ${i + 1}: ${String((e as Error).message).slice(0, 120)}`);
        }
      }
      if (summaries.length) {
        const median = (xs: Array<number | null>) => {
          const v = xs.filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
          return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
        };
        const out = {
          caveat: 'Lab Lighthouse in the DI capture environment (egress proxy, simulated throttling). Compare only within this environment (D-009).',
          runs: summaries.length,
          summary: { ...summaries[0], medianPerformanceScore: median(summaries.map((s) => s.scores.performance)), medianLcp: median(summaries.map((s) => s.metrics.lcp)) },
          perRun: summaries,
        };
        const name = `lighthouse-${formFactor}.json`;
        writeJson(`${capDir}/${name}`, out);
        const text = JSON.stringify(out, null, 2) + '\n';
        manifest.files = manifest.files.filter((f: any) => f.path !== name);
        manifest.files.push({ path: name, sha256: sha256(text), bytes: Buffer.byteLength(text) });
      }
      writeJson(`${capDir}/manifest.json`, manifest);
    }
  }
}
