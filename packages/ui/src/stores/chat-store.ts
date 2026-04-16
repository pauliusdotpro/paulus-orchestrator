import { create } from 'zustand'
import type {
  AISession,
  AISessionConfig,
  AIEvent,
  AIMessage,
  AIModelOption,
  AIProviderType,
} from '@paulus/shared'
import type { Bridge } from '@paulus/bridge'

type ProviderStateMap<T> = Partial<Record<AIProviderType, T>>

interface ChatStore {
  sessions: Record<string, AISession>
  activeSessionId: string | null
  streamingEvents: AIEvent[]
  streamingText: string
  isStreaming: boolean
  initialized: boolean
  draftConfigs: Record<string, AISessionConfig>
  modelOptions: ProviderStateMap<AIModelOption[]>
  modelLoadState: ProviderStateMap<'idle' | 'loading' | 'loaded' | 'error'>
  modelLoadErrors: ProviderStateMap<string>
  messageQueue: string[]

  init(bridge: Bridge): void
  loadSessions(bridge: Bridge, serverId: string): Promise<void>
  createSession(bridge: Bridge, serverIds: string[], config?: AISessionConfig): Promise<AISession>
  updateSessionConfig(bridge: Bridge, sessionId: string, config: AISessionConfig): Promise<void>
  deleteSession(bridge: Bridge, sessionId: string): Promise<void>
  removeSessionsForServer(serverId: string): void
  setActiveSession(id: string | null): void
  ensureDraftConfig(bridge: Bridge, serverId: string): Promise<void>
  setDraftConfig(serverId: string, config: AISessionConfig): void
  loadModels(bridge: Bridge, provider: AIProviderType): Promise<void>
  sendMessage(bridge: Bridge, serverIds: string[], message: string): Promise<void>
  interruptWithMessage(bridge: Bridge, serverIds: string[], message: string): Promise<void>
  killSession(bridge: Bridge): Promise<void>
  approveCommand(bridge: Bridge, commandId: string): Promise<void>
  rejectCommand(bridge: Bridge, commandId: string): Promise<void>
  queueMessage(message: string): void
  dequeueMessage(): void
  handleAIEvent(event: AIEvent & { sessionId: string }): void
}

// ─── Streaming event buffer ─────────────────────────────────────────────────
// Coalesces rapid streaming events into frame-paced state updates so React
// re-renders at most once per animation frame instead of once per token.
let _streamBuf: { textDelta: string; events: AIEvent[] } = { textDelta: '', events: [] }
let _streamRafId = 0

function _flushStreamBuffer(): void {
  _streamRafId = 0
  const { textDelta, events } = _streamBuf
  _streamBuf = { textDelta: '', events: [] }
  if (!textDelta && events.length === 0) return
  useChatStore.setState((state) => ({
    streamingText: state.streamingText + textDelta,
    streamingEvents: [...state.streamingEvents, ...events],
  }))
}

function _bufferStreamEvent(event: AIEvent): void {
  if (event.type === 'text') {
    _streamBuf.textDelta += event.text
  }
  _streamBuf.events.push(event)
  if (!_streamRafId) {
    _streamRafId = requestAnimationFrame(_flushStreamBuffer)
  }
}

/** Flush pending events synchronously (used before finalizing a stream). */
function _forceFlush(): void {
  if (_streamRafId) {
    cancelAnimationFrame(_streamRafId)
    _flushStreamBuffer()
  }
}

/** Discard pending events without applying them (used when streaming is aborted). */
function _cancelPendingFlush(): void {
  if (_streamRafId) {
    cancelAnimationFrame(_streamRafId)
    _streamRafId = 0
  }
  _streamBuf = { textDelta: '', events: [] }
}

