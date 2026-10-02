# Repository tooling

All scripts are TypeScript executed directly by Node ≥ 22.18 (type stripping; erasable syntax only — D-001).

| Script | Purpose |
|---|---|
| `validate.ts` | Schemas, evidence-pointer resolution, holdout leakage, rule confidence ceilings (D-006), skill contract. |
| `check-corpus.ts` | Diversity / split / studio constraints of `datasets/corpus.yaml`. |
| `collect.ts` | Capture a corpus reference with Playwright at the benchmark viewports (robots check, consent policy, hashing). |
| `normalize.ts` | Deterministically derive VERIFIED observations from raw captures. |
| `lighthouse.ts` | Lab Lighthouse summary for a reference (environment-relative — D-009). |
| `build-skill.ts` | Compile rules (`datasets/rules`) into skill references. |
| `why.ts` | Provenance query: why does a rule exist? |
| `score-benchmark.ts` | Automated checks for benchmark outputs. |
| `package-skill.ts` | Build distributable ZIP of the skill into `dist/`. |

## Environment notes

- Browser: Playwright 1.56.1 uses the pre-installed Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Never run `playwright install` in the managed container.
- Egress proxy: Chromium reads trust from the NSS DB. If pages fail with `ERR_CERT_AUTHORITY_INVALID`, add the proxy CA once (this *adds trust*, it does not disable verification):
  ```bash
  certutil -A -d sql:$HOME/.pki/nssdb -n ccr-agent-proxy -t "C,," -i /root/.ccr/agent-proxy-ca.crt
  ```
  The collector passes `HTTPS_PROXY` to Chromium automatically.
- Lab timings measured through the proxy are environment-relative (D-009).
