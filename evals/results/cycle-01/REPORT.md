# Cycle 01 report — baseline vs DI v0.1.0

**Status: final for cycle 01.** No further runs, critics or research cycles were made after this report (scope decision, 2026-10-04). Plan fixed before scoring: [`ANALYSIS-PLAN.md`](ANALYSIS-PLAN.md). Per-output data: [`tables.md`](tables.md), [`summary.json`](summary.json), [`automated.json`](automated.json), critics [`critic-A.json`](critic-A.json) … [`critic-D.json`](critic-D.json), run log [`RUNLOG.md`](RUNLOG.md).

## Summary

1. **Blind critics preferred DI in every brief.** Weighted critic score 83.8 vs 72.7 (/100), +11.1 overall; per brief A +9.8, B +13.0, C +12.8, D +10.0. In all four briefs both DI outputs ranked first and second (8 of 8 DI outputs above 9 of 9 baseline outputs). Under random ranking that complete separation has probability 1/2160 — but see the confounds below before reading it as DI's design effect.
2. **Measured quality signals improved.** No hard-gate failure in either condition. DI outputs had 0 verifier warnings (baseline 1.2 per output), 0.25 generic signatures (baseline 2.0), 0 unjustified signatures per the critics (baseline 1.0), Lighthouse mobile performance 0.99 vs 0.94, LCP 1.8 s vs 2.2 s, CLS 0.014 vs 0.039, fewer font sizes (13 vs 19) and colour literals (34 vs 50), more design tokens (52 vs 36 custom properties), logical CSS everywhere (100 % vs 44 %). Critic MEDIUM+ findings: 5 vs 30.
3. **The largest gains are in system consistency (+1.49 on a 1–5 scale), accessibility (+1.13) and performance (+0.70); the smallest is brief fidelity (+0.24).** The baseline was already strong (0 serious axe issues, 100 % visible focus in both conditions).
4. **DI introduced a house style.** DI outputs are more alike across briefs than baseline outputs (cross-brief sameness 0.70 vs 0.49): all eight are light "paper and ink" pages with hairline rules and small radii, and the critics themselves described seven of the eight with the same paper / ink / ledger / print / rules vocabulary across different briefs (baseline: one of nine). Per-brief critics cannot see this, so the scores above do not penalise it. This contradicts DI's own goal ("two outputs made with DI for different briefs should not look like the same agency made them") and is the main problem for v0.2.
5. **Cost:** DI runs used about 17 % more agent tokens (mean 426 k vs 363 k) and somewhat more time.

## Setup

| | Baseline (control) | DI (treatment) |
|---|---|---|
| Prompt | brief + output contract | identical + "read and follow `SKILL.md`" (skill files readable, nothing else) |
| Outputs | A×3, B×2, C×2, D×2 = 9 | 2 per brief = 8 |
| Agent | fresh sub-agent per run, same model and settings | same |
| Skill version | — | v0.1.0 (frozen at `e012194`; verified unchanged after generation) |

Scoring: every output rendered sequentially on an idle container with the DI verifier (4 viewports, reduced motion, dark scheme), Lighthouse mobile through a loopback server, and static code analysis; then blinded (random IDs, code comments that could reveal the condition removed, NOTES.md withheld). One independent critic per brief — a different model from the generator, told it did not make the designs — scored each output on the 7 weighted dimensions of [`../../rubrics/scorecard.yaml`](../../rubrics/scorecard.yaml) from 10 screenshots per output and a condition-neutral automated report, listed findings by severity, and ranked the outputs. No human review has been done.

Protocol deviations (all in [`RUNLOG.md`](RUNLOG.md)): an account usage limit interrupted seven runs, six resumed two days later; the project skill became discoverable to all sub-agents after a session restart — a transcript audit found **no** skill use or repository reads by any baseline run; condition names were visible in file paths; DI runs were limited to two per brief by the usage budget.

## Primary outcome — blind critic score

