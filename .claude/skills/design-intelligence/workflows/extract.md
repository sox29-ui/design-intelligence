# Workflow: extract design grammar (observations → conditional rules)

Do **not** start by writing best practices. Start from observations of several independent references and ask what holds, where, and why.

## Inputs

`datasets/observations/ref-*/verified.json` and `analyst.json` (extraction split only). Validation references are used *after* candidate rules exist. Holdout references are never read.

## Questions to answer, in order

1. Which patterns repeat across **independent** references (different studios)?
2. Which only work in particular contexts — and which context dimension explains it: industry, content density, user intent, language/script, device, brand personality, engineering budget, motion budget?
3. Which have **counterexamples** in the corpus (same pattern, different outcome)?
4. Which are trends rather than principles (appear because they are fashionable, not because the context needs them)?
5. Which are **artistic signatures** of one studio/site that must not be generalized?
6. Where is the evidence insufficient? (Record as `hypothesis`, not as guidance.)

## Output records (`datasets/rules/<domain>/<id>.yaml`, schema `principle.schema.json`)

- `principle` — conditional decision rule: WHEN (context) → CONSIDER → VERIFY → AVOID WHEN, with supporting refs (≥ 2 studios), counterexamples, trade-offs, `depends_on`.
- `invariant` — holds across contexts; grounded in a standard (`provenance/sources.yaml`) and/or ≥ 2 refs.
- `anti-pattern` — a pattern that becomes harmful *without justification from the brief*; supporting = references/outputs where it hurt; counterexamples = where it was justified.
- `signature` — one site's distinctive move; recorded so DI knows **not** to generalize it.
- `hypothesis` — plausible but under-evidenced; not compiled as guidance.

Confidence is capped by evidence structure (D-006): 2 studios → low; ≥ 3 → medium; ≥ 4 across ≥ 2 archetypes with no unresolved counterexample and a consistent validation check → high. `npm run validate` enforces this.

## Writing a good rule

Prefer:

```yaml
when: { page_goal: [storytelling, brand-expression], content_density: [low] }
consider: [oversized display typography, narrow headline measure, intentional line breaks]
verify: [mobile wrapping at 390, localization expansion, 200% zoom, font-loading CLS]
avoid_when: [dashboard, transactional form, dense information UI]
```

over "Use large typography." Every bullet must be traceable to the cited observations or to a cited standard. Rationale is INFERRED and must say so.

## After drafting

1. `npm run validate` (pointers, leakage, confidence ceilings).
2. Capture validation references (`npm run collect -- val-00N --allow-validation`), record `evidence.validation` results per rule (consistent / inconsistent / inconclusive), adjust confidence or narrow `when`.
3. `npm run skill:build` to compile rules into skill references.
4. Journal: rules added, rejected hypotheses, signatures, insufficient-evidence areas.
