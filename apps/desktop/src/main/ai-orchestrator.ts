import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { AIEvent, AIMessage, AIModelOption, AIProviderType } from '@paulus/shared'
import type { AIProcess } from '@paulus/ai'
import {
  buildServerCommandToolState,
  createCommandToolOutput,
  createProvider,
  formatCommandResultForModel,
  toolStateEvent,
} from '@paulus/ai'
import type { ServerManager } from './ssh/server-manager'
import type { SessionManager } from './session-manager'
import type { SettingsManager } from './settings-manager'

interface PendingCommand {
  id: string
  command: string
  serverId: string
  serverName: string
  sessionId: string
  startedAt: string
}

interface ActiveRun {
  process: AIProcess
  assistantContent: string
  events: AIEvent[]
}

export class AIOrchestrator {
  private win: BrowserWindow
  private serverManager: ServerManager
  private sessionManager: SessionManager
  private settingsManager: SettingsManager
  private activeRuns = new Map<string, ActiveRun>()
  private pendingCommands = new Map<string, PendingCommand>()

  constructor(
    win: BrowserWindow,
    serverManager: ServerManager,
    sessionManager: SessionManager,
    settingsManager: SettingsManager,
  ) {
    this.win = win
    this.serverManager = serverManager
    this.sessionManager = sessionManager
    this.settingsManager = settingsManager
  }

  async getModels(providerType: AIProviderType): Promise<AIModelOption[]> {
    const provider = createProvider(providerType)
    return provider.listModels()
  }

  async send(serverIds: string[], sessionId: string, message: string): Promise<void> {
    const session = await this.sessionManager.get(sessionId)
    const yoloMode = session.yoloMode === true

    // Build server contexts for all servers in this session
    const serverContexts = serverIds.map((sid) => {
      const config = this.serverManager.getConfig(sid)
      if (!config) throw new Error(`Server not found: ${sid}`)
      return {
        id: sid,
        name: config.name,
        host: config.host,
        port: config.port,
        username: config.username,
        authMethod: config.authMethod as 'password' | 'key',
        hasStoredPassword: Boolean(config.hasPassword),
        privateKeyPath: config.privateKeyPath,
        tags: config.tags ?? [],
        connected: this.serverManager.pool.isConnected(sid),
      }
    })

    // Save user message
    const userMessage: AIMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    await this.sessionManager.addMessage(sessionId, userMessage)

    // Build conversation history
    const history = session.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    history.push({ role: 'user', content: message })

    // Spawn AI process
    const serverNamesList = serverContexts.map((s) => s.name).join(', ')
    console.log(`[AI] Spawning ${session.provider} for servers: ${serverNamesList}`)
    const provider = createProvider(session.provider)
    const process = provider.spawn(
      message,
      {
        servers: serverContexts,
        conversationHistory: history,
      },
      { model: session.model },
    )
    console.log('[AI] Process spawned, waiting for events...')

    this.activeRuns.set(sessionId, {
      process,
      assistantContent: '',
      events: [],
    })

    // Stream events to renderer
    ;(async () => {
      try {
        for await (const event of process.events) {
          console.log(
            '[AI] Event:',
            event.type,
            event.type === 'text' ? (event as any).text?.slice(0, 50) : '',
          )

          if (event.type === 'text') {
            this.emitAIEvent(sessionId, event)
          } else {
            this.emitAIEvent(sessionId, event)
          }

          if (
            event.type === 'tool_state' &&
            event.tool.kind === 'server-command' &&
            event.tool.status === 'pending' &&
            event.tool.command
          ) {
            // Resolve server name from tool metadata to serverId
            const targetServerName =
              (event.tool.metadata?.serverName as string) ?? serverContexts[0]?.name
            const targetServer = serverContexts.find(
              (s) => s.name.toLowerCase() === targetServerName?.toLowerCase(),
            )
            const targetServerId = targetServer?.id ?? serverIds[0]

            this.pendingCommands.set(event.tool.id, {
              id: event.tool.id,
              command: event.tool.command,
              serverId: targetServerId,
              serverName: targetServerName ?? '',
              sessionId,
              startedAt: event.tool.startedAt ?? new Date().toISOString(),
            })

            if (yoloMode) {
              void this.approve(sessionId, event.tool.id)
            }
          }
        }
      } catch (err: any) {
        console.error('[AI] Error:', err.message)
        this.emitAIEvent(sessionId, {
          type: 'error',
          message: err.message,
        })
      } finally {
        this.failPendingCommandsForSession(
          sessionId,
          'AI run ended before command execution completed',
        )
        const run = this.activeRuns.get(sessionId)
        this.activeRuns.delete(sessionId)

        // Save assistant message
        if (run && (run.assistantContent || run.events.length > 0)) {
          const assistantMessage: AIMessage = {
            id: randomUUID(),
            role: 'assistant',
            content: run.assistantContent,
            events: run.events,
            timestamp: new Date().toISOString(),
          }
          await this.sessionManager.addMessage(sessionId, assistantMessage)
        }
      }
    })()
  }

