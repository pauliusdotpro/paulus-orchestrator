# Paulus Orchestrator

## Project Overview

Open-source, cross-platform, local-first, AI-first server manager desktop app.
Core loop: select server → ask AI in chat → review proposed commands → approve → see result.

## Tech Stack

- **Runtime**: Bun workspaces monorepo (`apps/`, `packages/`)
- **Desktop**: Electron 41 + electron-vite 5
- **UI**: React 19, Zustand, Tailwind CSS v4 (`@tailwindcss/vite`)
- **AI Backends**: Codex CLI (`Codex -p --output-format stream-json`), Codex CLI (`codex exec --json`) — spawned as child processes, not direct API calls
- **SSH**: `ssh2` in Electron main process with connection pooling
- **Security**: Electron `safeStorage` for OS keychain password encryption

## Architecture

### Bridge Pattern

UI talks through a `Bridge` interface. Electron implements via IPC, future web app via HTTP/WebSocket. This avoids code duplication when adding web support later.

### Workspace Packages

- `@paulus/shared` — types, constants
- `@paulus/bridge` — Bridge interface + implementations (electron, web)
- `@paulus/ai` — AI provider abstraction, CLI spawning, NDJSON parsing
- `@paulus/ui` — React components, Zustand stores

### Key Config Details

- `externalizeDepsPlugin({ exclude: workspacePackages })` in electron.vite.config.ts — must exclude `@paulus/*` so they get bundled
- `@source "../../../../packages/ui/src/**/*.tsx"` in renderer styles.css — Tailwind v4 needs this to scan UI package
- `contextBridge.exposeInMainWorld` for secure IPC in preload

## Debugging

### CDP (Chrome DevTools Protocol)

The Electron app exposes CDP on port 9222 in dev mode via `app.commandLine.appendSwitch('remote-debugging-port', '9222')`.

To debug the running Electron app:

1. Run the app with `bun run dev`
2. Open Chrome and go to `chrome://inspect`
3. Click "Configure..." and add `localhost:9222`
4. The Electron renderer will appear under "Remote Target" — click "inspect"

This gives full DevTools access (Elements, Console, Network, etc.) to the live Electron app with real data. **Browser preview is useless for this app** since it lacks `window.electronAPI` and can't access real data.

## Commands

- `bun run dev` — start Electron dev app
- `bun run build` — production build
- `bun run typecheck` — check all packages

## Data Storage

- Server configs: `{userData}/data/servers.json`
- Settings: `{userData}/data/settings.json`
- Passwords: encrypted via `safeStorage`, stored in `{userData}/data/credentials.json`
- All writes are atomic (write `.tmp`, then rename)

## Future Plans

- Cloud features will be in a separate private repo
- Web app support via the Bridge pattern (not priority for v1)
