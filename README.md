# Discard

A locally-hosted Discord alternative. You self-host the server and connect with the desktop or mobile client.

## Repositories

| Repo | Visibility | Contents |
|------|-----------|----------|
| [ItsAshn/discard](https://github.com/ItsAshn/discard) | Private | Full monorepo (server + desktop + mobile + client) |
| [ItsAshn/discard-server](https://github.com/ItsAshn/discard-server) | Public | Server only — for self-hosters |

## Projects

| Directory  | Description                    | Tech                                   |
| ---------- | ------------------------------ | -------------------------------------- |
| `server/`  | Backend API + WebSocket server | Node.js, Express, Socket.IO, mediasoup |
| `desktop/` | Desktop client                 | Electron, React, Vite, Tailwind        |
| `mobile/`  | Mobile client                  | React Native, Expo                     |
| `client/`  | Web client (browser)           | React, Vite, Tailwind                  |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [npm](https://www.npmjs.com/) v9+
- For mobile: [Expo Go](https://expo.dev/client) on your phone, or an Android/iOS emulator

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
SERVER_NAME=My Discard Server
SERVER_DESCRIPTION=A locally-hosted Discard server
INVITE_CODE=change-this-invite-code

JWT_SECRET=change_this_to_a_long_random_secret

SERVER_DB_PATH=./server.db

# mediasoup (voice) settings
MEDIASOUP_LISTEN_IP=127.0.0.1
PUBLIC_ADDRESS=localhost
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
MEDIASOUP_LOG_LEVEL=warn
```

> **Important:** Change `INVITE_CODE` and `JWT_SECRET` before exposing the server to a network.

---

## 3. Run the Server

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

The desktop app uses [`electron-updater`](https://www.electron.build/auto-update) pointed at **GitHub Releases** on the private `ItsAshn/discard` repo.

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

| Variable              | Default                   | Description                          |
| --------------------- | ------------------------- | ------------------------------------ |
| `SERVER_PORT`         | `5000`                    | Port the server listens on           |
| `SERVER_NAME`         | `My Discard Server`       | Name shown to clients                |
| `SERVER_DESCRIPTION`  | _(empty)_                 | Server description                   |
| `INVITE_CODE`         | `change-this-invite-code` | Code required to register an account |
| `JWT_SECRET`          | _(must be set)_           | Secret used to sign auth tokens      |
| `SERVER_DB_PATH`      | `./server.db`             | Path to the SQLite database file     |
| `MEDIASOUP_LISTEN_IP` | `127.0.0.1`               | IP mediasoup listens on internally   |
| `PUBLIC_ADDRESS`      | `localhost`               | Public IP/hostname for WebRTC        |
| `RTC_MIN_PORT`        | `40000`                   | Start of UDP port range for WebRTC   |
| `RTC_MAX_PORT`        | `49999`                   | End of UDP port range for WebRTC     |

---

## Hosting on a LAN / Remote Server

1. Set `PUBLIC_ADDRESS` in `server/.env` to the machine's LAN IP or public domain.
2. Set `MEDIASOUP_LISTEN_IP` to `0.0.0.0` (or the specific network interface) to accept external connections.
3. Open firewall ports: `SERVER_PORT` (TCP) and the RTC port range (UDP).
4. Point the desktop/mobile client at `http://<server-ip>:<SERVER_PORT>`.
