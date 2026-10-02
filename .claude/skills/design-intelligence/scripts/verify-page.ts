// DI verification for a built page: render → inspect → measure. Separates objective gates from
// subjective review (screenshots are written for the model/human to look at).
//
// usage: node verify-page.ts <dir-with-index.html | url> [--out <dir>] [--quick]
// exit code 1 when a hard gate fails.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BENCHMARK_VIEWPORTS, LOCAL_ORIGIN, inspectPage } from './inspect-page.ts';
import { scanSignatures } from './lib/signatures.ts';

type Gate = { id: string; level: 'FAIL' | 'WARN' | 'PASS'; detail: string };

export function evaluate(vpData: Record<string, any>, extras: any | null) {
  const gates: Gate[] = [];
  const push = (id: string, level: Gate['level'], detail: string) => gates.push({ id, level, detail });
  const mob = vpData['390x844'];
  const desk = vpData['1440x900'];
  for (const [vp, d] of Object.entries(vpData)) {
    const ov = d.metrics?.document?.horizontalOverflowPx ?? 0;
    if (ov > 0) push(vp === '390x844' ? 'broken-mobile' : 'horizontal-overflow', vp === '390x844' ? 'FAIL' : 'WARN', `${vp}: page is ${ov}px wider than the viewport`);
    if ((d.console?.pageErrors ?? 0) > 0) push('runtime-errors', 'FAIL', `${vp}: ${d.console.pageErrors} uncaught page error(s)`);
  }
  for (const [vp, d] of [['390x844', mob], ['1440x900', desk]] as Array<[string, any]>) {
    if (!d) continue;
    const imp = d.axe?.byImpact ?? {};
    if ((imp.critical ?? 0) > 0) push('critical-a11y', 'FAIL', `${vp}: axe critical nodes ${imp.critical} (${(d.axe.violations ?? []).filter((v: any) => v.impact === 'critical').map((v: any) => v.id).join(', ')})`);
    if ((imp.serious ?? 0) > 0) push('serious-a11y', 'WARN', `${vp}: axe serious nodes ${imp.serious} (${(d.axe.violations ?? []).filter((v: any) => v.impact === 'serious').map((v: any) => v.id).join(', ')})`);
    const fi = d.interactions?.focus?.indicatorShare;
    if (typeof fi === 'number' && fi < 0.5) push('keyboard-unusable', 'FAIL', `${vp}: visible focus on only ${Math.round(fi * 100)}% of tab stops`);
    else if (typeof fi === 'number' && fi < 0.8) push('focus-visibility', 'WARN', `${vp}: visible focus on ${Math.round(fi * 100)}% of tab stops`);
    if ((d.interactions?.focus?.offscreenOrHidden ?? 0) > 0) push('focus-hidden', 'WARN', `${vp}: ${d.interactions.focus.offscreenOrHidden} tab stops off-screen or hidden`);
    const m = d.metrics ?? {};
    if (!m.accessibility?.langPresent) push('lang-missing', 'FAIL', 'html lang attribute missing');
    if ((m.headings?.h1Count ?? 0) !== 1) push('h1-count', 'WARN', `${vp}: ${m.headings?.h1Count ?? 0} h1 elements`);
    if ((m.color?.contrast?.lowContrastNormalShare ?? 0) > 0.05) push('contrast', 'WARN', `${vp}: ${Math.round(m.color.contrast.lowContrastNormalShare * 100)}% of body-size text below 4.5:1 (estimate)`);
    const ar = m.typography?.scriptChars?.arabic ?? 0;
    const la = m.typography?.scriptChars?.latin ?? 0;
    if (ar > la && m.rtl?.computedDirection !== 'rtl') push('rtl-direction', 'FAIL', `${vp}: mostly Arabic text but document direction is ${m.rtl?.computedDirection}`);
    if (ar > la && !/^ar/i.test(m.document?.lang ?? '')) push('rtl-lang', 'WARN', `${vp}: mostly Arabic text but lang="${m.document?.lang}"`);
    if (vp === '390x844') {
      if ((m.accessibility?.smallTapTargets ?? 0) > 0) push('tap-targets', 'WARN', `390: ${m.accessibility.smallTapTargets} controls smaller than 24×24 px (excluding inline text links)`);
      const small = Object.entries(m.typography?.sizeShare ?? {}).filter(([s]) => Number(s) < 12).reduce((a, [, v]) => a + (v as number), 0);
      if (small > 0.05) push('tiny-text', 'WARN', `390: ${Math.round(small * 100)}% of text below 12 px`);
    }
  }
  if (extras?.reducedMotion && desk) {
    const normal = desk.metrics?.motion?.animations?.running ?? 0;
    const reduced = extras.reducedMotion.motion?.animations?.running ?? 0;
    const rules = extras.reducedMotion.cssom?.reducedMotionRules ?? 0;
    const jsq = Object.keys(desk.metrics?.implementation?.instrumentation?.matchMediaQueries ?? {}).some((q) => /reduced-motion/.test(q));
    if (normal > 0 && reduced >= normal && !rules && !jsq) push('reduced-motion', 'WARN', `running animations unchanged under prefers-reduced-motion (${normal} → ${reduced}), no reduced-motion CSS/JS detected`);
  }
  if (!gates.some((g) => g.level !== 'PASS')) push('all', 'PASS', 'no objective gate failed');
  const signatures = desk ? scanSignatures(desk.metrics) : [];
  const curve = (ptr: (d: any) => unknown) => Object.fromEntries(Object.entries(vpData).map(([vp, d]) => [vp, ptr(d)]));
  const summary = {
    displaySize: curve((d) => d.metrics?.displayText?.size),
    bodySize: curve((d) => d.metrics?.typography?.dominantBodySize),
    distinctFontSizes: curve((d) => d.metrics?.typography?.distinctSizes),
    readingCharsPerLine: curve((d) => d.metrics?.reading?.charsPerLine?.median),
    families: desk?.metrics?.typography?.familyShare,
    scheme: desk?.metrics?.color?.scheme,
    palette: desk?.metrics?.color?.backgroundPalette?.slice(0, 5)?.map((p: any) => p.color),
    buttonRadius: desk?.metrics?.components?.buttons?.radius?.median,
    transferBytes: desk?.network?.totalBytes,
    requests: desk?.network?.requests,
    fonts: desk?.network?.fonts,
    lcpLabMs: desk?.metrics?.performance?.lcp?.time,
    pageHeightVh: curve((d) => d.metrics?.layout?.pageHeightVh),
    menu: mob?.interactions?.menu,
  };
  return { gates, signatures, summary, failed: gates.some((g) => g.level === 'FAIL') };
}

