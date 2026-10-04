# Cycle 01 — analysis plan (written before any output was scored or reviewed)

**Outputs.** Control: A×3, B×2, C×2, D×2. Treatment: 2 per brief (A-1/2, B-1/2, C-1/2, D-1/2). The third control run for A exists only because a resumed run finished; it is included, and every per-brief comparison is also reported on matched runs 1–2.

**Primary outcome.** Blind critic weighted total (/100, weights from `evals/rubrics/scorecard.yaml`) per output; compared as the per-brief difference of condition means (treatment − control), then averaged over briefs (each brief weighted equally).

**Secondary outcomes.**
1. Hard-gate failures (automated FAIL gates and critic-reported gates).
2. Unjustified generic signatures (critic) and signatures present (automated scan).
3. Automated accessibility: axe serious + critical nodes at 390 and 1440, focus-indicator share, `lang`/`dir`.
4. Lighthouse mobile (lab, proxied): performance and accessibility scores, total bytes.
5. Cross-brief sameness within each condition (fonts, palette, scheme, radius; lower = less of a house style).
6. Critic rank within each brief.

**Rules of interpretation.**
- With 2–3 outputs per cell no significance test is meaningful; results are reported descriptively with every per-output value. A difference is called "consistent" only if it has the same sign in at least 3 of 4 briefs.
- The critic is one model run per brief, a different model from the generator, blind to condition; it is not ground truth (report P27). Human review is required before any rule becomes `accepted`.
- Self-reported verification in agents' summaries is not used as evidence; only the scorer's own measurements and the blind critic count.
- Outputs are scored sequentially after all generations finish, under the same container conditions.

**Known threats (recorded before results).** Condition names are visible in prompt-file and output paths; the DI skill became discoverable to control agents after a session restart (audited: no use); generation was interrupted by an account usage limit for six control runs; treatment agents can run the same verifier that the scorer uses (they may optimise for its checks).
