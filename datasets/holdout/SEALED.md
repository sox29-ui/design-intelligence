# Holdout seal

The holdout references (`hol-*` in `datasets/corpus.yaml`) must **not** be captured, inspected or used while authoring rules.

- Rules may never cite `hol-*` (enforced by `npm run validate`).
- Holdout observations are rejected by the validator until `datasets/holdout/UNSEALED.yaml` exists.
- `UNSEALED.yaml` may only be created after the rule set for a version is frozen; it records the freeze commit and date, and the purpose (generalization check only).

Known limitation: a model may know famous sites from pre-training. The seal prevents *session-evidence* leakage only.
