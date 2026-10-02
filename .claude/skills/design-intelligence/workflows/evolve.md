# Workflow: evidence-driven skill evolution

Never: `website → model opinion → SKILL.md edit → merge`.
Always: `website → evidence → sanitized observation → candidate principle → evaluation → review → versioned change`.

1. **Trigger**: an eval failure, a recurring critic/human finding, or new research evidence.
2. **Recurrence test**: does the defect recur across briefs / generations / models? Single-instance taste → `evals/human/feedback-log.yaml` only.
3. **Candidate**: write `datasets/candidates/cc-NNNN.yaml` (schema `schemas/candidate-change.schema.json`): type, targets (rule IDs / files), motivation with evidence IDs, predicted effect.
4. **Implement on a branch**: edit rule YAML (with `history` entry), recompile references (`npm run skill:build`), `npm run validate`, `npm test`.
5. **Benchmark**: run the fixed briefs with the candidate; compare to the current version and to control.
6. **Review**: independent critic + human. Accept only measurable improvement without regressions; otherwise reject and record why.
7. **Version**: PATCH / MINOR / MAJOR per `docs/EVOLUTION.md`; update `CHANGELOG.md`, `metadata.version` in `SKILL.md`, journal.

Weaken or delete rules that repeatedly fail. Size is never an improvement metric.
