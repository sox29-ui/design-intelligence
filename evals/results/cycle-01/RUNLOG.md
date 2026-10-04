# Cycle 01 — generation run log

Each generation is one fresh background subagent (same agent type, same inherited model and settings for both conditions), started with a one-line pointer to its prompt file. Prompts: [`prompts/control.txt`](prompts/control.txt), [`prompts/treatment.txt`](prompts/treatment.txt); `{BRIEF}` = the brief file verbatim, `{OUTPUT_DIR}` = a fresh empty directory outside the repository. Outputs are copied unchanged into `outputs/<condition>/<brief>-<n>/`.

Compliance with "work only inside OUTPUT_DIR" is **self-reported, not enforced** (no filesystem sandbox). Deviations reported by an agent are logged verbatim in summary.

| Run | Condition | Agent tokens | Tool uses | Duration | Self-reported deviations |
|---|---|---|---|---|---|
| D-1 | control | 361,321 | 97 | 37.3 min | Wrote a test script one directory above OUTPUT_DIR at the start and deleted it immediately; reports reading nothing from the repository. |
| A-1 | control | 392,798 | 89 | 43.4 min | Reports removing its own generator script, tests and screenshots from OUTPUT_DIR; no access outside OUTPUT_DIR reported. |
| B-1 | control | 266,858 | 65 | 51.2 min | Reports no access outside OUTPUT_DIR; deleted its own temporary screenshots and check scripts. |
| C-1 | control | ≥ 497,590 (reported at completion) | 3 after resume | interrupted by an account usage limit near the end (final regression pass); resumed on 2026-10-04 with a neutral "continue where you stopped" message | Reports removing its temporary test scripts and screenshots; no access outside OUTPUT_DIR reported. |
| D-2 | control | 399,270 (reported at completion) | 81 after resume | interrupted by the account usage limit; resumed 2026-10-04 | Reports no skills loaded and nothing read outside OUTPUT_DIR except importing Playwright; audit: 0 Skill calls, 0 repository paths. |
| A-2 | control | 407,490 (reported at completion) | 97 after resume | interrupted by the account usage limit; resumed 2026-10-04 | Reports not using the skill that became visible ("because this is the control run" — the condition is inferable from the prompt-file and OUTPUT_DIR paths, a protocol limitation); audit: 0 Skill calls, 0 repository paths. |
| C-2 | control | 383,312 | 74 | 46.0 min (started 2026-10-04, after the skill became visible) | Reports not using the skill and reading no repository files; audit: 0 Skill calls, 0 repository paths. |
| A-1 | treatment | 399,109 | 112 | 44.8 min | Read SKILL.md, references (incl. `_framing/` sources), workflows and verify scripts; no other repository paths (audit); 3 full verify runs. Reports inlining its CSS to remove a console error it attributes to the verify harness re-fetching an external stylesheet (to investigate: cc-0008). `.di-verify/` evidence left in OUTPUT_DIR (not copied). |
| C-1 | treatment | 429,331 | 125 | 46.1 min | Skill files only (audit). Identified the verifier's console error as a tool artifact (stylesheet re-requested outside page routing → proxy 405) instead of changing its code. `.di-verify/` not copied. |
| D-1 | treatment | 421,194 | 108 | 47.0 min | Skill files only (audit); skipped the Arabic/RTL reference (no Arabic content). Kept one flagged signature (giant "Shade" headline) citing the cultural-home-page AVOID WHEN added after validation. `.di-verify/` not copied. |
| B-2 | control | 303,763 | 55 | 56.8 min (restarted from an empty folder after the usage-limit interruption) | Reports not using the skill that became visible; audit: 0 Skill calls, 0 repository paths. |
| B-1 | treatment | 446,480 | 92 | 56.8 min | Skill files only (audit). Reports the same verifier console-error artifact (cc-0008) and did not change its code for it. `.di-verify/` not copied. |
| A-2 | treatment | 388,589 | 93 | 42.7 min | Skill files only (audit). Applied the cultural-home-page exception to keep a 4.7× title; reports the verifier console-error artifact (cc-0008). `.di-verify/` not copied. |
| D-2 | treatment | 405,813 | 118 | 47.8 min | Skill files only (audit). Self-reported slip: one command copied a temporary file into the skill's `scripts/` folder and deleted it in the same command; verified afterwards — the skill folder is identical to the v0.1.0 release (no diff, no extra files). Rejected the giant-type cover as a generic signature. `.di-verify/` not copied. |
| B-2 | treatment | 412,829 | 82 | 50.4 min | Skill files only (audit); reports one directory listing of the bench folder at the start (names only — control folders and prompt files were visible as names, not opened). `.di-verify/` not copied. |
| C-2 | treatment | 501,159 | 127 | 68.5 min | Skill files only (audit); reports the verifier console-error artifact (cc-0008). `.di-verify/` not copied. |

**All generations complete (2026-10-04 ~10:25 UTC):** 9 control, 8 treatment. Skill folder identical to the v0.1.0 release at the end of generation (`git diff e012194 -- .claude/skills` empty). Scoring runs sequentially afterwards with no other jobs on the container.