  async approve(sessionId: string, commandId: string): Promise<void> {
    const pending = this.pendingCommands.get(commandId)
    if (!pending) throw new Error(`No pending command: ${commandId}`)

    this.pendingCommands.delete(commandId)

    // Notify renderer that command is running
    this.emitAIEvent(
      sessionId,
      toolStateEvent(
        buildServerCommandToolState({
          id: commandId,
          command: pending.command,
          status: 'running',
          startedAt: pending.startedAt,
          serverId: pending.serverId,
          serverName: pending.serverName,
        }),
      ),
    )

    try {
      const result = await this.serverManager.pool.exec(pending.serverId, pending.command)

      this.emitAIEvent(
        sessionId,
        toolStateEvent(
          buildServerCommandToolState({
            id: commandId,
            command: pending.command,
            status: 'completed',
            startedAt: pending.startedAt,
            endedAt: new Date().toISOString(),
            output: createCommandToolOutput(result),
            serverId: pending.serverId,
            serverName: pending.serverName,
          }),
        ),
      )

      // Feed output back to AI if process is still active
      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(formatCommandResultForModel(result))
      }
    } catch (err: any) {
      this.emitAIEvent(
        sessionId,
        toolStateEvent(
          buildServerCommandToolState({
            id: commandId,
            command: pending.command,
            status: 'error',
            startedAt: pending.startedAt,
            endedAt: new Date().toISOString(),
            error: `Command failed: ${err.message}`,
            serverId: pending.serverId,
            serverName: pending.serverName,
          }),
        ),
      )

      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(
          formatCommandResultForModel({
            exitCode: 1,
            stdout: '',
            stderr: `Command failed on ${pending.serverName}: ${err.message}`,
          }),
        )
      }
    }
  }

  async reject(sessionId: string, commandId: string): Promise<void> {
    const pending = this.pendingCommands.get(commandId)
    this.pendingCommands.delete(commandId)

    // Feed rejection back to AI process (needed for ACP providers to unblock pending tool calls)
    const run = this.activeRuns.get(sessionId)
    if (run) {
      run.process.write('Command rejected by user')
    }

    this.emitAIEvent(
      sessionId,
      toolStateEvent(
        buildServerCommandToolState({
          id: commandId,
          command: pending?.command ?? '',
          status: 'rejected',
          startedAt: pending?.startedAt,
          endedAt: new Date().toISOString(),
          error: 'Command rejected by user',
        }),
      ),
    )
  }

  kill(sessionId: string): void {
    const run = this.activeRuns.get(sessionId)
    if (run) {
      this.failPendingCommandsForSession(sessionId, 'AI run was killed')
      run.process.kill()
      this.activeRuns.delete(sessionId)
    }
  }

  private failPendingCommandsForSession(sessionId: string, reason: string): void {
    for (const [commandId, pending] of this.pendingCommands) {
      if (pending.sessionId !== sessionId) continue
      this.pendingCommands.delete(commandId)
      this.emitAIEvent(
        sessionId,
        toolStateEvent(
          buildServerCommandToolState({
            id: commandId,
            command: pending.command,
            status: 'error',
            startedAt: pending.startedAt,
            endedAt: new Date().toISOString(),
            error: reason,
          }),
        ),
      )
    }
  }

  private emitAIEvent(sessionId: string, event: AIEvent): void {
    const run = this.activeRuns.get(sessionId)
    if (run) {
      run.events.push(event)
      if (event.type === 'text') {
        run.assistantContent += event.text
      }
    }

    this.win.webContents.send('ai:event', { ...event, sessionId })
  }
}
