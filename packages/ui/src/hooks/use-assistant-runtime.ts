import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import type { AIMessage } from '@paulus/shared'
import { useChatStore } from '../stores'
import { useBridge } from './use-bridge'
import { buildMessageContent } from '../components/chat/message-content'

function convertMessage(msg: AIMessage, isRunning = false): ThreadMessageLike {
  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: buildMessageContent(msg),
    createdAt: new Date(msg.timestamp),
    ...(msg.role === 'assistant' && isRunning ? { status: { type: 'running' as const } } : {}),
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
  const messages = session?.messages ?? []

  // Build the messages array including the in-progress streaming message
  const allMessages: AIMessage[] =
    isStreaming && (streamingText.length > 0 || streamingEvents.length > 0)
      ? [
          ...messages,
          {
            id: '__streaming__',
            role: 'assistant' as const,
            content: streamingText,
            events: streamingEvents,
            timestamp: new Date().toISOString(),
          },
        ]
      : messages

  return useExternalStoreRuntime({
    messages: allMessages,
    isRunning: isStreaming,
    convertMessage: (message) =>
      convertMessage(message, message.id === '__streaming__' && isStreaming),
    onNew: async (message) => {
      const text = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('\n')

      if (!activeSessionId) {
        await createSession(bridge, serverId)
      }
      await sendMessage(bridge, serverId, text)
    },
  })
}
