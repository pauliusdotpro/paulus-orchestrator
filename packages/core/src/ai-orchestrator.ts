import { randomUUID } from 'crypto'
import type { AIEvent, AIMessage, AIModelOption, AIProviderType } from '@paulus/shared'
import type { AIProcess } from '@paulus/ai'
import {
  buildServerCommandToolState,
  createCommandToolOutput,
  createProvider,
  formatCommandResultForModel,
  toolStateEvent,
} from '@paulus/ai'
import type { RuntimeEventSink } from './events'
import type { ServerManager } from './ssh/server-manager'
import type { SessionManager } from './session-manager'
import type { SettingsManager } from './settings-manager'
import type { TerminalSessionManager } from './terminal-session-manager'

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
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly pendingCommands = new Map<string, PendingCommand>()

  constructor(
    private readonly eventSink: RuntimeEventSink,
    private readonly serverManager: ServerManager,
    private readonly sessionManager: SessionManager,
    private readonly settingsManager: SettingsManager,
    private readonly terminalSessions: TerminalSessionManager,
  ) {}

  async getModels(providerType: AIProviderType): Promise<AIModelOption[]> {
    const provider = createProvider(providerType)
    return provider.listModels()
  }

  async send(serverId: string, sessionId: string, message: string): Promise<void> {
    const session = await this.sessionManager.get(sessionId)
    const serverConfig = this.serverManager.getConfig(serverId)
    if (!serverConfig) throw new Error(`Server not found: ${serverId}`)

    const userMessage: AIMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    await this.sessionManager.addMessage(sessionId, userMessage)

    const history = session.messages.map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: entry.content,
    }))
    history.push({ role: 'user', content: message })

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

    this.activeRuns.set(sessionId, {
      process,
      assistantContent: '',
      events: [],
    })
    ;(async () => {
      try {
        for await (const event of process.events) {
          this.emitAIEvent(sessionId, event)

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
      } finally {
        this.failPendingCommandsForSession(
          sessionId,
          'AI run ended before command execution completed',
        )
        const run = this.activeRuns.get(sessionId)
        this.activeRuns.delete(sessionId)

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
    })().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.emitAIEvent(sessionId, {
        type: 'error',
        message,
      })
    })
  }

  async approve(sessionId: string, commandId: string): Promise<void> {
    const pending = this.pendingCommands.get(commandId)
    if (!pending) throw new Error(`No pending command: ${commandId}`)

    this.pendingCommands.delete(commandId)
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
      await this.terminalSessions.recordCommand(sessionId, pending.command)
      const result = await this.serverManager.pool.exec(
        pending.serverId,
        sessionId,
        pending.command,
      )
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

      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(formatCommandResultForModel(result))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.terminalSessions.appendSystem(sessionId, `Error: ${message}`)
      this.emitAIEvent(
        sessionId,
        toolStateEvent(
          buildServerCommandToolState({
            id: commandId,
            command: pending.command,
            status: 'error',
            startedAt: pending.startedAt,
            endedAt: new Date().toISOString(),
            error: `Command failed: ${message}`,
          }),
        ),
      )

      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(
          formatCommandResultForModel({
            exitCode: 1,
            stdout: '',
            stderr: `Command failed: ${message}`,
          }),
        )
      }
    }
  }

  async reject(sessionId: string, commandId: string): Promise<void> {
    const pending = this.pendingCommands.get(commandId)
    this.pendingCommands.delete(commandId)

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

    this.eventSink.emitAIEvent({ ...event, sessionId })
  }
}
