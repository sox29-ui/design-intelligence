# evals

| Path | Content |
|---|---|
| `briefs/` | Four fixed benchmark briefs (A experimental landing, B B2B SaaS dashboard, C Arabic RTL mobile-first commerce, D editorial/cultural publication). Never edited after a cycle starts; changes = new brief version. |
| `rubrics/` | `scorecard.yaml` (weights, anchors, hard gates, signature list), `critic-prompt.md` (blind independent critic). |
| `harness/` | `PROTOCOL.md` — conditions, output contract, limitations, scoring pipeline. |
| `human/` | Human blind-review procedure, feedback log. |
| `results/<cycle>/` | Prompts used, automated scores, critic scores, blind key, report. Rendered screenshots of outputs stay in git-ignored `artifacts/`. Generated outputs themselves are committed (small static sites). |

Do not evaluate DI on its extraction references (report W7). Generalization to unseen real sites is checked separately with sealed holdout references (`datasets/holdout/`).