| Brief | Baseline (runs → score) | DI (runs → score) | Δ | Ranks (DI) |
|---|---|---|---|---|
| A — experimental landing | 75.5, 78.5, 71.5 → **75.2** | 81.5, 88.5 → **85.0** | +9.8 | 1, 2 of 5 |
| B — B2B SaaS dashboard | 70.5, 69.0 → **69.8** | 79.5, 86.0 → **82.8** | +13.0 | 1, 2 of 4 |
| C — Arabic RTL commerce | 66.0, 72.0 → **69.0** | 83.5, 80.0 → **81.8** | +12.8 | 1, 2 of 4 |
| D — editorial publication | 77.0, 74.0 → **75.5** | 89.0, 82.0 → **85.5** | +10.0 | 1, 2 of 4 |
| **Mean of briefs** | **72.4** | **83.8** | **+11.4** | |

(Condition means over all outputs: 72.7 vs 83.8.) Matched runs 1–2 only, brief A: baseline 77.0 → Δ +8.0; the conclusion does not change. All four critics rated their ranking confidence "medium".

| Dimension (1–5, critic) | Baseline | DI | Δ |
|---|---|---|---|
| Brief fidelity (25) | 3.89 | 4.13 | +0.24 |
| Hierarchy / usability (20) | 3.78 | 4.31 | +0.53 |
| Originality / art direction (15) | 3.39 | 3.94 | +0.55 |
| Responsive quality (15) | 3.61 | 3.94 | +0.33 |
| Accessibility (10) | 3.50 | 4.63 | +1.13 |
| Performance (10) | 3.61 | 4.31 | +0.70 |
| System consistency (5) | 2.89 | 4.38 | +1.49 |

What the critics said, in short:
- **A (Tidewrack):** both conditions interpreted "the sea as a score"; the DI pair was judged to have the earliest, highest-contrast ticket action and the most deliberate per-viewport recomposition; the bottom baseline output had 39 font-size declarations, 11 viewports of page at 390 px and 10–11 px microcopy. The one DI MEDIUM: the hero score shrinks to an unreadable fragment on phones (A-1).
- **B (Ledgerline):** the top DI output sorts the queue by priority so the nine urgent rows lead; the other DI output's default view hides 3 of 9 urgent rows (MEDIUM). The only HIGH finding of the cycle is a baseline output whose navigation toggle does nothing below desktop.
- **C (Dukkan Al-Qahwa):** DI outputs were clean on axe and Lighthouse with disciplined tokens; weaknesses: sparse desktop product rows (C-1), no sort/filter for 12 products (C-2). Baseline outputs carried 2–3 unjustified generic signatures each (glass, glow, large-radius card grid), a 13 px body, no `h1` and a 0.157 layout shift.
- **D (The Lighthouse Review):** the DI outputs led on long-read typography and measure; the baseline outputs' poster covers (one at 426 px type) filled the first desktop screen, with Lighthouse 0.82–0.84 and 8–15 sub-24 px targets.

## Secondary outcomes (automated)

| Measure | Baseline (n=9) | DI (n=8) |
|---|---|---|
| Hard-gate failures | 0 | 0 |
| Verifier warnings per output | 1.22 (tap targets, tiny text, h1 count, hidden focus) | 0 |
| Generic signatures present per output | 2.00 | 0.25 (one kept as justified per DI output A-1, D-1: a title-page / cover word) |
| Unjustified signatures (critic) per output | 1.00 | 0 |
| axe serious + critical | 0 | 0 |
| Focus indicator share (min) | 1.00 | 1.00 |
| Lighthouse performance / accessibility | 0.94 / 1.00 | 0.99 / 1.00 |
| LCP (lab, ms) / CLS | 2165 / 0.039 | 1766 / 0.014 |
| Page weight (KB) | 204 | 221 |
| Distinct font-size declarations / colour literals | 19.4 / 50 | 13.0 / 34 |
| CSS custom properties | 36 | 52 |
| Logical-property share | 0.44 | 1.00 |
| Critic findings per output: HIGH / MEDIUM / LOW | 0.11 / 3.2 / 5.1 | 0 / 0.6 / 4.8 |

## The house-style problem

