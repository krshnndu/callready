# Changelog

All notable changes to CallReady. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/). Each version is a git tag with a GitHub release.

## [Unreleased]

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

[Unreleased]: https://github.com/krshnndu/callready/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/krshnndu/callready/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/krshnndu/callready/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/krshnndu/callready/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/krshnndu/callready/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/krshnndu/callready/releases/tag/v0.1.0
