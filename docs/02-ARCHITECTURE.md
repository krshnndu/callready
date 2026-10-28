# 02. Architecture

> **As built (v0.5.0, 2026-10-28):** a smaller stack than the target design below. The web app is plain ES modules with no build step. One pack-agnostic engine (`core.js`, `score.js`) runs in the browser on any `callready.pack.v1` pack. Three Vercel functions (`/api/coach`, `/api/extract`, `/api/health`) proxy to the API and hold its origin and key. The API is FastAPI with SQLite: `/api/coach` (Gemini 3.8 Flash high, Claude Sonnet 4.6, Flash medium), `/api/extract` as a background job the browser polls (Flash medium first, because extraction is transcription the rules verify, then Sonnet 4.6, then Flash high), `/health` with telemetry, and 7-day retention. PDFs are read in the browser by pdf.js, so the file itself never leaves the device; only its text is sent for conversion. The API reaches the internet through Tailscale Funnel. The rest of this document is the target design.

## 1. Principles

1. **Rules first, model second.** Arithmetic, variances, rankings and number matching are code with tests. The LLM writes questions, critiques and recommendations, always from facts the code has already computed and cited.
2. **The static frontend never holds a secret.** It lives on Vercel and calls the API on the same origin through a rewrite. Model keys stay on the backend host, behind its LLM gateway.
3. **Small and disposable on the backend.** The host is shared and its disk is tight, so the API is one Python process with a SQLite file. Everything in it can be rebuilt from the repo and the pack.
4. **The demo must survive its dependencies.** The scripted journey ships as cached JSON inside the frontend build, so it plays even if the backend is unreachable.

## 2. Topology

```
 Browser (judges, team)
      |
      v
 Vercel: static SPA (Vite + React + TS)            demo cache: web/public/demo/*.json
      |  rewrite  /api/*, /health  ->  BACKEND_ORIGIN
      v
 BACKEND_ORIGIN  (HTTPS, reverse proxy on the VPS, path allowlist, 64 KB body cap)
      |
      v
 VPS, loopback only
 +---------------------------------------------------------------+
 |  callready-api   127.0.0.1:API_PORT  (FastAPI, uvicorn, 1-2 w) |
 |     |-- packs/        read-only pack files from the repo       |
 |     |-- callready.db  SQLite: sessions, attempts, LLM cache    |
 |     '-- LLM gateway   OpenAI-compatible, loopback (LLM_BASE_URL)|
 +---------------------------------------------------------------+
```

`BACKEND_ORIGIN`, `API_PORT` and the gateway address are deployment settings, not code. The concrete values for our host are kept out of this public repo.

## 3. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Vite, React 19, TypeScript strict, TanStack Query, plain CSS design tokens, hand-built SVG meters | Static build fits Vercel; tokens make the instrument-panel look consistent; no chart library for a handful of meters |
| Voice (F13) | Browser Web Speech API, client side | Free, no audio leaves the browser, no extra service |
| API | Python 3.12, uv (lockfile committed), FastAPI, pydantic v2, httpx | Same stack the host already runs; pydantic schemas validate every model output |
| Storage | SQLite (WAL) | Prototype scale; one file; nothing to provision on a full disk |
| LLM | OpenAI-compatible gateway on the host; model ids per task in env | One set of keys and routing for every app on the host; swap models without a deploy |
| Retrieval | None. The whole pack (about 25k tokens) goes into the prompt with stable line and row ids | Fewer moving parts, and citations become exact ids rather than fuzzy chunks |
| Tests | pytest, ruff; vitest, tsc; Playwright smoke of the demo journey | Gates in CI |
| CI | GitHub Actions: lint, tests, pack validator, secret scan | Free for public repos |
| Deploy, web | Vercel Git integration, root `web/`, production on `main`, preview per PR | No secrets in the frontend, so previews are safe |
| Deploy, API | `git pull`, `uv sync --frozen`, operator restarts a systemd user unit | Operator-only restarts, as for the host's other apps |

## 4. Repository layout (target, scaffolded in P0)

