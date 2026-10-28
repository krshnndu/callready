# CallReady

**Is the leadership team ready for tough investor questions?** CallReady helps a listed company's leadership rehearse its quarterly earnings call. It reads the quarter's results, segments, guidance and earlier call transcripts, ranks what investors will push on, and generates the questions they are likely to ask. Executives answer those questions and get a score checked against the company's own disclosures. The output is a readiness report with recommendations to act on before the call.

**Live prototype:** https://callreadyai.vercel.app. All data is synthetic.

## The journey: sample inputs to a recommendation

| Step | Screen | What it does | How |
| --- | --- | --- | --- |
| 1 | Quarter | Results against last year, consensus and the promises made on earlier calls | Synthetic pack |
| 2 | Pressure map | Ranks what investors will push on; the implied-H2 gauge shows the margin guidance needs 15.3% in H2 against a 14.2% record | Plain arithmetic, no AI |
| 2b | Remarks gap check | Flags what the draft prepared remarks say nothing about, and the phrases that will backfire | Rules, reruns as you type |
| 3 | Question bank | 12 likely questions by theme and analyst persona, each with its trap and sources | Written from the pack |
| 4 | Rehearse | Type or speak an answer against a 60-second timer. Seven-dimension scorecard; every figure is checked against the disclosures; risky phrases are marked; a live AI coach adds a critique, a stronger answer and the analyst's follow-up | Deterministic checks in the browser, plus Gemini 3.8 Flash through an LLM gateway |
| 5 | Readiness report | Readiness by theme and speaker, the riskiest questions, CEO/CFO contradictions, and recommendations each tied to a computed fact. Printable | Aggregation in the browser |

## How it reasons

- **Rules first.** KPIs, variances, the pressure ranking, the implied-guidance arithmetic and the number checker are plain code (`web/js/engine.js`). A model never computes a figure.
- **Pressure** = magnitude x investor salience x credibility (1.5 if a promise is broken) x recurrence (1.3 if management deflected it before).
- **Scorecard:** accuracy 25, consistency with commitments 20, directness 15, explanation 15, forward clarity 10, disclosure safety 10, delivery 5. A figure that is not in the disclosures caps accuracy. Any new forward-looking number, or a hint about current trading, an order or an acquisition, forces Red whatever the total.
- **The coach is checked too.** Its improved answer is re-scored by the same checker. If it uses a figure that is not in the disclosures, the vetted reference answer is shown instead.
- **Demo-proof.** If the coach or the backend is unavailable, every step still works, and the reference answers fill in for the coach.

## Data and assumptions

1. Meridian Arc Industries Ltd and every figure, person, analyst and broker are synthetic. They are built to reproduce the brief: revenue +14.3%, EBITDA margin -258 bps, cash conversion 86% to 39%, segments diverging, two promises from the last call already broken. Authoritative figures: `docs/03-DATA.md`.
2. Indian listed company: SEBI listing and insider-trading rules frame what may be said on a call. Financial year April to March; INR crore.
3. Consensus estimates stand in for those a real IR team would buy.
4. Pressure weights and score thresholds are judgement calls from typical earnings-call practice, not fitted to data.
5. Scores rank answer quality against a rubric. They do not predict the share-price reaction. Disclosure flags are prompts for the company secretary, not legal advice.

## Key limitation

CallReady anticipates questions grounded in the disclosures. A question driven by news after the results, a rumour or a competitor's call is outside what it can foresee, and the rule-based checks can miss a wrong claim that contains no number.

## Architecture

```
Browser -> Vercel: static site (plain ES modules, no build) + two functions (/api/coach, /api/health)
             '-> API on a VPS (FastAPI on loopback, published through a tunnel, shared key)
                   '-> OpenAI-compatible LLM gateway: Gemini 3.8 Flash (high), Claude Sonnet 4.6 fallback, Flash (medium)
```

The frontend holds no secret. The backend origin and key are Vercel env vars. The API caches every coach response, and caps calls per client and per day.

## Run it locally

```bash
cd web && python3 -m http.server 8731
```

Open http://127.0.0.1:8731. Every screen works without the API. To run the API: `cd api && uv sync && LLM_BASE_URL=... LLM_API_KEY=... uv run uvicorn callready.main:app --port 8140`.

## What is here

| Path | What |
| --- | --- |
| `web/` | The app: `js/pack.js` (data), `js/engine.js` (rules), `js/questions.js`, `js/app.js` (screens), `styles.css`, `api/` (Vercel proxy functions) |
| `api/` | Coach API (FastAPI) |
| `data/pack.json` | The pack exported for the API by `scripts/export_pack.mjs` |
| `docs/` | PRD, architecture, data, scoring, roadmap, decisions and risks, pitch, governance (PMI-CPMAI) |
| `ops/` | Deployment templates with placeholders |
| `private/` | Gitignored. Host-specific runbook |

## License

MIT

_Last true: 2026-10-28_
