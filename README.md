<div align="center">

<img src="assets/icon.png" alt="Paulus Orchestrator" width="128" height="128" />

# Paulus Orchestrator

Open source, local-first desktop app for managing servers with AI over SSH.

[![CI](https://github.com/pauliusdotpro/paulus-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/pauliusdotpro/paulus-orchestrator/actions/workflows/ci.yml)
[![Release](https://github.com/pauliusdotpro/paulus-orchestrator/actions/workflows/release.yml/badge.svg)](https://github.com/pauliusdotpro/paulus-orchestrator/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/pauliusdotpro/paulus-orchestrator)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/pauliusdotpro/paulus-orchestrator?style=social)](https://github.com/pauliusdotpro/paulus-orchestrator/stargazers)

</div>

## About

Paulus Orchestrator is a desktop app for working with remote servers through chat.
You connect a server, describe what you want, review the command, approve it, and see the result.

Nothing runs without approval.
Server data stays on your machine.
Passwords are stored with the OS keychain through Electron `safeStorage`.

## Screenshot

![Paulus Orchestrator screenshot](assets/app-screenshot.png)

## How It Works

1. Add a server.
2. Open a chat.
3. Ask for a task in plain English.
4. Review the proposed command.
5. Approve it and inspect the output.

## Features

- Local-first desktop app for macOS, Linux, and Windows
- SSH server management with connection pooling
- AI providers: Claude ACP and Codex ACP
- Built-in terminal with live stdout and stderr
- Per-server sessions and chat history
- Explicit command approval before execution

## Installation

Download the latest release from the [releases page](https://github.com/pauliusdotpro/paulus-orchestrator/releases).

### Build from source

Requirements:

- [Bun](https://bun.sh)
- Node.js `24.x`

```bash
git clone https://github.com/pauliusdotpro/paulus-orchestrator.git
cd paulus-orchestrator
bun install
bun run dev
```

## Development

```bash
bun run dev
bun run build
bun run build:dist
bun run typecheck
bun run format
bun run format:check
bun run check
```

### Debugging Electron

In development the app exposes Chrome DevTools Protocol on port `9222`.

1. Run `bun run dev`
2. Open `chrome://inspect`
3. Add `localhost:9222`
4. Inspect the Electron renderer target

## Architecture

This repo is a Bun workspaces monorepo.

```text
apps/
  cli
  desktop
  web

packages/
  ai
  bridge
  core
  shared
  ui
```

The UI talks through a bridge interface.
Electron uses IPC today.
The same UI can later talk to a web backend without rewriting the app layer.

## Tech Stack

- Bun workspaces
- Electron 41 + electron-vite 5
- React 19
- Zustand
- Tailwind CSS v4
- `ssh2`
- TypeScript

## Contributing

```bash
git checkout -b codex/my-change
bun run check
```

Open a pull request when the branch is ready.

## Repo Activity

![Repo Activity](https://repobeats.axiom.co/api/embed/320eb0e0551f1dc72f33d2a6f8c90dce48d08c1b.svg 'Repobeats analytics image')

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=pauliusdotpro/paulus-orchestrator&type=Date)](https://star-history.com/#pauliusdotpro/paulus-orchestrator&Date)

## License

[MIT](LICENSE)
