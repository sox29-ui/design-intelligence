# Workflow: browser verification

The model may not declare completion because code exists. Completion requires rendered evidence.

## Run

```bash
node ${CLAUDE_SKILL_DIR}/scripts/verify-page.ts <dir-or-url> [--quick]
```

Requires Node ≥ 22.18 and Playwright with Chromium. Writes `.di-verify/verify-report.{md,json}` and screenshots to `.di-verify/artifacts/`. If the tooling is unavailable: say so, state what could not be verified (UNVERIFIED), and fall back to reasoning over the HTML/CSS plus a manual checklist — never claim checks that did not run.

## Objective gates (must pass)

| Gate | Check |
|---|---|
| `broken-mobile` | no horizontal overflow at 390 px |
| `keyboard-unusable` | visible focus on ≥ 50% of tab stops (target 100%); primary action reachable |
| `critical-a11y` | no axe critical violations |
| `runtime-errors` | no uncaught page errors |
| `lang-missing` | `html[lang]` set |
| `rtl-direction` | Arabic content ⇒ `dir="rtl"` effective |

Warnings to resolve unless justified: serious axe issues, contrast estimate, tap targets < 24 px, tiny text at 390, h1 count ≠ 1, reduced motion ignored, off-screen focus.

## Visual inspection (required)

Open and actually look at: `390x844-top`, `390x844-long`, `390x844-menu-open` (if a menu exists), `390x844-focus`, `1440x900-top`, `1440x900-long`, `1440x900-reduced-motion-top`. Check:

1. 1st/2nd/3rd read matches the thesis at both widths.
2. Nothing clipped, overlapping, orphaned (single word lines in display type), or off-canvas.
3. The mobile layout *transforms* (priority, navigation, interaction) rather than just shrinking.
4. RTL: layout mirrored; directional icons mirrored; logos, media controls, checkmarks and numerals not mirrored; mixed Arabic/Latin runs read correctly.
5. Reduced motion: content fully visible without animation.

## Separate objective from subjective

Objective failures are fixed. Subjective notes are reported, not silently "improved".

## Re-run after fixes

Re-run the affected checks; report before/after per finding.
