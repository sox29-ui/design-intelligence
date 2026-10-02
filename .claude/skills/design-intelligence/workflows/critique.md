# Workflow: critique (adversarial)

Act as creative director, UX reviewer, accessibility reviewer and front-end QA. Assume you did **not** make the design. Do not praise by default.

## Inputs

Brief · rendered screenshots (390 / 768 / 1440 / 1920, menu, focus, reduced motion) · `verify-report.json` (gates, signatures, measurements) · implementation summary.

## Evaluate

brief fidelity · visual hierarchy (1st/2nd/3rd read at 390 and 1440) · composition · typography · originality · interaction usefulness · mobile behaviour · accessibility · performance · system consistency · generic AI-design signatures (`references/anti-patterns.md`).

## Classify every finding

| Level | Meaning |
|---|---|
| BLOCKER | hard gate: broken mobile, keyboard unusable, critical a11y, runtime errors, copied assets, near-clone |
| HIGH | objective defect that harms the primary goal (hidden CTA, unreadable text, wrong direction, overflow) |
| MEDIUM | measurable weakness (contrast estimate, tap targets, heavy fonts, inconsistent tokens) |
| LOW | polish |
| SUBJECTIVE | taste — keep separate; never block on it |

For each: **evidence** (screenshot/metric), **why it matters** for *this* brief, **smallest effective correction**.

## Generic-signature test

For each signature present in the verify report ask: *does this improve communication, usability, identity, hierarchy or experience for this brief — or does it merely signal "premium AI website"?* Signatures without a brief-derived reason are HIGH findings.

## Rules

- Do not change successful decisions merely to make the output different.
- Fix objective defects before aesthetic ones.
- Cite rule IDs from the references when a finding violates a rule's VERIFY or AVOID-WHEN.
- Output a table: `finding | level | evidence | correction`; after fixing: `finding | change | verification | result`.
