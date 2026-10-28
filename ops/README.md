# ops

Deployment templates for the API host. Placeholders in `<angle brackets>`; the real
values are host-specific and live outside this public repo.

| Path | What |
| --- | --- |
| `callready-api.service` | systemd user unit for the API (loopback only) |
| `Caddyfile.snippet` | Public site block: only `/api/*` and `/health`, 64 KB body cap |

## Before you touch it

- The reverse proxy is shared with other apps on the host. Add a new site block,
  validate, then reload. Never restart it blind.
- The web app is never built on the host. Vercel builds `web/`.

_Last true: 2026-10-28_
