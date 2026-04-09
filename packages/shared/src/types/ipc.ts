import type { ServerConfig, ServerConnection } from './server'
import type {
  AIEvent,
  AISession,
  AISessionConfig,
  AIModelOption,
  AIProviderType,
  AIProviderConfig,
  AIProviderTestResult,
  TerminalSessionState,
} from './ai'
import type { AppSettings } from './settings'
import type { AppDataOverview, PasswordStorageMode, RoyalTsxImportResult } from './app-data'

export interface IPCChannelMap {
  'servers:list': [void, ServerConfig[]]
  'servers:add': [
    { config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>; password?: string },
    ServerConfig,
  ]
  'servers:update': [{ config: ServerConfig; password?: string }, ServerConfig]
  'servers:remove': [string, void]
  'servers:connect': [string, void]
  'servers:connect-with-password': [{ id: string; password: string; save: boolean }, void]
  'servers:disconnect': [string, void]
  'servers:exec': [{ serverId: string; sessionId: string; command: string }, void]

  'ai:send': [{ serverId: string; sessionId: string; message: string }, void]
  'ai:approve': [{ sessionId: string; commandId: string }, void]
  'ai:reject': [{ sessionId: string; commandId: string }, void]
  'ai:providers': [void, AIProviderConfig[]]
  'ai:models': [AIProviderType, AIModelOption[]]

  'sessions:list': [string, AISession[]]
  'sessions:get': [string, AISession]
  'sessions:create': [{ serverId: string; config: AISessionConfig }, AISession]
  'sessions:update': [{ sessionId: string; config: AISessionConfig }, AISession]
  'sessions:delete': [string, void]
  'terminals:get': [string, TerminalSessionState]
  'terminals:clear': [string, TerminalSessionState]

  'settings:get': [void, AppSettings]
  'settings:update': [Partial<AppSettings>, AppSettings]
  'settings:test-provider': [AIProviderType, AIProviderTestResult]

  'app-data:overview': [void, AppDataOverview]
  'app-data:open-directory': [void, void]
  'app-data:export-servers': [void, string | null]
  'app-data:import-royal-tsx': [{ documentPassword: string }, RoyalTsxImportResult | null]
  'app-data:set-password-storage-mode': [PasswordStorageMode, AppDataOverview]

  'storage:get': [string, unknown]
  'storage:set': [{ key: string; value: unknown }, void]
}

export interface IPCEventChannelMap {
  'ai:event': AIEvent & { sessionId: string }
  'server:connection-status': ServerConnection
  'ssh:output': { serverId: string; sessionId: string; data: string; stream: 'stdout' | 'stderr' }
}
