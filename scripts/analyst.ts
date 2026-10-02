// Analyst toolkit for OBSERVED / INFERRED observations.
//   node scripts/analyst.ts kit <ref>     → compact evidence sheet (artifacts + key VERIFIED facts)
//   node scripts/analyst.ts build <ref>   → compile datasets/observations/<ref>/analyst.src.yaml → analyst.json
//   node scripts/analyst.ts check <ref>   → fail if analyst.json is stale vs. its source
// Source format (analyst.src.yaml):
//   items:
//     - key: hero-first-read              # unique slug within the ref
//       page: home
//       viewport: 1440x900 | cross-viewport
//       category: hierarchy               # observation.schema.json category enum
//       type: OBSERVED | INFERRED
//       shots: [1440x900-top, 390x844-top] # OBSERVED: artifact states (file name without .jpg)
//       based_on: [hero-first-read, ref-001.typography.home-1440-display-size]   # INFERRED: keys or full ids
//       statement: "…"
//       confidence: 0.8
//       assessment: strength | weakness | trade-off | neutral
//       tags: [hero]
import { existsSync, readdirSync } from 'node:fs';
import { abs, readJson, readText, readYaml, writeJson } from './lib/io.ts';

type Item = {
  key: string;
  page: string;
  viewport: string;
  category: string;
  type: 'OBSERVED' | 'INFERRED';
  shots?: string[];
  regions?: string[];
  based_on?: string[];
  statement: string;
  property?: string;
  value?: unknown;
  confidence: number;
  assessment: string;
  tags?: string[];
};

function captures(ref: string) {
  const base = abs('datasets/raw', ref);
  const out: Record<string, { dir: string; manifest: any }> = {};
  if (!existsSync(base)) return out;
  for (const page of readdirSync(base)) {
    const caps = readdirSync(`${base}/${page}`).filter((c) => existsSync(`${base}/${page}/${c}/manifest.json`)).sort();
    const cap = caps.pop();
    if (cap) out[page] = { dir: `datasets/raw/${ref}/${page}/${cap}`, manifest: readJson(`${base}/${page}/${cap}/manifest.json`) };
  }
  return out;
}

export function buildAnalyst(ref: string) {
  const src = readYaml<{ items: Item[]; notes?: string }>(abs('datasets/observations', ref, 'analyst.src.yaml'));
  const caps = captures(ref);
  const verified = existsSync(abs('datasets/observations', ref, 'verified.json'))
    ? new Set(readJson<{ observations: Array<{ id: string }> }>(abs('datasets/observations', ref, 'verified.json')).observations.map((o) => o.id))
    : new Set<string>();
  const keyToId = new Map<string, string>();
  for (const it of src.items) keyToId.set(it.key, `${ref}.${it.category}.${it.page}-a-${it.key}`);
  const errors: string[] = [];
  const observations = src.items.map((it) => {
    const cap = caps[it.page];
    if (!cap) errors.push(`${it.key}: no capture for page ${it.page}`);
    const m = cap?.manifest ?? {};
    const evidence: Array<Record<string, string>> = [];
    for (const [i, s] of (it.shots ?? []).entries()) {
      const a = (m.artifacts ?? []).find((x: any) => x.file.endsWith(`/${s}.jpg`) || x.file.endsWith(`/${s}`));
      if (!a) errors.push(`${it.key}: shot ${s} not in manifest of ${it.page}`);
      else evidence.push({ artifact: a.file, sha256: a.sha256, ...(it.regions?.[i] ? { region: it.regions[i] } : {}) });
    }
    for (const b of it.based_on ?? []) {
      const id = keyToId.get(b) ?? b;
      if (!keyToId.has(b) && !verified.has(b)) errors.push(`${it.key}: based_on ${b} is neither a local key nor a VERIFIED id`);
      evidence.push({ observation: id });
    }
    return {
      id: keyToId.get(it.key)!,
      ref_id: ref,
      page: it.page,
      source_url: m.url,
      capture_id: m.capture_id,
      captured_at: m.started_at,
      viewport: it.viewport,
      category: it.category,
      property: it.property ?? it.key,
      value: it.value ?? (it.type === 'OBSERVED' ? 'see statement' : 'see statement'),
      evidence_type: it.type,
      method: it.type === 'OBSERVED' ? (it.shots?.some((s) => s.includes('frame')) ? 'frame-sequence' : (it.shots ?? []).some((s) => /menu|hover|focus/.test(s)) ? 'interaction' : 'screenshot') : 'analyst-judgment',
      evidence,
      statement: it.statement,
      confidence: it.type === 'INFERRED' ? Math.min(it.confidence, 0.95) : it.confidence,
      assessment: it.assessment,
      ...(it.tags ? { tags: it.tags } : {}),
    };
  });
  const keys = new Set<string>();
  for (const it of src.items) {
    if (keys.has(it.key)) errors.push(`duplicate key ${it.key}`);
    keys.add(it.key);
  }
  return { observations, errors, notes: src.notes };
}

