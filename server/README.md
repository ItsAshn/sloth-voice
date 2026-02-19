# discard-server

The self-hostable backend for **Discard** — a locally-hosted Discord alternative.

Desktop and mobile client coming in the next few days.

---

## Quick Start (Docker — recommended)

Docker is the easiest way to run and **keep the server up to date**. No Node.js required.

**Requirements:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) v2+

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/ItsAshn/discard-server/master/docker-compose.yml

# 2. Create your .env (edit the values before starting)
curl -O https://raw.githubusercontent.com/ItsAshn/discard-server/master/.env.example
cp .env.example .env
```

Edit `.env` — at minimum set `JWT_SECRET` and `PUBLIC_ADDRESS`, then start:

```bash
docker compose up -d
```

The server starts on `http://localhost:5000` (or your configured `SERVER_PORT`).  
Check `http://localhost:5000/health` to verify it is running.

### Updating to the latest version

```bash
docker compose pull          # fetch the newest image from ghcr.io
docker compose up -d         # restart the container with the new image
```

Your database is stored in a Docker volume (`server_data`) and is **not affected** by updates.

---

## Manual Setup (Node.js)

### Requirements

- [Node.js](https://nodejs.org/) v20+
- npm v9+

### Setup

```bash
git clone https://github.com/ItsAshn/discard-server.git
cd discard-server
npm install
```

Copy `.env.example` to `.env` and edit it:

```bash
cp .env.example .env
```

```env
SERVER_PORT=5000
SERVER_NAME=My Discard Server
SERVER_DESCRIPTION=A locally-hosted Discard server
# Optional: set a password to restrict registration (leave blank for open access)
SERVER_PASSWORD=

JWT_SECRET=change_this_to_a_long_random_secret

SERVER_DB_PATH=./server.db

# mediasoup (voice chat) settings
# PUBLIC_ADDRESS must be a plain IPv4 address — NOT a hostname like "localhost".
# Chromium resolves "localhost" to ::1 (IPv6) but mediasoup binds on IPv4 only,
# which causes ICE negotiation to fail silently and voice chat to produce no audio.
#   Local testing  → 127.0.0.1
#   LAN hosting    → your LAN IP  (e.g. 192.168.1.100)
#   Public hosting → your public IPv4  (e.g. 203.0.113.42)
MEDIASOUP_LISTEN_IP=0.0.0.0
PUBLIC_ADDRESS=127.0.0.1
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
```

> **Important:** Set `SERVER_PASSWORD` and `JWT_SECRET` before sharing with anyone.

### Run

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:5000` (or your configured `SERVER_PORT`).  
Check `http://localhost:5000/health` to verify it is running.

### Updating

```bash
git pull
npm install        # in case dependencies changed
npm start
```

---

## Hosting on a LAN or the Internet

1. Set `MEDIASOUP_LISTEN_IP` to `0.0.0.0` (binds to all interfaces).
2. Set `PUBLIC_ADDRESS` to your machine's **IPv4 address** or a hostname that resolves to one.
   > ⚠️ **Do not use `localhost` here.** The Discard desktop client runs on Chromium, which resolves `localhost` to `::1` (IPv6). Because mediasoup only binds on IPv4, this causes ICE negotiation to fail silently — clients connect to the server but hear no voice audio. Always use a dotted-decimal IPv4 address (e.g. `192.168.1.100` for LAN, `203.0.113.42` for public).
3. Open firewall ports:
   - `SERVER_PORT` (TCP) — for API and WebSocket connections
   - `RTC_MIN_PORT`–`RTC_MAX_PORT` (UDP) — for voice chat (mediasoup WebRTC)
4. Point the Discard desktop/mobile client at `http://<your-ip>:<SERVER_PORT>`.

## Environment Variables

| Variable              | Default             | Description                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVER_PORT`         | `5000`              | Port the server listens on                                                                                                                                                                                                                                                                                                   |
| `SERVER_NAME`         | `My Discard Server` | Name shown to clients                                                                                                                                                                                                                                                                                                        |
| `SERVER_DESCRIPTION`  | _(empty)_           | Server description                                                                                                                                                                                                                                                                                                           |
| `SERVER_PASSWORD`     | _(empty)_           | Optional password required to register an account (open if blank)                                                                                                                                                                                                                                                            |
| `JWT_SECRET`          | _(must be set)_     | Secret used to sign auth tokens                                                                                                                                                                                                                                                                                              |
| `SERVER_DB_PATH`      | `./server.db`       | Path to the SQLite database file                                                                                                                                                                                                                                                                                             |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0`           | IP mediasoup binds to internally (use `0.0.0.0` for all interfaces)                                                                                                                                                                                                                                                          |
| `PUBLIC_ADDRESS`      | `127.0.0.1`         | **Must be a dotted-decimal IPv4 address.** Used as the ICE candidate address sent to clients. Setting this to a hostname (e.g. `localhost`) causes the Electron client to resolve it to IPv6 (`::1`), which breaks voice audio entirely. Use `127.0.0.1` locally, your LAN IP on a LAN, or your public IPv4 on the internet. |
| `RTC_MIN_PORT`        | `40000`             | Start of UDP port range for WebRTC                                                                                                                                                                                                                                                                                           |
| `RTC_MAX_PORT`        | `49999`             | End of UDP port range for WebRTC                                                                                                                                                                                                                                                                                             |
