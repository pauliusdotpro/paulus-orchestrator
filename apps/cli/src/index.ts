import { randomUUID } from 'crypto'
import { createInterface } from 'readline/promises'
import type { CredentialStoreFactory, PaulusRuntime, RuntimeEventSink } from '@paulus/core'
import { createPaulusRuntime, getDefaultDataPath } from '@paulus/core'
import type { AIProviderType, PasswordStorageMode, ServerConfig } from '@paulus/shared'

interface ParsedArgs {
  positionals: string[]
  options: Map<string, string | boolean>
  commandTail: string[]
}

interface ChatSendOptions {
  password?: string
  provider?: AIProviderType
  autoApprove: boolean
  newSession: boolean
  sessionId?: string
}

function printUsage(): void {
  process.stdout.write(`Paulus CLI

Usage:
  bun run cli -- servers list
  bun run cli -- servers connect <server> [--password <password>]
  bun run cli -- servers exec <server> [--password <password>] -- <command>
  bun run cli -- sessions list <server>
  bun run cli -- chat send <server> [--password <password>] [--provider claude-acp|codex-acp] [--auto-approve] [--new-session] [--session <id>] <message>

Notes:
  - CLI mode uses the same data directory as the desktop app.
  - Saved passwords only work in CLI when desktop password storage mode is Plaintext JSON.
`)
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const options = new Map<string, string | boolean>()
  let commandTail: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--') {
      commandTail = argv.slice(index + 1)
      break
    }

    if (token.startsWith('--')) {
      const next = argv[index + 1]
      if (next && !next.startsWith('--')) {
        options.set(token, next)
        index += 1
      } else {
        options.set(token, true)
      }
      continue
    }

    positionals.push(token)
  }

  return { positionals, options, commandTail }
}

function getOption(args: ParsedArgs, name: string): string | undefined {
  const value = args.options.get(name)
  return typeof value === 'string' ? value : undefined
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.options.get(name) === true
}

async function createCliRuntime(eventSink: RuntimeEventSink): Promise<PaulusRuntime> {
  const credentialStoreFactory: CredentialStoreFactory = (storage) => {
    const assertPlaintextMode = async (): Promise<void> => {
      const mode =
        (await storage.get<{ mode: PasswordStorageMode }>('credentials-meta'))?.mode ??
        'safe-storage'

      if (mode !== 'plaintext-json') {
        throw new Error(
          `Saved passwords are stored with ${mode} and are not available in CLI. Pass --password explicitly or switch desktop password storage back to Plaintext JSON.`,
        )
      }
    }

    return {
      async savePassword(serverId: string, password: string): Promise<void> {
        await assertPlaintextMode()
        const creds = (await storage.get<Record<string, string>>('credentials')) ?? {}
        creds[serverId] = password
        await storage.set('credentials', creds)
      },
      async getPassword(serverId: string): Promise<string | null> {
        await assertPlaintextMode()
        const creds = await storage.get<Record<string, string>>('credentials')
        return creds?.[serverId] ?? null
      },
      async removePassword(serverId: string): Promise<void> {
        await assertPlaintextMode()
        const creds = (await storage.get<Record<string, string>>('credentials')) ?? {}
        delete creds[serverId]
        await storage.set('credentials', creds)
      },
    }
  }

  return createPaulusRuntime({
    basePath: getDefaultDataPath(),
    credentialStoreFactory,
    eventSink,
    autoConnect: false,
  })
}

async function resolveServer(runtime: PaulusRuntime, identifier: string): Promise<ServerConfig> {
  const servers = await runtime.serverManager.list()
  const directMatch = servers.find((server) => server.id === identifier)
  if (directMatch) return directMatch

  const byName = servers.filter((server) => server.name === identifier)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new Error(`Multiple servers match name "${identifier}". Use the server id instead.`)
  }

  throw new Error(`Server not found: ${identifier}`)
}

async function ensureConnected(
  runtime: PaulusRuntime,
  server: ServerConfig,
  password?: string,
): Promise<void> {
  if (runtime.serverManager.pool.isConnected(server.id)) {
    return
  }

  if (server.authMethod === 'password') {
    if (password) {
      await runtime.serverManager.connectWithPassword(server.id, password, false)
      return
    }
    await runtime.serverManager.connect(server.id)
    return
  }

  await runtime.serverManager.connect(server.id)
}

