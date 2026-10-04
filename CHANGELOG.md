# Changelog

DI versions describe **skill behavior and knowledge**, not package code. Format per [docs/EVOLUTION.md](docs/EVOLUTION.md) (PATCH / MINOR / MAJOR).

## Unreleased

- Benchmark cycle 01 (baseline vs. DI) and holdout check run against v0.1.0 — results in `evals/results/cycle-01/`.

## 0.1.0 — 2026-10-04 (first release; rule set frozen for holdout and benchmark)

**Knowledge.** 57 rules in `datasets/rules/` (28 principles, 12 invariants, 8 anti-patterns, 7 signatures, 2 hypotheses not compiled), learned from 12 extraction references and checked against 2 validation references; every rule cites observation IDs. Confidence: 6 `high`, the rest `medium` or `low`; all `provisional` (no human review yet).

**Skill.** `SKILL.md` router and contract; 12 compiled references (incl. Arabic/RTL, anti-patterns, do-not-copy signatures, implementation patterns, provenance); workflows for research, extraction, creation, critique, browser verification, benchmark and evolution; `scripts/verify-page.ts` (4 viewports, axe, focus walk, overflow, reduced motion, dark scheme, generic-signature scan).

**Tooling.** Capture (`collect`, robots + consent policy, soft-error detection), normalization to VERIFIED observations, analyst observations, validator (schemas, provenance, leakage, confidence ceilings, skill contract), skill build/package, validation checks, benchmark scorer, tests (unit, skill contract, browser fixtures).

**Known weaknesses at release.**
- Thin validation: one LTR immersive site and one Arabic cultural site; the Arabic-commerce validation slot could not be captured (error pages served to the headless browser by two candidate sites). Commerce and RTL-commerce rules are unvalidated.
- Three rule refinements made after validation (cultural home pages, immersive scaling) rest on one site each and are themselves unvalidated.
- All analyst observations and judgements were made by the same agent that wrote the rules; no human has reviewed a rule (status `provisional`).
- Lab measurements are environment-relative (egress proxy, software WebGL, concurrent jobs); WebKit/Firefox behaviour is UNVERIFIED.
- Older captures used probe versions with known limits (legacy contrast estimate; focus-walk start point) — see the journal.
- Real-world skill triggering is untested end to end; only a lexical routing check exists.
- Corpus: 12 extraction references cannot cover all industries; Arabic references are 3; several strong Arabic sites were inaccessible.

## Pre-release

- Phase A: repository architecture, schemas (corpus, capture manifest, observation, principle, candidate change, eval result, feedback), validator, docs (report extraction, architecture, decisions, evidence taxonomy, ethics, evolution, journal).
- Phase B: corpus selection (18 references, 12/3/3), access and robots checks.
- Phase C: evidence collection for the extraction split; tooling fixes recorded in the journal.
- Phase D: synthesis of the v0.1 rule set; validation on the validation split.
