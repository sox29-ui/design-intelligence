# Workflow: benchmark a DI version

Purpose: show — with evidence — whether a DI version improves outputs over no-skill generation and over the previous version. Protocol: `evals/harness/PROTOCOL.md` (repository).

1. **Fixed inputs**: briefs `evals/briefs/A–D`, scorecard `evals/rubrics/scorecard.yaml`. Never edit them during a cycle.
2. **Generate**: per brief, ≥ 3 outputs per condition (`control` no skill, `treatment` this skill, optionally `candidate`). Same model, effort, tools, output contract.
3. **Automated scoring**: `npm run bench:score -- <cycle>` (renders all outputs with the DI capture engine; gates, axe, focus, overflow, signatures, Lighthouse, style-diversity features).
4. **Blind critique**: assign blind IDs; an independent critic (not the generator, different model where possible) scores with `evals/rubrics/critic-prompt.md`.
5. **Human blind review**: packet in `evals/human/`; required before rules become `accepted`.
6. **Compare**: per dimension mean ± spread, hard-gate failures, signature counts, style diversity across briefs (four outputs that look like one agency = partial failure), plus what remains unknown.
7. **Record**: `evals/results/<cycle>/REPORT.md`, journal entry, feedback log; failures become candidate changes (`workflows/evolve.md`).

Never evaluate on the extraction references; holdout references are only for generalization checks after rules are frozen.
