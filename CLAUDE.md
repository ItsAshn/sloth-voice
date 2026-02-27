# Sloth Voice

Self-hosted Discord alternative (chat + voice). Monorepo with Node.js server, Electron desktop app, and React Native mobile app.

## Goal

The project should be easy to set up and run for non-technical users, with a focus on voice quality and low latency. The desktop app is the primary client, but mobile is also supported. The server can be self-hosted on any machine (Raspberry Pi, VPS, etc.) with minimal configuration.

## Structure

```
server/          — Express + Socket.IO + mediasoup + SQLite
desktop/         — Electron + React/TS (primary client)
mobile/          — React Native + Expo
packages/shared/ — Shared TypeScript types and API client (used by desktop + mobile)
scripts/         — Release automation
```

## Commands

```bash
npm run install:all   # Install all workspace deps
npm run dev           # Server + desktop concurrently (main workflow)
npm run server        # Server only (localhost:5000)
npm run desktop       # Desktop only
npm run mobile        # Expo mobile
npm run release       # Bump versions, tag, push → triggers CI
cd desktop && npm run dist  # Build platform installer
cd server && docker compose up -d  # Docker deployment
```

## Tech Stack

- **Backend**: Node.js 20+ (ES modules), Express, Socket.IO, mediasoup, SQLite (`--experimental-sqlite`)
- **Desktop**: Electron 29, React 18, TypeScript, Tailwind, Zustand, electron-updater
- **Mobile**: React Native 0.74, Expo 51, Zustand
- **Shared**: `packages/shared/` — TypeScript source consumed via path alias (no build step); both desktop (Vite alias) and mobile (Babel module-resolver + Metro watchFolders) resolve it
- **Auth**: JWT + bcryptjs
- **Voice**: mediasoup (server-side WebRTC), mediasoup-client (desktop/web)

## Server `.env`

Copy `server/.env.example` to `server/.env`. Key vars:

- `JWT_SECRET` — **required**; changing it invalidates all sessions
- `PUBLIC_ADDRESS` — blank = auto-detect via UPnP/public IP services; or set a static IP/DDNS hostname
- `SERVER_PORT` — default `5000`
- `RTC_MIN_PORT` / `RTC_MAX_PORT` — UDP range for WebRTC (default `40000–40099`, ~50 voice users)
- `UPNP_ENABLED` — auto port-forward via UPnP (default `true`)

## CI/CD

| Workflow               | Trigger                                     | Action                                                                     |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `pr-build.yml`         | PR to `master`                              | Validates server deps + builds desktop (Windows + macOS) — no artifacts uploaded (free tier) |
| `release.yml`          | Tag push `v*`                               | Multi-platform desktop installers → GitHub Release                         |
| `server-publish.yml`   | Tag push `server-v*` or `workflow_dispatch` | Builds and publishes server Docker image to GHCR                           |

## Key Gotchas

- **SQLite**: Requires `--experimental-sqlite` flag (Node 20+)
- **Voice ICE**: Desktop Chromium resolves hostnames to IPv6; server always converts `PUBLIC_ADDRESS` to a dotted-decimal IPv4 before sending as an ICE candidate
- **Voice ports**: UDP 40000–40099 must be open/forwarded (UPnP does this automatically)
- **No tests**: CI validates via builds only
- **GitHub Actions free tier**: Do not upload artifacts in PR builds — the build passing is sufficient validation. Release artifacts use `retention-days: 1` since they're only needed within the same workflow run to create the GitHub Release.
