# Report extraction — the DI v0.x specification

Source: the supplied deep-research report *"هندسة مهارة «design-intelligence»: من مواقع الجوائز إلى نظام تصميم قابل لإعادة الاستخدام مع Claude وOpenAI"* (Arabic, dated 2026-10-02 by its own text). It is the **primary architectural specification for DI v0.x**. This file extracts it into four strictly separated classes so later sessions do not re-derive or silently override it.

Labels used below:

| Label | Meaning |
|---|---|
| `REPORT-VERIFIED` | The report states it as fact **and cites an official source**. DI did not necessarily re-check it. |
| `SPOT-CHECKED` | A DI session re-checked the claim against a primary source (date given). |
| `REPORT-PROPOSED` | An engineering recommendation by the report author. Not a fact; adopted by DI unless a decision in [DECISIONS.md](DECISIONS.md) says otherwise. |
| `REPORT-UNCERTAIN` | The report itself flags the item as undefined, unverified, or an estimate. |
| `REPORT-WARNING` | A failure mode the report tells us to avoid. |

---

## 1. Verified facts (as cited by the report)

| # | Claim | Status |
|---|---|---|
| V1 | Skills (Anthropic and OpenAI) are folders of `SKILL.md` + instructions + resources + scripts, discovered by name/description and loaded on demand. They are **not** weight updates / fine-tuning. | `REPORT-VERIFIED`; `SPOT-CHECKED` 2026-10-02 against code.claude.com/docs/en/skills (supporting files, body loads only when used). |
| V2 | Claude Code discovers project skills in `.claude/skills/<name>/SKILL.md` and personal skills in `~/.claude/skills/`. | `SPOT-CHECKED` 2026-10-02. Additional detail found: a *new top-level* `.claude/skills/` created mid-session needs `/reload-skills`; description + `when_to_use` are truncated at 1,536 chars in the skill listing. |
| V3 | Progressive disclosure: metadata → `SKILL.md` → references/scripts only when needed. Keep `SKILL.md` under ~500 lines. | `SPOT-CHECKED` 2026-10-02 ("Keep SKILL.md under 500 lines. Move detailed reference material to separate files."). |
| V4 | Claude.ai accepts a skill uploaded as a ZIP. | `REPORT-VERIFIED` (not re-checked; out of v0.1 scope). |
| V5 | OpenAI Agent Skills: directory with `SKILL.md`, `references/`, `scripts/`, `assets/`; API upload + versions. | `REPORT-VERIFIED` (not re-checked; out of v0.1 scope). |
| V6 | CSS Design Awards judges UI, UX and Innovation; WOTD/WOTM feed annual awards. | `REPORT-VERIFIED`. |
| V7 | Land-book is a daily-updated curated gallery with industry/style/type filters. | `REPORT-VERIFIED`. |
| V8 | Awwwards distinguishes Sites of the Day / Month / Year. | `REPORT-VERIFIED`. |
| V9 | CSSDA terms restrict copying its content, data and screenshots. | `REPORT-VERIFIED` → DI uses galleries only as a discovery index. |
| V10 | Playwright supports `toHaveScreenshot()` (pixelmatch) and ARIA snapshots; screenshots vary across OS/environments, so goldens must run in a fixed environment. | `REPORT-VERIFIED`. |
| V11 | `@axe-core/playwright` integrates axe with Playwright. W3C: automated tools cannot check every accessibility requirement; human judgement remains necessary. | `REPORT-VERIFIED`. |
| V12 | Lighthouse audits performance/accessibility/SEO; Lighthouse CI asserts on categories/audits and is noisy, so multiple runs and assertions on stable facts (resource counts/sizes) are preferred. A Lighthouse accessibility score is not a WCAG certification. | `REPORT-VERIFIED`. |
| V13 | Core Web Vitals "good" thresholds: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (field data). INP needs real interactions; Lighthouse reports LCP, CLS and TBT instead. | `REPORT-VERIFIED`. |
| V14 | GitHub supports protected branches + required status checks; Actions artifacts store workflow outputs; LFS stores pointers in Git and blobs elsewhere. | `REPORT-VERIFIED`. |
| V15 | Claude Opus 5.5 (released 2026-09-22) and Sonnet 5.5 (2026-09-28) exist; "Max" is a plan / effort level, not a model; no official "Ultra" model found. | `REPORT-VERIFIED` / `REPORT-UNCERTAIN` for "Ultra". |
| V16 | Skills with network/tool access can carry prompt-injection / exfiltration risk if not reviewed (OpenAI). | `REPORT-VERIFIED`. |

## 2. Proposed recommendations (adopted as the DI v0.x architecture)

