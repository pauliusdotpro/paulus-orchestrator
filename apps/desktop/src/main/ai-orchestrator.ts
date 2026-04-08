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

  async send(serverId: string, sessionId: string, message: string): Promise<void> {
    const session = await this.sessionManager.get(sessionId)
    const serverConfig = this.serverManager.getConfig(serverId)
    if (!serverConfig) throw new Error(`Server not found: ${serverId}`)

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
    console.log(`[AI] Spawning ${session.provider} for server ${serverConfig.name}`)
    const provider = createProvider(session.provider)
    const process = provider.spawn(
      message,
      {
        server: {
          name: serverConfig.name,
          host: serverConfig.host,
          port: serverConfig.port,
          username: serverConfig.username,
          authMethod: serverConfig.authMethod,
          hasStoredPassword: Boolean(serverConfig.hasPassword),
          privateKeyPath: serverConfig.privateKeyPath,
          tags: serverConfig.tags ?? [],
          connected: this.serverManager.pool.isConnected(serverId),
        },
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
            this.pendingCommands.set(event.tool.id, {
              id: event.tool.id,
              command: event.tool.command,
              serverId,
              sessionId,
              startedAt: event.tool.startedAt ?? new Date().toISOString(),
            })
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
          }),
        ),
      )

      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(
          formatCommandResultForModel({
            exitCode: 1,
            stdout: '',
            stderr: `Command failed: ${err.message}`,
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
