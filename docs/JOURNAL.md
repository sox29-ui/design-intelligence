# DI research & evolution journal

Concise, append-only. Records decisions, discoveries, rejected hypotheses, corpus changes, uncertain findings, unexpected failures, rule changes and evaluation results so later sessions do not repeat the same reasoning. Newest entries at the bottom.

---

## 2026-10-02 — Session 1: bootstrap

**Read** the full deep-research report (Arabic). Extracted into [REPORT-EXTRACTION.md](REPORT-EXTRACTION.md): 16 report-verified facts, 43 proposals, 6 self-declared uncertainties, 15 warnings. Spot-checked V1–V3 against the Claude Code skills docs. New fact found: a top-level `.claude/skills/` created mid-session needs `/reload-skills` to be discovered → this session cannot rely on automatic discovery of the new skill; evaluation agents will be pointed at `SKILL.md` explicitly (see benchmark harness notes).

**Repository** started empty (one README line, one commit). Architecture follows report P30 with additions documented in [ARCHITECTURE.md](ARCHITECTURE.md): `datasets/raw/` (derived capture data), `datasets/candidates/` (candidate changes), `provenance/`, `docs/`, `research-artifacts/` (git-ignored).

**Environment discoveries (affect evidence quality):**
- Chromium could not validate TLS through the egress proxy: the NSS store had no CA. Added the proxy CA to `~/.pki/nssdb` with `certutil` (trust, not verification bypass). Container-local; future sessions may need the same step (documented in `scripts/README.md`).
- From this container, `www.awwwards.com` closes the tunnel and `land-book.com` returns HTTP 403 to non-browser clients; `thefwa.com` returns 200; `cssdesignawards.com` returns 202 (likely a challenge page). Galleries are discovery indexes only (P11), so this limits *signal verification*, not evidence collection. No bypass attempted (D-010).
- All lab timings go through the proxy (D-009).

**Decisions** D-001…D-019 recorded in [DECISIONS.md](DECISIONS.md), all EXPERIMENTAL.

## 2026-10-02 — Phase B: corpus selection

**Discovery.** Awwwards annual-awards 2025 winners and Sites of the Month 2026 read through the fetch service (direct access blocked); FWA case pages rendered in Chromium; CSSDA WOTY 2025 only via search summaries (CSSDA pages render empty); Ilham (Arabic gallery) listing parsed for featured sites. Land-book (403) and SiteInspire (429) unavailable → substituted, documented in [CORPUS-METHODOLOGY.md](CORPUS-METHODOLOGY.md) §4.

**Access failures (not bypassed):** Thmanyah (429/502), Salla, Al-Jumhuriya, Diriyah, Aesop (Cloudflare challenge), Rolex/Hermès (403), noon (502). Several strong Arabic typography references were lost; Thmanyah should be retried in a later round.

**Corpus frozen** (`datasets/corpus.yaml`): extraction = Lando Norris, Shopify Editions Winter '26, Scout Motors, Dropbox Brand, Exat, See What Eye See, GOV.UK, Our World in Data, Stripe, Tabby (AR/EN), Megaphone (AR), Ounass (EN/AR); validation = Oryzo AI, Mathaf (AR), Nahdi (AR); holdout (sealed) = ERA Residence, Al Jazeera (AR), Linear.

**Diversity check** (`npm run corpus:check`): all required industries/archetypes/objectives/densities/devices covered; studio cap respected; each split has RTL + high + low motion. Pre-capture motion distribution is 7 low / 5 medium / 6 high (report target 6/6/6) — accepted as a warning; revisit after capture. 7 of 18 quality signals are UNVERIFIED (real-world picks without a curation listing) and are labelled as such.

**Noted for later:** the 2025 Site of the Year (ref-001) uses a near-black + lime palette — the exact pairing the report lists as "AI slop". This is a deliberate test case for context-justified vs. generic use of a trend.

**Holdout discipline:** holdout picks were chosen from listing metadata only; no per-site award pages were opened for them. Disclosed exposure: before the split existed, a screening script loaded hol-002 (Al Jazeera) once and logged title, `lang`/`dir`, page height and text length; its screenshot was never viewed and has been deleted. hol-003 (Linear) was loaded once in the very first browser smoke test (page title only). No design observations of holdout sites were made.

