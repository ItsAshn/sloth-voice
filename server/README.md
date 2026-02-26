# sloth-voice-server

The self-hostable backend for **Sloth Voice** — a locally-hosted Discord alternative.

---

## Table of Contents

- [Option 1 — Plain HTTP](#option-1--plain-http)
- [Option 2 — HTTPS via Caddy](#option-2--https-via-caddy)
- [Docker Quick Reference](#docker-quick-reference)
- [Manual Setup (Node.js)](#manual-setup-nodejs)
- [Environment Variables](#environment-variables)

---

## Option 1 — Plain HTTP

Use this when you want **anyone on the internet** to connect and you do not need HTTPS.

### Step 1 — Find your public IPv4

```bash
curl -4 https://ifconfig.me
```

### Step 2 — Set up port forwarding on your router

Forward the following ports to your server's LAN IP:

| External port   | Internal port   | Protocol |
| --------------- | --------------- | -------- |
| `5000`          | `5000`          | TCP      |
| `40000`–`40099` | `40000`–`40099` | UDP      |

(Exact steps vary by router — check your router's admin panel.)

### Step 3 — Download compose file and create `.env`

```bash
curl -O https://raw.githubusercontent.com/ItsAshn/sloth-voice-server/master/docker-compose.yml
curl -O https://raw.githubusercontent.com/ItsAshn/sloth-voice-server/master/.env.example
cp .env.example .env
```

### Step 4 — Edit `.env`

```env
JWT_SECRET=replace_with_a_long_random_string
SERVER_PASSWORD=optional_join_password
MEDIASOUP_LISTEN_IP=0.0.0.0
PUBLIC_ADDRESS=203.0.113.42   # ← your public IPv4
```

### Step 5 — Open firewall ports

| Port range                                         | Protocol | Purpose              |
| -------------------------------------------------- | -------- | -------------------- |
| `5000` (or `SERVER_PORT`)                          | TCP      | HTTP API + WebSocket |
| `40000`–`40099` (or `RTC_MIN_PORT`–`RTC_MAX_PORT`) | UDP      | Voice chat (WebRTC)  |

```bash
sudo ufw allow 5000/tcp
sudo ufw allow 40000:40099/udp
```

### Step 6 — Start and verify

```bash
docker compose up -d
curl http://203.0.113.42:5000/health
```

### Step 7 — Connect a client

Point the Sloth Voice client at `http://203.0.113.42:5000`.

---

## Option 2 — HTTPS via Caddy

Use this when you have a **domain name** and want automatic HTTPS. Caddy proxies
HTTP/WebSocket traffic to the server on port 5000. The WebRTC UDP ports still go
directly to the server — they cannot be proxied.

A ready-to-use `Caddyfile` is included in this repository.

### Step 1 — Point your domain at the server

Create an **A record** in your DNS pointing `sloth-voice.example.com` to your server's public IPv4.

### Step 2 — Install Caddy

```bash
# Debian / Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

See [https://caddyserver.com/docs/install](https://caddyserver.com/docs/install) for other operating systems.

### Step 3 — Configure the Caddyfile

Copy the included `Caddyfile` to `/etc/caddy/Caddyfile` and replace the placeholder domain:

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/sloth-voice.example.com/your.actual.domain/' /etc/caddy/Caddyfile
```

Or edit it manually — see [Caddyfile](#caddyfile-reference) below.

### Step 4 — Open firewall ports

| Port            | Protocol | Purpose                                   |
| --------------- | -------- | ----------------------------------------- |
| `80`            | TCP      | HTTP (Caddy redirects to HTTPS)           |
| `443`           | TCP      | HTTPS + WebSocket                         |
| `40000`–`40099` | UDP      | Voice chat (WebRTC — direct, not proxied) |

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 40000:40099/udp
```

### Step 5 — Edit `.env`

```env
JWT_SECRET=replace_with_a_long_random_string
SERVER_PASSWORD=optional_join_password
MEDIASOUP_LISTEN_IP=0.0.0.0
PUBLIC_ADDRESS=203.0.113.42   # ← your public IPv4 (NOT the domain name)
```

> ⚠️ Even when using a domain with Caddy, `PUBLIC_ADDRESS` must still be the raw
> IPv4 — mediasoup uses it only for ICE candidates, which go over UDP directly.

### Step 6 — Start both services

```bash
# Start the Sloth Voice server
docker compose up -d

# Reload Caddy
sudo systemctl reload caddy
```

### Step 7 — Verify

```bash
curl https://your.actual.domain/health
```

### Step 8 — Connect a client

Point the Sloth Voice client at `https://your.actual.domain` (no port needed).

---

## Caddyfile Reference

The included `Caddyfile` configures Caddy as a reverse proxy with automatic HTTPS
and proper WebSocket support:

```caddy
sloth-voice.example.com {
    reverse_proxy localhost:5000
}
```

Caddy automatically:

- Obtains and renews a TLS certificate from Let's Encrypt
- Redirects HTTP → HTTPS
- Forwards WebSocket upgrade headers

> ⚠️ The `Caddyfile` only covers HTTP/WebSocket (port 443). The RTC UDP port range
> (`40000`–`40099`) must be opened directly in the firewall — Caddy cannot proxy UDP.

---

## Docker Quick Reference

```bash
# Start (detached)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Update to the latest image
docker compose pull
docker compose up -d

# Back up the database
docker run --rm -v server_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/sloth-voice-backup.tar.gz /data
```

Your database is stored in the `server_data` Docker volume and is **never affected** by image updates.

---

## Manual Setup (Node.js)

### Requirements

- [Node.js](https://nodejs.org/) v20+
- npm v9+

### Step 1 — Clone and install

```bash
git clone https://github.com/ItsAshn/sloth-voice-server.git
cd sloth-voice-server
npm install
```

### Step 2 — Create `.env`

```bash
cp .env.example .env
```

Edit the file and set at minimum `JWT_SECRET` and `PUBLIC_ADDRESS` (see the hosting options above for the correct values).

### Step 3 — Run

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

Check `http://localhost:5000/health` to confirm the server is running.

### Updating

```bash
git pull
npm install   # in case dependencies changed
npm start
```

---

## Environment Variables

| Variable              | Default             | Description                                                                                                                                                                                                                          |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SERVER_PORT`         | `5000`              | Port the HTTP server and WebSocket listen on. Must match your firewall/port-forward rules.                                                                                                                                           |
| `SERVER_NAME`         | `My Sloth Voice Server` | Display name shown to clients.                                                                                                                                                                                                       |
| `SERVER_DESCRIPTION`  | _(empty)_           | Short description shown to clients.                                                                                                                                                                                                  |
| `SERVER_PASSWORD`     | _(empty)_           | Optional join password. Anyone registering an account must supply this. Leave blank for open access.                                                                                                                                 |
| `JWT_SECRET`          | _(must be set)_     | Signs and verifies auth tokens. Use a long random string (`openssl rand -hex 64`). Changing it invalidates all sessions.                                                                                                             |
| `SERVER_DB_PATH`      | `./server.db`       | Path to the SQLite database. In Docker this is set to `/data/server.db` inside the container automatically.                                                                                                                          |
| `MEDIASOUP_LISTEN_IP` | `0.0.0.0`           | IP mediasoup binds to internally. Keep `0.0.0.0` to listen on all interfaces.                                                                                                                                                        |
| `PUBLIC_ADDRESS`      | `127.0.0.1`         | **Must be a bare IPv4 address — never a hostname.** Sent to clients as the WebRTC ICE candidate. Using a hostname causes Chromium to resolve it to IPv6 (`::1`), silently breaking voice. Use your public IPv4 for internet hosting. |
| `RTC_MIN_PORT`        | `40000`             | Start of the UDP port range for WebRTC voice. Must be open in your firewall.                                                                                                                                                         |
| `RTC_MAX_PORT`        | `40099`             | End of the UDP port range. Each voice participant uses ~2 ports; 100 ports supports ~50 concurrent users.                                                                                                                            |
| `MEDIASOUP_LOG_LEVEL` | `warn`              | mediasoup log verbosity: `debug`, `warn`, `error`, or `none`.                                                                                                                                                                        |
| `AUDIO_BITRATE_KBPS`  | `64`                | Server-side audio bitrate cap in kbps. Opus useful range is 32–320; 64 is a good default.                                                                                                                                            |
| `UPNP_ENABLED`        | `true`              | Automatically forward ports on your router via UPnP at startup. Safe to enable — silently skipped if the router does not support UPnP. Disable on VPS/dedicated servers.                                                             |
| `UPNP_TTL`            | `0`                 | UPnP lease duration in seconds. `0` = indefinite (recommended — prevents voice from dropping when the lease expires).                                                                                                                |
| `UPNP_RTC_MAX_PORTS`  | `50`                | Maximum RTC UDP ports to map via UPnP. If the RTC range is wider, it is automatically narrowed to this count so forwarding and mediasoup stay in sync.                                                                               |