Evidence:
- **Automated:** mean cross-brief sameness (fonts, palette, scheme, radius between outputs of the same condition and run index across different briefs) 0.70 for DI vs 0.49 for baseline.
- **Scheme and material:** all 8 DI outputs are light with warm paper grounds (#eef0ec…#f7f2ea) and radii of 0–6 px; baseline brief A was dark in all three runs (a night installation in a dim warehouse) while DI's brief A outputs were light.
- **Ideas:** the critics' one-sentence "central idea" uses paper / ink / ledger / print / rules vocabulary for 7 of 8 DI outputs (all four briefs) and 1 of 9 baseline outputs; e.g. *paper* (A, B, C), *ledger* (B, B, C), *print* (C, D). Baseline ideas were brief-specific (a nocturnal live score, a waterline title, a harvest landscape, a morning briefing, a cover cut by arcade light).

Likely causes (to test, not established): several rules and anti-patterns push the same way — `layout.structure-with-lines-not-shadows`, `color.colour-from-content-or-identity` (neutral UI), the anti-patterns against dark-neon, glass, glow and large-radius card grids, and implementation patterns that model a quiet editorial system. Avoiding generic AI signatures appears to have produced a *new* default: the tasteful editorial-minimal page.

Why it matters: the scores reward per-brief polish; they do not measure whether DI flattens identity across clients. Fixes are proposed, not applied: cc-0009 (directions must differ in scheme, material and type voice; check for DI's own default look), cc-0010 (cross-brief critic and a diversity target).

## What this is — and is not — evidence of

- **Teaching to the test.** DI runs used the same verifier that produced the automated measures, and the critics saw that verifier's report. Lower warnings and signatures are partly optimisation against the instrument. The critic gains in originality (+0.55) and hierarchy (+0.53) are less exposed, but not independent of it either (cc-0011 proposes a critic run without the report).
- **One critic run per brief, no human review.** The critic is a different model but is not ground truth; rankings were "medium" confidence; three of four critics noted truncated long captures and no captures of interaction states (detail panels, sort/filter), so lower sections and flows are partly unverified (cc-0013).
- **Small samples.** 2–3 outputs per brief per condition; the consistency rule from the plan is met (same sign in 4/4 briefs), but effect sizes are imprecise.
- **Same model family as the critic? No** — the critic model differs from the generator; the treatment and baseline used the same model and settings.
- **Effort.** DI runs used ~17 % more tokens; part of the gain may come from more self-verification, which DI's workflow mandates.

## Generalisation and validation (recap)

- **Validation (2 sites):** 35 rules received results; inconsistencies led to three refinements before the freeze (immersive scaling, cultural home pages) and six confidence raises (measured validation only, D-021).
- **Holdout (3 sealed sites, predictions committed before capture):** 31 of 45 decided predictions held (69 %); high-confidence rules 12/15, medium 19/30. Misses: normative rules the sites break, reading-size and scale rules on cinematic and SaaS marketing pages, logical properties on a large Arabic news site. Details: `datasets/holdout/results.json`.

## Limitations

1. No human blind review yet; all rules remain `provisional`.
2. Small n, one critic pass per brief, critic saw the verifier's report.
3. House style not penalised by the per-brief rubric.
4. Thin validation (no Arabic-commerce site could be captured); holdout spent.
5. Lab measurements are environment-relative (proxy, software WebGL); Chromium only.
6. Verifier artefacts: one console error per viewport behind a proxy (cc-0008), truncated long captures (cc-0013), lenient reduced-motion and neon checks (cc-0001, cc-0002).
7. Protocol: condition names visible in paths; usage-limit interruptions; skill discoverable to baseline agents (audited, unused).
8. Real-world skill triggering untested (simulated routing only: 25/25 unambiguous cases).

## v0.2 candidates from this cycle (not implemented)

| ID | Summary |
|---|---|
| cc-0009 | Counter the house style in the create workflow and anti-pattern review |
| cc-0010 | Score cross-brief diversity (cross-brief critic + sameness target) |
| cc-0011 | Reduce benchmark confounds (critic without the verifier report, hidden condition names, full captures and states, single-session generation) |
| cc-0012 | Unify the context vocabulary (`ltr/rtl` vs `latin/ar`) |
| cc-0013 | Full-height page captures for review |

Earlier candidates cc-0001…cc-0008 come from validation, holdout and tooling audits (see `datasets/candidates/`).
