# Changelog

All notable changes to CallReady. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Each version is a git tag with a GitHub release.

## [Unreleased]

### Changed
- Pitch script rewritten as a product demo that covers every point of the brief: the problem, the working journey from sample inputs to a recommendation, earlier commitments compared, synthetic data and assumptions stated, business value, and one key limitation (`docs/07-PITCH.md`, with a compliance table).

## [0.6.0] - 2026-10-28

Charts that tell the truth, one unit system, a verified coach answer, and the demo video.

### Added
- The demo video (https://www.tella.tv/video/callready-earnings-prep-ai-1-giwu4686) is linked from the credit line in the app and from the README.

### Changed
- The margin bridge is drawn as driver bars around zero in basis points, ending in a net-change row (the same form as the segment margin-change chart). A waterfall of a small change on a large margin crushed the drivers into slivers even at an honest zero baseline. Drivers that do not add up to the reported change get a "Not explained" row. Long driver labels wrap instead of truncating.
- One unit system, in `web/js/units.js`: margin levels in percent (11.6%), every change in a percentage in signed basis points (−258 bps; cash conversion too, which was in "pts"), growth as a signed percent (+14.0%), and a true minus sign for every negative. Every formatter goes through it, and one typesetting pass on the page gives a minus sign to negatives in any text, including rule-written sentences and company quotes. `check_content.mjs` now fails a hyphen used as a minus, or a change in a percentage given in %, points or pp.
- The pitch is now a 70-second read-aloud script with on-screen directions for each part, recorded in Tella (`docs/07-PITCH.md`). The key limitation is data trust: the AI features run on outside providers, so a finance team cannot use them on unpublished results until the models run inside the company's own cloud. README and handoff updated to match.

### Fixed
- The margin bridge still exaggerated the fall (user screenshot): its axis started at 9%, so 11.6% was drawn at half the height of 14.2% instead of 82%. The cut was marked and captioned, but it was not needed: every step is visible from zero. Bars now start at zero, and a waterfall cuts its axis only when a step would be thinner than 2 px drawn from zero (`MIN_STEP_PX`). The chart-truth gate now fails any cut the data did not need, and was proven to catch this exact chart.
- Chart labels and bridge tooltips write negatives with a true minus sign (U+2212), and never "-0". The gate fails a hyphen used as a minus anywhere in a chart.
- Charts that misled (found from a user screenshot of the Quarter screen). The margin line had uneven ticks (11.4, 12.9, 14.5) with no unit; it now has round ticks with the unit (11% to 15%), and its gutter fits the widest tick. The margin-bridge waterfall cut its axis above zero without saying so, so 14.2% looked more than twice 11.6%; the cut is now marked on the bars it shortens and the caption says where the axis starts. The pressure-map gauge also had unrounded ticks; it moved into `charts.js`.
- Root causes, closed in code: every chart now maps values through one `scale()` and records it on the drawing, and bars are drawn only by `barMark()`, which adds the break mark and caption whenever an axis cuts a bar. A waterfall whose drivers do not add up to the change shows the remainder as a "Not explained" step instead of a silent jump. Bar charts handle negative values; charts drop non-numbers and say "No figures to chart" when nothing is left. Random inputs found and fixed two more: ticks finer than 4 decimals were mislabelled, and an empty segment name printed "undefined".
- Stale code in local testing: the Python static server let the browser cache modules, so a page ran old `charts.js` beside new `app.js`. `scripts/serve.mjs` serves `web/` with `Cache-Control: no-store`, and the browser gates refuse a local server that caches. CI uses it.
- The coach no longer withholds its whole answer when one figure cannot be found in the disclosures: that figure is removed and named, and the rest is shown. Figures are matched to the nearest metric word, and basis points allow rounding (25 bps for a 24.6 bps change). When the AI coach is not used, a rules-built ideal answer is shown with the facts to fill in, in brackets.

### Added
- `scripts/check_charts.mjs`: the chart-truth gate. It reads every drawn mark back on every screen for every company at two widths, then on 1,500 seeded random charts, and fails if a mark is off its value by more than 0.75 px, an axis is cut without a mark and a caption, a bar chart leaves out zero, or a tick is not round, evenly spaced, labelled with its unit or placed at its value. Proven by breaking `charts.js` three ways: each break fails the gate. It runs in CI.
- `scripts/serve.mjs`, the no-store local server. Every browser gate also has a 10-minute watchdog, so a hung Chrome fails the gate instead of hanging it.

### Added
- Credit line: "Made by Krishnendu" (krishnendu.me), the source on GitHub, and the demo video. It sits at the foot of the rail on laptops and in a page footer on phones. The demo link reads "coming soon" until `DEMO_VIDEO_URL` is set in `web/js/site.js`.

### Fixed
- A non-answer ("hello, I am doing well") scored 56, because disclosure safety, consistency and accuracy gave free points when nothing was said. A relevance gate now runs first: an answer must use the question's key terms or substantive words, or give a figure on topic. Otherwise five dimensions are not assessed and the total is capped at 15 (Red, flagged as not an answer). Tests first: small talk, a polite refusal, a long off-topic answer and filler now score 6 to 9.

### Changed
- The 60-second countdown is replaced by a live word count and the speaking time it implies. The clock had no consequence; length is what the Delivery score measures.

### Added
- Annual statements (FY25 vs FY24, or year-end dates such as "31 March 2025") are read by the rules. Found when a user uploaded Reliance Retail's annual financial statements.
- EBITDA is derived by arithmetic (PBT + finance costs + D&A - other income) when a document does not print it. The derivation is recorded and shown; its inputs are verified against the document, the result is not. When EBITDA can be neither found nor derived, the error names the figures needed. Extraction prompt `extract-v3` asks for those inputs.

### Fixed
- Blank speaker names from extraction gave empty options in "Answering as". Speakers now always fall back to their role, and the sanitiser drops blank names.
- The persona line no longer splits punctuation off into its own layout item; curly quotes are used across all UI and rule copy.
- Stale code: every build stamps its commit into all module URLs, and a running page offers a reload when a newer version is live.

### Added
- `scripts/check_content.mjs`: a content-quality gate over every screen x company x size (empty options, nameless buttons, stray punctuation, straight quotes, empty labels, NaN/undefined). It runs in CI.

### Changed
- Web deploys come from GitHub: Vercel's Git integration builds `web/` (root directory) on every push to `main`, so no machine-specific Vercel login is needed to ship.

### Added
- `docs/11-HANDOFF.md` and `GEMINI.md`: continue the project with any agent (state, gates, workflow, backlog). Host details and test data sit in the build server's gitignored `private/`.
- Robustness, test-first (`docs/10-EDGE-CASES.md`, `docs/superpowers/plans/2026-10-28-robustness.md`). Rule-based extraction (`extract.js`) runs first, and AI only when needed. A strict evidence policy applies. A fuzz test (10,000 packs) and units and consistency rules were added. The coach is now on demand. Recommendations carry their evidence. `scripts/journey.mjs` drives the live site with unseen filings: Havells and CEAT each 6 of 6 against hand-checked truth.

### Security
- Guardrails in four layers, planned and built test-first with the superpowers methodology (`docs/superpowers/plans/2026-10-28-guardrails.md`). Layer 1: `sanitizePack` on every load path (types, length and list caps, http(s)-only links). Layer 2: financial sanity rules (revenue above zero, profit not above revenue, margins within -100 to 100, units warnings). Layer 3: every chart attribute escaped; the new XSS gate found and fixed unescaped chart labels. Layer 4: Content-Security-Policy, HSTS and COOP; on the live site the CSP blocks an injected inline handler.
- Upload limits (5 files, 20 MB each, PDF or text, 2 MB packs), proxy body caps (64 KB coach, 200 KB extract), and model output capped at 1500 characters per field.
- Tests: `check_guardrails.mjs` (37 checks), `check_xss.mjs` (canary plus 7 screens), `api/tests/test_guardrails.py` (13 tests). All run in CI with the layout gate.

### Changed
- Repository made public. CI's secret scan can read pull requests; Dependabot updates `uv.lock` with `pyproject.toml`.
- `docs/07-PITCH.md` is now a shot-by-shot recording script: setup checklist, clicks, spoken lines, timings and fallbacks. `scripts/record_demo.mjs` includes the any-company beat.

### Fixed
- Charts are laid out by rules at the real container width: text is measured with the web font, labels wrap and then truncate with the full text in the tooltip, value labels move inside the bar or across the zero line when they do not fit, and tick labels thin out. Fixes overlapping labels on phones in the segment chart and the margin bridge.
- Period labels are normalised to the short form ("Q2 FY27"); a bracketed date range moves to `period`.
- Every quote on screen gets one pair of curly quotes (no more nested quotes).
- Phone header is compact, and the step bar no longer clips the first step.

### Added
- `scripts/check_layout.mjs`: a layout gate that renders 6 screens x 7 companies x 2 sizes in headless Chrome and fails on overlapping chart text, chart text outside its chart, sideways page scroll, or content outside its panel.

### Fixed (earlier)
- Persona line spacing, the "1 rehearsed answers" plural, and chart labels too small to read on phones.
- The upload retries and keeps polling through slow or dropped requests (seen during a Tailscale Funnel incident).

## [0.5.0] - 2026-10-28

Load any company, not just the sample.

### Added
- **Load a company** screen. Three ways in: real-company test datasets, upload of results documents (PDF or text), or a pack in the `callready.pack.v1` JSON format, with a downloadable template.
- **Upload pipeline.** PDF text is read in the browser (pdf.js). AI converts it to a pack: Gemini 3.8 Flash medium first, with Claude Sonnet 4.6 and Flash high as fallbacks. It runs as a background job the browser polls. Rules then check every extracted figure, commitment quote and transcript line against the source text.
- **Review** screen. Every extracted field is editable and carries a found-in-document dot, alongside the validator's errors and warnings, before the pack is used.
- **Six test datasets** of real Q2 FY27 filings from NSE and company sites: Wipro, Jindal Saw, Tejas Networks, Pitti Engineering, JK Tyre and Nestle India. Figures verified by rules: 34/34, 17/17, 16/17, 13/13, 12/12 and 18/20.
- One pack-agnostic engine (`core.js`). Commitment status is computed by rules where the metric allows, and the question bank is generated by rules for packs that bring none. Covers EBIT-only reporters, a PAT collapse, a quarter-on-quarter margin slip, guidance on record, and the standing outlook, growth-mix and capital-allocation questions.
- Charts: revenue and margin trends with the guided band, segment margin change, a margin-bridge waterfall, and readiness bars. Each has hover and keyboard tooltips.
- Light, Dark and Auto theme switch.
- Phone layout with a sticky step bar. No horizontal page scroll at 375 px.
- Rules warnings for a pack are shown on the Quarter screen.
- Scripts: `make_sample_pdf.mjs` (round-trip test document) and `test_extract.mjs` (field accuracy against ground truth).

### Changed
- The coach accepts an uploaded pack's own question and facts.
- Extraction prompt `extract-v2`: reported EBITDA only, operating profit in `ebit`, units in a few words.

### Removed
- `engine.js`, the sample-only engine, replaced by `core.js` and `score.js`.

## [0.4.0] - 2026-10-28

Governed under PMI-CPMAI.

### Added
- `docs/08-GOVERNANCE.md`: an assessment against the five PMI-CPMAI domains, changes C1 to C12, and a go/no-go log.
- A notice on the Rehearse screen saying what is rules and what is AI, and where answers go.
- An editable business case on the Report screen.
- `scripts/check_engine.mjs`, the calibration and data-readiness gate. Building it found and fixed a forward-guidance figure that escaped the disclosure check after "H2".
- `scripts/check_bias.mjs`, a phrasing-bias test. It found that Indian-English acknowledgements scored 13 to 23 points lower; fixed.
- `/health` telemetry: calls by model, fallback rate, latency and cache hit rate.
- Seven-day retention for coach and extraction records.
- Prompt `coach-v2` with a prompt-injection guard.
- AI-specific risks R-11 to R-14.
- `scripts/record_demo.mjs`, a captioned 89-second backup video of the pitch path.

## [0.3.0] - 2026-10-28

Live AI coach.

### Added
- Coach API on the VPS behind Tailscale Funnel, with a shared key, a cache, and per-client and daily caps.
- Production URL `callreadyai.vercel.app`.
- `scripts/warm_demo.mjs`, which pre-warms the cache for the pitch path.

### Fixed
- The gateway streamed by default, so the API now asks for non-streamed JSON. Claude Sonnet 4.6 added as fallback.
- Number ranges in coach output keep "to" when dashes are removed.

## [0.2.0] - 2026-10-28

First working prototype.

### Added
- The five-step journey on the synthetic sample: Quarter, Pressure map, Question bank, Rehearse and Readiness report.
- Deterministic pressure ranking, the implied-H2 margin calculation, the remarks gap check, and a seven-dimension answer scorecard.
- Twelve questions with reference answers, voice input, a printable report, and a fallback to reference answers when the coach is unavailable.

## [0.1.0] - 2026-10-28

### Added
- Planning package: PRD, architecture, synthetic data, scoring design, roadmap, decisions and risks, and the 90-second pitch.
- Agent rules, ops templates and the MIT license.

[Unreleased]: https://github.com/krshnndu/callready/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/krshnndu/callready/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/krshnndu/callready/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/krshnndu/callready/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/krshnndu/callready/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/krshnndu/callready/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/krshnndu/callready/releases/tag/v0.1.0
