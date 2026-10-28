# Robustness Implementation Plan

**Goal:** CallReady never fails on real documents. It degrades visibly when data is missing, never uses an unverified figure without a person confirming it, and calls AI only where rules cannot do the job.

**Architecture:** The edge cases in `docs/10-EDGE-CASES.md` become tests first, then code. Property and fuzz tests drive the engine over thousands of packs with fields missing, zero or negative. A strict verification policy runs at the point a pack is used. A rule-based extractor serves as cross-check, fallback and a rules-only mode. A journey test drives the live site with real, unseen filings.

**Tech stack:** ES modules (`web/js/core.js`, `score.js`, new `extract.js`), Node test scripts, headless Chrome over the DevTools protocol.

**Spec:** the user's request for a gap and edge-case analysis, no hallucinations, rules over AI, and proof on new company data. Method: superpowers `writing-plans`, `test-driven-development`, `verification-before-completion`.

## Global constraints

- Accuracy and evidence first. Rules before AI. Fail visibly.
- Every task starts with a failing test, and every gate stays green after it.
- No figure reaches the user unless it was verified against the source document, derived by arithmetic from verified figures, or confirmed by a person.

## Tasks

| Task | Covers | Test written first | Then |
| --- | --- | --- | --- |
| R1 Engine robust to missing, zero and negative values | P3, P4, E1 | `scripts/check_fuzz.mjs`: 3,000 packs mutated at random from the sample and the six datasets (fields removed, zeroed, negated, nulled). `analyze`, `generateQuestions`, `remarksCheck` and `scoreAnswer` must never throw, and no text output may contain NaN, Infinity, "undefined" or "null" | Fix every failure the fuzzer finds |
| R2 Strict anti-hallucination policy | A3, A4 | `check_guardrails.mjs`: `applyEvidencePolicy(pack, sourceText, {keepUnverified})` clears unverified figures, drops commitments and lines not found word for word, keeps derived figures, and reports each change | The Review screen shows the policy with a confirm checkbox; Use applies it |
| R3 Rule-based extractor | A7 | `scripts/check_extract_rules.mjs`: on the sample PDF text, every labelled figure for all three periods matches the truth, and guidance sentences with numbers are found verbatim. On the six real filings, every figure the rules extract is in the document, and agreement with the verified AI figures is reported | Rules-only mode on the Load screen; cross-check of AI figures against rule figures on Review |
| R4 Units and consistency rules | A5, A6, P6, P7 | `check_guardrails.mjs`: consensus 10x away is ignored with a warning; segments off by more than 10% are left out of the analysis; a backwards range is swapped; quarters elapsed come from Q2 | Implement in `normalizePack` and `kpis` |
| R5 Fewer AI calls; evidence on every recommendation | E6, E7 | `check_engine.mjs`: every recommendation carries a non-empty `evidence` list. The XSS and layout gates still pass with the coach behind a button | The coach becomes a button; recommendations list their evidence |
| R6 Upload edge cases | U4, U5, U6 | The journey test uploads a corrupt PDF and expects a named error | Clear messages for encrypted, truncated and over-long documents |
| R7 Journey on new companies | Section 6 | `scripts/journey.mjs` against the live site with unseen filings | Fix anything it finds; record the results in the README and governance |

## Verification before completion

Run fresh, and quote the output before any claim: `check_engine`, `check_bias`, `check_guardrails`, `check_fuzz`, `check_extract_rules`, `check_xss`, `check_layout`, the API pytest, and `journey.mjs` on the live site. CI must be green.