async function promptForApproval(command: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `Command approval is interactive. Re-run with --auto-approve or from a TTY.\nPending command: ${command}`,
    )
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(`Approve remote command?\n${command}\n[y/N] `)
    return answer.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

async function resolveSession(
  runtime: PaulusRuntime,
  serverId: string,
  explicitSessionId: string | undefined,
  newSession: boolean,
): Promise<string> {
  if (explicitSessionId) {
    const session = await runtime.sessions.get(explicitSessionId)
    if (session.serverId !== serverId) {
      throw new Error(`Session ${explicitSessionId} does not belong to the selected server`)
    }
    return session.id
  }

  if (!newSession) {
    const sessions = await runtime.sessions.list(serverId)
    const latest = sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    if (latest) return latest.id
  }

  const settings = await runtime.settings.get()
  const session = await runtime.sessions.create(serverId, {
    provider: settings.activeProvider,
    model: null,
  })
  return session.id
}

async function runServersList(): Promise<void> {
  const runtime = await createCliRuntime({
    emitAIEvent() {},
    emitSSHOutput() {},
    emitConnectionStatus() {},
  })

  try {
    const servers = await runtime.serverManager.list()
    if (servers.length === 0) {
      process.stdout.write('No servers configured.\n')
      return
    }

    for (const server of servers) {
      const summary = [
        `${server.name}`,
        `id=${server.id}`,
        `${server.username}@${server.host}:${server.port}`,
        `auth=${server.authMethod}`,
        `autoConnect=${server.autoConnect ? 'yes' : 'no'}`,
        `tags=${server.tags?.join(',') || 'none'}`,
      ]
      process.stdout.write(`${summary.join('  ')}\n`)
    }
  } finally {
    runtime.serverManager.pool.disconnectAll()
  }
}

async function runServersConnect(serverRef: string, password?: string): Promise<void> {
  const runtime = await createCliRuntime({
    emitAIEvent() {},
    emitSSHOutput() {},
    emitConnectionStatus(status) {
      const line = status.error
        ? `[connection] ${status.serverId} ${status.status}: ${status.error}\n`
        : `[connection] ${status.serverId} ${status.status}\n`
      process.stderr.write(line)
    },
  })

  try {
    const server = await resolveServer(runtime, serverRef)
    await ensureConnected(runtime, server, password)
    process.stdout.write(
      `Connected to ${server.name} (${server.username}@${server.host}:${server.port}). Connection closes when the CLI process exits.\n`,
    )
  } finally {
    runtime.serverManager.pool.disconnectAll()
  }
}

async function runServersExec(
  serverRef: string,
  command: string,
  password?: string,
): Promise<void> {
  const runtime = await createCliRuntime({
    emitAIEvent() {},
    emitSSHOutput(event) {
      const stream = event.stream === 'stdout' ? process.stdout : process.stderr
      stream.write(event.data)
    },
    emitConnectionStatus(status) {
      if (status.status === 'error' && status.error) {
        process.stderr.write(`[connection] ${status.error}\n`)
      }
    },
  })

  try {
    const server = await resolveServer(runtime, serverRef)
    await ensureConnected(runtime, server, password)
    const result = await runtime.serverManager.pool.exec(server.id, randomUUID(), command)
    if (result.stdout && !result.stdout.endsWith('\n')) {
      process.stdout.write('\n')
    }
    if (result.stderr && !result.stderr.endsWith('\n')) {
      process.stderr.write('\n')
    }
    process.stderr.write(`[exit ${result.exitCode}]\n`)
  } finally {
    runtime.serverManager.pool.disconnectAll()
  }
}

async function runSessionsList(serverRef: string): Promise<void> {
  const runtime = await createCliRuntime({
    emitAIEvent() {},
    emitSSHOutput() {},
    emitConnectionStatus() {},
  })

  try {
    const server = await resolveServer(runtime, serverRef)
    const sessions = await runtime.sessions.list(server.id)
    if (sessions.length === 0) {
      process.stdout.write(`No sessions for ${server.name}.\n`)
      return
    }

    for (const session of sessions.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )) {
      process.stdout.write(
        `${session.id}  provider=${session.provider}  messages=${session.messages.length}  updated=${session.updatedAt}\n`,
      )
    }
  } finally {
    runtime.serverManager.pool.disconnectAll()
  }
}

