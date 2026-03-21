import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import type { ServerConfig } from '@paulus/shared'
import type { StorageService } from '../storage'
import type { CredentialManager } from '../credential-manager'
import { ConnectionPool } from './connection-pool'

const SERVERS_KEY = 'servers'

export class ServerManager {
  private storage: StorageService
  private credentials: CredentialManager
  private servers: ServerConfig[] = []
  readonly pool: ConnectionPool

  constructor(win: BrowserWindow, storage: StorageService, credentials: CredentialManager) {
    this.storage = storage
    this.credentials = credentials
    this.pool = new ConnectionPool(win)
  }

  async init(): Promise<void> {
    this.servers = (await this.storage.get<ServerConfig[]>(SERVERS_KEY)) ?? []
  }

  async autoConnectAll(): Promise<void> {
    const autoConnectServers = this.servers.filter((s) => s.autoConnect)
    for (const server of autoConnectServers) {
      this.connect(server.id).catch(() => {
        // auto-connect failures are non-fatal, status is emitted via IPC
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
      hasPassword: !!password,
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
    const idx = this.servers.findIndex((s) => s.id === server.id)
    if (idx === -1) throw new Error(`Server not found: ${server.id}`)
    server.updatedAt = new Date().toISOString()
    if (password) {
      server.hasPassword = true
      await this.credentials.savePassword(server.id, password)
    } else if (password === '') {
      server.hasPassword = false
      await this.credentials.removePassword(server.id)
    }
    this.servers[idx] = server
    await this.persist()
    return server
  }

  async remove(id: string): Promise<void> {
    await this.pool.disconnect(id)
    await this.credentials.removePassword(id)
    this.servers = this.servers.filter((s) => s.id !== id)
    await this.persist()
  }

  getConfig(id: string): ServerConfig | undefined {
    return this.servers.find((s) => s.id === id)
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

  private async persist(): Promise<void> {
    await this.storage.set(SERVERS_KEY, this.servers)
  }
}
