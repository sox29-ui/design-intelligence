// Compile datasets/rules/**.yaml into .claude/skills/design-intelligence/references/*.md (D-012).
// Each reference = hand-written framing (references/_framing/<file>.md, optional) + generated rule cards.
// Only rules with status provisional/accepted/weakened are compiled. Hypotheses compile into an
// "open questions" list, never as guidance.
// Usage: node scripts/build-skill.ts [--check]   (--check fails if references are stale)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { abs, readYaml } from './lib/io.ts';
import { COMPILED_STATUSES, loadCorpus, loadRules } from './validate.ts';

const SKILL = '.claude/skills/design-intelligence';

/** Which reference file each domain compiles into. */
export const ROUTES: Record<string, string> = {
  typography: 'typography.md',
  layout: 'layout-responsive.md',
  responsive: 'layout-responsive.md',
  hierarchy: 'layout-responsive.md',
  color: 'color-theme.md',
  motion: 'motion-interaction.md',
  components: 'components.md',
  accessibility: 'accessibility-performance.md',
  performance: 'accessibility-performance.md',
  rtl: 'arabic-rtl.md',
  content: 'components.md',
  implementation: 'implementation-patterns.md',
  process: 'design-principles.md',
};
const TITLES: Record<string, string> = {
  'typography.md': 'Typography intelligence',
  'layout-responsive.md': 'Layout, hierarchy & responsive intelligence',
  'color-theme.md': 'Colour & theme intelligence',
  'motion-interaction.md': 'Motion & interaction intelligence',
  'components.md': 'Component & content intelligence',
  'accessibility-performance.md': 'Accessibility & performance intelligence',
  'arabic-rtl.md': 'Arabic / RTL intelligence',
  'implementation-patterns.md': 'Implementation patterns',
  'design-principles.md': 'Cross-cutting design principles',
  'anti-patterns.md': 'Anti-pattern intelligence',
  'signatures.md': 'Non-generalizable signatures (do NOT reuse)',
};

type Rule = any;

function refLabel(id: string, names: Map<string, string>) {
  return `${id}${names.has(id) ? ` (${names.get(id)})` : ''}`;
}

function card(r: Rule, names: Map<string, string>): string {
  const L: string[] = [];
  const status = r.status === 'weakened' ? ' · ⚠️ weakened' : r.status === 'provisional' ? ' · provisional' : '';
  L.push(`### ${r.title}`);
  L.push(`<!-- rule:${r.id} -->`);
  L.push(`\`${r.id}\` · ${r.kind} · confidence **${r.confidence}** · evidence: ${r.evidence_count} independent ref(s)${(r.evidence.external ?? []).length ? ` + ${(r.evidence.external ?? []).length} standard(s)` : ''}${status}`);
  L.push('');
  L.push(`**${r.statement}**`);
  L.push('');
  const when = Object.entries(r.when ?? {});
  if (when.length) L.push(`- **WHEN:** ${when.map(([k, v]) => `${k} ∈ {${(v as string[]).join(', ')}}`).join('; ')}`);
  if (r.consider?.length) L.push(`- **CONSIDER:** ${r.consider.join('; ')}`);
  if (r.verify?.length) L.push(`- **VERIFY:** ${r.verify.join('; ')}`);
  if (r.avoid_when?.length) L.push(`- **AVOID WHEN:** ${r.avoid_when.join('; ')}`);
  if (r.trade_offs?.length) L.push(`- **TRADE-OFFS:** ${r.trade_offs.join('; ')}`);
  if (r.rationale) L.push(`- **WHY (inferred):** ${r.rationale}`);
  const sup = (r.evidence.supporting ?? []).map((s: any) => refLabel(s.ref, names));
  const cex = (r.evidence.counterexamples ?? []).map((s: any) => `${refLabel(s.ref, names)}${s.note ? ` — ${s.note}` : ''}`);
  const val = (r.evidence.validation ?? []).map((v: any) => `${v.ref}: ${v.result}`);
  const ext = (r.evidence.external ?? []).map((x: any) => x.source_id);
  const ev = [sup.length ? `supported by ${sup.join(', ')}` : '', cex.length ? `counterexamples: ${cex.join('; ')}` : '', val.length ? `validation: ${val.join(', ')}` : '', ext.length ? `standards: ${ext.join(', ')}` : ''].filter(Boolean);
  if (ev.length) L.push(`- *Evidence:* ${ev.join(' · ')}. Details: \`npm run why -- ${r.id}\`.`);
  L.push('');
  return L.join('\n');
}

