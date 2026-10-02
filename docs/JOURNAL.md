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

**Holdout discipline:** holdout picks were chosen from listing metadata only; no screenshots or per-site award pages were opened for them.
