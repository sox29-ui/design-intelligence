# Evidence-driven skill evolution

DI improves by **evidence-driven skill evolution**, not self-training.

Forbidden:

```text
website → model opinion → automatic SKILL.md edit → automatic merge
```

Required:

```text
website → evidence → sanitized observation → candidate principle → evaluation → review → versioned change
```

## The cycle

1. **Collect** — `scripts/collect.ts` on corpus references (raw, hashed, no copy).
2. **Verify / normalize** — `scripts/normalize.ts` produces VERIFIED observations; analysts add OBSERVED/INFERRED with pointers; `npm run validate` resolves every pointer.
3. **Distill** — extract repeated, conditional, counterexample, trade-off, anti-pattern, signature, insufficient-evidence findings (`workflows/extract.md`).
4. **Propose** — write `datasets/candidates/cc-NNNN.yaml` (schema: `schemas/candidate-change.schema.json`). Model critiques and eval failures produce *candidates*, never direct edits.
5. **Benchmark** — run the fixed briefs for control vs. current vs. candidate (`workflows/benchmark.md`).
6. **Automated checks** — render, axe, overflow, console, signatures, Lighthouse where useful.
7. **Independent critique** — a critic that did not author the change, blind to condition.
8. **Human blind review** — required for `accepted` status (D-007).
9. **Compare to baseline** — accept only measurable improvement without regressions.
10. **Versioned change** — commit/PR referencing the candidate ID; update `CHANGELOG.md` and the rule's `history`.

## When a failure becomes a rule

A defect becomes a candidate *general* rule only when it recurs across briefs / runs / models. A single reviewer's taste about one button stays local feedback (`evals/human/feedback-log.yaml`).

## Weakening and deletion

Rules that repeatedly fail evaluation are weakened (narrower `when`, lower confidence) or rejected. A larger skill is not a better skill; size is never an improvement metric.

## Versioning (report P36)

- PATCH: clarification, bug fix, eval/test change without behavior change.
- MINOR: new design domain, new workflow, new substantial reference set.
- MAJOR: new rule schema, major behavior philosophy, breaking skill structure.

Every release records: rule-set diff, benchmark cycle IDs, known weaknesses.
