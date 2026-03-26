# AGENTS.md

Guidelines for agentic coding agents working in this repository.

## Build/Lint/Test Commands

```bash
# Install all dependencies (run first)
npm run install:all

# Development
npm run dev           # Server + desktop concurrently (main workflow)
npm run server        # Server only (localhost:5000)
npm run desktop       # Desktop only

# Server (from server/)
npm run start         # Production mode (requires--experimental-sqlite)
npm run dev           # Development with nodemon
npm run setup         # Interactive config wizard
npm run doctor        # Diagnose configuration issues

# Desktop (from desktop/)
npm run dev           # Vite dev server + Electron
npm run build         # Type-check + build
npm run dist          # Build platform installers

# Mobile (from mobile/)
npx expo start        # Start Expo dev server
npx expo start --android
npx expo start --ios

# Release
npm run release       # Bump versions, tag, push → triggers CI
```

**No test framework is configured.** CI validates via builds only.

## Project Structure

```
server/               # Express + Socket.IO + mediasoup + SQLite
├── src/
│   ├── index.js          # Entry point
│   ├── routes/           # Express route handlers
│   ├── socket/           # Socket.IO handlers (chat, voice)
│   ├── db/               # SQLite database layer
│   ├── mediasoup/        # WebRTC worker management
│   └── middleware/       # Auth middleware

desktop/              # Electron + React + TypeScript
├── src/
│   ├── main/             # Electron main process
│   ├── preload/          # Context bridge
│   └── renderer/         # React app (src/renderer/src/)
│       ├── components/   # UI components
│       ├── hooks/        # Custom React hooks
│       ├── store/        # Zustand state
│       └── api/           # Server API client

mobile/               # React Native + Expo
├── src/
│   ├── screens/          # Screen components
│   ├── hooks/            # Custom hooks
│   ├── store/            # Zustand state
│   └── api/              # Server API client

packages/shared/      # Shared TypeScript types (no build step)
├── src/
│   ├── index.ts          # Re-exports
│   ├── types.ts          # Type definitions
│   └── api.ts            # Shared API client code
```

## Code Style

### Imports
- External packages first, then internal modules
- Use path aliases: `@/` for renderer src, `@sloth-voice/shared` for shared package
- Group imports logically (React, external libs, internal modules)

### Formatting
- No comments in production code (self-documenting code preferred)
- 2-space indentation
- Single quotes for strings
- Trailing commas in multiline objects/arrays

### Types
- Use `interface` for object shapes, `type` for unions/mapped types
- Properties from DB/API use snake_case (e.g., `created_at`, `channel_id`)
- Frontend-only properties use camelCase
- Export all types from `packages/shared/src/types.ts`

### Naming
- Files: PascalCase for components (`MessageItem.tsx`), camelCase for utilities (`useSocket.ts`)
- Components: Function components with `export default`
- Hooks: Prefix with `use` (`useSocket`, `useVoice`)
- Constants: UPPER_SNAKE_CASE (`JWT_SECRET`, `RATE_LIMIT_MAX`)

### Functions
- Arrow functions for React components and callbacks
- Named functions for Express routes and handlers
- Prefer early returns over nested conditionals

### Error Handling
- Use try/catch for async operations
- Log errors with `console.error`
- Return user-friendly error messages from API endpoints
- Never expose internal errors to clients

### Server (Node.js)
- CommonJS: use `require()` and `module.exports`
- SQLite requires `--experimental-sqlite` Node flag
- Use `db.prepare().run()/get()/all()` for queries
- Destructure imports at top: `const { getDb } = require("../db/database")`

### Desktop (React/TypeScript)
- Use Zustand for state: `const value = useStore((s) => s.value)`
- TailwindCSS for styling (custom theme in `tailwind.config.js`)
- Custom hooks in `hooks/` directory
- Electron IPC via `window.slothVoice` exposed in preload

### Mobile (React Native)
- Expo SDK conventions
- Same state management pattern as desktop (Zustand)
- Source shared types from `@sloth-voice/shared` via Babel module-resolver

## Key Architecture Notes

- **Shared package**: TypeScript source consumed via path alias; no build step. Both desktop (Vite) and mobile (Metro) resolve it directly.
- **Auth**: JWT tokens stored per-server, passed via Socket.IO auth
- **Voice**: mediasoup WebRTC; UDP ports 40000-40099 must be open/forwarded
- **State**: Zustand stores persist server list and sessions to localStorage/AsyncStorage
- **API responses**: `{ user: {...} }`, `{ users: [...] }`, `{ error: "message" }`

## Common Patterns

### Adding a new type
1. Define in `packages/shared/src/types.ts`
2. Export from `packages/shared/src/index.ts`
3. Import in desktop/mobile: `import type { MyType } from "@sloth-voice/shared"`

### Adding a new API endpoint
1. Create route handler in `server/src/routes/`
2. Register in `server/src/index.js`
3. Add client function in `desktop/src/renderer/src/api/server.ts` or `mobile/src/api/server.ts`

### Adding a new React component
1. Create file in appropriate `components/` subdirectory
2. Use named export: `export default function MyComponent()`
3. Follow existing patterns for hooks, state, and styling

## Environment Setup

Server requires `.env` file (copy from `.env.example`). Key variables:
- `JWT_SECRET` — Required; must be a strong random string
- `SERVER_PORT` — Default 5000
- `RTC_MIN_PORT`/`RTC_MAX_PORT` — UDP range for voice (default 40000-40099)
- `PUBLIC_ADDRESS` — Auto-detected if blank
- `UPNP_ENABLED` — Auto port-forward (default true)