**Core stance**
- P1. Do not fine-tune. Build an *externalized* design-intelligence layer: corpus → observations → conditional rules → workflows → scripts → fixed evals. Revisit training only if a stable failure cannot be fixed by references/workflow/evals.
- P2. Pipeline: award/curated sites → evidence (screenshots + DOM + CSS + motion + audits) → structured observations (evidence + confidence + viewport + provenance) → conditional principles + anti-patterns + exceptions → Skill → generation → automated verification → human blind review → eval report → PR → versioned Skill.
- P3. Never let a model read sites and write `SKILL.md` directly (mixes impressions, implementation and taste; recency bias). Separate raw data, extraction, generalization and evaluation.
- P4. Goal is a **Design Grammar / Decision System**, not a style library.

**Corpus**
- P5. 18 sites: 12 extraction, 3 validation, 3 holdout (holdout never exposed during rule authoring).
- P6. Source quotas: 6 Awwwards, 3 CSSDA, 2 FWA, 2 Land-book, 1 SiteInspire/Godly, 3 Arabic sources/sites, 1 deliberately counter-taste (functionally strong, non-showy).
- P7. Diversity axes: industry; motion (6 low / 6 medium / 6 high); style archetype; objective; content density; device; language/direction; technology; colour scheme; accessibility quality (good *and* bad examples).
- P8. At most two sites from the same studio.
- P9. Selection score (proposal): 25% quality/award signal, 20% archetype coverage, 15% interaction diversity, 15% mobile quality, 10% accessibility/performance contrast, 10% Arabic/RTL or localization, 5% implementation diversity.
- P10. Award year: use 2025 Site-of-the-Year winners as completed annual references plus 2026 SOTD/SOTM up to collection date.
- P11. Galleries are an index; inspect the original site; check its terms/robots before heavy automation.
- P12. Keep in repo: measurements, derived tokens, observations, rules, provenance, synthetic examples, benchmark results. Do not keep: their images, videos, fonts, copied CSS/JS, gallery screenshots, pixel-perfect clones. Research screenshots go to private storage / CI artifacts.

**Evidence**
- P13. Per-site layers: typography, layout, spacing, colour, hierarchy, components, motion, responsive, accessibility, assets, implementation, performance, context.
- P14. Observation record shape (site id, page, captured_at, viewport incl. DPR, category, property, value, confidence, evidence_type, selector; separate interpretation with its own confidence and status).
- P15. Evidence classes VERIFIED (DOM/CSS/computed-style/network/a11y tree), OBSERVED (screenshot/video/manual interaction), INFERRED (framework guess, rationale, business intent, technique). `implementation_hint` with evidence and confidence, or `"unknown"`.
- P16. Use `document.fonts`, `getComputedStyle()`, CSS custom properties, CSSOM media queries, `document.getAnimations()`. For canvas/WebGL use screenshot/interaction analysis and record hints, not facts.
- P17. Separate RTL measurement set: direction, alignment, logical vs physical properties, Arabic font, Arabic/Latin fallback pairing, line-height, mixed runs, numerals, mirrored navigation, non-mirroring icons, mobile wrapping, bilingual state changes.
- P18. Rules as conditional YAML: `id, evidence_count, confidence, when, consider, verify, avoid_when, counterexamples, sources`.

**Verification & evaluation**
- P19. The model must not be able to declare success because code compiles. Playwright is the main layer.
- P20. Benchmark viewports 390×844, 768×1024, 1440×900, 1920×1080 (*DI choices, not standards*).
- P21. Capture: initial viewport, full page, mobile menu open, modal/drawer, hover/focus, 25/50/75% scroll, bottom, reduced motion, light/dark.
- P22. STRUCTURAL screenshots (animations frozen; regression) vs MOTION captures (frames/video; interaction critique). Pixel diff only for DI's own regressions, never to approach a clone.
- P23. Accessibility gate = automated (axe, ARIA snapshot, semantics, obvious contrast) + human (keyboard-only, visible focus, screen-reader sanity, reduced motion, alt quality, content order, Arabic reading order).
- P24. Lighthouse as a lab tool, never a beauty judge; multiple runs. Example budgets a11y ≥ 0.95 (error), perf ≥ 0.85 (warn) — *proposed, not standards*.
- P25. Four fixed briefs: A experimental creative landing; B B2B SaaS dashboard; C Arabic RTL mobile-first commerce; D editorial/cultural publication. CONTROL (no skill) vs TREATMENT (skill) with same model/effort/brief; ≥3 generations each (24 outputs); blind reviewer.
- P26. Scorecard: brief fidelity 25, hierarchy/usability 20, originality/art direction 15, responsive 15, accessibility 10, performance 10, code/system consistency 5. Hard gates: broken mobile viewport, unusable keyboard navigation, critical a11y regression, persistent console/runtime errors, copied proprietary assets/code, obvious near-clone.
- P27. LLM-as-judge never the sole judge; cross-model critique; humans decide important releases.
- P28. Skill routing tests: positive prompts (landing page, SaaS dashboard redesign, Arabic ecommerce, typography/spacing) must trigger; negative controls (SQL, Python exception, renaming files) must not.
- P29. Measure style diversity across outputs: four beautiful outputs that look like the same agency = partial failure.

