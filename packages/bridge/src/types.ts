import type {
  ServerConfig,
  ServerConnection,
  AIEvent,
  AISession,
  AISessionConfig,
  AIModelOption,
  AIProviderType,
  AIProviderConfig,
  AIProviderTestResult,
  AppSettings,
  AppDataOverview,
  PasswordStorageMode,
  RoyalTsxImportResult,
  TerminalSessionState,
  UpdaterEvent,
  UpdaterState,
} from '@paulus/shared'

export interface Bridge {
  servers: {
    list(): Promise<ServerConfig[]>
    add(
      server: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>,
      password?: string,
    ): Promise<ServerConfig>
    update(server: ServerConfig, password?: string): Promise<ServerConfig>
    move(serverId: string, targetCategory: string, beforeServerId?: string): Promise<ServerConfig[]>
    listCategories(): Promise<string[]>
    createCategory(name: string): Promise<string[]>
    renameCategory(
      oldName: string,
      newName: string,
    ): Promise<{ categories: string[]; servers: ServerConfig[] }>
    removeCategory(name: string): Promise<{ categories: string[]; servers: ServerConfig[] }>
    remove(id: string): Promise<void>
    connect(id: string): Promise<void>
    connectWithPassword(id: string, password: string, save: boolean): Promise<void>
    disconnect(id: string): Promise<void>
    exec(serverId: string, sessionId: string, command: string): Promise<void>
    onConnectionStatus(cb: (status: ServerConnection) => void): () => void
    onOutput(
      cb: (data: {
        serverId: string
        sessionId: string
        data: string
        stream: 'stdout' | 'stderr'
      }) => void,
    ): () => void
  }

  ai: {
    send(serverIds: string[], sessionId: string, message: string): Promise<void>
    approve(sessionId: string, commandId: string): Promise<void>
    reject(sessionId: string, commandId: string): Promise<void>
    kill(sessionId: string): Promise<void>
    getProviders(): Promise<AIProviderConfig[]>
    getModels(provider: AIProviderType): Promise<AIModelOption[]>
    onEvent(cb: (event: AIEvent & { sessionId: string }) => void): () => void
  }

  sessions: {
    list(serverId: string): Promise<AISession[]>
    get(sessionId: string): Promise<AISession>
    create(serverIds: string[], config: AISessionConfig): Promise<AISession>
    update(sessionId: string, config: AISessionConfig): Promise<AISession>
    delete(sessionId: string): Promise<void>
  }

  terminals: {
    get(sessionId: string): Promise<TerminalSessionState>
    clear(sessionId: string): Promise<TerminalSessionState>
  }

  settings: {
    get(): Promise<AppSettings>
    update(settings: Partial<AppSettings>): Promise<AppSettings>
    testProvider(provider: AIProviderType): Promise<AIProviderTestResult>
  }

  appData: {
    getOverview(): Promise<AppDataOverview>
    openDirectory(): Promise<void>
    exportServers(): Promise<string | null>
    importRoyalTsx(documentPassword: string): Promise<RoyalTsxImportResult | null>
    setPasswordStorageMode(mode: PasswordStorageMode): Promise<AppDataOverview>
  }

  storage: {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, value: T): Promise<void>
  }

  updater: {
    getState(): Promise<UpdaterState>
    check(): Promise<UpdaterState>
    download(): Promise<UpdaterState>
    install(): Promise<void>
    onEvent(cb: (event: UpdaterEvent) => void): () => void
  }
}
