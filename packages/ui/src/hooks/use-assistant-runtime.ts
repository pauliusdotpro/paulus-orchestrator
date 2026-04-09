import { useCallback, useMemo, useRef } from 'react'
import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import type { AIMessage } from '@paulus/shared'
import { useChatStore } from '../stores'
import { useBridge } from './use-bridge'
import { buildMessageContent } from '../components/chat/message-content'

export const STREAMING_MESSAGE_ID = '__streaming__'

const EMPTY_MESSAGES: AIMessage[] = []

// Defined at module scope so its identity is stable across renders. The
// assistant-ui library flushes its entire converter cache whenever this prop's
// identity changes, so keeping it stable is critical for smooth streaming.
function convertMessage(msg: AIMessage): ThreadMessageLike {
  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: buildMessageContent(msg),
    createdAt: new Date(msg.timestamp),
  }
}

export function useAssistantRuntime(serverId: string) {
  const bridge = useBridge()
  const {
    activeSessionId,
    sessions,
    streamingText,
    streamingEvents,
    isStreaming,
    createSession,
    sendMessage,
  } = useChatStore()

  const session = activeSessionId ? sessions[activeSessionId] : null
  const messages = session?.messages ?? EMPTY_MESSAGES

  // Hold the streaming message's timestamp stable for the duration of a single
  // run so its object identity doesn't churn on every render. A new timestamp
  // is only minted when a new streaming run begins.
  const streamingTimestampRef = useRef<string>('')
  if (isStreaming && !streamingTimestampRef.current) {
    streamingTimestampRef.current = new Date().toISOString()
  } else if (!isStreaming && streamingTimestampRef.current) {
    streamingTimestampRef.current = ''
  }

  // Include the in-progress streaming message the moment a run starts — even
  // before any content has arrived — so the message identity (and ID) stays
  // stable from the first render. Otherwise the library would fill the gap
  // with an optimistic placeholder, and then swapping it out for our real
  // streaming message would flip the message ID and reset the smooth-text
  // animator, causing the visible flicker.
  const streamingMessage = useMemo<AIMessage | null>(() => {
    if (!isStreaming) return null
    return {
      id: STREAMING_MESSAGE_ID,
      role: 'assistant',
      content: streamingText,
      events: streamingEvents,
      timestamp: streamingTimestampRef.current,
    }
  }, [isStreaming, streamingText, streamingEvents])

  const allMessages = useMemo<AIMessage[]>(
    () => (streamingMessage ? [...messages, streamingMessage] : messages),
    [messages, streamingMessage],
  )

  const onNew = useCallback(
    async (message: { content: readonly { type: string; text?: string }[] }) => {
      const text = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('\n')

      if (!activeSessionId) {
        await createSession(bridge, serverId)
      }
      await sendMessage(bridge, serverId, text)
    },
    [activeSessionId, bridge, createSession, sendMessage, serverId],
  )

  return useExternalStoreRuntime({
    messages: allMessages,
    isRunning: isStreaming,
    convertMessage,
    onNew,
  })
}
