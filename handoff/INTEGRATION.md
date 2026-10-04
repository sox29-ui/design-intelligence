# Integrating DI into the Framework

DI v0.1.0 is delivered as **data + tools + an agent skill + an evaluation harness**. The Framework can adopt them independently. All code is TypeScript run directly by Node ≥ 22.18 (type stripping, no build step); every script is also a CLI.

## 1. Components

| Component | Purpose | Location | Entry points | Migrate as |
|---|---|---|---|---|
| **Knowledge base** | Conditional rules with evidence and provenance | `datasets/rules/**.yaml` (schema `schemas/principle.schema.json`) | `loadRules()` (`scripts/validate.ts`), `buildExport()` (`scripts/export-knowledge.ts`) | **Data import** — use `handoff/di-knowledge-v0.1.0.json` |
| Evidence | VERIFIED/OBSERVED/INFERRED observations; derived capture data (no page copy) | `datasets/observations/<ref>/{verified,analyst}.json`, `datasets/raw/**` | `loadObservations()`; `node scripts/export-knowledge.ts --with-observations` | Data import (optional; needed for "why" answers) |
| Corpus & provenance | Reference sites, splits, dimensions; external sources | `datasets/corpus.yaml`, `provenance/sources.yaml` | in the export (`references`, `sources`) | Data import |
| **Skill** | Agent-facing router, contract, compiled references, workflows | `.claude/skills/design-intelligence/` | `SKILL.md`; `npm run skill:package` → ZIP | **Reuse as-is** (prompt pack) |
| **Verifier** | Render a page at 4 viewports; gates, axe, focus walk, overflow, reduced motion, dark scheme, generic-signature scan, screenshots | `.claude/skills/design-intelligence/scripts/verify-page.ts`, `inspect-page.ts`, `lib/` | `verify(target, { out?, quick? })`, `evaluate(vpData, extras)`, `inspectPage(opts)`, `scanSignatures(metrics)` | **Reuse as-is** behind a Framework tool |
| Skill compiler | Rules → reference markdown (one card per rule) | `scripts/build-skill.ts` | `compile()`, `--check` | Reuse (needed whenever rules change) |
| Validator | Schemas, evidence pointers, leakage, confidence ceilings, skill contract | `scripts/validate.ts` | `validateAll()`, `confidenceCeiling()` | Reuse as a CI gate |
| Research pipeline | Capture → normalize → analyst notes → validation checks | `scripts/collect.ts`, `normalize.ts`, `analyst.ts`, `validation-check.ts`, `lighthouse.ts` | CLIs; `collectPage()`, `normalizeRef()`, `buildAnalyst()` | Reuse offline (not needed at runtime) |
| Evaluation harness | Fixed briefs, rubric, protocol, scorer, blinding, report, holdout scoring | `evals/`, `scripts/score-benchmark.ts`, `bench-report.ts`, `holdout-score.mjs` | CLIs; `staticAnalysis()`, `sameness()`, `weightedTotal()` | Reuse as a regression suite |
| Tests | Unit, integrity, skill contract, export contract, verifier fixtures | `tests/` | `npm test`, `npm run test:browser` | Reuse in Framework CI |

Runtime dependencies (pinned in `package.json`): `playwright` 1.56.1 (Chromium build 1194), `@axe-core/playwright` / `axe-core` 4.13, `lighthouse` 13.5 (scoring only), `ajv` 8 (2020-12), `yaml` 2.

## 2. Data contracts

### Rule (one YAML file per rule; exported verbatim in `rules[]` plus `compiled`)