function kit(ref: string) {
  const caps = captures(ref);
  const lines: string[] = [`# Evidence sheet ${ref}`];
  for (const [page, { dir, manifest }] of Object.entries(caps)) {
    lines.push(`\n## page ${page}  (${manifest.url})  capture ${manifest.capture_id}  consent=${manifest.consent?.action}  blocked=${manifest.blocked}`);
    lines.push(`raw: ${dir}`);
    const shots = (manifest.artifacts ?? []).filter((a: any) => a.kind === 'screenshot' || a.kind === 'frame');
    lines.push(`shots (${shots.length}): ` + shots.map((a: any) => a.file.split('/').pop().replace(/\.jpg$/, '')).join(', '));
    lines.push(`artifact dir: ${shots[0]?.file.split('/').slice(0, -1).join('/')}`);
  }
  const vpath = abs('datasets/observations', ref, 'verified.json');
  if (existsSync(vpath)) {
    const obs = readJson<{ observations: Array<{ id: string; value: unknown; assessment: string }> }>(vpath).observations;
    const pick = /display-size$|display-size-vw$|display-line-height$|display-tracking$|display-family$|display-transform$|body-size$|scale-range$|reading-chars-per-line$|family-share$|uppercase-share$|widest-container$|page-height-vh$|scheme$|background-palette$|button-backgrounds$|gradient-area$|low-contrast-normal-share$|header$|buttons$|card-groups$|effects$|menu$|transition-duration$|animations$|landmarks$|axe-by-impact$|focus-indicator-share$|cls-before-interaction$|transfer-bytes$|long-tasks$|library-evidence$|globals$|canvas-contexts$|reduced-motion-response$|scroll-linked-changes$|display-size-curve$|display-lines-curve$|container-curve$|header-toggles-curve$|lighthouse|text-align$|digits$|mixed-runs$|logical-properties$|mirrored-icons$|webfonts$|text-over-media$|horizontal-overflow$/;
    lines.push(`\n## key VERIFIED facts (${obs.length} total; ${obs.filter((o) => o.assessment === 'weakness').length} threshold weaknesses)`);
    const compact = process.argv.includes('--full') ? () => true : (id: string) => /-(390|1440|xvp)-/.test(id);
    for (const o of obs.filter((o) => pick.test(o.id) && compact(o.id))) lines.push(`${o.id.replace(ref + '.', '')}${o.assessment === 'weakness' ? ' [WEAK]' : ''} = ${JSON.stringify(o.value).slice(0, process.argv.includes('--full') ? 260 : 160)}`);
  }
  console.log(lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ref] = process.argv.slice(2);
  if (cmd === 'kit') kit(ref);
  else if (cmd === 'build' || cmd === 'check') {
    const { observations, errors, notes } = buildAnalyst(ref);
    if (errors.length) {
      for (const e of errors) console.error(`ERROR ${e}`);
      process.exit(1);
    }
    const out = abs('datasets/observations', ref, 'analyst.json');
    if (cmd === 'check') {
      const cur = existsSync(out) ? readJson<{ observations: unknown[] }>(out).observations : [];
      const same = JSON.stringify(cur) === JSON.stringify(observations);
      console.log(same ? `${ref}: analyst.json up to date` : `${ref}: analyst.json STALE — run build`);
      process.exit(same ? 0 : 1);
    }
    writeJson(out, { ref_id: ref, authorship: 'analyst', generator: 'scripts/analyst.ts from analyst.src.yaml', generated_at: new Date().toISOString(), ...(notes ? { notes } : {}), observations });
    console.log(`${ref}: ${observations.length} analyst observations (${observations.filter((o) => o.evidence_type === 'OBSERVED').length} OBSERVED, ${observations.filter((o) => o.evidence_type === 'INFERRED').length} INFERRED)`);
  } else {
    console.error('usage: node scripts/analyst.ts kit|build|check <ref>');
    process.exit(2);
  }
  void readText;
}
