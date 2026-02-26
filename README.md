# Sloth Voice

A locally-hosted Discord alternative. You self-host the server and connect with the desktop or mobile client.

## Repositories

| Repo                                                                | Visibility | Contents                                           |
| ------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| [ItsAshn/sloth-voice](https://github.com/ItsAshn/sloth-voice)               | Private    | Full monorepo (server + desktop + mobile + client) |
| [ItsAshn/sloth-voice-server](https://github.com/ItsAshn/sloth-voice-server) | Public     | Server only — for self-hosters                     |

## Projects

| Directory                   | Description                    | Tech                                   |
| --------------------------- | ------------------------------ | -------------------------------------- |
| `server/`                   | Backend API + WebSocket server | Node.js, Express, Socket.IO, mediasoup |
| `desktop/`                  | Desktop client                 | Electron, React, Vite, Tailwind        |
| `mobile/`                   | Mobile client                  | React Native, Expo                     |
| `client/`                   | Web client (browser)           | React, Vite, Tailwind                  |
| `website/`                  | Landing page                   | Qwik, Tailwind, Docker                 |
| `server/docker-compose.yml` | Container orchestration        | Docker, Docker Compose                 |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [npm](https://www.npmjs.com/) v9+
- For mobile: [Expo Go](https://expo.dev/client) on your phone, or an Android/iOS emulator
- For Docker hosting: [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) v2+

---

## 1. Install Dependencies

From the root of the repository, install all project dependencies at once:

```bash
npm run install:all
```

Or install individually:

```bash
cd server && npm install
cd ../desktop && npm install
cd ../mobile && npm install
```

---

## 2. Configure the Server

Copy or edit `server/.env`:

```env
SERVER_PORT=5000
SERVER_NAME=My Sloth Voice Server
SERVER_DESCRIPTION=A locally-hosted Sloth Voice server
# Optional: set a password to restrict registration (leave blank for open access)
SERVER_PASSWORD=

JWT_SECRET=change_this_to_a_long_random_secret

SERVER_DB_PATH=./server.db

# mediasoup (voice) settings
MEDIASOUP_LISTEN_IP=127.0.0.1
PUBLIC_ADDRESS=localhost
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
MEDIASOUP_LOG_LEVEL=warn
```

> **Important:** Set `SERVER_PASSWORD` and `JWT_SECRET` before exposing the server to a network.

---

## 3. Run the Server

### Option A — Node.js (local)

```bash
cd server
npm run dev
```

The server starts on `http://localhost:5000` by default. Visit `http://localhost:5000/health` to verify it is running.

**Scripts:**

| Command       | Description                       |
| ------------- | --------------------------------- |
| `npm run dev` | Start with nodemon (auto-restart) |
| `npm start`   | Start without nodemon             |

### Option B — Docker Compose

See [**§ Hosting with Docker**](#hosting-with-docker) below for full details. Quick start:

```bash
cd server
docker compose up -d
```

---

## 4. Run the Desktop Client

```bash
cd desktop
npm run dev
```

The Electron app will launch and prompt you to enter your server's URL (e.g. `http://localhost:5000`).

**Scripts:**

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npm run dev`     | Start in development mode         |
| `npm run build`   | Build the app                     |
| `npm run dist`    | Build and package as an installer |
| `npm run preview` | Preview the production build      |

**Packaging output** (`npm run dist`) is placed in `desktop/dist/` as:

- Windows: `.exe` installer (NSIS)
- macOS: `.dmg`
- Linux: `.AppImage`

### Auto-updates

The desktop app uses [`electron-updater`](https://www.electron.build/auto-update) pointed at **GitHub Releases** on the private `ItsAshn/sloth-voice` repo.

**To publish an update:**

1. Bump the version in `desktop/package.json`
2. Build and publish:
   ```bash
   cd desktop
   GH_TOKEN=<your_github_token> npm run dist -- --publish always
   ```
3. A GitHub Release is created automatically with the installer and update metadata files.

When a user opens the app, it silently checks for a new release. If one is found it downloads in the background and prompts the user to restart.

> A **GitHub Personal Access Token** with `repo` scope is required for publishing. Set it as `GH_TOKEN` in your environment or as a repo secret in CI.

---

## 5. Run the Mobile Client

```bash
cd mobile
npx expo start
```

Scan the QR code with the **Expo Go** app (iOS/Android), or press `a` for Android emulator / `i` for iOS simulator.

**Scripts:**

| Command           | Description                       |
| ----------------- | --------------------------------- |
| `npx expo start`  | Start Expo dev server             |
| `npm run android` | Open directly on Android          |
| `npm run ios`     | Open directly on iOS (macOS only) |

When prompted in the app, enter your server's URL (e.g. `http://192.168.1.x:5000` — use your machine's LAN IP so the phone can reach it).

---

## 6. Run Everything at Once (Desktop + Server)

From the root:

```bash
npm run dev
```

This opens two terminal windows — one for the server and one for the desktop client.

---

## Environment Variables Reference

### `server/.env`

| Variable              | Default             | Description                                                                     |
| --------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `SERVER_PORT`         | `5000`              | Port the server listens on                                                      |
| `SERVER_NAME`         | `My Sloth Voice Server` | Name shown to clients                                                           |
| `SERVER_DESCRIPTION`  | _(empty)_           | Server description                                                              |
| `SERVER_PASSWORD`     | _(empty)_           | Optional password required to register an account (leave blank for open access) |
| `JWT_SECRET`          | _(must be set)_     | Secret used to sign auth tokens                                                 |
| `SERVER_DB_PATH`      | `./server.db`       | Path to the SQLite database file                                                |
| `MEDIASOUP_LISTEN_IP` | `127.0.0.1`         | IP mediasoup listens on internally                                              |
| `PUBLIC_ADDRESS`      | `localhost`         | Public IP/hostname for WebRTC                                                   |
| `RTC_MIN_PORT`        | `40000`             | Start of UDP port range for WebRTC                                              |
| `RTC_MAX_PORT`        | `49999`             | End of UDP port range for WebRTC                                                |

---

## Hosting with Docker

The `server/` directory ships with a `Dockerfile` and a `docker-compose.yml`. The image is built on `node:20-bookworm-slim` and includes the native build tools required by mediasoup.

### 1. Create an env file

Copy the example and fill in your values:

```bash
cd server
cp .env.example .env   # edit .env before continuing
```

> **Important:** Set `JWT_SECRET` to a long random string and optionally set `SERVER_PASSWORD`. Docker Compose reads the `.env` file from the `server/` directory.

### 2. Start the container

```bash
cd server
docker compose up -d
```

This builds the image on first run and starts the server in the background. The SQLite database is persisted in the `server_data` Docker volume.

### 3. Verify

```bash
curl http://localhost:5000/health
```

### Useful commands

| Command                         | Description                      |
| ------------------------------- | -------------------------------- |
| `docker compose up -d`          | Start (build if needed)          |
| `docker compose up -d --build`  | Force rebuild and start          |
| `docker compose down`           | Stop and remove containers       |
| `docker compose down -v`        | Stop and **delete** the database |
| `docker compose logs -f server` | Tail server logs                 |

### Voice (WebRTC / mediasoup) port range

By default, Docker Compose exposes UDP ports `40000–40099` for WebRTC. The range is intentionally kept small for Docker compatibility. Adjust `RTC_MIN_PORT` / `RTC_MAX_PORT` in your `.env` and ensure the same range is open in your firewall.

**Linux only:** replace the `ports` entries in `server/docker-compose.yml` with `network_mode: host` for zero-overhead voice (no port mapping needed).

---

## Hosting the Website

The landing page (`website/`) is published as a Docker image to GHCR on every push to `master` that touches `website/`:

```
ghcr.io/itsashn/sloth-voice-website:latest
```

### 1. Pull and run (recommended)

Copy `website/docker-compose.yml` to your server, then:

```bash
docker compose pull
docker compose up -d
```

The site listens on port `3000` by default. Override with `WEBSITE_PORT`:

```bash
WEBSITE_PORT=8080 docker compose up -d
```

### 2. Redeploy after a new push

```bash
docker compose pull && docker compose up -d
```

That's it — no build step needed on the server.

### 3. Serving desktop release artifacts

The download section of the site reads `https://slothvoice.com/updates/latest.yml` at request time to display the current version and link to the correct installers. After publishing a new desktop release via `npm run release -- vX.Y.Z`, copy the build output into `website/updates/` and redeploy:

```
website/updates/
  latest.yml
  latest-mac.yml
  latest-linux.yml
  Sloth Voice Setup <version>.exe
  Sloth Voice-<version>.dmg
  Sloth Voice-<version>.AppImage
```

### Image tags

| Tag         | Published when                             |
| ----------- | ------------------------------------------ |
| `latest`    | Every push to `master` touching `website/` |
| `vX.Y.Z`    | On a `vX.Y.Z` release tag                  |
| `sha-<sha>` | Every build, for traceability              |

---

## Hosting on a LAN / Remote Server

1. Set `PUBLIC_ADDRESS` in `server/.env` to the machine's LAN IP or public domain.
2. Set `MEDIASOUP_LISTEN_IP` to `0.0.0.0` (or the specific network interface) to accept external connections.
3. Open firewall ports: `SERVER_PORT` (TCP) and the RTC port range (UDP).
4. Point the desktop/mobile client at `http://<server-ip>:<SERVER_PORT>`.
