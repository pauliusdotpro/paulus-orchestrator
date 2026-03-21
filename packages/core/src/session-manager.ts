import { randomUUID } from 'crypto'
import type { AISession, AISessionConfig, AIMessage } from '@paulus/shared'
import { DEFAULT_AI_PROVIDER, isAIProviderType } from '@paulus/shared'
import type { StorageService } from './storage'
import type { TerminalSessionManager } from './terminal-session-manager'

type SessionLookupIndex = Record<string, string>

export class SessionManager {
  constructor(
    private readonly storage: StorageService,
    private readonly terminalSessions: TerminalSessionManager,
  ) {}

  async list(serverId: string): Promise<AISession[]> {
    const index = await this.storage.get<string[]>(this.serverIndexKey(serverId))
    if (!index) return []

    const sessions: AISession[] = []
    for (const id of index) {
      const session = await this.storage.get<AISession>(this.sessionKey(serverId, id))
      if (session) sessions.push(await this.normalizeSession(session))
    }

    return sessions
  }

  async get(sessionId: string): Promise<AISession> {
    const serverId = await this.getServerIdForSession(sessionId)
    if (!serverId) throw new Error(`Session not found: ${sessionId}`)

    const session = await this.storage.get<AISession>(this.sessionKey(serverId, sessionId))
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return this.normalizeSession(session)
  }

  async create(serverId: string, config: AISessionConfig): Promise<AISession> {
    const session: AISession = {
      id: randomUUID(),
      serverId,
      messages: [],
      provider: config.provider,
      model: config.model,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.save(session)

    const index = (await this.storage.get<string[]>(this.serverIndexKey(serverId))) ?? []
    index.push(session.id)
    await this.storage.set(this.serverIndexKey(serverId), index)

    const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
    lookup[session.id] = serverId
    await this.storage.set(this.globalIndexKey(), lookup)

    return session
  }

  async update(sessionId: string, config: AISessionConfig): Promise<AISession> {
    const session = await this.get(sessionId)
    session.provider = config.provider
    session.model = config.model
    session.updatedAt = new Date().toISOString()
    await this.save(session)
    return session
  }

  async delete(sessionId: string): Promise<void> {
    const serverId = await this.getServerIdForSession(sessionId)
    if (!serverId) return

    const indexKey = this.serverIndexKey(serverId)
    const index = (await this.storage.get<string[]>(indexKey)) ?? []
    const nextIndex = index.filter((id) => id !== sessionId)

    if (nextIndex.length > 0) {
      await this.storage.set(indexKey, nextIndex)
    } else {
      await this.storage.remove(indexKey)
    }

    await this.storage.remove(this.sessionKey(serverId, sessionId))
    await this.terminalSessions.delete(sessionId)

    const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
    delete lookup[sessionId]
    if (Object.keys(lookup).length > 0) {
      await this.storage.set(this.globalIndexKey(), lookup)
    } else {
      await this.storage.remove(this.globalIndexKey())
    }
  }

  async deleteForServer(serverId: string): Promise<void> {
    const indexKey = this.serverIndexKey(serverId)
    const index = await this.storage.get<string[]>(indexKey)
    if (!index?.length) return

    const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
    for (const sessionId of index) {
      await this.storage.remove(this.sessionKey(serverId, sessionId))
      await this.terminalSessions.delete(sessionId)
      delete lookup[sessionId]
    }

    await this.storage.remove(indexKey)
    if (Object.keys(lookup).length > 0) {
      await this.storage.set(this.globalIndexKey(), lookup)
    } else {
      await this.storage.remove(this.globalIndexKey())
    }
  }

  async addMessage(sessionId: string, message: AIMessage): Promise<void> {
    const session = await this.get(sessionId)
    session.messages.push(message)
    session.updatedAt = new Date().toISOString()
    await this.save(session)
  }

  private async save(session: AISession): Promise<void> {
    await this.storage.set(this.sessionKey(session.serverId, session.id), session)
  }

  private async normalizeSession(session: AISession): Promise<AISession> {
    const normalizedProvider = isAIProviderType(session.provider)
      ? session.provider
      : DEFAULT_AI_PROVIDER
    const normalizedModel = typeof session.model === 'string' ? session.model : null

    if (normalizedProvider === session.provider && normalizedModel === session.model) {
      return session
    }

    const normalizedSession: AISession = {
      ...session,
      provider: normalizedProvider,
      model: normalizedModel,
    }
    await this.save(normalizedSession)
    return normalizedSession
  }

  private async getServerIdForSession(sessionId: string): Promise<string | null> {
    const lookup = await this.storage.get<SessionLookupIndex>(this.globalIndexKey())
    return lookup?.[sessionId] ?? null
  }

  private sessionKey(serverId: string, sessionId: string): string {
    return `sessions/${serverId}/${sessionId}`
  }

  private serverIndexKey(serverId: string): string {
    return `sessions/${serverId}/index`
  }

  private globalIndexKey(): string {
    return 'sessions/index'
  }
}
