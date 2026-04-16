import { useEffect, useState } from 'react'
import { useChatStore, useServerStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import { NewSessionDialog } from './new-session-dialog'

export function SessionList() {
  const bridge = useBridge()
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const connections = useServerStore((s) => s.connections)
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    deleteSession,
    loadSessions,
    init,
  } = useChatStore()
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)

  const activeServer = servers.find((s) => s.id === activeServerId)

  useEffect(() => {
    if (!activeServerId) return
    init(bridge)
    loadSessions(bridge, activeServerId)
  }, [activeServerId])

  const serverSessions = Object.values(sessions)
    .filter((s) => activeServerId && s.serverIds.includes(activeServerId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  if (!activeServerId) {
    return (
      <div className="px-4 py-8 text-center text-fg-faint text-xs">
        Select a server to view sessions
      </div>
    )
  }

  const handleNewSession = () => {
    if (!activeServerId) return
    // If only one server exists, create directly without showing dialog
    if (servers.length <= 1) {
      createSession(bridge, [activeServerId])
      return
    }
    setShowNewSessionDialog(true)
  }

  const handleCreateSession = (serverIds: string[]) => {
    setShowNewSessionDialog(false)
    createSession(bridge, serverIds)
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
        <span className="text-xs font-medium text-fg-faint uppercase truncate">
          {activeServer?.name ?? 'Sessions'}
        </span>
        <button
          onClick={handleNewSession}
          className="text-xs text-fg-muted hover:text-fg px-2 py-0.5 rounded hover:bg-surface-raised"
        >
          + New
        </button>
      </div>

      {serverSessions.length === 0 ? (
        <div className="px-4 py-6 text-center text-fg-faint text-xs">No sessions yet</div>
      ) : (
        <div className="space-y-0.5">
          {serverSessions.map((session) => {
            const isMultiServer = session.serverIds.length > 1
            return (
              <div
                key={session.id}
                className={`group flex items-stretch gap-1 rounded-md transition-colors min-w-0 ${
                  activeSessionId === session.id
                    ? 'bg-surface-raised'
                    : 'hover:bg-surface-raised/50'
                }`}
              >
                <button
                  onClick={() => setActiveSession(session.id)}
                  className={`flex-1 min-w-0 text-left px-3 py-2 rounded-md transition-colors ${
                    activeSessionId === session.id
                      ? 'text-fg'
                      : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  <div className="text-sm truncate">{getSessionPreview(session)}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-fg-dim">{formatTime(session.updatedAt)}</span>
                    {isMultiServer && (
                      <span
                        className="text-[10px] text-fg-faint bg-surface-raised px-1.5 py-0.5 rounded"
                        title={session.serverIds
                          .map((id) => servers.find((s) => s.id === id)?.name ?? id)
                          .join(', ')}
                      >
                        {session.serverIds.length} servers
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => handleDeleteSession(session.id)}
                  className={`px-2 text-xs text-fg-faint hover:text-red-300 transition-colors ${
                    activeSessionId === session.id
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="Delete session"
                >
                  Delete
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showNewSessionDialog && (
        <NewSessionDialog
          servers={servers}
          connections={connections}
          activeServerId={activeServerId}
          onSubmit={handleCreateSession}
          onCancel={() => setShowNewSessionDialog(false)}
        />
      )}
    </>
  )
}
