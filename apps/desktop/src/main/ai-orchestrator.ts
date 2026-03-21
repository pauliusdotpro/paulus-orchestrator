import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { AIEvent, AIMessage, AIModelOption, AIProviderType } from '@paulus/shared'
import type { AIProcess } from '@paulus/ai'
import { createProvider } from '@paulus/ai'
import type { ServerManager } from './ssh/server-manager'
import type { SessionManager } from './session-manager'
import type { SettingsManager } from './settings-manager'

interface PendingCommand {
  id: string
  command: string
  serverId: string
  sessionId: string
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

          if (event.type === 'command_proposal') {
            this.pendingCommands.set(event.id, {
              id: event.id,
              command: event.command,
              serverId,
              sessionId,
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
    this.emitAIEvent(sessionId, {
      type: 'command_running',
      id: commandId,
      command: pending.command,
    })

    try {
      const result = await this.serverManager.pool.exec(pending.serverId, pending.command)

      if (result.stdout) {
        this.emitAIEvent(sessionId, {
          type: 'command_output',
          id: commandId,
          data: result.stdout,
          stream: 'stdout',
        })
      }

      if (result.stderr) {
        this.emitAIEvent(sessionId, {
          type: 'command_output',
          id: commandId,
          data: result.stderr,
          stream: 'stderr',
        })
      }

      this.emitAIEvent(sessionId, {
        type: 'command_done',
        id: commandId,
        exitCode: result.exitCode,
      })

      // Feed output back to AI if process is still active
      const run = this.activeRuns.get(sessionId)
      if (run) {
        run.process.write(
          `Command completed (exit ${result.exitCode}):\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
        )
      }
    } catch (err: any) {
      this.emitAIEvent(sessionId, {
        type: 'error',
        message: `Command failed: ${err.message}`,
      })
    }
  }

  async reject(sessionId: string, commandId: string): Promise<void> {
    this.pendingCommands.delete(commandId)

    // Feed rejection back to AI process (needed for ACP providers to unblock pending tool calls)
    const run = this.activeRuns.get(sessionId)
    if (run) {
      run.process.write('Command rejected by user')
    }

    this.emitAIEvent(sessionId, {
      type: 'command_done',
      id: commandId,
      exitCode: -1,
    })
  }

  kill(sessionId: string): void {
    const run = this.activeRuns.get(sessionId)
    if (run) {
      run.process.kill()
      this.activeRuns.delete(sessionId)
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
