# Workflow: create an interface

`understand → design thesis → directions → implement → render → inspect → measure → critique → fix → verify`

Never treat the first render as final.

## 1. Understand (write it down, ≤ 15 lines)

Brief summary in DI context terms — these are the keys the references are conditioned on:

| Key | Values |
|---|---|
| `page_goal` | conversion · storytelling · brand-expression · task-completion · information-consumption · data-interaction |
| `content_density` | low · medium · high |
| `audience` / `device` | who, primary viewport (mobile-first? desktop tool?) |
| `brand_personality` | 3 adjectives from the brief (not from taste) |
| `language` / `direction` | en/ltr, ar/rtl, bilingual |
| `motion_budget` | none · subtle · expressive (and why) |
| `engineering_budget` | static page · light JS · heavy WebGL (rarely justified) |
| `constraints` | accessibility, performance, content, legal |

Missing information → state a conservative assumption explicitly.

## 2. Design thesis (≤ 12 lines)

Audience · primary goal · visual personality · hierarchy strategy (what is read 1st/2nd/3rd) · typography strategy · composition strategy · colour strategy · motion budget · responsive strategy (what *transforms* at 390) · accessibility constraints · performance constraints.

## 3. Three genuinely different directions

Not three colour variations of one hero. Vary the central idea (e.g. typographic vs. data-led vs. editorial-collage). For each: one-line idea, how it serves the goal, its main risk. Pick one; justify the trade-off in ≤ 5 sentences. Run the anti-pattern check (`references/anti-patterns.md`) on the chosen direction *before* coding.

## 4. Implement as a system

- Tokens first: type scale (few sizes, explicit roles), spacing scale, colour roles (background / text / muted / accent / semantic), radii, motion durations/easings.
- Semantic HTML: landmarks, one `h1`, ordered headings, labelled controls, `lang`/`dir`.
- Logical CSS properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`) by default — mandatory for RTL/bilingual.
- Motion behind `@media (prefers-reduced-motion: no-preference)`; nothing essential depends on motion.
- Fonts: ≤ 2 families, only needed weights, `font-display: swap`, Arabic-capable family for Arabic.
- No copied assets, code or distinctive compositions from references.

## 5. Render, inspect, measure

```bash
node ${CLAUDE_SKILL_DIR}/scripts/verify-page.ts <output-dir>          # full: 4 viewports + reduced motion + dark
node ${CLAUDE_SKILL_DIR}/scripts/verify-page.ts <output-dir> --quick  # 390 + 1440 only
```

Then **look at the screenshots** it lists (top, long, menu, focus at 390 and 1440). Follow `workflows/verify.md`.

## 6. Critique and fix

Follow `workflows/critique.md` on your own output as if someone else made it. Fix objective defects first (gates, overflow, focus, contrast, RTL), then high-confidence design defects. Do not redesign what works. Re-run verification after fixes.

## 7. Deliver

Summarise: thesis, chosen direction and why, rules applied (IDs from references), verification results (gates passed, remaining warnings), known limitations.