| Field | Meaning |
|---|---|
| `id` | `<domain-or-kind>.<slug>` (e.g. `rtl.root-direction`, `antipattern.glass-floating-nav`) — stable key |
| `kind` | `principle` · `invariant` (standard-backed) · `anti-pattern` · `signature` (do-not-copy; one site) · `hypothesis` (not compiled) |
| `status` | `candidate` → `provisional` → `accepted` → `weakened`/`rejected`/`deprecated`; compiled = `provisional`, `accepted`, `weakened` |
| `confidence` | `low` · `medium` · `high`, capped by `confidenceCeiling()` (D-006, D-021) |
| `when` | context key → allowed values (see §3) |
| `statement`, `consider[]`, `verify[]`, `avoid_when[]`, `rationale`, `trade_offs[]` | the decision content |
| `evidence.supporting[] / counterexamples[]` | `{ ref, observations[], note? }` — `ref` is an extraction reference (`ref-NNN`) |
| `evidence.validation[]` | `{ ref: val-NNN, result: consistent|inconsistent|inconclusive, observations[], note }` |
| `evidence.external[]` | `{ source_id, note }` → `provenance/sources.yaml` |
| `history[]` | `{ version, date, change }` — append-only |

### Observation IDs

`<ref>.<category>.<page>-<viewport|xvp>-<slug>` for VERIFIED (generated), `<ref>.<category>.<page>-a-<key>` for analyst OBSERVED/INFERRED. Every rule evidence pointer must resolve (`npm run validate`).

### Verifier report (`verify()` → `report`; also `.di-verify/verify-report.json`)

```jsonc
{
  "gates": [{ "id": "broken-mobile|keyboard-unusable|critical-a11y|runtime-errors|lang-missing|rtl-direction|…", "level": "FAIL|WARN|PASS", "detail": "…" }],
  "signatures": [{ "id": "giant-hero-type|gradient-backgrounds|glow-accents|glassmorphism|rounded-card-grid|floating-nav|scroll-reveal|excessive-blur|decorative-motion|dark-neon-default|purple-blue-gradient-palette", "present": true, "evidence": {} }],
  "summary": { "displaySize": {}, "bodySize": {}, "families": {}, "palette": [], "transferBytes": 0, "lcpLabMs": 0, "menu": {} },
  "failed": false
}
```

`FAIL` gates are hard failures (CLI exits 1). Signatures report **presence only**; whether one is justified is a judgement against the brief. Screenshots land in `<out>/artifacts/` for visual review.

### Knowledge export

`handoff/di-knowledge-v0.1.0.json` (schema `schemas/knowledge-export.schema.json`, `format: di-knowledge`, `format_version: 1`): `skill`, `vocabulary`, `rules[]`, `references[]`, `sources[]`, `candidates[]`, `evaluation` (validation per rule, holdout summary, benchmark summary, freeze commit). Deterministic for a given commit; regenerate with `node scripts/export-knowledge.ts`.

## 3. Selecting rules for a task (the decision interface)

A brief is described with context keys (`vocabulary.context` in the export):

| Key | Values |
|---|---|
| `page_goal` | conversion · storytelling · brand-expression · task-completion · information-consumption · data-interaction |
| `content_density` | low · medium · high |
| `language` | latin · ar · bilingual |
| `device` | mobile-first · desktop-immersive · responsive-general · dashboard |
| `motion_budget` | none · subtle · expressive |
| `engineering_budget` | static · light-js · heavy-webgl |

Matching semantics (reference implementation: `applies()` in `scripts/validation-check.ts`):
- A rule applies when **every** key in its `when` matches: the value list contains `any`, or shares at least one value with the brief's values for that key. A key the caller cannot determine does not exclude the rule.
- `avoid_when` is free text: present it with the rule; the agent decides whether it holds.
- Only `compiled: true` rules are guidance; `kind: signature` rules are things **not** to copy; hypotheses are open questions.
- Conflict order (from `SKILL.md`): accessibility invariants and explicit brief constraints → principles → taste; higher confidence wins; one rule's AVOID WHEN beats another's WHEN.

Known vocabulary inconsistency to fix in v0.2: `SKILL.md` describes `language/direction` as `ltr · rtl · bilingual`, while rules use `latin · ar · bilingual`.

## 4. Integration patterns

