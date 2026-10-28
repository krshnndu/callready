# Guardrails Implementation Plan

**Goal:** Make every path by which untrusted data enters CallReady (uploads, JSON packs, AI output, user answers, API callers) structurally safe, with a test that proves each guardrail.

**Architecture:** Defense in depth, after superpowers' `systematic-debugging/defense-in-depth`. Every piece of untrusted data passes four layers:
1. Entry sanitising: types, lengths, array caps and URL schemes are forced into shape before anything else sees the data.
2. Business-rule validation: figures must make financial sense, or the pack is refused or flagged.
3. Escaping at render: no data string reaches the page as markup.
4. Environment: a Content-Security-Policy stops inline script even if the first three layers fail.

On the API side, pydantic limits, the shared key, caps and output limits play the same roles.

**Tech stack:** Plain ES modules (`web/js/core.js`, `app.js`), FastAPI and pydantic (`api/callready/main.py`), Node scripts as tests, pytest for the API, headless Chrome over the DevTools protocol for browser tests.

**Spec:** the user's request to set proper guardrails everywhere. Method: superpowers `writing-plans`, `test-driven-development` (no guardrail without a failing test first), `verification-before-completion` (no claim without fresh output).

## Global constraints

- Rules first: guardrails are code with tests, never prompt text alone.
- The repo is public: no secrets, host names or IP addresses in tests or fixtures.
- Every test must fail before its guardrail exists (RED), and pass after (GREEN). Record both.
- The full gate suite (`check_engine`, `check_bias`, `check_layout`, the new tests) stays green after each task.

## Audit (2026-10-28)

| # | Entry point | Untrusted data | What exists | Gap |
| --- | --- | --- | --- | --- |
| A1 | JSON pack upload, AI extraction result, dataset files, the saved user pack | Whole pack | `validatePack` checks required fields | No type coercion. Strings where numbers belong reach unescaped numeric slots. No length caps on strings or arrays. URLs are not scheme-checked |
| A2 | The same | Figures | Required revenue and EBITDA | No sanity limits: revenue of 0 or below, EBITDA above revenue, absurd margins, negative day counts |
| A3 | Rendering | Every string | `esc()` at most sites | Not proven; numeric slots assume numbers |
| A4 | Browser environment | Anything that slips through | Basic security headers | No Content-Security-Policy |
| A5 | File upload | Files | `accept=` attribute, 80-page PDF limit | No file size or count limit enforced in code; type not enforced in code |
| A6 | Vercel functions | Request body | Method checks | No body size cap before forwarding |
| A7 | API `/api/coach`, `/api/extract` | Requests | Key, pydantic limits, caps, retention, injection rule in prompt | No tests; no cap on AI output length |
| A8 | Coach output in the browser | AI text | Re-scored by rules; withheld if a figure is unverified | Covered |
| A9 | Process | All of the above | CI runs engine and bias gates | Layout and guardrail tests are not in CI |

## Task 1: Pack sanitiser (A1)

**Files:** create `scripts/check_guardrails.mjs`; modify `web/js/core.js` (add `sanitizePack`, called by `normalizePack`); modify `web/js/app.js` (sanitise on every load path).
**Interfaces:** produces `sanitizePack(p) -> { pack, fixes: string[] }`.

- [ ] Step 1: write failing tests.
  - `"2,480"` becomes 2480; `"abc"` becomes null.
  - A 10,000-character company name is cut to 160 characters.
  - 500 transcript lines are capped at 300.
  - A `javascript:` provenance URL is dropped, and an `https:` one kept.
  - A nested object where a string belongs becomes null.
  - The sanitiser never throws on `null`, an array, or a number.
- [ ] Step 2: run it. It fails because `sanitizePack` does not exist.
- [ ] Step 3: implement `sanitizePack` as a schema walk: a numeric field set, string caps per path, array caps per path, and an `https?:` URL allowlist.
- [ ] Step 4: run it. It passes, and so do `check_engine` and `check_bias`.
- [ ] Step 5: commit.

## Task 2: Business-rule validation (A2)

**Files:** modify `scripts/check_guardrails.mjs` and `web/js/core.js` (`validatePack`).

