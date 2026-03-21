import { useState, useRef, useEffect, useCallback } from 'react'
import type { TerminalLine } from '@paulus/shared'
import { useBridge } from '../../hooks/use-bridge'
import { useChatStore } from '../../stores'

interface TerminalConsoleProps {
  serverId: string
  isConnected: boolean
}

let lineId = 0

export function TerminalConsole({ serverId, isConnected }: TerminalConsoleProps) {
  const bridge = useBridge()
  const { activeSessionId, sessions, createSession } = useChatStore()
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeSession = activeSessionId ? sessions[activeSessionId] : null
  const sessionId = activeSession?.serverId === serverId ? activeSession.id : null

  useEffect(() => {
    let cancelled = false

    if (!sessionId) {
      setLines([])
      setHistory([])
      setHistoryIndex(-1)
      return () => {
        cancelled = true
      }
    }

    bridge.terminals
      .get(sessionId)
      .then((state) => {
        if (cancelled) return
        lineId = state.lines.reduce((max, line) => Math.max(max, line.id), 0)
        setLines(state.lines)
        setHistory(state.history)
        setHistoryIndex(-1)
      })
      .catch(() => {
        if (cancelled) return
        setLines([])
        setHistory([])
        setHistoryIndex(-1)
      })

    return () => {
      cancelled = true
    }
  }, [bridge, sessionId])

  // Listen for SSH output events
  useEffect(() => {
    const unsub = bridge.servers.onOutput(
      ({ serverId: sid, sessionId: outputSessionId, data, stream }) => {
        if (sid !== serverId || outputSessionId !== sessionId) return
        const textLines = splitTerminalText(data)
        if (textLines.length === 0) return
        setLines((prev) => [
          ...prev,
          ...textLines.map((text) => ({
            id: ++lineId,
            text,
            type: stream as 'stdout' | 'stderr',
          })),
        ])
      },
    )
    return unsub
  }, [serverId, sessionId, bridge])

  useEffect(() => {
    const unsub = bridge.ai.onEvent((event) => {
      if (event.sessionId !== sessionId || event.type !== 'command_running') return
      setLines((prev) => [
        ...prev,
        {
          id: ++lineId,
          text: `$ ${event.command}`,
          type: 'stdin',
        },
      ])
    })

    return unsub
  }, [bridge, sessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const cmd = input.trim()
      if (!cmd) return

      let ensuredSessionId = sessionId
      if (!ensuredSessionId) {
        ensuredSessionId = (await createSession(bridge, serverId)).id
      }

      setHistory((prev) => [...prev, cmd])
      setHistoryIndex(-1)
      setLines((prev) => [...prev, { id: ++lineId, text: `$ ${cmd}`, type: 'stdin' }])
      setInput('')
      setRunning(true)

      try {
        await bridge.servers.exec(serverId, ensuredSessionId, cmd)
      } catch (err: any) {
        setLines((prev) => [
          ...prev,
          { id: ++lineId, text: `Error: ${err.message}`, type: 'system' },
        ])
      } finally {
        setRunning(false)
        inputRef.current?.focus()
      }
    },
    [input, sessionId, createSession, serverId, bridge],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(newIndex)
      setInput(history[newIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const newIndex = historyIndex + 1
      if (newIndex >= history.length) {
        setHistoryIndex(-1)
        setInput('')
      } else {
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
      }
    }
  }

  const handleClear = useCallback(() => {
    if (!sessionId) {
      setLines([])
      return
    }

    bridge.terminals
      .clear(sessionId)
      .then((state) => {
        setLines(state.lines)
        setHistory(state.history)
      })
      .catch(() => {})
  }, [bridge, sessionId])

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-[13px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-xs text-zinc-400 font-sans font-medium">Terminal</span>
        <button
          onClick={handleClear}
          className="text-xs text-zinc-500 hover:text-zinc-300 font-sans px-1.5 py-0.5 rounded hover:bg-zinc-800"
        >
          Clear
        </button>
      </div>

      {/* Output */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-0.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.length === 0 && (
          <p className="text-zinc-600 text-xs">Type a command below to execute on the server...</p>
        )}
        {lines.map((line) => (
          <div
            key={line.id}
            className={`whitespace-pre-wrap break-all leading-5 ${
              line.type === 'stderr'
                ? 'text-red-400'
                : line.type === 'stdin'
                  ? 'text-emerald-400'
                  : line.type === 'system'
                    ? 'text-yellow-400'
                    : 'text-zinc-300'
            }`}
          >
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isConnected && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 bg-zinc-900/30"
        >
          <span className="text-emerald-400 select-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            className="flex-1 bg-transparent text-zinc-100 outline-none placeholder-zinc-600 disabled:opacity-50"
            placeholder={running ? 'Running...' : 'Enter command...'}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      )}
    </div>
  )
}

function splitTerminalText(data: string): string[] {
  return data
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0)
}
