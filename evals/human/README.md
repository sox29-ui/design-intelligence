# Human blind review

Automated checks and LLM critics cannot judge taste, originality, real usability or screen-reader experience reliably. A DI rule becomes `accepted` (D-007) only after human review.

## Packet

Each cycle in `evals/results/<cycle>/` provides:
- `review-packet.md` — per brief, the outputs under blind IDs, with links to rendered captures and the runnable `index.html`.
- `human-scores.template.yaml` — fill in one copy per reviewer.
- `blind-key.SEALED.json` — condition mapping. **Do not open until all scores are submitted.**

## Procedure

1. For each brief, read the brief first.
2. Open each output (serve the folder locally, e.g. `npx http-server <dir>`), at phone width and desktop width.
3. Do the human-only checks in `evals/rubrics/scorecard.yaml` (`human_only_checks`): keyboard walkthrough of the primary task, screen-reader sanity, reduced motion, alt/name quality, reading order (Arabic for brief C).
4. Score each dimension 1–5 using the anchors; mark hard-gate failures; rank outputs within the brief.
5. Add free-text findings. Findings that recur across outputs/briefs go to `feedback-log.yaml` (schema `schemas/feedback.schema.json`); one-off taste remarks stay local.

## Status

No human review has been performed yet for any cycle. Every DI rule is therefore `provisional` at most.
