// Benchmark aggregation (PROTOCOL.md step 5). Run only after critic (and, when available, human) scoring:
// it opens the sealed blind key.
//   node scripts/bench-report.ts <cycle>   → evals/results/<cycle>/summary.json + tables.md
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { abs, readJson, readYaml, writeJson } from './lib/io.ts';

type Scores = Record<string, number>;
const DIMS = ['brief_fidelity', 'hierarchy_usability', 'originality_art_direction', 'responsive_quality', 'accessibility', 'performance', 'system_consistency'];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const r1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export function weightedTotal(scores: Scores, weights: Record<string, number>) {
  let t = 0;
  for (const [d, w] of Object.entries(weights)) t += (w * (scores[d] ?? 0)) / 5;
  return t;
}

function main() {
  const cycle = process.argv[2];
  if (!cycle) { console.error('usage: node scripts/bench-report.ts <cycle>'); process.exit(2); }
  const dir = abs('evals', 'results', cycle);
  const card = readYaml<any>(abs('evals', 'rubrics', 'scorecard.yaml'));
  const auto = readJson<any>(`${dir}/automated.json`);
  const key = readJson<any>(`${dir}/blind-key.SEALED.json`).key as Record<string, { condition: string; run: string }>;
  const critics = readdirSync(dir).filter((f) => /^critic-[A-D]\.json$/.test(f)).map((f) => readJson<any>(`${dir}/${f}`));
  const rows: any[] = [];
  for (const [bid, k] of Object.entries(key)) {
    const a = auto.outputs[`${k.condition}/${k.run}`];
    const brief = bid.split('-')[0];
    const critic = critics.find((c) => String(c.brief).startsWith(brief));
    const co = critic?.outputs?.find((o: any) => o.blind_id === bid);
    // Critics return ranking as IDs or as { rank, blind_id } objects.
    const ranking: string[] = critic?.ranking ? [...critic.ranking].sort((x: any, y: any) => (x?.rank ?? 0) - (y?.rank ?? 0)).map((x: any) => (typeof x === 'string' ? x : x.blind_id)) : [];
    const rank = ranking.length ? ranking.indexOf(bid) + 1 || null : null;
    const n = ranking.length || null;
    rows.push({
      blind_id: bid, brief, condition: k.condition, run: k.run,
      critic: co ? { scores: co.scores, total: r1(weightedTotal(co.scores, card.weights)), unjustified: (co.unjustified_signatures ?? []).length, gates: co.hard_gate_failures ?? [], idea_from_brief: co.idea_from_brief, rank, of: n, findings: (co.findings ?? []).reduce((m: Record<string, number>, f: any) => ((m[f.level ?? f.severity] = (m[f.level ?? f.severity] ?? 0) + 1), m), {}) } : null,
      automated: a ? {
        failedGates: a.gates.filter((g: any) => g.level === 'FAIL').map((g: any) => g.id),
        warnings: a.gates.filter((g: any) => g.level === 'WARN').map((g: any) => g.id),
        signatures: a.signatures.map((s: any) => s.id),
        axeSeriousCritical: Object.values(a.axe ?? {}).reduce((s: number, x: any) => s + (x?.serious ?? 0) + (x?.critical ?? 0), 0),
        focusMin: Math.min(...Object.values(a.focus ?? {}).filter(Boolean).map((f: any) => f.share ?? 1)),
        lighthouse: a.lighthouseMobile?.scores ?? null,
        lcpMs: a.lighthouseMobile?.metrics?.lcp ?? null,
        bytes: a.lighthouseMobile?.stable?.totalByteWeight ?? a.summary?.transferBytes ?? null,
        families: a.static?.googleFontFamilies ?? [],
        reducedMotion: a.static?.reducedMotion,
        logicalShare: a.static ? r2(a.static.logicalProps / Math.max(1, a.static.logicalProps + a.static.physicalInlineProps)) : null,
        customProps: a.static?.customPropertiesDeclared,
        distinctFontSizes: a.static?.distinctFontSizeDeclarations,
      } : null,
    });
  }
  const conds = [...new Set(rows.map((r) => r.condition))].sort();
  const briefs = [...new Set(rows.map((r) => r.brief))].sort();
  const agg = (sel: any[]) => ({
    n: sel.length,
    criticTotal: r1(mean(sel.filter((r) => r.critic).map((r) => r.critic.total))),
    dims: Object.fromEntries(DIMS.map((d) => [d, r2(mean(sel.filter((r) => r.critic).map((r) => r.critic.scores[d])))])),
    meanRank: r2(mean(sel.filter((r) => r.critic?.rank).map((r) => r.critic.rank))),
    unjustifiedSignatures: r2(mean(sel.filter((r) => r.critic).map((r) => r.critic.unjustified))),
    criticGateFailures: sel.filter((r) => r.critic?.gates?.length).length,
    automatedGateFailures: sel.filter((r) => r.automated?.failedGates?.length).length,
    signaturesPresent: r2(mean(sel.map((r) => r.automated?.signatures?.length ?? 0))),
    axeSeriousCritical: r2(mean(sel.map((r) => r.automated?.axeSeriousCritical ?? 0))),
    lhPerformance: r2(mean(sel.filter((r) => r.automated?.lighthouse).map((r) => r.automated.lighthouse.performance))),
    lhAccessibility: r2(mean(sel.filter((r) => r.automated?.lighthouse).map((r) => r.automated.lighthouse.accessibility))),
    kb: r1(mean(sel.filter((r) => r.automated?.bytes).map((r) => r.automated.bytes / 1024))),
  });
  const summary = {
    cycle,
    generated: new Date().toISOString(),
    byCondition: Object.fromEntries(conds.map((c) => [c, agg(rows.filter((r) => r.condition === c))])),
    byBrief: Object.fromEntries(briefs.map((b) => [b, Object.fromEntries(conds.map((c) => [c, agg(rows.filter((r) => r.brief === b && r.condition === c))]))])),
    diversity: auto.diversity,
    rows,
  };
  writeJson(`${dir}/summary.json`, summary);
  const L: string[] = [];
  L.push(`| Condition | n | Critic total (/100) | Mean rank | Unjustified signatures | Critic gate fails | Automated gate fails | Signatures present | axe serious+critical | LH perf | LH a11y | KB |`);
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of conds) { const s = summary.byCondition[c]; L.push(`| ${c} | ${s.n} | ${s.criticTotal} | ${s.meanRank} | ${s.unjustifiedSignatures} | ${s.criticGateFailures} | ${s.automatedGateFailures} | ${s.signaturesPresent} | ${s.axeSeriousCritical} | ${s.lhPerformance} | ${s.lhAccessibility} | ${s.kb} |`); }
  L.push('', `| Dimension (1–5) | ${conds.join(' | ')} |`, `|---|${conds.map(() => '---').join('|')}|`);
  for (const d of DIMS) L.push(`| ${d} | ${conds.map((c) => summary.byCondition[c].dims[d]).join(' | ')} |`);
  L.push('', `| Brief | ${conds.map((c) => `${c} total`).join(' | ')} | ${conds.map((c) => `${c} rank`).join(' | ')} |`, `|---|${conds.map(() => '---').join('|')}|${conds.map(() => '---').join('|')}|`);
  for (const b of briefs) L.push(`| ${b} | ${conds.map((c) => summary.byBrief[b][c].criticTotal).join(' | ')} | ${conds.map((c) => summary.byBrief[b][c].meanRank).join(' | ')} |`);
  L.push('', '| Output | Brief | Condition | Critic total | Rank | Unjustified sig. | Automated FAIL | Signatures | LH perf/a11y | KB |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.sort((a, b) => a.brief.localeCompare(b.brief) || a.condition.localeCompare(b.condition) || a.run.localeCompare(b.run))) {
    L.push(`| ${r.blind_id} (${r.run}) | ${r.brief} | ${r.condition} | ${r.critic?.total ?? '—'} | ${r.critic?.rank ?? '—'}/${r.critic?.of ?? '—'} | ${r.critic?.unjustified ?? '—'} | ${r.automated?.failedGates?.join(', ') || '—'} | ${r.automated?.signatures?.join(', ') || '—'} | ${r.automated?.lighthouse ? `${r.automated.lighthouse.performance}/${r.automated.lighthouse.accessibility}` : '—'} | ${r.automated?.bytes ? Math.round(r.automated.bytes / 1024) : '—'} |`);
  }
  writeFileSync(`${dir}/tables.md`, L.join('\n') + '\n');
  console.log(L.join('\n'));
  if (!existsSync(`${dir}/human`)) console.log('\n(no human scores yet — evals/human/README.md)');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
