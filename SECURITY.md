# Security policy

CallReady handles documents that users upload and sends text to AI model providers through a gateway, so security reports are taken seriously.

## Reporting a vulnerability

Report it privately through GitHub: **Security › Report a vulnerability** on this repository. Please do not open a public issue, discussion or pull request for a vulnerability.

Include what you found, how to reproduce it, and the impact you see. Never include real unpublished company information or credentials.

## What is in scope

- The web app and its Vercel functions (`web/`).
- The coach and extraction API (`api/`): authentication with the shared key, caps, retention, and prompt injection through answers or uploaded documents.
- The rules engine, where a crafted pack or answer could cause an unsafe disclosure to be scored as safe.

## How the design limits damage

- The browser holds no secret. The API origin and key live in Vercel env vars.
- The API accepts only requests carrying the shared key. It caps body size, per-client calls and daily calls, and deletes stored records after 7 days.
- Uploaded text and answers reach models only as quoted data, with an explicit rule to ignore instructions inside them. Model output is parsed into fixed fields and re-checked by rules before it is shown.

## Supported versions

Only the latest commit on `main` is supported.
