import { randomUUID } from 'crypto'
import type { AISession, AISessionConfig, AIMessage } from '@paulus/shared'
import { DEFAULT_AI_PROVIDER, isAIProviderType } from '@paulus/shared'
import type { StorageService } from './storage'

export class SessionManager {
  private storage: StorageService

  constructor(storage: StorageService) {
    this.storage = storage
  }

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

  async create(serverId: string, config: AISessionConfig): Promise<AISession> {
    const session: AISession = {
      id: randomUUID(),
      serverId,
      messages: [],
      provider: config.provider,
      model: config.model,
      yoloMode: config.yoloMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.save(session)

    const index = (await this.storage.get<string[]>(`sessions-index-${serverId}`)) ?? []
    index.push(session.id)
    await this.storage.set(`sessions-index-${serverId}`, index)

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

  private async save(session: AISession): Promise<void> {
    await this.storage.set(`session-${session.id}`, session)
  }

  private async normalizeSession(session: AISession): Promise<AISession> {
    const normalizedProvider = isAIProviderType(session.provider)
      ? session.provider
      : DEFAULT_AI_PROVIDER
    const normalizedModel = typeof session.model === 'string' ? session.model : null
    const normalizedYoloMode = session.yoloMode === true

    if (
      normalizedProvider === session.provider &&
      normalizedModel === session.model &&
      normalizedYoloMode === session.yoloMode
    ) {
      return session
    }

    const normalizedSession: AISession = {
      ...session,
      provider: normalizedProvider,
      model: normalizedModel,
      yoloMode: normalizedYoloMode,
    }
    await this.save(normalizedSession)
    return normalizedSession
  }
}