## 2026-10-02 — Phase C: evidence collection (extraction split)

**Captured** all 12 extraction references (16 pages incl. AR/EN pairs and GOV.UK/OWID second pages) at 390×844, 768×1024, 1440×900, 1920×1080 with `scripts/collect.ts`; normalized to 230–544 VERIFIED observations per reference; analyst OBSERVED/INFERRED notes in `datasets/observations/ref-*/analyst.src.yaml`. Cross-reference summary: [`datasets/corpus-matrix.extraction.md`](../datasets/corpus-matrix.extraction.md).

**Tooling fixes made during capture** (each changes what was measured — recorded so later comparisons are fair):
- Consent click on GOV.UK inflated CLS → the probe now reports `cls-before-interaction` separately from the session total.
- Focus walk started from wherever the consent click left focus → fixed (focus start reset). **Captures for ref-001, 002, 007–012 used the old start point**; focus-indicator shares for them sample a different subset of tab stops.
- Consent banners with hashed class names were not dismissed → fallback "reject" search inside fixed/sticky layers. Banners stayed open on Tabby, Dropbox and Megaphone captures (visible in screenshots, may cover content).
- Scout Motors reloaded the page on consent → `clickAndSettle`; recaptured.
- Probe 0.1.0 counted text over `<img>` as text on white (Ounass showed 75 % "low contrast") → fixed in probe 0.1.1. **All extraction captures except ref-003 carry the legacy estimate**; it is tagged `legacy-contrast-estimate`, capped at confidence 0.9 and never used as a weakness signal. Contrast claims in rules use axe counts instead.

**Known gaps (UNVERIFIED, not guessed):** Lando Norris WebGL hero did not render under software GL in headless Chromium (hero composition unknown; mobile menu probe inconclusive); See What Eye See simulator interior never entered (only the entry page); Shopify Editions 1440 capture was very slow (timings unreliable even relative to the corpus). Lab timings are proxy-relative (D-009) and 2–3 capture workers ran concurrently, adding noise. Lighthouse has not been run on the final captures.

**Untrusted content:** no instruction-like content was found in stored data; none logged.

## 2026-10-02 — Phase D: synthesis (v0.1 rule set)

**Authored** 57 rules in `datasets/rules/` from extraction-split evidence only: 28 principles, 12 invariants, 8 anti-patterns, 7 signatures, 2 hypotheses (candidate, not compiled). Every rule cites observation IDs that `validate.ts` resolves; 25 rules carry counterexamples. Confidence: no rule exceeds `medium` because no validation evidence existed at authoring time (D-006). All rules are `provisional` — no human has reviewed them (D-007).

**Audit before commit** (claims in rationales were re-checked against the corpus matrix): `typography.families-with-roles` claimed ten references but cited six → four supporting references added after checking rendered-font measurements. `accessibility.visible-focus` claimed "eleven of twelve" with full focus visibility → measured shares are 9 × 100 %, 2 × ≥ 93 %, 1 × 53 %; rationale corrected.

**Choices worth revisiting:**
- Signatures are compiled as *do-not-copy* knowledge, each pointing to the transferable principle behind it. This is the main mechanism against "copy the reference".
- The dark + neon reference (ref-001, 2025 Site of the Year) became the counterexample that bounds `antipattern.dark-neon-without-identity` instead of evidence for it: the pairing is the subject's livery. The anti-pattern therefore rests on the report plus that boundary (confidence `low`).
- Arabic invariants lean on W3C/practitioner sources because the corpus has only three Arabic references (ceiling `medium`).

**Decision D-020 (benchmark leakage):** cycle-01 control outputs are *not* used as evidence for v0.1 rules, even though they visibly exhibit generic signatures. Using them would tune DI to the benchmark it is evaluated on. Their failures feed v0.2 candidate changes only (`datasets/candidates/`).

## 2026-10-02 — Verifier fixes before release (inspect-page 0.1.2)