- [ ] Step 1: write failing tests.
  - These are errors: revenue of 0 or below; EBITDA or EBIT whose absolute value exceeds revenue; a segment margin outside -100 to 100.
  - These are warnings: day counts below 0 or above 730; net debt above 20x EBITDA; a quarter label not of the form `Q1 to Q4 FYxx`.
  - The sample and all six datasets still validate with no errors.
- [ ] Step 2: run them and confirm they fail.
- [ ] Step 3: implement the rules in `validatePack`.
- [ ] Step 4: run everything and confirm it passes.
- [ ] Step 5: commit.

## Task 3: Rendering is proven safe (A3, A4)

**Files:** create `scripts/check_xss.mjs`; modify `web/vercel.json` (CSP); fix any unescaped slot it finds in `web/js/app.js`.

- [ ] Step 1: write the failing test. A hostile pack, saved as the user pack, puts `<img src=x onerror=...>` and `<script>` payloads in every string field and a `javascript:` URL in provenance. Every screen renders it, including Review. The test asserts three things: no payload ran (`window.__pwned` unset), no element carries an `on*` attribute, and no link uses `javascript:`.
- [ ] Step 2: run it against the current code. Expect a failure, or record that escaping already holds; if so, keep the test as a regression guard.
- [ ] Step 3: sanitise on load (Task 1), escape any slot the test exposes, and add a CSP. The policy: scripts and workers only from self and cdnjs, styles from self and Google Fonts, fonts from Google Fonts, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- [ ] Step 4: run it and confirm it passes. The layout gate still passes and the live site still loads pdf.js.
- [ ] Step 5: commit.

## Task 4: Upload and proxy limits (A5, A6)

**Files:** modify `web/js/app.js` (upload), `web/api/*.js` (body cap); extend `scripts/check_guardrails.mjs` for the pure helper `uploadAllowed(files)`.

- [ ] Step 1: write failing tests.
  - A 30 MB file is refused.
  - Six files are refused.
  - An `.exe` is refused.
  - A 2 MB PDF plus a `.txt` is allowed.
- [ ] Step 2: confirm they fail.
- [ ] Step 3: implement `uploadAllowed` in `core.js` and use it in the upload handler. The Vercel functions reject a body over 200 KB with a 413.
- [ ] Step 4: confirm they pass.
- [ ] Step 5: commit.

## Task 5: API guardrails tested (A7)

**Files:** create `api/tests/test_guardrails.py`; modify `api/callready/main.py` (output caps).

- [ ] Step 1: write failing tests with FastAPI's TestClient. Model calls are stubbed, so the tests never touch a network.
  - A wrong or missing key returns 401 when a key is set.
  - Unknown qid returns 404; an answer over 2000 characters returns 422; extraction text under 200 characters returns 422.
  - An uploaded-pack question without facts returns 422.
  - The per-client hourly cap returns 429.
  - Model output over 1500 characters per field is cut to the limit.
  - Cache rows older than the retention window are purged.
  - The prompt carries the untrusted-input rule, and the answer stays inside the quoted block.
- [ ] Step 2: run pytest and confirm the output-cap test fails.
- [ ] Step 3: cap `critique`, `improved` and `followup` at 1500 characters in `parse_json`.
- [ ] Step 4: run pytest and confirm everything passes.
- [ ] Step 5: commit, then deploy the API.

## Task 6: CI runs every gate (A9)

**Files:** modify `.github/workflows/ci.yml` and `scripts/check_layout.mjs` (the Chrome path comes from the `CHROME` environment variable).

- [ ] Step 1: add the guardrails, XSS and layout gates to CI, with a local static server and Chrome from the runner, and pytest for the API.
- [ ] Step 2: push, and confirm a CI run on main passes every job.

## Verification before completion

Run fresh, and quote the output before any claim:

```
node scripts/check_engine.mjs
node scripts/check_bias.mjs
node scripts/check_guardrails.mjs
node scripts/check_xss.mjs
node scripts/check_layout.mjs
cd api && uv run pytest -q
```

Also: the CI run on main is green, and the live site loads, extracts and coaches under the CSP.
