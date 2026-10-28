# Rules for working in this repo

Apply to every contributor: people, Claude Code, the Hermes agent and its subagents.

## This repo is public

- **No host specifics in tracked files:** no IP addresses, tailnet or internal host names, account names, home paths, host ports or gateway addresses. Use the placeholders in `docs/02-ARCHITECTURE.md` section 8. Real values go in env files on the host or in gitignored `private/`.
- **No secrets, ever.** Read them only through `api/callready/config.py`. Never print, echo, `cat` or log them. The secret scan must pass before any push.
- **Synthetic data only.** No real company's figures, transcripts or people.

## How the product reasons

- Rules first. Arithmetic, variances, rankings and number matching are plain code in `engine/` and `checks/`, with tests. A model never computes a figure.
- Every figure shown to a user cites the pack (file plus row or line id). An uncited figure is a defect.
- Model output is parsed against a pydantic schema. Pack text goes into prompts as quoted data, never as instructions.
- Prompts are versioned files. Changing the judge prompt reruns the calibration set (`docs/04-SCORING.md` section 4).
- Fact-bearing text (transcripts, notes, improved answers, recommendations) is written by the strong model, never the fast one, and checked by `scripts/validate_pack.py` or the number checker.

## Engineering

- Python 3.12 with uv, lockfile committed; ruff and pytest. Web: Vite, React, TypeScript strict, vitest. New dependencies are named in the commit message with a reason.
- Do not build the web app or install `node_modules` on the backend host; Vercel and CI build it.
- Commit after every task with a conventional message. Never force-push `main`.
- When a folder changes, update the README "What is here" table and its `_Last true:_` date in the same commit.
- No em or en dashes in UI strings, docs or commit messages. Use commas, colons, parentheses or new sentences.
- Timezone Asia/Kolkata for anything user-facing. Currency INR crore.
