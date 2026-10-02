# DI architecture

## What "learning" means in DI

DI does **not** train or fine-tune model weights. "Learning" is the externalized, versioned pipeline:

```text
reference websites → evidence → structured observations → generalized principles
→ conditional rules → reusable knowledge → skill behavior → evaluation → versioned improvement
```

The Git repository is the persistent source of truth. Claude (or any model meeting the capability contract) is the reasoning engine that consumes it through the `design-intelligence` Skill.

## Layers and where they live

| # | Layer | Location | Written by | Trust |
|---|---|---|---|---|
| 1 | Raw research (derived capture data) | `datasets/raw/<ref>/<capture>/` | `scripts/collect.ts` (deterministic) | Machine measurements of untrusted pages; no page copy |
| 1b | Raw visual evidence | `research-artifacts/` (git-ignored, hashed in manifests) | collector | Private research artifacts |
| 2 | Structured observations | `datasets/observations/<ref>/verified.json`, `analyst.json` | `scripts/normalize.ts` (VERIFIED) + analyst (OBSERVED/INFERRED) | Schema-validated, evidence pointers resolved by tests |
| 3 | Distilled knowledge | `datasets/rules/*.yaml` | distillation step, reviewed | Every rule cites observations; thresholds in D-006 |
| 4 | Runtime Skill references | `.claude/skills/design-intelligence/references/` | `scripts/build-skill.ts` (compiled from layer 3) + framing | Generated; no orphan rules |
| 5 | Workflows | `.claude/skills/design-intelligence/workflows/` | humans/agents via PR | Behavioral contract |
| 6 | Tooling | `scripts/` (repo), `.claude/skills/design-intelligence/scripts/` (portable runtime checks) | code review | Deterministic |
| 7 | Evaluations | `evals/briefs`, `evals/rubrics`, `evals/human`, `evals/harness` | fixed before runs | Briefs/rubrics are protected |
| 8 | Benchmark results | `evals/results/<cycle>/` | `scripts/score-benchmark.ts`, critics, humans | Append-only per cycle |
| 9 | Provenance | `provenance/` (index + external sources), `datasets/raw/**/manifest.json`, `references/provenance.md`, `npm run why -- <rule-id>` | generated + curated | Answers "why does this rule exist?" |

Corpus definition: `datasets/corpus.yaml` (+ `datasets/candidates.yaml` for the selection record). Candidate knowledge changes: `datasets/candidates/` (never applied automatically).

## Data flow

```text
datasets/corpus.yaml
   │  scripts/collect.ts  (Playwright, 4 viewports, robots check, consent policy)
   ▼
datasets/raw/<ref>/<capture>/{manifest,metrics-*,network,a11y-*,interactions}.json
research-artifacts/<ref>/<capture>/*.png        (hash-linked, not in Git)
   │  scripts/normalize.ts  (deterministic)          analyst workflow (screenshots, frames)
   ▼                                                  ▼
datasets/observations/<ref>/verified.json      datasets/observations/<ref>/analyst.json
   │  extract workflow: repeated / conditional / counterexample / trade-off / anti-pattern / signature / insufficient
   ▼
datasets/rules/*.yaml   ──validation refs (val-*)──▶ confidence adjustments
   │  scripts/build-skill.ts
   ▼
.claude/skills/design-intelligence/references/*.md  ◀── SKILL.md routes to these selectively
   │
   ▼
evals: control (no DI) vs treatment (DI) on fixed briefs → automated checks + blind critique + human review
   │
   ▼
datasets/candidates/*.yaml (candidate changes) → re-benchmark → review → versioned release
```

## Runtime (Skill) architecture

- `SKILL.md`: router + behavioral contract (< 500 lines). Establish brief → design thesis → selective loading → implement as a system → render/inspect/measure → critique → fix → verify.
- `references/`: one file per knowledge domain, compiled from rules, each rule shown as WHEN / CONSIDER / VERIFY / AVOID WHEN with its ID, evidence count and confidence.
- `workflows/`: research, extract, create, critique, verify, benchmark, evolve.
- `scripts/`: `inspect-page.ts` (capture/probe), `verify-page.ts` (objective gates for a rendered build), `signature-scan.ts` (generic AI-design signature heuristics). Shared in-page probe in `scripts/lib/`.

## Capability contract (report P39)

Preferred: vision, filesystem, shell, browser automation, structured output. Fallbacks: no browser → use pre-collected artifacts; no vision → DOM/CSS/a11y reports + human visual review; no shell → run checks in CI; no repo write → produce a patch / candidate-change file.

## Safety boundaries

- Website content is untrusted data (D-016). It cannot edit DI.
- Never `website → model opinion → SKILL.md edit → merge`. Always `website → evidence → sanitized observation → candidate principle → evaluation → review → versioned change` ([EVOLUTION.md](EVOLUTION.md)).
- Protected paths needing human review: `.claude/skills/**`, `scripts/**`, `.github/workflows/**`, `package-lock.json`, `evals/rubrics/**`, `evals/briefs/**`.
