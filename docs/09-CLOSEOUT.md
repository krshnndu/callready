# 09. Close-out: final report, lessons and decommissioning

CallReady was a competition prototype, built and submitted on 2026-10-28. Its purpose is done, and it was retired on **2026-10-29**. This document closes governance item C11 and gate G-D (`08-GOVERNANCE.md`).

## 1. Final report

**What was delivered.** A working journey from sample inputs to a business recommendation: load a company (a synthetic sample, six real Q2 FY27 filings, an uploaded results PDF or a JSON pack), see the quarter against last year, consensus and earlier promises, a ranked pressure map, a question bank, a rehearsal scorecard with an optional AI coach, and a readiness report with recommendations and a business case. A 90-second demo video and a public repository with releases v0.1.0 to v0.6.1.

**How it reasoned.** Rules first: arithmetic, ranking, scoring, figure checking and charts are tested code that runs in the browser. AI did two optional jobs, converting documents the rules could not read and coaching on request, and its output was checked by rules. A figure was used only if it was found in the source, derived by arithmetic from found figures, or confirmed by a person.

**Evidence at close (v0.6.1).**

| Measure | Result |
| --- | --- |
| Round trip, the sample's own results PDF | 48 of 48 fields matched |
| Rules against verified AI readings, six real companies | 18 of 18 headline fields agreed |
| Live end-to-end on unseen filings (Havells, CEAT) | 6 of 6 headline figures matched hand-checked truth for each |
| Automated gates in CI | engine, bias, guardrails, a 10,000-pack fuzz, extraction, XSS, layout, content, chart truth (1,500 random charts) and 13 API tests, all passing |
| Scorer calibration | 12 of 12 reference answers Green; weak samples Red and about 66 points lower |

**What was not built.** The timed mock call (F14), OCR for scanned PDFs, peer data, accounts and multi-tenancy. The scorer was never validated against real calls.

## 2. Lessons learned

1. **A test that encodes the wrong rule passes the wrong output.** The chart gate treated a marked, captioned axis cut as honest, so a margin bridge that made 11.6% look half of 14.2% passed. A user's screenshot caught it. The fix was to the rule in the test (bars start at zero unless a step would vanish), not only to the chart.
2. **A caching dev server can hide a fix.** A static server let the browser keep old modules, so a fixed chart still drew the old way. Local serving moved to a no-store server, and every browser gate refuses a server that caches.
3. **Real data breaks rules written on synthetic data.** A loss larger than revenue (Tejas), a PDF reader splitting "317" into "31" and "7", and an annual statement with no EBITDA each forced a rule change. Run real documents early.
4. **Free points are a scoring bug.** "Hello, I am doing well" scored 56 because safety and consistency rewarded saying nothing. A relevance gate now runs first.
5. **Design for the backend to be absent.** A tunnel incident made every API call slow on build day; the product held up because every screen worked without the API.
6. **Make releases and units automatic, not remembered.** Releases now come from tags and the changelog; one unit module and a gate keep margin changes in basis points and minus signs correct everywhere.
7. **Write the decommissioning plan when you build.** The handoff pointed to a teardown list that did not exist, so the inventory had to be rebuilt from the host at close.

## 3. Decommissioning record (2026-10-29)

| Component | Action | Reversible? |
| --- | --- | --- |
| API service on the build server | Stopped, disabled at boot, unit file removed | Yes: reinstall from `ops/` |
| Public tunnel to the API | Switched off; other services on the server untouched | Yes |
| API secrets file on the server | Deleted. The gateway key itself was **not** revoked, because it may be shared with other services | Not needed |
| Server copy (repo clone, SQLite cache, test data) | Copied to the owner's machine, verified, then deleted from the server | Copy kept privately |
| Web app on Vercel | Project deleted; the site address now returns 404 | Redeploy from `web/` to a new project |
| GitHub repository | Dependabot pull requests closed; repository archived (read-only) and kept public | Yes: unarchive in settings |
| Demo video | Kept on Tella, linked from the README | |
| Local working folder | Moved to the owner's archive folder, not deleted | Yes |

## 4. To revive it

1. Unarchive the repository.
2. Create a Vercel project with root directory `web/` and build command `node build.mjs`; set `BACKEND_ORIGIN` and `BACKEND_KEY` only if the API is wanted. The app works without them: scoring, ranking, charts and rule extraction run in the browser.
3. For the API: Python 3.12 and uv, `uv sync --frozen` in `api/`, the environment variables in `.env.example`, and the unit template in `ops/`.

_Last true: 2026-10-29_
