import { randomUUID } from 'crypto'
import { DEFAULT_SERVER_CATEGORY, type ServerConfig } from '@paulus/shared'
import type { CredentialStore } from '../credentials'
import type { RuntimeEventSink } from '../events'
import type { StorageService } from '../storage'
import type { TerminalSessionManager } from '../terminal-session-manager'
import { ConnectionPool } from './connection-pool'

const SERVERS_KEY = 'servers'
const CATEGORIES_KEY = 'server-categories'

export class ServerManager {
  private servers: ServerConfig[] = []
  private categories: string[] = []
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
    const storedServers = (await this.storage.get<ServerConfig[]>(SERVERS_KEY)) ?? []
    const normalizedServers = storedServers.map((server) => normalizeStoredServer(server))
    const serversChanged = normalizedServers.some(
      (server, index) => server !== storedServers[index],
    )

    this.servers = normalizedServers

    const storedCategories = await this.storage.get<string[]>(CATEGORIES_KEY)
    const reconciledCategories = this.reconcileCategories(storedCategories ?? null)
    const categoriesChanged =
      storedCategories == null || !arraysEqual(reconciledCategories, storedCategories)

    this.categories = reconciledCategories

    if (serversChanged) {
      await this.persistServers()
    }
    if (categoriesChanged) {
      await this.persistCategories()
    }
  }

  async autoConnectAll(): Promise<void> {
    const autoConnectServers = this.servers.filter(
      (server) => server.autoConnect && server.authMethod === 'key',
    )
    for (const server of autoConnectServers) {
      this.connect(server.id).catch(() => {
        // status updates are emitted by the connection pool
      })
    }
  }

  async list(): Promise<ServerConfig[]> {
    return this.servers
  }

  async listCategories(): Promise<string[]> {
    return this.categories
  }

  async createCategory(name: string): Promise<string[]> {
    const normalized = normalizeCategory(name)
    if (!this.categories.includes(normalized)) {
      this.categories.push(normalized)
      await this.persistCategories()
    }
    return this.categories
  }

  async renameCategory(
    oldName: string,
    newName: string,
  ): Promise<{ categories: string[]; servers: ServerConfig[] }> {
    const from = normalizeCategory(oldName)
    const to = normalizeCategory(newName)

    if (from === DEFAULT_SERVER_CATEGORY) {
      throw new Error(`Cannot rename the default category "${DEFAULT_SERVER_CATEGORY}"`)
    }

    const fromIndex = this.categories.indexOf(from)
    if (fromIndex === -1) {
      throw new Error(`Category not found: ${oldName}`)
    }

    if (from === to) {
      return { categories: this.categories, servers: this.servers }
    }

    const toExisted = this.categories.includes(to)
    if (toExisted) {
      // Merge into existing category: drop the old entry.
      this.categories.splice(fromIndex, 1)
    } else {
      this.categories[fromIndex] = to
    }

    const now = new Date().toISOString()
    this.servers = this.servers.map((server) =>
      server.category === from ? { ...server, category: to, updatedAt: now } : server,
    )

    await this.persistCategories()
    await this.persistServers()
    return { categories: this.categories, servers: this.servers }
  }

  async removeCategory(name: string): Promise<{ categories: string[]; servers: ServerConfig[] }> {
    const normalized = normalizeCategory(name)
    if (normalized === DEFAULT_SERVER_CATEGORY) {
      throw new Error(`Cannot remove the default category "${DEFAULT_SERVER_CATEGORY}"`)
    }

    const index = this.categories.indexOf(normalized)
    if (index === -1) {
      throw new Error(`Category not found: ${name}`)
    }

    this.categories.splice(index, 1)
    if (!this.categories.includes(DEFAULT_SERVER_CATEGORY)) {
      this.categories.push(DEFAULT_SERVER_CATEGORY)
    }

    const now = new Date().toISOString()
    this.servers = this.servers.map((server) =>
      server.category === normalized
        ? { ...server, category: DEFAULT_SERVER_CATEGORY, updatedAt: now }
        : server,
    )

    await this.persistCategories()
    await this.persistServers()
    return { categories: this.categories, servers: this.servers }
  }

  async add(
    config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>,
    password?: string,
  ): Promise<ServerConfig> {
    const now = new Date().toISOString()
    const server: ServerConfig = {
      ...config,
      category: normalizeCategory(config.category),
      id: randomUUID(),
      hasPassword: Boolean(password),
      createdAt: now,
      updatedAt: now,
    }

    this.servers.push(server)
    await this.persistServers()
    if (this.registerCategory(server.category)) {
      await this.persistCategories()
    }

    if (password) {
      await this.credentials.savePassword(server.id, password)
    }

    return server
  }

  async update(server: ServerConfig, password?: string): Promise<ServerConfig> {
    const index = this.servers.findIndex((existing) => existing.id === server.id)
    if (index === -1) throw new Error(`Server not found: ${server.id}`)

    server.category = normalizeCategory(server.category)
    server.updatedAt = new Date().toISOString()
    if (password) {
      server.hasPassword = true
      await this.credentials.savePassword(server.id, password)
    } else if (password === '') {
      server.hasPassword = false
      await this.credentials.removePassword(server.id)
    }

    this.servers[index] = server
    await this.persistServers()
    if (this.registerCategory(server.category)) {
      await this.persistCategories()
    }
    return server
  }

  async move(
    serverId: string,
    targetCategory: string,
    beforeServerId?: string,
  ): Promise<ServerConfig[]> {
    const sourceIndex = this.servers.findIndex((server) => server.id === serverId)
    if (sourceIndex === -1) {
      throw new Error(`Server not found: ${serverId}`)
    }

    const normalizedCategory = normalizeCategory(targetCategory)
    const [server] = this.servers.splice(sourceIndex, 1)

    if (beforeServerId) {
      const beforeServer = this.servers.find((candidate) => candidate.id === beforeServerId)
      if (!beforeServer) {
        throw new Error(`Target server not found: ${beforeServerId}`)
      }
      if (normalizeCategory(beforeServer.category) !== normalizedCategory) {
        throw new Error('Target server category does not match move category')
      }
    }

    server.category = normalizedCategory
    server.updatedAt = new Date().toISOString()

    const insertIndex =
      beforeServerId == null
        ? this.findCategoryInsertIndex(normalizedCategory)
        : this.servers.findIndex((candidate) => candidate.id === beforeServerId)

    if (insertIndex === -1) {
      this.servers.push(server)
    } else {
      this.servers.splice(insertIndex, 0, server)
    }

    await this.persistServers()
    if (this.registerCategory(normalizedCategory)) {
      await this.persistCategories()
    }
    return this.servers
  }

  async remove(id: string): Promise<void> {
    await this.pool.disconnect(id)
    await this.credentials.removePassword(id)
    this.servers = this.servers.filter((server) => server.id !== id)
    await this.persistServers()
  }

  getConfig(id: string): ServerConfig | undefined {
    return this.servers.find((server) => server.id === id)
  }

  async connect(id: string): Promise<void> {
    const config = this.getConfig(id)
    if (!config) throw new Error(`Server not found: ${id}`)
    const password =
      config.authMethod === 'password' ? await this.credentials.getPassword(id) : undefined
    await this.pool.connect(config, password ?? undefined)
  }

  async connectWithPassword(id: string, password: string, save: boolean): Promise<void> {
    const config = this.getConfig(id)
    if (!config) throw new Error(`Server not found: ${id}`)

    await this.pool.connect(config, password)

    if (save) {
      config.hasPassword = true
      await this.credentials.savePassword(id, password)
      await this.persistServers()
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

  private async persistServers(): Promise<void> {
    await this.storage.set(SERVERS_KEY, this.servers)
  }

  private async persistCategories(): Promise<void> {
    await this.storage.set(CATEGORIES_KEY, this.categories)
  }

  private registerCategory(name: string): boolean {
    const normalized = normalizeCategory(name)
    if (this.categories.includes(normalized)) {
      return false
    }
    this.categories.push(normalized)
    return true
  }

  private reconcileCategories(stored: string[] | null): string[] {
    const seen = new Set<string>()
    const ordered: string[] = []

    const add = (raw: string | undefined): void => {
      const normalized = normalizeCategory(raw)
      if (seen.has(normalized)) return
      seen.add(normalized)
      ordered.push(normalized)
    }

    if (stored) {
      for (const entry of stored) {
        add(entry)
      }
    }

    for (const server of this.servers) {
      add(server.category)
    }

    add(DEFAULT_SERVER_CATEGORY)

    return ordered
  }

  private findCategoryInsertIndex(category: string): number {
    let insertIndex = -1

    for (let index = 0; index < this.servers.length; index += 1) {
      if (this.servers[index].category === category) {
        insertIndex = index + 1
      }
    }

    return insertIndex
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function normalizeStoredServer(server: ServerConfig): ServerConfig {
  const normalizedCategory = normalizeCategory(server.category)
  if (normalizedCategory === server.category) {
    return server
  }

  return {
    ...server,
    category: normalizedCategory,
  }
}

function normalizeCategory(category: string | undefined): string {
  const normalized = category?.trim()
  return normalized && normalized.length > 0 ? normalized : DEFAULT_SERVER_CATEGORY
}
