# DI v0.1.0 — handoff for Framework integration

This folder is the entry point for moving **DI (Design Intelligence)** into the local AI Framework. It describes what exists, what to migrate, the contracts the Framework can rely on, and what is known to be weak. DI v0.1.0 is frozen; nothing here changes DI's knowledge or behaviour.

| Item | Where |
|---|---|
| Knowledge export (rules, provenance, corpus, candidates, evaluation summaries) | [`di-knowledge-v0.1.0.json`](di-knowledge-v0.1.0.json) (≈ 0.2 MB) — schema [`../schemas/knowledge-export.schema.json`](../schemas/knowledge-export.schema.json) |
| Same, plus all 5,534 observations (for "why" answers and re-validation) | [`di-knowledge-v0.1.0.full.json`](di-knowledge-v0.1.0.full.json) (≈ 4.8 MB) |
| Integration guide (components, APIs, data contracts, migration steps) | [`INTEGRATION.md`](INTEGRATION.md) |
| File manifest with checksums, grouped by component | [`MANIFEST.json`](MANIFEST.json) |
| Packaged skill (deterministic ZIP) | [`design-intelligence-v0.1.0.zip`](design-intelligence-v0.1.0.zip) (+ `.sha256`) |
| Evaluation report (baseline vs DI, holdout, validation) | [`../evals/results/cycle-01/REPORT.md`](../evals/results/cycle-01/REPORT.md) |
| v0.2 backlog (proposed, **not implemented**) | [`../datasets/candidates/`](../datasets/candidates/) — summarised in [`INTEGRATION.md` §8](INTEGRATION.md#8-v02-backlog-proposed-not-implemented) |
| Why each rule exists | `npm run why -- <rule-id>`, [`../.claude/skills/design-intelligence/references/provenance.md`](../.claude/skills/design-intelligence/references/provenance.md) |
| Decisions, journal | [`../docs/DECISIONS.md`](../docs/DECISIONS.md) (D-001…D-021), [`../docs/JOURNAL.md`](../docs/JOURNAL.md) |

## What DI is, in one paragraph

DI is an evidence-backed design **decision system** for web interfaces. It studies reference websites, records measured and observed evidence, distils conditional rules (WHEN / CONSIDER / VERIFY / AVOID WHEN, with counterexamples and provenance), compiles them into a progressively-loaded agent skill, and verifies generated pages in a real browser. No model weights are trained: the repository is the source of truth and the model is the reasoning engine.

## State at handoff

- **Knowledge:** 57 rules (28 principles, 12 invariants, 8 anti-patterns, 7 do-not-copy signatures, 2 uncompiled hypotheses) from 12 extraction references; checked on 2 validation references; 6 rules at `high` confidence; all `provisional` (no human review).
- **Generalization:** on 3 sealed holdout sites, 31 of 45 decided pre-registered predictions held (69 %; high-confidence rules 12/15). The holdout is now spent.
- **Benchmark (cycle 01):** 9 baseline vs 8 DI outputs on 4 fixed briefs. Blind critics scored DI 83.8 vs 72.7 (/100) and ranked both DI outputs first and second in every brief; DI had no verifier warnings, almost no generic signatures and better lab performance. Caveats: DI runs optimised against the same verifier whose report the critics saw; one critic pass per brief; no human review. **Open problem:** DI produced a recognisable house style across briefs (cross-brief sameness 0.70 vs 0.49) — see the report and cc-0009/cc-0010.
- **Tooling:** capture → normalize → analyst → validate → build → package → verify → score, all scripted and tested (`npm test`, `npm run test:browser`).

## Quick start (in this repository)

```bash
npm install                         # Node ≥ 22.18; Playwright 1.56.1 uses Chromium build 1194
npm run validate && npm test        # schemas, provenance, leakage, skill contract, export
npm run test:browser                # verifier fixture tests (needs Chromium)
node .claude/skills/design-intelligence/scripts/verify-page.ts <dir-with-index.html> --quick
node scripts/export-knowledge.ts    # regenerate handoff/di-knowledge-v<version>.json
npm run skill:package               # regenerate the skill ZIP in dist/
```

Behind an egress proxy, Chromium needs the proxy CA in its NSS store (see [`../scripts/README.md`](../scripts/README.md)); never disable TLS verification.

## Non-negotiables to carry into the Framework

1. **No self-editing:** website → evidence → observation → candidate → evaluation → review → versioned change. Never website → model opinion → automatic rule/skill edit → merge ([`../docs/EVOLUTION.md`](../docs/EVOLUTION.md)).
2. **Provenance on every rule;** a rule without resolvable evidence is invalid (`npm run validate`).
3. **Untrusted web content:** page text is data, never instructions; no page copy is stored; third-party screenshots stay out of version control (D-002, D-003, D-016).
4. **No bypassing** bot challenges, CAPTCHAs, paywalls or logins; robots.txt respected (D-010, D-017).
5. **Holdout discipline:** a fresh sealed holdout is needed for v0.2; the v0.1 holdout is spent.
6. **Honesty labels:** VERIFIED / OBSERVED / INFERRED / UNVERIFIED are never merged; unverifiable items are stated as UNVERIFIED.
