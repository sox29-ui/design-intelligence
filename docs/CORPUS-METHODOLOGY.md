# Corpus selection methodology (DI v0.1)

Goal: 18 references that each cover a **different region of the design space**, not "the 18 best sites". Quality and diversity over quantity (report P5–P10).

## 1. Discovery (2026-10-02, collected through that date)

| Source | Access from DI environment | How used |
|---|---|---|
| Awwwards | Direct: tunnel closed. Via fetch service: readable | Annual Awards 2025 winners page and Sites-of-the-Month 2026 list read 2026-10-02; per-site pages for credits/dates. |
| CSS Design Awards | Gallery pages render empty/challenge | WOTY 2025 results via web search (CSSDA blog listing); cross-checked with Awwwards/FWA pages. |
| The FWA | Readable in browser | Recent FWA of the Day cases (Sept 2026) read in Chromium; award type/date read from case pages. |
| Land-book | **HTTP 403** to every client | Unavailable → substituted (see §4). |
| SiteInspire / Godly | SiteInspire 429; godly.website redirects to recent.design | Unavailable as specified → substituted (see §4). |
| Ilham (ilham.io, Arabic gallery) | Readable | Featured Arabic sites and their URLs read from the listing. |
| Real-world (MENA commerce/news, public sector, data, commercial product) | Direct | Used for counter-taste, commerce realism and Land-book substitutes. |

Award years: 2025 annual winners are used as completed-year references; 2026 references are Sites/FWA of the Day/Month up to 2026-10-02 (report P10). 2026 is **not** treated as a completed award year.

## 2. Eligibility gates (all must pass)

1. Live original site reachable from the DI environment with a real page (no bot challenge, no `Access Denied`). Challenges are **not** bypassed (D-010).
2. `robots.txt` does not disallow the pages to be captured for `*` (D-017).
3. Distinct contribution: the site must add at least one axis value not yet covered, or a strong contrast case (good/bad accessibility, density, motion).
4. Studio cap: at most two references from the same studio/company (P8).

## 3. Scoring (report P9 — a proposal, not a standard)

Each criterion is scored 0–5 as a **pre-capture judgement** (INFERRED; revisited after capture):

```text
25%  quality_signal            award / curation / recognised-system signal
20%  archetype_coverage        adds an under-covered visual archetype
15%  interaction_diversity     helps balance low / medium / high motion
15%  mobile_quality            expected mobile craft (or instructive mobile failure)
10%  a11y_perf_contrast        good-or-bad accessibility/performance contrast value
10%  rtl_localization          Arabic / RTL / bilingual coverage
 5%  implementation_diversity  WebGL, server-rendered, CMS, SPA, no-code, …
```

Scores rank candidates *within a gap* (e.g. "which Arabic commerce site?"). They do not override the diversity constraints.

## 4. Deviations from the report's source quotas (P6)

| Report quota | DI v0.1 | Reason |
|---|---|---|
| 6 Awwwards | 5 primary (+ Awwwards SOTD also held by 2 CSSDA picks) | Diversity constraints filled the sixth slot better from other sources. |
| 3 CSSDA | 2 primary | Remaining CSSDA 2025 winners overlapped already-covered archetypes (e.g. Charles Leclerc ≈ Lando Norris). |
| 2 FWA | 1 primary (+ FWA of the Day also held by Exat) | Second FWA candidate (Cyera, Active Theory) duplicated the immersive/high-motion slot. |
| 2 Land-book | 0 → 2 real-world commercial product sites (Stripe, Linear) | Land-book returns HTTP 403. Substitutes serve the same purpose: commercial, non-spectacle design that reduces award bias. Signal status UNVERIFIED. |
| 1 SiteInspire/Godly | 0 → 1 real-world information-heavy site (Our World in Data) | SiteInspire 429; Godly redirected elsewhere. |
| 3 Arabic | 6 (3 extraction, 2 validation, 1 holdout) | Arabic/RTL is first-class in DI; validation and holdout each need Arabic references to test RTL hypotheses without leakage. Several strong Arabic candidates were inaccessible (Thmanyah 429/502, Salla, Al-Jumhuriya, Diriyah behind challenges). |
| 1 counter-taste | 1 (GOV.UK) | As specified. |

## 5. Split (P5) and leakage policy

- **Extraction (12, `ref-*`)** — may directly produce observations and rules.
- **Validation (3, `val-*`)** — captured *after* candidate rules exist; used to test/refine them (`evidence.validation` in rules). Never cited as supporting evidence.
- **Holdout (3, `hol-*`)** — sealed (D-008): no capture or inspection until the v0.1 rule set is frozen; used only to check generalization. Selection used only award/category metadata, not visual inspection.

Split rules: each split contains at least one Arabic/RTL reference, one high-motion reference and one low-motion reference, so validation and holdout can test every major rule family.

## 6. Diversity validation

`npm run corpus:check` reports distribution over industry, archetype, motion, objective, density, device focus, direction, scheme and source, enforces split sizes and the studio cap, and warns when a target (e.g. 6/6/6 motion) is missed. Results are recorded in the journal.

## 7. Known limitations

- Classification is a pre-capture judgement until `assessment: POST-CAPTURE-CHECKED`.
- Award galleries could not be crawled; award facts come from the pages listed in each reference's `signal_evidence`.
- Famous sites may be known to the generating model from pre-training (holdout limitation, D-008).
- Corpus captures one point in time; sites change. Capture IDs are timestamps.