async function getDefaultSessionConfig(bridge: Bridge): Promise<AISessionConfig> {
  const settings = await bridge.settings.get()
  return {
    provider: settings.activeProvider,
    model: null,
    yoloMode: false,
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  streamingEvents: [],
  streamingText: '',
  isStreaming: false,
  initialized: false,
  draftConfigs: {},
  modelOptions: {},
  modelLoadState: {},
  modelLoadErrors: {},
  messageQueue: [],

  init(bridge) {
    if (get().initialized) return
    bridge.ai.onEvent((event) => {
      get().handleAIEvent(event)
    })
    set({ initialized: true })
  },

  async loadSessions(bridge, serverId) {
    const sessions = await bridge.sessions.list(serverId)
    const draftConfigs = { ...get().draftConfigs }
    if (!draftConfigs[serverId]) {
      draftConfigs[serverId] = await getDefaultSessionConfig(bridge)
    }

    const map: Record<string, AISession> = { ...get().sessions }
    // Merge: replace sessions for this server, keep others
    for (const key of Object.keys(map)) {
      if (map[key].serverIds.includes(serverId)) delete map[key]
    }
    for (const s of sessions) {
      map[s.id] = s
    }
    // Auto-select the most recent session for this server, or null
    const current = get().activeSessionId
    const currentBelongsToServer = current && map[current]?.serverIds.includes(serverId)
    const latest = sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0]
    set({
      sessions: map,
      draftConfigs,
      activeSessionId: currentBelongsToServer ? current : (latest?.id ?? null),
      streamingText: currentBelongsToServer ? get().streamingText : '',
      streamingEvents: currentBelongsToServer ? get().streamingEvents : [],
    })
  },

  async createSession(bridge, serverIds, config) {
    const primaryServerId = serverIds[0]
    const effectiveConfig =
      config ?? get().draftConfigs[primaryServerId] ?? (await getDefaultSessionConfig(bridge))
    const session = await bridge.sessions.create(serverIds, effectiveConfig)
    set((state) => ({
      sessions: { ...state.sessions, [session.id]: session },
      draftConfigs: { ...state.draftConfigs, [primaryServerId]: effectiveConfig },
      activeSessionId: session.id,
    }))
    return session
  },

  async updateSessionConfig(bridge, sessionId, config) {
    const updated = await bridge.sessions.update(sessionId, config)
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: updated },
      draftConfigs: { ...state.draftConfigs, [updated.serverIds[0]]: config },
    }))
  },

  async deleteSession(bridge, sessionId) {
    const session = get().sessions[sessionId]
    if (!session) return
    if (get().activeSessionId === sessionId) _cancelPendingFlush()

    await bridge.sessions.delete(sessionId)

    set((state) => {
      const sessions = { ...state.sessions }
      delete sessions[sessionId]

      if (state.activeSessionId !== sessionId) {
        return { sessions }
      }

      const primaryServerId = session.serverIds[0]
      const nextActiveSession = Object.values(sessions)
        .filter((candidate) => primaryServerId && candidate.serverIds.includes(primaryServerId))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]

      return {
        sessions,
        activeSessionId: nextActiveSession?.id ?? null,
        streamingEvents: [],
        streamingText: '',
        isStreaming: false,
      }
    })
  },

  removeSessionsForServer(serverId) {
    set((state) => {
      const sessions = Object.fromEntries(
        Object.entries(state.sessions).filter(
          ([, session]) => !session.serverIds.includes(serverId),
        ),
      )
      const draftConfigs = { ...state.draftConfigs }
      delete draftConfigs[serverId]
      const activeSession =
        state.activeSessionId !== null ? state.sessions[state.activeSessionId] : null
      const removedActiveSession = activeSession?.serverIds.includes(serverId) ?? false

      return {
        sessions,
        draftConfigs,
        activeSessionId: removedActiveSession ? null : state.activeSessionId,
        streamingEvents: removedActiveSession ? [] : state.streamingEvents,
        streamingText: removedActiveSession ? '' : state.streamingText,
        isStreaming: removedActiveSession ? false : state.isStreaming,
      }
    })
  },

  setActiveSession(id) {
    _cancelPendingFlush()
    set({ activeSessionId: id, streamingText: '', streamingEvents: [] })
  },

  async ensureDraftConfig(bridge, serverId) {
    if (get().draftConfigs[serverId]) return

    const config = await getDefaultSessionConfig(bridge)
    set((state) => ({
      draftConfigs: {
        ...state.draftConfigs,
        [serverId]: config,
      },
    }))
  },

  setDraftConfig(serverId, config) {
    set((state) => ({
      draftConfigs: {
        ...state.draftConfigs,
        [serverId]: config,
      },
    }))
  },

  async loadModels(bridge, provider) {
    const currentState = get().modelLoadState[provider]
    if (currentState === 'loading' || currentState === 'loaded') return

    set((state) => ({
      modelLoadState: { ...state.modelLoadState, [provider]: 'loading' },
      modelLoadErrors: { ...state.modelLoadErrors, [provider]: '' },
    }))

    try {
      const models = await bridge.ai.getModels(provider)
      set((state) => ({
        modelOptions: { ...state.modelOptions, [provider]: models },
        modelLoadState: { ...state.modelLoadState, [provider]: 'loaded' },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load models.'
      set((state) => ({
        modelLoadState: { ...state.modelLoadState, [provider]: 'error' },
        modelLoadErrors: { ...state.modelLoadErrors, [provider]: message },
      }))
    }
  },

  async sendMessage(bridge, serverIds, message) {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return
    const session = sessions[activeSessionId]
    if (!session) return

    // Add user message to local state
    const userMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    set((state) => {
      const session = state.sessions[activeSessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...session,
            messages: [...session.messages, userMsg],
          },
        },
        isStreaming: true,
        streamingText: '',
        streamingEvents: [],
      }
    })

    await bridge.ai.send(serverIds, activeSessionId, message)
  },

  async interruptWithMessage(bridge, serverIds, message) {
    const { activeSessionId } = get()
    if (!activeSessionId) return

    _forceFlush()

    // Finalize partial response so it's preserved in history
    set((state) => {
      const session = state.sessions[activeSessionId]
      if (!session || !state.isStreaming) {
        return { isStreaming: false, streamingText: '', streamingEvents: [], messageQueue: [] }
      }
      const hasContent = state.streamingText || state.streamingEvents.length > 0
      if (!hasContent) {
        return { isStreaming: false, streamingText: '', streamingEvents: [], messageQueue: [] }
      }
      const assistantMsg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: state.streamingText,
        events: state.streamingEvents,
        timestamp: new Date().toISOString(),
      }
      return {
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            ...session,
            messages: [...session.messages, assistantMsg],
          },
        },
        isStreaming: false,
        streamingText: '',
        streamingEvents: [],
        messageQueue: [],
      }
    })

    await bridge.ai.kill(activeSessionId)
    await get().sendMessage(bridge, serverIds, message)
  },

  async killSession(bridge) {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    _cancelPendingFlush()
    set({ isStreaming: false, streamingText: '', streamingEvents: [], messageQueue: [] })
    await bridge.ai.kill(activeSessionId)
  },

  async approveCommand(bridge, commandId) {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    await bridge.ai.approve(activeSessionId, commandId)
  },

  async rejectCommand(bridge, commandId) {
    const { activeSessionId } = get()
    if (!activeSessionId) return
    await bridge.ai.reject(activeSessionId, commandId)
  },

  queueMessage(message) {
    set((state) => ({ messageQueue: [...state.messageQueue, message] }))
  },

  dequeueMessage() {
    set((state) => ({ messageQueue: state.messageQueue.slice(1) }))
  },

  handleAIEvent(event) {
    const { activeSessionId } = get()
    if (event.sessionId !== activeSessionId) return

    switch (event.type) {
      case 'text':
      case 'thinking':
      case 'tool_state':
      case 'tool_call':
      case 'tool_result':
      case 'command_proposal':
      case 'command_running':
      case 'command_output':
      case 'command_done':
      case 'error':
        _bufferStreamEvent(event)
        break
      case 'done':
        // Flush any buffered events before finalizing
        _forceFlush()
        // Finalize streaming text as an assistant message
        set((state) => {
          // If streaming was already cleared (e.g. by kill), skip finalization
          if (!state.isStreaming) return state
          const session = state.sessions[activeSessionId!]
          if (!session) return { isStreaming: false, streamingText: '', streamingEvents: [] }
          const assistantMsg: AIMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: state.streamingText,
            events: state.streamingEvents,
            timestamp: new Date().toISOString(),
          }
          return {
            sessions: {
              ...state.sessions,
              [activeSessionId!]: {
                ...session,
                messages: [...session.messages, assistantMsg],
              },
            },
            isStreaming: false,
            streamingText: '',
            streamingEvents: [],
          }
        })
        break
    }
  },
}))
