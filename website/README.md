# sloth / voice — landing page

Qwik + Tailwind landing page for [sloth voice](https://slothvoice.com).

Docker image: `ghcr.io/itsashn/sloth-voice-website:latest`  
Automatically built and pushed to GHCR on every push to `master` that touches `website/`.

---

## local dev

```bash
npm install
npm start          # dev server at localhost:5173
```

---

## deploy (recommended — pull from GHCR)

This is the fastest way to get the latest version running on your server.

```bash
# 1. copy docker-compose.yml to your server (only needed once)
scp website/docker-compose.yml user@yourserver:~/website/

# 2. on the server — pull latest image and restart
docker compose -f ~/website/docker-compose.yml pull
docker compose -f ~/website/docker-compose.yml up -d
```

Or, if you already have it running, a one-liner redeploy:

```bash
docker compose pull && docker compose up -d
```

The container listens on port `3000` by default. Override with `WEBSITE_PORT`:

```bash
WEBSITE_PORT=8080 docker compose up -d
```

---

## deploy (alternative — build locally)

Edit `docker-compose.yml` and uncomment the `build:` block, then:

```bash
docker compose up -d --build
```

---

## adding desktop release artifacts

The download section reads `https://slothvoice.com/updates/latest.yml` at request
time to show the current version. After running `npm run release -- vX.Y.Z` from
the monorepo root (which builds all desktop clients via CI), copy the following
files into the **`website/updates/`** folder and redeploy:

```
latest.yml
latest-mac.yml
latest-linux.yml
Sloth-Voice-Setup-<version>.exe
Sloth-Voice-<version>.dmg
Sloth-Voice-<version>.AppImage
```

> The monorepo release workflow (`release.yml`) will eventually automate this step.

---

## image tags

| Tag         | When                                                |
| ----------- | --------------------------------------------------- |
| `latest`    | every push to `master`                              |
| `vX.Y.Z`    | when a `vX.Y.Z` tag is pushed via `npm run release` |
| `sha-<sha>` | every build, for traceability                       |

---

## repo

This site lives inside the discard monorepo:

```
ItsAshn/discard  →  website/
```
