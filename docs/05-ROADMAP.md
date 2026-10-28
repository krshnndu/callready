# 05. Roadmap

Dates follow the submission deadline (decision D-04). Each phase ends at a gate: the checks below pass, and a short gate report goes to the team before the next phase starts.

| Phase | Goal | Deliverables | Gate |
| --- | --- | --- | --- |
| **P0 Foundations** | Hello world, end to end | Public GitHub repo; `api/` scaffold (FastAPI, uv, `/health`); `web/` scaffold (Vite, React, TS, tokens, empty routes); CI (lint, tests, secret scan); Vercel project on `web/`; API on the host under a systemd user unit; reverse-proxy block; rewrite wired | The live Vercel URL shows the API's `/health` as green; CI green; secret scan clean on full history |
| **P1 Data pack** | The quarter exists | Pack files per `03-DATA.md` section 5; `validate_pack.py`; KPI engine with tests; quarter summary screen (F1) | Validator passes; KPIs equal the `03-DATA.md` tables; every verbatim commitment found at its ref |
| **P2 Pressure and questions** | Know what is coming | Pressure engine and implied-guidance calculator; question bank (F3) with personas and citations, cached; remarks gap check (F11); Pressure and Questions screens | Top five matches the fixture in `04-SCORING.md` section 1; every question cites; the team marks 8 of the top 10 as realistic |
| **P3 Rehearsal** | Practise and improve | Number, commitment, disclosure and delivery checks; LLM judge; improved answer; follow-up (F10); Rehearse screen | Calibration set passes (`04-SCORING.md` section 4); planted errors all caught |
| **P4 Report and demo-proofing** | The recommendation | Readiness report (F8) with print stylesheet; speakers and contradictions (F12); voice (F13); `bake_demo.py` and demo mode (F9); budget caps live | Scripted journey under 75 s on the live URL; the same journey with the backend stopped still plays from the demo cache; Playwright smoke green |
| **P5 Pitch** | Win the 90 seconds | README with assumptions and limitation; design pass; recorded backup video of the demo; pitch rehearsed to time (`07-PITCH.md`) | Three timed run-throughs at or under 90 s; repo public with a clean history |

Critical path: P1 pack quality, then P3 calibration. Everything else is plumbing that the host already does for other apps.

## Definition of done (every phase)

- Tests and lint pass in CI; the secret scan is clean.
- No figure appears in any UI string or prompt output without a pack citation.
- The README "What is here" table and `_Last true:_` date are updated in the same commit as any folder change.
- Commit after every task with a conventional message; never force-push `main`.
