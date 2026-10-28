# 06. Decisions and risks

## Decisions

Each has a default. **Blocking** ones must be answered before the phase named.

| Id | Decision | Default | Needed by |
| --- | --- | --- | --- |
| D-01 | Product name | CallReady | P0 |
| D-02 | GitHub account that owns the public repo, and the repo name | **Decided 2026-10-28:** `krshnndu/callready`, pushed from the VPS clone. Created private; made public when the team is ready | done |
| D-03 | Public origin for the API | **Decided 2026-10-28:** a public port on the host's tunnel service. The planned reverse-proxy site could not work: the host's public address takes no inbound traffic. The API requires a shared key that only the Vercel function holds | done |
| D-04 | Submission deadline and demo date | **Decided 2026-10-28:** 17:00 the same day, moved to 20:00 the same afternoon | done |
| D-05 | Model ids for `MODEL_STRONG`, `MODEL_FAST` and the fallback chain | A Claude-family model for strong, a Flash-class model for fast; confirmed by a live probe on the gateway before P2 | P2 |
| D-06 | Voice answers (F13) in scope | Yes, in P4, text stays the primary path | P4 |
| D-07 | Access control on the public URL | Open, with caps (`02-ARCHITECTURE.md` section 6). Alternative: a shared demo passcode | P0 |
| D-08 | License | MIT | P0 |
| D-09 | Custom domain | **Decided 2026-10-28:** `callreadyai.vercel.app` (`callready.vercel.app` belongs to an unrelated site). Set as a project domain, so every production deploy lands there | done |

## Risks

| Id | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-01 | The LLM provider rate-limits or fails during the live demo | Medium | High | Response cache; fallback model chain; demo mode serves the baked journey; a recorded backup video |
| R-02 | The backend host is unreachable on demo day (shared box, cloud credit ends, disk fills) | Medium | High | The baked demo ships inside the Vercel build, so the journey plays with no backend (F9) |
| R-03 | Shared host's disk is nearly full | High | Medium | No frontend builds or `node_modules` on the host (Vercel builds the web app); SQLite only; session TTL; log rotation; check free space before every deploy |
| R-04 | Public URL abused, model spend runs away | Medium | Medium | Path allowlist, body cap, per-client and daily caps, cache |
| R-05 | Model invents figures in questions or improved answers | High without checks | High | Pack in prompt with ids, citation required by schema, number checker re-runs on every model answer, strong model for fact-bearing text |
| R-06 | Judges read it as "a chatbot" | Medium | High | Lead the demo with the deterministic pressure map and the implied-H2 number; the LLM is shown as the coach, not the brain |
| R-07 | Synthetic data looks fake or inconsistent | Medium | Medium | One authoritative table (`03-DATA.md` section 3) and a validator; realistic transcripts with deflections and analyst follow-ups |
| R-08 | 90 seconds is too short to show the journey | High | High | Scripted path with pre-loaded state, one click per step, rehearsed to time (`07-PITCH.md`) |
| R-09 | Infrastructure detail leaks into the public repo | Medium | Medium | Host specifics stay in gitignored `private/`; placeholders in public docs; secret scan in CI and before the first push |
| R-10 | Editing the shared reverse proxy breaks another app on the host | Low | High | Validate the config before reload; add a new site block only; the operator applies it |
| R-11 | The coach invents a figure or gives new guidance in its improved answer | Medium | High | The prompt allows only pack figures; the browser re-scores every coach answer and shows the vetted reference answer instead if any figure fails |
| R-12 | Prompt injection through the answer box (for example "ignore your rules") | Medium | Medium | The answer is passed as quoted, untrusted data with an explicit rule to ignore instructions inside it (prompt `coach-v2`); the coach can only return three text fields, has no tools and changes nothing |
| R-13 | The gateway silently changes which model answers, or its quality drifts | Medium | Medium | Each response names the model; `/health` reports calls by model, fallback rate and median latency for the last 24 hours; the prompt version is part of the cache key |
| R-14 | Users over-trust a score, or a weak executive is shamed by one | Medium | Medium | Scores are labelled as a rubric, not a prediction; rehearsal is private to the browser with no accounts; each dimension shows its reason |