export function compile(): Map<string, string> {
  const corpus = loadCorpus();
  const names = new Map((corpus?.references ?? []).map((r: any) => [r.id, r.name]));
  const rules: Rule[] = loadRules().map((x) => x.rule as Rule).filter((r) => r?.id);
  const files = new Map<string, { guidance: Rule[]; hypotheses: Rule[] }>();
  const bucket = (f: string) => files.get(f) ?? files.set(f, { guidance: [], hypotheses: [] }).get(f)!;
  for (const r of rules) {
    const file = r.kind === 'anti-pattern' ? 'anti-patterns.md' : r.kind === 'signature' ? 'signatures.md' : ROUTES[r.domain] ?? 'design-principles.md';
    if (r.kind === 'hypothesis') bucket(file).hypotheses.push(r);
    else if (COMPILED_STATUSES.has(r.status)) bucket(file).guidance.push(r);
  }
  for (const f of Object.keys(TITLES)) bucket(f);
  const out = new Map<string, string>();
  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  for (const [file, { guidance, hypotheses }] of files) {
    const framingPath = abs(SKILL, 'references', '_framing', file);
    const framing = existsSync(framingPath) ? readFileSync(framingPath, 'utf8').trim() + '\n\n' : '';
    const L: string[] = [];
    L.push(`# ${TITLES[file] ?? file}`);
    L.push('');
    L.push(`> Generated by \`scripts/build-skill.ts\` from \`datasets/rules/\` — do not edit by hand. Framing text: \`references/_framing/${file}\`.`);
    L.push('> Rules are conditional: apply a rule only when its WHEN matches the brief; always run its VERIFY items; respect AVOID WHEN.');
    L.push('');
    if (framing) L.push(framing);
    guidance.sort((a, b) => (order[a.confidence] - order[b.confidence]) || a.id.localeCompare(b.id));
    if (guidance.length) {
      L.push(`## Rules (${guidance.length})`);
      L.push('');
      for (const r of guidance) L.push(card(r, names));
    } else L.push('_No compiled rules in this domain yet._\n');
    if (hypotheses.length) {
      L.push('## Open questions (hypotheses — NOT guidance)');
      L.push('');
      for (const h of hypotheses) L.push(`- \`${h.id}\` — ${h.statement} _(insufficient evidence: ${h.confidence_basis})_`);
      L.push('');
    }
    out.set(file, L.join('\n').replace(/\n{3,}/g, '\n\n'));
  }
  // Provenance index for the skill (rule → evidence summary).
  const P: string[] = ['# Provenance index', '', '> Generated. Every compiled rule with its evidence base. Full chain (observations, pointers, screenshots hashes): `npm run why -- <rule-id>` in the DI repository.', ''];
  P.push('| Rule | Kind | Conf. | Supporting refs | Counterexamples | Validation | Standards |');
  P.push('|---|---|---|---|---|---|---|');
  for (const r of rules.filter((x) => COMPILED_STATUSES.has(x.status) || x.kind === 'hypothesis').sort((a, b) => a.id.localeCompare(b.id))) {
    const sup = (r.evidence.supporting ?? []).map((s: any) => s.ref).join(', ') || '—';
    const cex = (r.evidence.counterexamples ?? []).map((s: any) => s.ref).join(', ') || '—';
    const val = (r.evidence.validation ?? []).map((v: any) => `${v.ref}:${v.result}`).join(', ') || '—';
    const ext = (r.evidence.external ?? []).map((x: any) => x.source_id).join(', ') || '—';
    P.push(`| \`${r.id}\` | ${r.kind} | ${r.confidence} | ${sup} | ${cex} | ${val} | ${ext} |`);
  }
  P.push('', 'Reference IDs map to `datasets/corpus.yaml` (ref-* extraction, val-* validation). Holdout references never appear here.');
  out.set('provenance.md', P.join('\n') + '\n');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = compile();
  let stale = 0;
  for (const [file, text] of out) {
    const p = abs(SKILL, 'references', file);
    const cur = existsSync(p) ? readFileSync(p, 'utf8') : '';
    if (cur !== text) {
      stale++;
      if (!process.argv.includes('--check')) writeFileSync(p, text);
    }
  }
  if (process.argv.includes('--check')) {
    console.log(stale ? `skill references STALE (${stale} file(s)) — run npm run skill:build` : 'skill references up to date');
    process.exit(stale ? 1 : 0);
  }
  console.log(`compiled ${out.size} reference files (${stale} changed)`);
  void readYaml;
}
