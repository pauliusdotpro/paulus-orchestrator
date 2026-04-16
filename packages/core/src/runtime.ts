import { AIOrchestrator } from './ai-orchestrator'
import type { CredentialStore, CredentialStoreFactory } from './credentials'
import { noopRuntimeEventSink, type RuntimeEventSink } from './events'
import { SessionManager } from './session-manager'
import { SettingsManager } from './settings-manager'
import { ServerManager } from './ssh/server-manager'
import { StorageService } from './storage'
import { TerminalSessionManager } from './terminal-session-manager'

export interface PaulusRuntime {
  storage: StorageService
  credentials: CredentialStore
  settings: SettingsManager
  sessions: SessionManager
  terminalSessions: TerminalSessionManager
  serverManager: ServerManager
  aiOrchestrator: AIOrchestrator
}

export interface CreatePaulusRuntimeOptions {
  basePath: string
  credentialStoreFactory: CredentialStoreFactory
  eventSink?: RuntimeEventSink
  autoConnect?: boolean
}

export async function createPaulusRuntime(
  options: CreatePaulusRuntimeOptions,
): Promise<PaulusRuntime> {
  const downstreamEventSink = options.eventSink ?? noopRuntimeEventSink
  const storage = new StorageService(options.basePath)
  await storage.init()

  const credentials = options.credentialStoreFactory(storage)
  const settings = new SettingsManager(storage)
  const terminalSessions = new TerminalSessionManager(storage)
  const eventSink: RuntimeEventSink = {
    emitAIEvent(event) {
      downstreamEventSink.emitAIEvent(event)
    },
    emitSSHOutput(event) {
      void terminalSessions.appendOutput(event.sessionId, event.data, event.stream)
      downstreamEventSink.emitSSHOutput(event)
    },
    emitConnectionStatus(status) {
      downstreamEventSink.emitConnectionStatus(status)
    },
  }
  const sessions = new SessionManager(storage, terminalSessions)
  const serverManager = new ServerManager(
    storage,
    credentials,
    terminalSessions,
    sessions,
    eventSink,
  )
  const aiOrchestrator = new AIOrchestrator(
    eventSink,
    serverManager,
    sessions,
    settings,
    terminalSessions,
  )

  await serverManager.init()
  if (options.autoConnect) {
    await serverManager.autoConnectAll()
  }

  return {
    storage,
    credentials,
    settings,
    sessions,
    terminalSessions,
    serverManager,
    aiOrchestrator,
  }
}