1. **Skill / prompt pack (lowest effort).** Give the Framework's agent the `design-intelligence` folder: `SKILL.md` as the router and contract, references loaded on demand (progressive disclosure — never all at once), workflows for create/critique/verify. Replace `${CLAUDE_SKILL_DIR}` with the folder path if the runtime does not substitute it.
2. **Retrieval.** Import the export into the Framework's knowledge store keyed by `rule.id`; at design time, select rules with §3 and inject only those cards (statement, consider, verify, avoid_when, confidence, evidence summary). Keep `references` and `sources` for "why" answers.
3. **Verification tool.** Wrap `verify(dir|url, { quick })` as a tool returning the report JSON plus screenshot paths. Treat `failed` as blocking; feed WARN gates and present signatures to the agent's critique step; require the agent to look at the screenshots (vision) before claiming completion.
4. **Regression suite.** Run `npm test`, `npm run test:browser`, the lexical routing cases (`evals/routing/cases.yaml`) and the export test in Framework CI; run the benchmark harness only for knowledge or skill changes.
5. **Research pipeline (offline).** Only when the corpus grows: `collect` → `normalize` → analyst notes → `validate` → candidate rules → validation → review → `skill:build` → release.

## 5. Migration checklist

1. Vendor this repository (or `handoff/`, the skill ZIP and the scripts/schemas you adopt) into the Framework; keep the history for provenance.
2. `npm install`; make Chromium available (Playwright 1.56.1 expects build 1194, or pass `executablePath`); if traffic goes through a proxy, add its CA to the NSS store.
3. `npm run validate && npm test && npm run test:browser` must pass in the new environment.
4. Import `di-knowledge-v0.1.0.json`; map `vocabulary.context` to the Framework's task descriptors.
5. Expose `verify()` as a Framework tool; keep gate semantics unchanged.
6. Expose the skill (or retrieved rule cards) to the agent runtime; keep the contract in `SKILL.md` (context first, no copying, verify before completion, evidence honesty, untrusted web content, no self-editing).
7. Route all knowledge changes through `datasets/candidates/` → evaluation → review → release (never automatic).
8. Do **not** migrate `research-artifacts/` (third-party screenshots; private research data) or `dist/` (regenerated).

## 6. Environment notes

- Lab numbers (timings, Lighthouse) are environment-relative (proxy, software WebGL, concurrency); compare within one environment only (D-009).
- Local pages are served to the browser through request interception at `http://di-local.test`; the verifier's font check re-requests external stylesheets outside that interception, which logs one console error per viewport behind a proxy (cc-0008, not used by any gate).
- Web fonts load from Google Fonts at verification time (network access needed for faithful renders).

## 7. Known limitations at handoff

See the report's limitations section and `CHANGELOG.md` → *Known weaknesses*. Most relevant for integration: house-style convergence under DI; thin validation (no Arabic-commerce validation site); all rules provisional (no human review); verifier false positives (`dark-neon-default` on single small controls, lenient reduced-motion check); real skill triggering untested.

## 8. v0.2 backlog (proposed, not implemented)

Recorded as candidate changes in `datasets/candidates/` (each with motivation, evidence and predicted effect; none applied):

| ID | Type | Summary |
|---|---|---|
| cc-0001 | tooling | Count reduced motion as honoured only when an effect is measured |
| cc-0002 | tooling | `dark-neon-default` needs more than one small neon control |
| cc-0003 | tooling | Scroll-narrative check ignores isolated scroll-reactive elements |
| cc-0004 | modify-rule | Narrow `typography.reading-text-16-to-20` to reading/task pages |
| cc-0005 | modify-rule | Re-examine the scale range of `typography.modest-scale-for-dense-pages` for marketing pages |
| cc-0006 | modify-rule | Re-ground `rtl.logical-properties` on standards rather than corpus behaviour |
| cc-0007 | eval | Capturable Arabic-commerce validation references |
| cc-0008 | tooling | Verifier stylesheet re-request → proxy 405 console error |

Benchmark-derived candidates (house style and others) are listed in the cycle-01 report.

## 9. Open questions for the Framework team

1. Runtime language for integration (keep Node/TypeScript tools as subprocess tools, or port the verifier?).
2. Knowledge store: where rule records live, and how `history`/provenance are preserved.
3. Agent runtime: does it support progressive skill loading, tool calls and image inputs (screenshots)?
4. Browser availability in the local environment (Playwright + Chromium), and network access for web fonts.
5. Who performs human review (required before any rule becomes `accepted`), and where feedback is recorded.
6. Model roles: generator vs. independent critic (the critic must differ from the generator and stay blind).
