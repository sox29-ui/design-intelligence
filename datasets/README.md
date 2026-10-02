# datasets

| Path | Content | Written by |
|---|---|---|
| `corpus.yaml` | The 18 references, their split, dimensions, selection scores, access checks. | Phase B, reviewed |
| `candidates.yaml` | Full candidate pool incl. rejected candidates and reasons. | Phase B |
| `raw/<ref>/<capture>/` | Derived capture data (measurements; no page copy) + `manifest.json` with hashes of committed files and git-ignored artifacts. | `scripts/collect.ts` |
| `observations/<ref>/verified.json` | VERIFIED observations derived deterministically. Never hand-edited. | `scripts/normalize.ts` |
| `observations/<ref>/analyst.json` | OBSERVED / INFERRED observations with evidence pointers. | analyst (workflow `extract.md`) |
| `rules/<domain>/<id>.yaml` | Distilled knowledge records (principle, invariant, anti-pattern, signature, hypothesis). | distillation, reviewed |
| `candidates/cc-NNNN.yaml` | Candidate changes to knowledge or behavior. Never applied automatically. | anyone, via PR |
| `holdout/` | Seal for holdout references (D-008). | — |
