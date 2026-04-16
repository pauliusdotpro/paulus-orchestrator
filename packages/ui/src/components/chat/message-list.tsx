import { useEffect, useRef } from 'react'
import type { AIMessage } from '@paulus/shared'

interface MessageListProps {
  messages: AIMessage[]
  streamingText: string
  isStreaming: boolean
}

export function MessageList({ messages, streamingText, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingText])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.length === 0 && !isStreaming && (
        <div className="text-center text-fg-dim py-12">
          <p className="text-sm">Ask the AI to inspect, debug, or manage this server.</p>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] min-w-0 px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-surface-raised text-fg'
                : 'bg-surface-alt border border-edge-subtle text-fg-tertiary'
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {isStreaming && streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[80%] px-4 py-2.5 rounded-lg text-sm bg-surface-alt border border-edge-subtle text-fg-tertiary whitespace-pre-wrap">
            {streamingText}
            <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-0.5 animate-pulse" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
