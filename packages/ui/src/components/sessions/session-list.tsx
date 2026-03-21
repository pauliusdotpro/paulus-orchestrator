import { useEffect } from 'react'
import { useChatStore, useServerStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'

export function SessionList() {
  const bridge = useBridge()
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    deleteSession,
    loadSessions,
    init,
  } = useChatStore()

  const activeServer = servers.find((s) => s.id === activeServerId)

  useEffect(() => {
    if (!activeServerId) return
    init(bridge)
    loadSessions(bridge, activeServerId)
  }, [activeServerId])

  const serverSessions = Object.values(sessions)
    .filter((s) => s.serverId === activeServerId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  if (!activeServerId) {
    return (
      <div className="px-4 py-8 text-center text-zinc-500 text-xs">
        Select a server to view sessions
      </div>
    )
  }

  const handleNewSession = () => {
    if (!activeServerId) return
    createSession(bridge, activeServerId)
  }

  const handleDeleteSession = (sessionId: string) => {
    const session = sessions[sessionId]
    if (!session) return
    const preview = getSessionPreview(session)
    if (!window.confirm(`Delete this session?\n\n${preview}`)) return
    deleteSession(bridge, sessionId).catch(() => {})
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const getSessionPreview = (session: (typeof serverSessions)[0]) => {
    const lastUserMsg = [...session.messages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) return lastUserMsg.content.slice(0, 60)
    return 'New session'
  }

  return (
    <>
      <div className="flex items-center justify-between px-2 py-1 min-w-0 gap-2">
        <span className="text-xs font-medium text-zinc-500 uppercase truncate">
          {activeServer?.name ?? 'Sessions'}
        </span>
        <button
          onClick={handleNewSession}
          className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-zinc-800"
        >
          + New
        </button>
      </div>

      {serverSessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-zinc-500 text-xs">No sessions yet</div>
      ) : (
        <div className="space-y-0.5">
          {serverSessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-stretch gap-1 rounded-md transition-colors min-w-0 ${
                activeSessionId === session.id ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
              }`}
            >
              <button
                onClick={() => setActiveSession(session.id)}
                className={`flex-1 min-w-0 text-left px-3 py-2 rounded-md transition-colors ${
                  activeSessionId === session.id
                    ? 'text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="text-sm truncate">{getSessionPreview(session)}</div>
                <div className="text-xs text-zinc-600 mt-0.5">{formatTime(session.updatedAt)}</div>
              </button>
              <button
                onClick={() => handleDeleteSession(session.id)}
                className={`px-2 text-xs text-zinc-500 hover:text-red-300 transition-colors ${
                  activeSessionId === session.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Delete session"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
