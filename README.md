# DI — Design Intelligence

DI is a persistent, versioned, evidence-backed **design decision system** for the web. Its first product is a reusable Claude Code Skill, [`design-intelligence`](.claude/skills/design-intelligence/SKILL.md).

DI is **not** a website, a giant prompt, a screenshot library, a style generator or a list of trendy CSS tricks. It studies exceptional (and flawed) websites to learn *why* design decisions work, *when* they apply, *when they fail*, and *how to verify them* — then turns that into conditional, provenance-linked knowledge that a model consumes at design time.

```text
examples → evidence → patterns → conditional principles → decisions      (DI)
examples → imitation                                                      (not DI)
```

## "Learning" in DI

No model weights are trained or fine-tuned. Learning means:

```text
reference websites → evidence → structured observations → generalized principles
→ conditional rules → reusable knowledge → skill behavior → evaluation → versioned improvement
```

The repository is the source of truth; Claude is the reasoning engine that consumes it. Changes follow **evidence-driven skill evolution** ([docs/EVOLUTION.md](docs/EVOLUTION.md)), never self-editing.

## Repository map

| Concern | Location |
|---|---|
| Specification extracted from the research report | [docs/REPORT-EXTRACTION.md](docs/REPORT-EXTRACTION.md) |
| Architecture, decisions, evidence taxonomy, ethics | [docs/](docs/) |
| Research / evolution journal | [docs/JOURNAL.md](docs/JOURNAL.md) |
| Corpus (18 refs, 12 extraction / 3 validation / 3 holdout) | [datasets/corpus.yaml](datasets/corpus.yaml), [docs/CORPUS-METHODOLOGY.md](docs/CORPUS-METHODOLOGY.md) |
| Raw derived captures (hash-linked, no page copy) | `datasets/raw/` |
| Structured observations (VERIFIED / OBSERVED / INFERRED) | `datasets/observations/` |
| Distilled knowledge (conditional rules, anti-patterns, signatures) | `datasets/rules/` |
| Candidate changes (never auto-applied) | `datasets/candidates/` |
| Provenance (external sources, rule→evidence index) | `provenance/` |
| Claude Code Skill (router, references, workflows, runtime scripts) | `.claude/skills/design-intelligence/` |
| Repo tooling (collect, normalize, validate, build, why, score) | `scripts/` |
| Evaluation (briefs, rubrics, human review, harness, results) | `evals/` |
| Schemas | `schemas/` |

## Commands

```bash
npm install                      # Node ≥ 22.18 (native TS type-stripping)
npm run validate                 # schemas + provenance + leakage + skill contract
npm test                         # unit/integrity tests
npm run collect -- ref-001       # capture a corpus reference (Playwright, 4 viewports)
npm run normalize -- ref-001     # raw capture → VERIFIED observations
npm run skill:build              # compile rules → skill references
npm run why -- <rule-id>         # provenance: why does this rule exist?
npm run corpus:check             # diversity / split / studio constraints
npm run validation:check -- val-001 val-002 [--apply]   # test rules against the validation split
npm run skill:package            # deterministic ZIP of the skill → dist/
npm run test:browser             # verifier fixture tests (Chromium)
npm run bench:score -- cycle-01  # benchmark: verify + Lighthouse + static analysis → automated.json
```

See [scripts/README.md](scripts/README.md) for environment notes (browser, proxy CA).

## Evidence classes

`VERIFIED` (DOM / computed CSS / network / accessibility tree / measurable state) · `OBSERVED` (screenshots, frames, interaction) · `INFERRED` (rationale, intent, implementation hypotheses — always with confidence) · `UNVERIFIED` (could not be checked; stated explicitly). Never merged. See [docs/EVIDENCE-TAXONOMY.md](docs/EVIDENCE-TAXONOMY.md).

## Status

See [CHANGELOG.md](CHANGELOG.md) for the current version, completed milestones and **known weaknesses**.
