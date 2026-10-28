# 10. Gap and edge-case analysis

What can go wrong at each stage, from an uploaded document to a recommendation, and what stops it. The status column says whether the guard exists and which test proves it. The implementation plan is `docs/superpowers/plans/2026-10-28-robustness.md`.

Principles, in priority order:
1. **Accuracy and evidence first.** A figure is used only if the rules can find it in the source document, or if it is derived by arithmetic from figures that were found. Nothing else reaches an answer, a question or a recommendation without a person confirming it.
2. **Rules before AI.** AI is used for two jobs only: turning an unstructured document into the pack format, and coaching on request. The rest is rules. A rules-only path exists for both jobs: a rules-only extraction, and reference answers in place of the coach.
3. **Performance.** No AI call on the critical path of a screen. AI calls are cached, capped and optional.
4. **Fail visibly.** Every refusal names the problem and the fix. No silent truncation or silent default.

## 1. Upload and text

| # | Case | Guard | Status |
| --- | --- | --- | --- |
| U1 | No file and no text | Message: choose a file or paste text | Done |
| U2 | Wrong type (an `.exe`, an image), more than 5 files, over 20 MB | `uploadAllowed` | Done, check_guardrails |
| U3 | Scanned PDF with no text layer | Under 200 characters of text: message to paste text instead | Done |
| U4 | Encrypted or corrupt PDF | pdf.js throws: the message names the file and says to export it again | Robustness task R6 |
| U5 | PDF over 80 pages | Only the first 80 are read; the user is told so | Robustness task R6 |
| U6 | Text over 148k characters | Cut, and the user is told how much was dropped | Robustness task R6 |
| U7 | Documents from two companies mixed in one upload | The extracted company name and quarter are shown on Review for confirmation | Done (Review) |

## 2. AI conversion

| # | Case | Guard | Status |
| --- | --- | --- | --- |
| A1 | Gateway slow, unreachable or rate-limited | Background job, polling with retries, fallback models, 7-minute ceiling, message with alternatives | Done |
| A2 | Not JSON, or not a pack | API rejects and tries the next model | Done |
| A3 | A figure the AI invented or misread (hallucination) | Rules look for every figure in the source text. **Strict policy: unverified figures are cleared on use unless the person confirms them** | Robustness task R2 |
| A4 | A quote paraphrased rather than copied | Rules look for every quote word for word. **Strict policy: unverified commitments and transcript lines are left out on use unless confirmed** | Robustness task R2 |
| A5 | Units mixed (crore and million, lakh) | Units warnings; consensus more than 2x away from actuals is ignored | Robustness task R4 |
| A6 | Segments double-counted | Segments that do not sum to within 10% of revenue are left out of the analysis | Robustness task R4 |
| A7 | AI unavailable altogether | **Rules-only extraction** of labelled financial rows and guidance sentences | Robustness task R3 |
| A8 | Hostile text inside the document | The prompt treats the document as untrusted data; the output passes the sanitiser and the rules | Done, test_guardrails |

## 3. Pack (JSON) and missing values

| # | Case | Guard | Status |
| --- | --- | --- | --- |
| P1 | Wrong types, oversized strings or lists, unsafe links | `sanitizePack` | Done, check_guardrails |
| P2 | Missing company, quarter or this quarter's or last year's revenue or EBITDA | Validation error naming the field | Done |
| P3 | Any optional field missing (PAT, cash flow, capex, net debt, days, last quarter, YTD, segments, consensus, transcript, commitments) | Every check that needs it is skipped; nothing shows NaN, "undefined" or "null" | Robustness task R1, fuzz test |
| P4 | Zero or negative values: losses, negative EBITDA, negative cash flow, net cash | Correct wording ("loss narrowed"), no division by zero | Robustness task R1 |
| P5 | Revenue zero or negative; profit above revenue; margin outside -100 to 100 | Validation errors | Done, check_guardrails |
| P6 | Guidance range written backwards (low above high) | Swapped, with a fix noted | Robustness task R4 |
| P7 | YTD without quarters elapsed | Derived from the quarter label (Q2 is 2) | Robustness task R4 |

## 4. Engine, scoring and coach

| # | Case | Guard | Status |
| --- | --- | --- | --- |
| E1 | A company with no pressure points | The standing questions still give a bank; a message replaces the empty list | Done |
| E2 | Empty or one-word answer; 2000+ characters | Asks for a sentence; the API caps at 2000 | Done |
| E3 | Figures written as words ("eleven point six percent") | Not detected: a documented limitation | Documented |
| E4 | Coach offline, slow or out of budget | Reference answer, or a message; the scorecard never depends on AI | Done |
| E5 | Coach writes a figure that is not in the disclosures | The answer is withheld; the rules re-check every coach answer | Done |
| E6 | AI calls on every scoring | **The coach becomes a button: scoring is rules only, and AI is called only when asked** | Robustness task R5 |
| E7 | A recommendation without evidence | **Each recommendation lists the facts and sources behind it** | Robustness task R5 |

## 5. Browser and state

| # | Case | Guard | Status |
| --- | --- | --- | --- |
| B1 | Storage blocked, full or corrupt | Every read and write is guarded; falls back to memory | Done |
| B2 | Unknown screen, question or dataset | Falls back to the Quarter screen, the first question, or the sample | Done |
| B3 | Speech recognition unavailable | Button disabled with a reason | Done |
| B4 | Hostile content in any field | Four layers | Done, check_xss |
| B5 | Phone layout | Layout gate | Done, check_layout |

## 6. Proof on new, unseen companies

The last step: a real user journey on live, real companies that the system has never seen. Headless Chrome uploads the PDF through the real file input. It then goes through conversion, review and every screen, scores an answer, and checks the report. The extracted figures are compared with ground truth read from the PDF by hand. The test fails on any error, any NaN or "undefined" on screen, any figure used without verification, or any accuracy below 100% on the figures that are kept. Script: `scripts/journey.mjs`.
