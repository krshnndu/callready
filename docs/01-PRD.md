# 01. Product requirements

Working name: **CallReady** (decision D-01). An earnings-call rehearsal tool for a listed company's leadership team.

## 1. Problem

A listed company is about to hold its quarterly earnings call. Revenue grew, but margins fell, cash flow weakened and the segments diverged. Analysts will compare the quarter with what management promised on earlier calls. Today the finance and investor-relations (IR) team prepares for this by hand. They read old transcripts, guess the questions, write a Q&A document, and run one or two dry runs with no objective feedback. Three things go wrong:

1. **The hard questions are found late.** The team rehearses the questions it is comfortable with, not the ones the numbers invite.
2. **Answers drift from the disclosures.** A spokesperson quotes a figure that is not in the results, contradicts an earlier commitment, or gives new forward-looking numbers on the spot.
3. **Readiness is a feeling, not a measure.** Nobody can say which themes the CEO and CFO are weak on, or whether they would give the same answer.

## 2. Users

| User | Need |
| --- | --- |
| Finance / IR lead (primary operator) | Build the question bank fast, see where leadership is weak, produce the briefing pack |
| CFO, CEO, segment heads (rehearsers) | Practise the hardest questions, get specific feedback, see a better answer grounded in the disclosures |
| Company secretary / legal (reviewer) | See disclosure-risk flags before the call |

## 3. The journey (sample inputs to recommendation)

This is the spine of the prototype and of the demo. Each step has a screen.

| # | Step | What the user sees | How it is computed |
| --- | --- | --- | --- |
| 1 | **Load the quarter** | Company pack: results, segments, guidance, consensus, last two call transcripts, draft prepared remarks | Synthetic pack, `docs/03-DATA.md` |
| 2 | **Pressure map** | Ranked list of what investors will push on, each with the numbers behind it and the earlier promise it breaks | Deterministic KPI engine plus commitment tracker, no LLM (`04-SCORING.md` section 1) |
| 3 | **Question bank** | 25 to 40 likely questions grouped by theme and analyst persona, each with the trap inside it and citations | LLM, grounded in the pack, cached |
| 4 | **Remarks gap check** | Which pressure points the draft prepared remarks are silent on | Deterministic theme match plus LLM confirmation |
| 5 | **Rehearse** | Pick a question or run a timed mock call. Answer by typing or speaking. Get a scored critique, the flagged sentences, a follow-up from the same analyst, and an improved answer with citations | Deterministic checks plus an LLM judge (`04-SCORING.md` section 2) |
| 6 | **Readiness report** | Readiness by theme and by speaker, the five riskiest questions, contradictions between speakers, and **concrete recommendations** (what to add to the remarks, which number to pre-empt, who answers what, whether guidance is still defensible) | Aggregation plus LLM-written recommendations constrained to the computed facts |

The business recommendation in step 6 is what the brief asks for. Example output for the sample pack:

> Guidance is not defensible as stated. H1 EBITDA margin was 11.5%. Reaching the bottom of the 13.5 to 14.5% band needs about 15.3% in H2, above any quarter in the last two years. Recommend revising the band before the call rather than defending it under questioning. The CFO scored 38/100 on margin questions because no answer quantified the bridge. Add the 258 bps bridge to the prepared remarks.

## 4. Features

Priority: **M** must for the demo, **S** should, **C** could (stretch).

| ID | Feature | Pri | Phase |
| --- | --- | --- | --- |
| F1 | Load the sample pack and show a one-screen quarter summary (KPIs vs last year, vs guidance, vs consensus) | M | P1 |
| F2 | Pressure map: ranked pressure points with evidence and broken commitments | M | P2 |
| F3 | Question bank by theme and persona, with the trap and citations per question | M | P2 |
| F4 | Rehearsal drill: answer one question, get scores, flags, improved answer | M | P3 |
| F5 | Deterministic number check: every figure in an answer is matched against the pack | M | P3 |
| F6 | Commitment check: answer contradicts or ignores an earlier statement | M | P3 |
| F7 | Disclosure-risk flags (new forward numbers, unpublished information, selective disclosure) | M | P3 |
| F8 | Readiness report with recommendations, printable | M | P4 |
| F9 | Demo mode: the scripted journey works from cached results with the LLM or the backend down | M | P4 |
| F10 | Analyst follow-up question generated from the answer just given | S | P3 |
| F11 | Prepared-remarks gap check | S | P2 |
| F12 | Speaker roles (CEO, CFO, segment head) and cross-speaker contradiction check | S | P4 |
| F13 | Voice answers via the browser's speech recognition, with pace (words per minute) and filler count | S | P4 |
| F14 | Timed mock call: 5 questions back to back, persona follow-ups, one report | C | P4 |
| F15 | Bring your own pack: upload files in the pack schema | C | later |

Out of scope: real company data feeds, user accounts, multi-tenant storage, legal sign-off. The prototype advises; it does not approve disclosures.

## 5. Non-functional requirements

- **Grounded:** every question, flag and improved answer cites the pack (file and line or row). An uncited figure is a defect.
- **Deterministic where it can be:** KPIs, variances, the pressure ranking, number matching and the implied-H2 maths are plain code with tests. The LLM phrases, critiques and recommends; it does not compute.
- **Demo-proof:** the full journey runs in under 75 seconds on the public URL, and still runs with the LLM or the backend unavailable (F9).
- **Cheap and bounded:** a public URL with no login, so global and per-client LLM caps apply (`02-ARCHITECTURE.md` section 6).
- **Readable at a glance:** an instrument-panel interface (section 7).
- **No real data:** the shipped pack is synthetic and labelled as such on every screen.

## 6. Success measures

| Measure | Target |
| --- | --- |
| Demo journey, steps 1 to 6, on the live URL | under 75 s, no errors |
| Questions citing at least one pack source | 100% |
| Scoring calibration: hand-written strong answer outscores its weak twin | 9 of 10 pairs, by 15+ points |
| Number check: planted wrong figure caught | 10 of 10 |
| Team reviewers rating the top 10 questions "a real analyst would ask this" | 8 of 10 |

## 7. Design direction

Instrument panel, after Teenage Engineering: numbered modules on a strict grid, small wide-tracked uppercase labels, large tabular figures, one status LED per module (green, amber, red readiness), segment meters for scores, grey with a single orange accent, no decorative animation. It suits the subject: a pre-flight check before a call. Legibility on a projector beats density, so the demo screens use larger readouts than a desk dashboard would.
