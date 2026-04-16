import { randomUUID } from 'crypto'
import type { AISession, AISessionConfig, AIMessage } from '@paulus/shared'
import { DEFAULT_AI_PROVIDER, isAIProviderType } from '@paulus/shared'
import type { StorageService } from './storage'
import type { TerminalSessionManager } from './terminal-session-manager'

type SessionLookupIndex = Record<string, string>

export class SessionManager {
  // Per-server promise chain that serializes mutations of the server session
  // index. Without it, two simultaneous create()/delete() calls for the same
  // server can both read the index, both push, and the later write loses the
  // earlier mutation — leaving sessions on disk that list() can never find.
  private readonly serverIndexLocks = new Map<string, Promise<unknown>>()
  private readonly globalIndexLock = { promise: Promise.resolve() as Promise<unknown> }

  constructor(
    private readonly storage: StorageService,
    private readonly terminalSessions: TerminalSessionManager,
  ) {}

  async list(serverId: string): Promise<AISession[]> {
    const index = await this.storage.get<string[]>(this.serverIndexKey(serverId))
    if (!index) return []

    const loaded = await Promise.all(
      index.map(async (id) => {
        const session = await this.storage.get<AISession>(this.sessionKey(serverId, id))
        return session ? this.normalizeSession(session) : null
      }),
    )

    return loaded.filter((session): session is AISession => session !== null)
  }

  async get(sessionId: string): Promise<AISession> {
    const serverId = await this.getServerIdForSession(sessionId)
    if (!serverId) throw new Error(`Session not found: ${sessionId}`)

    const session = await this.storage.get<AISession>(this.sessionKey(serverId, sessionId))
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return this.normalizeSession(session)
  }

  async create(serverIds: string[], config: AISessionConfig): Promise<AISession> {
    // Use first server as the primary for storage keying
    const primaryServerId = serverIds[0]
    if (!primaryServerId) throw new Error('At least one server is required')

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

    // Index under each server so the session is visible from any of them.
    // Serialized per server to prevent concurrent create()/delete() calls
    // from clobbering each other's index updates.
    for (const serverId of serverIds) {
      await this.withServerIndexLock(serverId, async () => {
        const index = (await this.storage.get<string[]>(this.serverIndexKey(serverId))) ?? []
        if (!index.includes(session.id)) {
          index.push(session.id)
          await this.storage.set(this.serverIndexKey(serverId), index)
        }
      })
    }

    await this.withGlobalIndexLock(async () => {
      const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
      lookup[session.id] = primaryServerId
      await this.storage.set(this.globalIndexKey(), lookup)
    })

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

  async delete(sessionId: string): Promise<void> {
    const serverId = await this.getServerIdForSession(sessionId)
    if (!serverId) return

    await this.withServerIndexLock(serverId, async () => {
      const indexKey = this.serverIndexKey(serverId)
      const index = (await this.storage.get<string[]>(indexKey)) ?? []
      const nextIndex = index.filter((id) => id !== sessionId)

      if (nextIndex.length > 0) {
        await this.storage.set(indexKey, nextIndex)
      } else {
        await this.storage.remove(indexKey)
      }
    })

    await this.storage.remove(this.sessionKey(serverId, sessionId))
    await this.terminalSessions.delete(sessionId)

    await this.withGlobalIndexLock(async () => {
      const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
      delete lookup[sessionId]
      if (Object.keys(lookup).length > 0) {
        await this.storage.set(this.globalIndexKey(), lookup)
      } else {
        await this.storage.remove(this.globalIndexKey())
      }
    })
  }

  async deleteForServer(serverId: string): Promise<void> {
    const indexKey = this.serverIndexKey(serverId)

    const sessionIds = await this.withServerIndexLock(serverId, async () => {
      const index = (await this.storage.get<string[]>(indexKey)) ?? []
      if (index.length === 0) return [] as string[]
      await this.storage.remove(indexKey)
      return index
    })

    if (sessionIds.length === 0) return

    await Promise.all(
      sessionIds.map(async (sessionId) => {
        await this.storage.remove(this.sessionKey(serverId, sessionId))
        await this.terminalSessions.delete(sessionId)
      }),
    )

    await this.withGlobalIndexLock(async () => {
      const lookup = (await this.storage.get<SessionLookupIndex>(this.globalIndexKey())) ?? {}
      for (const sessionId of sessionIds) {
        delete lookup[sessionId]
      }
      if (Object.keys(lookup).length > 0) {
        await this.storage.set(this.globalIndexKey(), lookup)
      } else {
        await this.storage.remove(this.globalIndexKey())
      }
    })
  }

  async addMessage(sessionId: string, message: AIMessage): Promise<void> {
    const session = await this.get(sessionId)
    session.messages.push(message)
    session.updatedAt = new Date().toISOString()
    await this.save(session)
  }

  private async save(session: AISession): Promise<void> {
    const primaryServerId = session.serverIds[0] ?? (session as any).serverId
    await this.storage.set(this.sessionKey(primaryServerId, session.id), session)
  }

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
    delete normalizedSession.serverId
    await this.save(normalizedSession)
    return normalizedSession
  }

  private async getServerIdForSession(sessionId: string): Promise<string | null> {
    const lookup = await this.storage.get<SessionLookupIndex>(this.globalIndexKey())
    return lookup?.[sessionId] ?? null
  }

  private async withServerIndexLock<T>(serverId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.serverIndexLocks.get(serverId) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.serverIndexLocks.set(
      serverId,
      next.catch(() => undefined),
    )
    try {
      return await next
    } finally {
      // Drop the entry once it is the tail of the chain to avoid unbounded growth.
      if (this.serverIndexLocks.get(serverId) === next) {
        this.serverIndexLocks.delete(serverId)
      }
    }
  }

  private async withGlobalIndexLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.globalIndexLock.promise
    const next = previous.then(task, task)
    this.globalIndexLock.promise = next.catch(() => undefined)
    return next
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
