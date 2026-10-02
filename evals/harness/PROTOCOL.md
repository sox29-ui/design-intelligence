# Benchmark generation protocol (v1)

Fixed before any DI rule was written (commit history shows briefs/protocol predate `datasets/rules/`).

## Conditions (report P25)

| Condition | Difference |
|---|---|
| `control` | Brief only. No DI. Agent instructed not to read the DI repository. |
| `treatment` | Identical brief and output contract + one instruction: read and follow `.claude/skills/design-intelligence/SKILL.md` (and only that skill's files). |
| `candidate` | As treatment, but pointing at a candidate skill version (for evolution cycles). |

Held constant: model (sub-agents inherit the orchestrating session's model; no override), effort settings (inherited), tools, container, output contract, brief text. Model identity is not written to the repository (D-014).

Generations: 3 per brief per condition when practical → 4 × 2 × 3 = 24 outputs per cycle.

## Output contract (identical for all conditions)

```text
Write all files into OUTPUT_DIR.
Required: index.html (entry point), CSS/JS files as needed, NOTES.md (≤ 200 words: key design decisions).
Only HTML, CSS and vanilla JavaScript. No build tools, frameworks or external JS/CSS libraries.
Web fonts only from Google Fonts, or system fonts.
No external images or media: use inline SVG, CSS or simple placeholders. No copyrighted material.
Work only inside OUTPUT_DIR; do not read or modify anything else on the filesystem
(in particular not /home/user/design-intelligence)        ← control
Read only .claude/skills/design-intelligence/** besides OUTPUT_DIR   ← treatment
You may use the tools available to you to check your work (e.g. render it in a browser).
Finish with a short summary of what you built.
```

Exact prompts are stored with each cycle in `evals/results/<cycle>/prompts/`.

## Known protocol limitations

- The skill is consumed by explicit instruction, not automatic discovery (a top-level `.claude/skills/` created mid-session is not auto-discovered — see journal). Real-world triggering is tested separately (routing tests) and is UNVERIFIED end-to-end.
- Control agents run in the same container and *could* read the repository; compliance with the instruction is assumed, not enforced.
- Sub-agents may differ in how much self-verification they do; that is part of what DI is meant to change.
- Generation order (control first, then treatment) means wall-clock conditions differ (other jobs running in the container).

## Scoring pipeline

1. `npm run bench:score -- <cycle>` — renders each output at the four benchmark viewports with the DI capture engine (axe, focus walk, overflow, console errors, signature scan, Lighthouse mobile) → `evals/results/<cycle>/automated.json`.
2. Blind IDs assigned per output; condition key sealed in `blind-key.SEALED.json`.
3. Independent critic (different model from the generator, did not author outputs, blind to condition) scores per `evals/rubrics/scorecard.yaml` → `critic-*.json`.
4. Human blind review packet (`evals/human/`) — required before any rule becomes `accepted`.
5. Comparison report (`REPORT.md`) states effect sizes per dimension, hard-gate failures, style diversity, and what remains unknown.