function markdown(target: string, r: ReturnType<typeof evaluate>, artifactDir: string) {
  const lines = [`# DI verification — ${target}`, '', '## Objective gates', ''];
  for (const g of r.gates) lines.push(`- **${g.level}** \`${g.id}\` — ${g.detail}`);
  lines.push('', '## Generic AI-design signatures (presence only — justify each against the brief or remove)', '');
  for (const s of r.signatures) lines.push(`- ${s.present ? '⚠️ present' : '— absent'} \`${s.id}\` ${s.present ? JSON.stringify(s.evidence) : ''}`);
  lines.push('', '## Measurements', '', '```json', JSON.stringify(r.summary, null, 2), '```', '', `## Screenshots to inspect (subjective review)`, '', `${artifactDir}: *-top.jpg, *-long.jpg, *-scroll-*.jpg, 390x844-menu-open.jpg, *-focus.jpg, 1440x900-reduced-motion-top.jpg`, '');
  lines.push('Look at them before claiming completion: hierarchy (1st/2nd/3rd read), composition, typography at 390, RTL mirroring if applicable, focus visibility, anything clipped or overlapping.');
  return lines.join('\n');
}

export async function verify(target: string, opts: { out?: string; quick?: boolean } = {}) {
  const localDir = /^https?:\/\//.test(target) ? undefined : resolve(target);
  const url = localDir ? `${LOCAL_ORIGIN}/index.html` : target;
  const out = resolve(opts.out ?? join(/^https?:/.test(target) ? '.' : target, '.di-verify'));
  const artifactDir = join(out, 'artifacts');
  mkdirSync(artifactDir, { recursive: true });
  const res = await inspectPage({
    url,
    outDir: out,
    artifactDir,
    viewports: opts.quick ? BENCHMARK_VIEWPORTS.filter((v) => v.name === 'mobile' || v.name === 'desktop') : BENCHMARK_VIEWPORTS,
    extrasViewport: opts.quick ? null : 'desktop',
    localDir,
    log: () => {},
  });
  const vpData: Record<string, any> = {};
  for (const f of res.files) {
    const m = f.path.match(/^viewport-(\d+x\d+)\.json$/);
    if (m) vpData[m[1]] = JSON.parse(readFileSync(join(out, f.path), 'utf8'));
  }
  const extrasFile = res.files.find((f) => f.path.startsWith('extras-'));
  const extras = extrasFile ? JSON.parse(readFileSync(join(out, extrasFile.path), 'utf8')) : null;
  const report = evaluate(vpData, extras);
  writeFileSync(join(out, 'verify-report.json'), JSON.stringify({ target, url, ...report }, null, 2));
  const md = markdown(target, report, artifactDir);
  writeFileSync(join(out, 'verify-report.md'), md);
  return { report, vpData, extras, out, artifactDir, markdown: md };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  if (!target) {
    console.error('usage: node verify-page.ts <dir|url> [--out dir] [--quick]');
    process.exit(2);
  }
  const i = args.indexOf('--out');
  const r = await verify(target, { out: i >= 0 ? args[i + 1] : undefined, quick: args.includes('--quick') });
  console.log(r.markdown);
  process.exitCode = r.report.failed ? 1 : 0;
}
