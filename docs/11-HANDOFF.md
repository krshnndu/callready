# 11. Handoff: how to continue this project with any agent

> **Retired 2026-10-29.** The service is shut down and the repository archived. Read [09-CLOSEOUT.md](09-CLOSEOUT.md) first; this handoff describes the project as it stood when live.

Written 2026-10-28 so the work can continue without the original session, whether with Hermes, Gemini, Claude or a person. Read this, then `AGENTS.md`. Host-specific details (server paths, ports, secrets locations, deploy commands) are in the gitignored `private/HANDOFF.md` on the build server, not in this public file.

## 1. State on 2026-10-28

**Live:** https://callreadyai.vercel.app · **Repo:** https://github.com/krshnndu/callready (public) · **Latest release:** v0.5.0, with later work under `[Unreleased]` in `CHANGELOG.md`.

Built and verified:
- **The five-step journey on any company.** Load a company (the synthetic sample, six real test datasets, an upload, or a JSON pack), then Quarter, Pressure map, Question bank, Rehearse and Readiness report.
- **Rules first.**
  - Figures, commitment status, the pressure ranking, questions, scoring and recommendations are all plain code: `web/js/core.js`, `score.js`, `recs.js` and `extract.js`.
  - AI does two jobs only, both optional:
    - Converting documents the rules cannot read (`/api/extract`).
    - Coaching on request (`/api/coach`).
- **No hallucinations by policy.** Rule extraction reads labelled table rows, so every value is in the document by construction. A row that does not line up with its header is refused. AI output is cross-checked against the rules. On "Use", the strict evidence policy clears any figure, quote or transcript line not found in the source, unless a person confirms it.
- **Guardrails in four layers,** each tested: sanitising on entry, financial sanity rules, escaping at render, and a CSP. On the API: a key, limits, caps, output caps and 7-day retention.
- **Verified on unseen real filings,** with Havells and CEAT run end to end on the live site: 6 of 6 headline figures matched the hand-checked truth for each company, and every figure in use was found in its document.

**Deploying.** The web app deploys itself: Vercel's Git integration builds `web/` on every push to `main` (connected 2026-10-28). Pull requests get preview deploys. The API is deployed on the server; see `private/HANDOFF.md`.

## 2. The gates (run all before claiming anything works)

| Command | What it proves | Last result |
| --- | --- | --- |
| `node scripts/check_engine.mjs` | Data readiness, scoring calibration, evidence on recommendations | pass |
| `node scripts/check_bias.mjs` | Scorer does not penalise phrasing or register | pass |
| `node scripts/check_guardrails.mjs` | Sanitiser, sanity rules, units and consistency, evidence policy, upload limits | pass (60+ checks) |
| `node scripts/check_fuzz.mjs 10000` | Engine never crashes or shows NaN/undefined/null on mutated packs | 0 failures |
| `node scripts/check_extract_rules.mjs [scratch]` | Rule extraction against sample and real ground truth | pass |
| `node scripts/check_xss.mjs [url]` | Hostile pack on every screen: no payload runs | pass, local and live |
| `node scripts/check_layout.mjs` | 6 screens x 7 companies x 2 sizes: no overlaps or spills | pass |
| `node scripts/check_content.mjs` | What a person reads: options, labels, quotes, punctuation, no NaN | pass |
| `node scripts/check_charts.mjs` | Chart truth: every mark at its value, cut axes marked and said, round ticks with units; real screens plus 1,500 random charts | pass |
| `cd api && uv run pytest -q tests` | API guardrails | 13 passed |
| `node scripts/journey.mjs <scratch> [url]` | Live end-to-end journey on real PDFs | 6 of 6 truth on both companies |

The browser gates need the local server `node scripts/serve.mjs`, which sends `Cache-Control: no-store`; they refuse to run against a local server that lets the browser cache modules, because a gate could then pass on stale code. They also need Chrome; set the `CHROME` environment variable on Linux. CI runs everything except the journey on every push.

## 3. How work is done here (keep doing it this way)

The superpowers methodology:
1. **Write the plan first** in `docs/superpowers/plans/`.
2. **Test first.** Write the failing test and watch it fail, then the minimal code, then watch it pass.
3. **Defense in depth** for any untrusted data.
4. **Verify before completion:** run the gates fresh and quote their output.

House rules (also in `AGENTS.md`):
- No em or en dashes.
- No host details in tracked files.
- Commit after each task with Conventional Commits, update `CHANGELOG.md` under `[Unreleased]`, and keep the README tables true.

## 4. Backlog, in priority order

0. ~~Demo video link~~ Done 2026-10-28: https://www.tella.tv/video/surviving-earnings-day-0dxghs83, set as `DEMO_VIDEO_URL` in `web/js/site.js` and linked from the README.

1. **More rule coverage for tables the rules cannot read yet.** Nestle's garbled table text and Wipro's IFRS million layout fall back to AI today. Add row synonyms and header patterns, with a failing test from their text first.
2. **Guidance pressure titles from rule-extracted sentences.** They use the first 60 characters of the sentence; derive a short topic instead.
3. **Margin basis.** CEAT reports a -403 bps margin change; we compute -405 bps from the rounded reported figures. Both are correct. Consider showing the company's own stated change when the document prints it.
4. ~~**Close-out (governance C11):**~~ Done 2026-10-29, see `09-CLOSEOUT.md`. a final report and lessons learned, plus the decommissioning plan (see the teardown list in `private/HANDOFF.md`).

## 5. Known limitations

- **Data trust (the pitched limitation):** the AI features send text to outside model providers, so unpublished results cannot go through them; the fix is models in the company's own cloud, or rules only. See the README "Key limitation".

- Figures written as words ("eleven point six percent") are not detected by the scorer.
- The rule extractor needs a header line that names at least two periods, such as `Q2 FY27 Q2 FY26`.
- The AI gateway can be slow, at 30 to 300 s. Every path works without it.