```
api/
  pyproject.toml, uv.lock
  callready/
    main.py            app factory, middleware (request id, rate limit, body cap, security headers)
    config.py          env loading, no secret ever logged
    pack/              loader.py, schema.py (pydantic models for the pack)
    engine/            PURE, no IO: kpis.py, variance.py, commitments.py, pressure.py, implied.py
    checks/            PURE: numbers.py (figure extraction and matching), disclosure.py, delivery.py
    llm/               client.py (gateway, retries, fallback chain, cache), prompts/, schemas.py
    routes/            packs.py, questions.py, sessions.py, report.py, health.py
    store.py           SQLite: sessions, attempts, llm_cache, usage counters
  tests/
web/
  src/ (routes: /, /pressure, /questions, /rehearse, /report), public/demo/
data/packs/meridian-arc/   the synthetic pack (03-DATA.md)
scripts/validate_pack.py   checks the pack tells the intended story
scripts/bake_demo.py       runs the scripted journey against the API, writes web/public/demo/
ops/                       templates: systemd unit, reverse-proxy block, deploy.sh
docs/
```

## 5. API (v1)

All JSON. All model-backed responses carry `citations: [{source, ref}]` and `cached: bool`.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Liveness plus gateway reachability and today's LLM budget left |
| `GET /api/packs` | Available packs |
| `GET /api/packs/{pack}` | Quarter summary: KPIs vs last year, guidance and consensus (F1) |
| `GET /api/packs/{pack}/pressure` | Ranked pressure points with evidence (F2) |
| `GET /api/packs/{pack}/questions?theme=&persona=` | Question bank (F3), served from cache |
| `POST /api/packs/{pack}/remarks-check` | Gap check on prepared remarks text (F11) |
| `POST /api/sessions` | Start a rehearsal: `{pack, speaker, mode: drill or mock}` |
| `POST /api/sessions/{id}/answers` | `{question_id, text, duration_s?}` returns the scorecard (F4 to F7) |
| `POST /api/sessions/{id}/followup` | Persona follow-up to the last answer (F10) |
| `GET /api/sessions/{id}/report` | Readiness report (F8, F12) |

The OpenAPI schema generates the frontend's TypeScript types, so a contract drift fails the build.

## 6. Abuse and cost controls (public URL, no login)

- Reverse proxy passes only `/api/*` and `/health`, caps the body at 64 KB, and adds security headers.
- Answers are capped at 2,000 characters; remarks at 12,000.
- Per-client limit on model-backed calls (default 30 per hour), keyed on the client address Vercel forwards.
- Global daily cap on model calls (default 400). At the cap the API returns cached or demo results with a visible "demo mode" banner instead of an error.
- Every model response is cached by a hash of (model, prompt version, inputs). The scripted demo path therefore costs nothing after its first run.
- Sessions are anonymous random ids, deleted after 7 days. The UI warns not to paste real unpublished information.

## 7. Model use

| Task | Model class | Why |
| --- | --- | --- |
| Question bank, improved answers, judge, recommendations | Strong model (env `MODEL_STRONG`) | Fact-bearing text and evaluation; cheaper models invent figures |
| Persona follow-ups, remarks theme confirmation | Fast model (env `MODEL_FAST`) | Short, low risk, latency matters |

Rules for every call: temperature 0 for the judge; JSON output validated against a pydantic schema, one repair retry, then a typed error; the pack is passed as quoted data with ids; a fallback chain of models on 429 or 5xx; prompts versioned in `llm/prompts/` so the cache invalidates when a prompt changes.

## 8. Configuration (env names)

`APP_ENV, API_HOST=127.0.0.1, API_PORT, DB_PATH, PACKS_DIR, LLM_BASE_URL, LLM_API_KEY, MODEL_STRONG, MODEL_FAST, MODEL_FALLBACKS, LLM_DAILY_CAP, LLM_CLIENT_HOURLY_CAP, SESSION_TTL_DAYS, ALLOWED_ORIGINS`

Frontend build: `VITE_DEMO_ONLY` (true serves only the baked demo). The rewrite target `BACKEND_ORIGIN` sits in `web/vercel.json`.

`.env.example` lists them with placeholders. Real values live only on the host, outside the repo.
