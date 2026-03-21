import { randomUUID } from 'crypto'
import type { ServerConfig } from '@paulus/shared'
import type { CredentialStore } from '../credentials'
import type { RuntimeEventSink } from '../events'
import type { StorageService } from '../storage'
import type { TerminalSessionManager } from '../terminal-session-manager'
import { ConnectionPool } from './connection-pool'

const SERVERS_KEY = 'servers'

export class ServerManager {
  private servers: ServerConfig[] = []
  readonly pool: ConnectionPool

  constructor(
    private readonly storage: StorageService,
    private readonly credentials: CredentialStore,
    private readonly terminalSessions: TerminalSessionManager,
    eventSink: RuntimeEventSink,
  ) {
    this.pool = new ConnectionPool(eventSink)
  }

  async init(): Promise<void> {
    this.servers = (await this.storage.get<ServerConfig[]>(SERVERS_KEY)) ?? []
  }

  async autoConnectAll(): Promise<void> {
    const autoConnectServers = this.servers.filter((server) => server.autoConnect)
    for (const server of autoConnectServers) {
      this.connect(server.id).catch(() => {
        // status updates are emitted by the connection pool
      })
    }
  }

  async list(): Promise<ServerConfig[]> {
    return this.servers
  }

  async add(
    config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>,
    password?: string,
  ): Promise<ServerConfig> {
    const now = new Date().toISOString()
    const server: ServerConfig = {
      ...config,
      id: randomUUID(),
      hasPassword: Boolean(password),
      createdAt: now,
      updatedAt: now,
    }

    this.servers.push(server)
    await this.persist()

    if (password) {
      await this.credentials.savePassword(server.id, password)
    }

    return server
  }

  async update(server: ServerConfig, password?: string): Promise<ServerConfig> {
    const index = this.servers.findIndex((existing) => existing.id === server.id)
    if (index === -1) throw new Error(`Server not found: ${server.id}`)

    server.updatedAt = new Date().toISOString()
    if (password) {
      server.hasPassword = true
      await this.credentials.savePassword(server.id, password)
    } else if (password === '') {
      server.hasPassword = false
      await this.credentials.removePassword(server.id)
    }

    this.servers[index] = server
    await this.persist()
    return server
  }

  async remove(id: string): Promise<void> {
    await this.pool.disconnect(id)
    await this.credentials.removePassword(id)
    this.servers = this.servers.filter((server) => server.id !== id)
    await this.persist()
  }

  getConfig(id: string): ServerConfig | undefined {
    return this.servers.find((server) => server.id === id)
  }

  async connect(id: string): Promise<void> {
    const config = this.getConfig(id)
    if (!config) throw new Error(`Server not found: ${id}`)
    const password = await this.credentials.getPassword(id)
    await this.pool.connect(config, password ?? undefined)
  }

  async connectWithPassword(id: string, password: string, save: boolean): Promise<void> {
    const config = this.getConfig(id)
    if (!config) throw new Error(`Server not found: ${id}`)

    await this.pool.connect(config, password)

    if (save) {
      config.hasPassword = true
      await this.credentials.savePassword(id, password)
      await this.persist()
    }
  }

  async disconnect(id: string): Promise<void> {
    await this.pool.disconnect(id)
  }

  async exec(serverId: string, sessionId: string, command: string): Promise<void> {
    await this.terminalSessions.recordCommand(sessionId, command)

    try {
      await this.pool.exec(serverId, sessionId, command)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.terminalSessions.appendSystem(sessionId, `Error: ${message}`)
      throw error
    }
  }

  private async persist(): Promise<void> {
    await this.storage.set(SERVERS_KEY, this.servers)
  }
}
