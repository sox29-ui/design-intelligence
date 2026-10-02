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
