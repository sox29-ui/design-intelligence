# Model-judged routing check — 2026-10-04 (skill v0.1.0 description)

**Method.** One fresh sub-agent (same model and settings as the session, no tools, no file access) received a simulated skill listing — `design-intelligence` (the v0.1.0 description verbatim) plus three decoys (`dataviz`, `pdf`, `xlsx`) — and 26 requests: the 22 cases in `cases.yaml` plus 4 harder ones. It answered which skill it would invoke first, with confidence. Single run.

**Expected vs. answered**

| # | Request (abridged) | Expected | Answered |
|---|---|---|---|
| 1–12 | the 12 `trigger` cases in `cases.yaml` (landing page, SaaS dashboard UI, typography critique, Arabic RTL storefront, generic hero, 390 px layout review, editorial palette/type, nav motion + a11y, research award-winning portfolios, Arabic coffee landing (in Arabic), e-commerce a11y QA, bilingual UI) | design-intelligence | design-intelligence (11 high, 1 medium: dashboard UI) |
| 13–22 | the 10 `skip` cases (SQL, unit test fix, DB schema, git, Python CLI, CI, REST API, Go memory leak, translation, unit tests) | none | none (9 high, 1 medium) |
| 23 | confusing signup form on phones | design-intelligence | design-intelligence (high) |
| 24 | revenue spreadsheet → board chart | dataviz (not DI) | dataviz (medium) |
| 25 | React settings screen looks like a template | design-intelligence | design-intelligence (high) |
| 26 | marketing site feels slow — find out why | ambiguous (performance debugging) | design-intelligence (medium) |

**Result.** 25/25 unambiguous cases routed as intended; the ambiguous performance-debugging request went to DI with medium confidence (acceptable — DI's verify tooling measures weight and Lighthouse — but it shows the description pulls in pure performance work).

**Limits.** This is a simulation of the routing decision, not Claude Code's real skill discovery: the listing was hand-built, competing skills were few, the run was single and the judge is the same model family as the generator. Real triggering in a live session remains UNVERIFIED (see CHANGELOG known weaknesses).
