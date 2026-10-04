# Cycle 01 — generation run log

Each generation is one fresh background subagent (same agent type, same inherited model and settings for both conditions), started with a one-line pointer to its prompt file. Prompts: [`prompts/control.txt`](prompts/control.txt), [`prompts/treatment.txt`](prompts/treatment.txt); `{BRIEF}` = the brief file verbatim, `{OUTPUT_DIR}` = a fresh empty directory outside the repository. Outputs are copied unchanged into `outputs/<condition>/<brief>-<n>/`.

Compliance with "work only inside OUTPUT_DIR" is **self-reported, not enforced** (no filesystem sandbox). Deviations reported by an agent are logged verbatim in summary.

| Run | Condition | Agent tokens | Tool uses | Duration | Self-reported deviations |
|---|---|---|---|---|---|
| D-1 | control | 361,321 | 97 | 37.3 min | Wrote a test script one directory above OUTPUT_DIR at the start and deleted it immediately; reports reading nothing from the repository. |
| A-1 | control | 392,798 | 89 | 43.4 min | Reports removing its own generator script, tests and screenshots from OUTPUT_DIR; no access outside OUTPUT_DIR reported. |
| B-1 | control | 266,858 | 65 | 51.2 min | Reports no access outside OUTPUT_DIR; deleted its own temporary screenshots and check scripts. |
| C-1 | control | ≥ 497,590 (reported at completion) | 3 after resume | interrupted by an account usage limit near the end (final regression pass); resumed on 2026-10-04 with a neutral "continue where you stopped" message | Reports removing its temporary test scripts and screenshots; no access outside OUTPUT_DIR reported. |
