# CallReady

**Is the leadership team ready for tough investor questions?** CallReady helps a listed company's leadership rehearse its quarterly earnings call. It reads the quarter's results, segment data, guidance and earlier call transcripts. From those it ranks what investors will push on and generates the questions they are likely to ask. Executives answer those questions, and each answer is scored against the company's own disclosures. The output is a readiness report with concrete recommendations.

> Status: planning. Nothing is built yet. Live demo: _to come_. All data is synthetic.

## The journey

1. **Load the quarter**: results, segments, guidance, consensus, past transcripts, draft remarks.
2. **Pressure map**: a deterministic ranking of misses, broken promises and at-risk guidance.
3. **Question bank**: likely questions by theme and analyst persona, each citing its source.
4. **Remarks gap check**: what the draft prepared remarks say nothing about.
5. **Rehearse**: answer by text or voice. The answer is scored on accuracy, consistency, directness, explanation, forward clarity, disclosure safety and delivery, and an improved answer comes back with citations.
6. **Readiness report**: weak themes, speaker contradictions and recommendations to act on before the call.

## What is here

| Path | What |
| --- | --- |
| `docs/01-PRD.md` | Problem, users, journey, features, success measures, design direction |
| `docs/02-ARCHITECTURE.md` | Topology (Vercel frontend, Python API on a VPS), stack, API, cost controls, model use |
| `docs/03-DATA.md` | The synthetic company, the authoritative figures, commitments on record, **assumptions** |
| `docs/04-SCORING.md` | Pressure ranking, answer scorecard, readiness report, calibration gate |
| `docs/05-ROADMAP.md` | Phases P0 to P5 with gates |
| `docs/06-DECISIONS-RISKS.md` | Open decisions with defaults, risk register |
| `docs/07-PITCH.md` | The 90-second presentation, beat by beat |
| `ops/` | Deployment templates with placeholders (systemd unit, reverse-proxy block) |
| `AGENTS.md` | Rules for anyone, human or agent, writing code here |
| `private/` | **Gitignored.** Host-specific runbook and the build handoff. Never commit it |

Planned, scaffolded in P0: `api/` (FastAPI), `web/` (Vite + React), `data/packs/`, `scripts/`.

## Key limitation

CallReady anticipates questions grounded in the disclosures. A question driven by news after the results, or by a rumour, is outside what it can foresee.

## License

MIT. See `LICENSE`.

_Last true: 2026-10-28_