**Skill & repository**
- P30. Repository layout with `.claude/skills/design-intelligence/{SKILL.md, references/, workflows/, scripts/}`, `datasets/{corpus.yaml, observations/, rules/, holdout/}`, `evals/{briefs, rubrics, human, results}`, `tests/`, `scripts/`, CI, `dist/`.
- P31. A short `SKILL.md` acting as router: establish brief → choose direction (consider multiple distinct directions) → load references selectively → implement as a coherent token system → verify before claiming completion → critique (objective vs subjective) → research discipline.
- P32. `references/anti-patterns.md` is the most important reference after `SKILL.md`; anti-patterns are context-bound ("Does scale improve communication, or merely signal 'premium design'?").
- P33. Evidence-driven skill evolution (not self-training): collect → verify → normalize → distill → propose rule change → generate benchmark outputs → automated checks → independent critique → human blind review → compare to baseline → PR → merge/reject. Model critiques produce `candidate-rule-change.yaml`, never direct `SKILL.md` edits.
- P34. Prompts for research, distillation, creation (design thesis + three genuinely different directions), adversarial critique (BLOCKER/HIGH/MEDIUM/LOW/SUBJECTIVE), revision (finding → change → verification → result table).
- P35. Feedback log: a defect becomes a candidate general rule only when it recurs across tasks/models/runs; a single reviewer's taste stays local.
- P36. SemVer-ish versions (PATCH = clarification/fix; MINOR = new domain/workflow/reference set; MAJOR = new rule schema / philosophy). Protected `main`, required checks. Branch names like `research/arabic-rtl-round-1`, `feat/motion-rules`.
- P37. Security gate: untrusted website → collector → sanitized structured observations → distiller → candidate rules → PR → review. Human review required for `.claude/skills/**`, `scripts/**`, `.github/workflows/**`, lockfile, eval rubrics.
- P38. Storage: Git for code, docs, observation JSON, benchmark metadata, small approved baselines; Actions artifacts / private storage for captures, Lighthouse HTML, screenshots, videos, diffs; LFS only for justified long-lived binaries.
- P39. Capability contract (vision, filesystem, shell, browser, structured output) with fallbacks (no browser → pre-collected artifacts; no vision → DOM/CSS/a11y reports + human visual review; no shell → CI; no repo write → patch artifact).
- P40. Model roles: Opus-class for rules and ambiguous design review; Sonnet-class for bulk implementation; second provider for independent critique; deterministic tools for measurable facts; human for taste and release.
- P41. Start small: corpus.yaml, observation schema, capture + CSS extraction scripts, SKILL.md, principles, arabic-rtl, research + critique workflows. "Do not build a huge architecture before the first benchmark."
- P42. After extraction ask: which rules have ≥3 independent references; which have counterexamples; which are trends; which are invariant; which depend on brand/density/objective/language/device/motion budget/engineering budget; which observations must NOT enter the skill.
- P43. v1.0 success = vs. no-skill baseline: higher blind human preference, higher brief fidelity, fewer generic repeated layouts, no mobile/a11y regression, equal or better performance budget, higher system consistency, preserved originality, correct triggering.

## 3. Uncertainties the report itself flags

- U1. 18 sites is a manageable engineering starting point, **not** a scientific optimum.
- U2. 12/3/3 split, selection weights, viewports, Lighthouse budgets, 3 generations per variant: proposals.
- U3. Final product framework (React/Next/Vite) and team size: unspecified.
- U4. "Ultra" as a Claude model: unverified. `app://connector_openai_deep_research` as a publishing mechanism: undocumented.
- U5. Multi-model critique does not guarantee removal of bias.
- U6. The Gantt timeline is an estimate.

## 4. Warnings

- W1. Don't let a model read sites and directly write the skill.
- W2. Awwwards is not the source of truth; an award does not make every decision good (spectacle, agency recognition ≠ usability, accessibility, conversion, performance).
- W3. Don't treat 2026 as a completed award year.
- W4. Don't copy gallery screenshots or site assets/code into a public skill.
- W5. Never mix fact and guess ("probably GSAP because it looks smooth" is not evidence).
- W6. DOM inspection does not explain canvas/WebGL designs.
- W7. Don't evaluate on the sites rules were extracted from.
- W8. axe = 0 ≠ WCAG compliant; Lighthouse accessibility score ≠ certification; Lighthouse is noisy; INP is not measurable by Lighthouse alone.
- W9. Visual goldens are environment-sensitive.
- W10. Pixel-diffing against a winner site leads to clones.
- W11. "Awwwards-flavored AI slop": giant headline + dark background + lime accent + 3 rounded cards + gradient blob + floating nav + scroll reveal.
- W12. Reject `Claude → design → critique itself → update own skill → push to main`.
- W13. Don't commit thousands of reference images to Git.
- W14. Don't couple the project to one model name.
- W15. A longer, more complex skill is not automatically better; evals are what prevent self-deception.

## 5. Where the report is silent → DI decisions

Implementation details the report does not specify are decided conservatively and logged in [DECISIONS.md](DECISIONS.md) with status `EXPERIMENTAL` until an evaluation supports them.
