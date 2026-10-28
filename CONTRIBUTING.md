# Contributing to CallReady

Thanks for helping. CallReady is a prototype built for a competition and governed under PMI-CPMAI (`docs/08-GOVERNANCE.md`). Contributions of any size are welcome: bug reports, docs, test datasets, rules and screens.

## Before you start

- **Talk first about big changes.** Open an issue before you change how a score, a pressure item or a commitment status is computed. Those rules are the product, and every change to them needs evidence.
- **Security issues** go through [SECURITY.md](SECURITY.md), never a public issue.
- **Never commit** secrets, host names, IP addresses or unpublished company information. The repo is public. See `AGENTS.md`.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

The web app has no build step: it is plain ES modules.

```sh
node scripts/serve.mjs                   # http://127.0.0.1:8731, no-store so a reload runs the code on disk
```

Every screen works without the API: the scorecard is rules in the browser, and the coach falls back to reference answers. To run the API you need Python 3.12 and uv, plus an OpenAI-compatible gateway:

```sh
cd api && uv sync
LLM_BASE_URL=... LLM_API_KEY=... uv run uvicorn callready.main:app --port 8140
```

## How changes land

1. Branch from `main`. Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
2. Run the gates. All three must pass:
   ```sh
   node scripts/check_engine.mjs   # data readiness and scoring calibration
   node scripts/check_bias.mjs     # scorer does not penalise phrasing or register
   node --check web/js/*.js
   ```
3. If you changed `web/js/pack.js` or `questions.js`, run `node scripts/export_pack.mjs` so the API coaches from the same facts.
4. If you changed a rule, add a case to `check_engine.mjs` that fails without your change.
5. UI changes: check the screens at 375 px and 1440 px, in light and dark.
6. Add a line under `[Unreleased]` in `CHANGELOG.md`.
7. Open a pull request with the template filled in.

## Adding a test dataset

Use official filings only (company investor-relations sites, NSE or BSE). Convert them through the upload screen or the extract API. Keep the pack in `web/datasets/`, with its source URLs and its verification score in `index.json`. Commit only the extracted pack and the source links, never the filing itself.