async function runChatSend(
  serverRef: string,
  message: string,
  options: ChatSendOptions,
): Promise<void> {
  const runtimeRef: { current: PaulusRuntime | null } = { current: null }
  let activeSessionId = ''
  let finished = false

  const sessionDone = new Promise<void>((resolve, reject) => {
    const eventSink: RuntimeEventSink = {
      emitAIEvent(event) {
        if (event.sessionId !== activeSessionId) {
          return
        }

        switch (event.type) {
          case 'text':
            process.stdout.write(event.text)
            break
          case 'command_proposal':
            process.stderr.write(`\n[command] ${event.command}\n`)
            void (async () => {
              try {
                const approved = options.autoApprove ? true : await promptForApproval(event.command)
                if (!runtimeRef.current) return
                if (approved) {
                  await runtimeRef.current.aiOrchestrator.approve(activeSessionId, event.id)
                } else {
                  await runtimeRef.current.aiOrchestrator.reject(activeSessionId, event.id)
                }
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)))
              }
            })()
            break
          case 'command_running':
            process.stderr.write(`[running] ${event.command}\n`)
            break
          case 'command_done':
            process.stderr.write(`[command exit ${event.exitCode}]\n`)
            break
          case 'error':
            reject(new Error(event.message))
            break
          case 'done':
            if (!finished) {
              finished = true
              if (process.stdout.isTTY) {
                process.stdout.write('\n')
              }
              resolve()
            }
            break
        }
      },
      emitSSHOutput(event) {
        const stream = event.stream === 'stdout' ? process.stdout : process.stderr
        stream.write(event.data)
      },
      emitConnectionStatus(status) {
        if (status.status === 'error' && status.error) {
          process.stderr.write(`[connection] ${status.error}\n`)
        }
      },
    }

    void (async () => {
      runtimeRef.current = await createCliRuntime(eventSink)
      const server = await resolveServer(runtimeRef.current, serverRef)

      if (options.provider) {
        await runtimeRef.current.settings.update({ activeProvider: options.provider })
      }

      await ensureConnected(runtimeRef.current, server, options.password)
      activeSessionId = await resolveSession(
        runtimeRef.current,
        server.id,
        options.sessionId,
        options.newSession,
      )
      await runtimeRef.current.aiOrchestrator.send(server.id, activeSessionId, message)
    })().catch((err) => {
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })

  try {
    await sessionDone
  } finally {
    runtimeRef.current?.serverManager.pool.disconnectAll()
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const [scope, action, ...rest] = args.positionals

  if (!scope || scope === '--help' || scope === '-h') {
    printUsage()
    return
  }

  if (scope === 'servers' && action === 'list') {
    await runServersList()
    return
  }

  if (scope === 'servers' && action === 'connect') {
    const serverRef = rest[0]
    if (!serverRef) throw new Error('Usage: servers connect <server> [--password <password>]')
    await runServersConnect(serverRef, getOption(args, '--password'))
    return
  }

  if (scope === 'servers' && action === 'exec') {
    const serverRef = rest[0]
    if (!serverRef) {
      throw new Error('Usage: servers exec <server> [--password <password>] -- <command>')
    }
    if (args.commandTail.length === 0) {
      throw new Error('servers exec requires a command after --')
    }
    await runServersExec(serverRef, args.commandTail.join(' '), getOption(args, '--password'))
    return
  }

  if (scope === 'sessions' && action === 'list') {
    const serverRef = rest[0]
    if (!serverRef) throw new Error('Usage: sessions list <server>')
    await runSessionsList(serverRef)
    return
  }

  if (scope === 'chat' && action === 'send') {
    const serverRef = rest[0]
    const message = rest.slice(1).join(' ').trim()
    if (!serverRef || !message) {
      throw new Error(
        'Usage: chat send <server> [--password <password>] [--provider claude-acp|codex-acp] [--auto-approve] [--new-session] [--session <id>] <message>',
      )
    }

    const provider = getOption(args, '--provider')
    if (provider && provider !== 'claude-acp' && provider !== 'codex-acp') {
      throw new Error(`Unsupported provider: ${provider}`)
    }

    await runChatSend(serverRef, message, {
      password: getOption(args, '--password'),
      provider: provider as AIProviderType | undefined,
      autoApprove: hasFlag(args, '--auto-approve'),
      newSession: hasFlag(args, '--new-session'),
      sessionId: getOption(args, '--session'),
    })
    return
  }

  throw new Error(`Unknown command: ${args.positionals.join(' ')}`)
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
