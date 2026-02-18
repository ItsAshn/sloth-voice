# discard-server

The self-hostable backend for **Discard** — a locally-hosted Discord alternative.

Connect with the [desktop](https://github.com/ItsAshn/discard) or mobile client.

## Requirements

- [Node.js](https://nodejs.org/) v20+
- npm v9+

## Setup

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
MEDIASOUP_LISTEN_IP=0.0.0.0       # Set to your network interface IP
PUBLIC_ADDRESS=localhost           # Set to your public IP or domain
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
```

> **Important:** Set `SERVER_PASSWORD` and `JWT_SECRET` before sharing with anyone.

## Run

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:5000` (or your configured `SERVER_PORT`).  
Check `http://localhost:5000/health` to verify it is running.

## Hosting on a LAN or the Internet

1. Set `MEDIASOUP_LISTEN_IP` to `0.0.0.0` (or a specific network interface).
2. Set `PUBLIC_ADDRESS` to your machine's LAN IP or public domain.
3. Open firewall ports:
   - `SERVER_PORT` (TCP) — for API and WebSocket connections
   - `RTC_MIN_PORT`–`RTC_MAX_PORT` (UDP) — for voice chat (mediasoup WebRTC)
4. Point the Discard desktop/mobile client at `http://<your-ip>:<SERVER_PORT>`.

## Environment Variables

| Variable              | Default             | Description                                                       |
| --------------------- | ------------------- | ----------------------------------------------------------------- |
| `SERVER_PORT`         | `5000`              | Port the server listens on                                        |
| `SERVER_NAME`         | `My Discard Server` | Name shown to clients                                             |
| `SERVER_DESCRIPTION`  | _(empty)_           | Server description                                                |
| `SERVER_PASSWORD`     | _(empty)_           | Optional password required to register an account (open if blank) |
| `JWT_SECRET`          | _(must be set)_     | Secret used to sign auth tokens                                   |
| `SERVER_DB_PATH`      | `./server.db`       | Path to the SQLite database file                                  |
| `MEDIASOUP_LISTEN_IP` | `127.0.0.1`         | IP mediasoup binds to internally                                  |
| `PUBLIC_ADDRESS`      | `localhost`         | Public IP/hostname for WebRTC candidates                          |
| `RTC_MIN_PORT`        | `40000`             | Start of UDP port range for WebRTC                                |
| `RTC_MAX_PORT`        | `49999`             | End of UDP port range for WebRTC                                  |
