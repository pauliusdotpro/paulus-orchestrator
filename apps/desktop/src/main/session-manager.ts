import { randomUUID } from 'crypto'
import type { AISession, AISessionConfig, AIMessage } from '@paulus/shared'
import { DEFAULT_AI_PROVIDER, isAIProviderType } from '@paulus/shared'
import type { StorageService } from './storage'

export class SessionManager {
  private storage: StorageService

  constructor(storage: StorageService) {
    this.storage = storage
  }

  /** List sessions that include this serverId */
  async list(serverId: string): Promise<AISession[]> {
    const index = await this.storage.get<string[]>(`sessions-index-${serverId}`)
    if (!index) return []
    const sessions: AISession[] = []
    for (const id of index) {
      const session = await this.storage.get<AISession>(`session-${id}`)
      if (session) sessions.push(await this.normalizeSession(session))
    }
    return sessions
  }

  async get(sessionId: string): Promise<AISession> {
    const session = await this.storage.get<AISession>(`session-${sessionId}`)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return this.normalizeSession(session)
  }

  async create(serverIds: string[], config: AISessionConfig): Promise<AISession> {
    const session: AISession = {
      id: randomUUID(),
      serverIds,
      messages: [],
      provider: config.provider,
      model: config.model,
      yoloMode: config.yoloMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.save(session)

    // Index under each server so the session appears when listing any of its servers
    for (const serverId of serverIds) {
      const index = (await this.storage.get<string[]>(`sessions-index-${serverId}`)) ?? []
      if (!index.includes(session.id)) {
        index.push(session.id)
        await this.storage.set(`sessions-index-${serverId}`, index)
      }
    }

    return session
  }

  async update(sessionId: string, config: AISessionConfig): Promise<AISession> {
    const session = await this.get(sessionId)
    session.provider = config.provider
    session.model = config.model
    session.yoloMode = config.yoloMode
    session.updatedAt = new Date().toISOString()
    await this.save(session)
    return session
  }

  async addMessage(sessionId: string, message: AIMessage): Promise<void> {
    const session = await this.get(sessionId)
    session.messages.push(message)
    session.updatedAt = new Date().toISOString()
    await this.save(session)
  }

  async deleteForServer(serverId: string): Promise<void> {
    const index = await this.storage.get<string[]>(`sessions-index-${serverId}`)
    if (!index) return
    for (const id of index) {
      await this.storage.remove(`session-${id}`)
    }
    await this.storage.remove(`sessions-index-${serverId}`)
  }

  async delete(sessionId: string): Promise<void> {
    const session = await this.storage.get<AISession>(`session-${sessionId}`)
    if (!session) return
    const normalized = await this.normalizeSession(session)
    // Remove from all server indexes
    for (const sid of normalized.serverIds) {
      const index = await this.storage.get<string[]>(`sessions-index-${sid}`)
      if (index) {
        const filtered = index.filter((id) => id !== sessionId)
        await this.storage.set(`sessions-index-${sid}`, filtered)
      }
    }
    await this.storage.remove(`session-${sessionId}`)
  }

  private async save(session: AISession): Promise<void> {
    await this.storage.set(`session-${session.id}`, session)
  }

  /**
   * Normalize a session — handles backward compatibility from old
   * single-server sessions (serverId) to new multi-server (serverIds).
   */
  private async normalizeSession(session: AISession): Promise<AISession> {
    const normalizedProvider = isAIProviderType(session.provider)
      ? session.provider
      : DEFAULT_AI_PROVIDER
    const normalizedModel = typeof session.model === 'string' ? session.model : null
    const normalizedYoloMode = session.yoloMode === true

    // Migrate old serverId → serverIds
    let serverIds = session.serverIds
    if (!serverIds || serverIds.length === 0) {
      const legacyServerId = (session as any).serverId as string | undefined
      serverIds = legacyServerId ? [legacyServerId] : []
    }

    const needsUpdate =
      normalizedProvider !== session.provider ||
      normalizedModel !== session.model ||
      normalizedYoloMode !== session.yoloMode ||
      serverIds !== session.serverIds

    if (!needsUpdate) {
      return session
    }

    const normalizedSession: AISession = {
      ...session,
      serverIds,
      provider: normalizedProvider,
      model: normalizedModel,
      yoloMode: normalizedYoloMode,
    }
    // Clean up legacy field
    delete normalizedSession.serverId
    await this.save(normalizedSession)
    return normalizedSession
  }
}