Running `verify-page.ts` on the first control output exposed three measurement errors; each would have mis-scored benchmark outputs in *both* conditions:
1. **Focus measured mid-scroll.** The focus walk read positions 140 ms after Tab; pages with `scroll-behavior: smooth` were still scrolling, so 5 stops counted as "off-screen". Now waits for the scroll position to settle.
2. **Ancestor focus indicators missed.** `.card:has(a:focus-visible) { outline }` (a legitimate pattern) counted as "no indicator". When an element shows no indicator itself, the probe now compares its ancestors (4 levels) and pseudo-elements focused vs. blurred, with transitions disabled.
3. **Page-level backgrounds ignored.** The colour pass scanned `body *` only, so a gradient or colour on `html`/`body` (the canvas) was invisible to the palette and to the `gradient-backgrounds` signature. The canvas background now counts at full document area.

Guarded by new fixture tests (`npm run test:browser`: a known-good and a known-bad page). Captures made before 0.1.2 (all extraction references, validation captures started before the fix) keep their old values; palettes from 0.1.2 captures include the canvas colour, so palette shares are not directly comparable across versions.

## 2026-10-02 → 2026-10-04 — Phase D (part 2): validation split

**Captures.** val-001 Oryzo (immersive product story, LTR) and val-002 Mathaf (Arabic museum home) captured at all four viewports. **val-003 is unavailable:** Nahdi served an error page (HTTP 200, "something went wrong / 500") to two capture attempts; the slot substitute Whites (chosen by slot, from access checks only — Al-Dawaa returned a Cloudflare challenge) served the same kind of error page to the headless browser although a plain HTTP fetch returned the storefront. Nothing was bypassed (D-010); both captures were discarded (error pages, not the sites). The collector now recognises error pages served with HTTP 200 (`SOFT_ERROR_RE`, tested). Validation therefore covers one LTR immersive site and one Arabic cultural site — **no Arabic commerce site validates the commerce and RTL-commerce rules.**

**Method.** `scripts/validation-check.ts` decides per rule whether its WHEN applies to the validation page (from corpus dimensions) and, for 27 rules, compares VERIFIED measurements with the rule (thresholds written before the checks were run, with two exceptions disclosed here: the family-count check was aligned with the rule text — "a third family only for a functional role *or a single accent*" — after Mathaf's 3.7 % display script was first flagged; and unreadable cross-origin CSS (0 logical / 0 physical) was reclassified from "inconsistent" to "no measurement"). AVOID WHEN cases are `inconclusive` by definition. Rules without a mechanical check were judged from screenshots (analyst entries citing new OBSERVED/INFERRED observations in `datasets/observations/val-00*/analyst.src.yaml`).

**Results** (35 rules received at least one validation result): consistent results on typography (families, reading size/measure, display steps on Mathaf), motion (durations, reduced motion), colour from content, structure with lines, RTL root direction / mirroring / numerals / no tracking, and the generic-signature anti-patterns (both sites avoid or deliberately motivate them — Oryzo stages the dark rainbow "AI glow" exactly once, as a joke about AI marketing). **Inconsistent:**
- `typography.display-steps-then-caps` — Oryzo's immersive hero scales as a whole (+33 % from 1440 to 1920). AVOID WHEN extended to whole-composition scaling (follows from the rule's own rationale: capping makes sense where containers are capped).
- `typography.modest-scale-for-dense-pages` and `hierarchy.router-hero-for-task-intent` — Mathaf leads with a 7.9× welcome statement instead of a router. A cultural institution's home page has brand expression as a co-primary goal; both rules now name that context in AVOID WHEN. **This refinement rests on one site and is itself unvalidated.**
- Normative rules that quality sites still break: no `h1` on either site (`accessibility.semantic-skeleton`), 5 contrast failures on Mathaf, Mathaf's mobile menu without `aria-expanded`, Mathaf's consent banner with "reject" as a small link. Recorded as inconsistent; the rules stand (they come from standards), but "award-level sites do this" is not evidence for them.

**Confidence changes (D-021):** six rules → `high` (`motion.duration-by-purpose`, `motion.honour-reduced-motion`, `typography.families-with-roles`, `typography.reading-text-16-to-20`, `rtl.root-direction`, `accessibility.visible-focus`). Three rules met D-006 only through analyst validation (`color.colour-from-content-or-identity`, `layout.structure-with-lines-not-shadows`, `antipattern.generic-premium-cluster`) and stay `medium` until an independent review.

**Measurement notes.** Oryzo's loader still covered the page at 4.2 s (software WebGL in the lab), so its first-viewport metrics come from the post-load capture. Mathaf's hero media did not render. Lighthouse was not run on validation captures.
