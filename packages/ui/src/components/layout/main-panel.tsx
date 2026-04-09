import { useRef, useCallback } from 'react'
import { useServerStore, useSettingsStore, useLayoutStore } from '../../stores'
import { ChatView } from '../chat/chat-view'
import { TerminalConsole } from '../terminal/terminal-console'
import { SettingsView } from '../settings/settings-view'
import { ServerSettingsView } from '../servers/server-settings-view'
import { maskHost, maskPort, maskUsername } from '../../lib/anonymize'

const MIN_TERMINAL_WIDTH = 280
const MAX_TERMINAL_WIDTH = 900

export function MainPanel() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const connections = useServerStore((s) => s.connections)
  const activeView = useSettingsStore((s) => s.activeView)
  const editingServerId = useSettingsStore((s) => s.editingServerId)
  const closeSettingsView = useSettingsStore((s) => s.closeSettingsView)
  const anonymousMode = useSettingsStore((s) => s.settings?.anonymousMode ?? false)
  const panelLayout = useLayoutStore((s) => s.panelLayout)
  const setPanelLayout = useLayoutStore((s) => s.setPanelLayout)
  const terminalWidth = useLayoutStore((s) => s.terminalWidth)
  const setTerminalWidth = useLayoutStore((s) => s.setTerminalWidth)
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return
        const containerRect = containerRef.current.getBoundingClientRect()
        const newWidth = containerRect.right - e.clientX
        const clamped = Math.min(MAX_TERMINAL_WIDTH, Math.max(MIN_TERMINAL_WIDTH, newWidth))
        setTerminalWidth(clamped)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [setTerminalWidth],
  )

  // Settings view — full panel takeover
  if (activeView === 'global') {
    return (
      <div className="flex-1 flex flex-col bg-zinc-950 min-w-0">
        <SettingsView onClose={closeSettingsView} />
      </div>
    )
  }

  if (activeView === 'server') {
    const editingServer = editingServerId
      ? servers.find((server) => server.id === editingServerId)
      : null
    if (!editingServer) {
      return (
        <div className="flex-1 flex flex-col bg-zinc-950 min-w-0">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Server Settings</h2>
            <button
              onClick={closeSettingsView}
              className="text-zinc-400 hover:text-zinc-100 text-sm px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
            Server not found.
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 flex flex-col bg-zinc-950 min-w-0">
        <ServerSettingsView server={editingServer} />
      </div>
    )
  }

  if (!activeServerId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-500">
          <p className="text-lg mb-1">No server selected</p>
          <p className="text-sm">Select or add a server to get started</p>
        </div>
      </div>
    )
  }

  const server = servers.find((s) => s.id === activeServerId)
  const connection = connections[activeServerId]
  const isConnected = connection?.status === 'connected'

  if (!server) return null

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 min-w-0">
      {/* Server header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
        {/* Sidebar toggle */}
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            title="Show sidebar"
            className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md p-1 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>
        )}

        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isConnected
              ? 'bg-emerald-400'
              : connection?.status === 'connecting'
                ? 'bg-yellow-400'
                : connection?.status === 'error'
                  ? 'bg-red-400'
                  : 'bg-zinc-600'
          }`}
        />
        <div>
          <span className="text-sm font-medium text-zinc-100">{server.name}</span>
          <span className="text-xs text-zinc-500 ml-2">
            {anonymousMode ? maskUsername(server.username) : server.username}@
            {anonymousMode ? maskHost(server.host) : server.host}:
            {anonymousMode ? maskPort(server.port) : server.port}
          </span>
        </div>
        <div className="flex-1" />
        {connection?.error && <span className="text-xs text-red-400">{connection.error}</span>}

        {/* Panel layout toggles */}
        {
          <div className="flex items-center gap-0.5">
            <PanelToggleButton
              active={panelLayout === 'chat-only'}
              onClick={() => setPanelLayout(panelLayout === 'chat-only' ? 'split' : 'chat-only')}
              title={panelLayout === 'chat-only' ? 'Show terminal' : 'Maximize chat'}
            >
              {/* Chat/message icon */}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                />
              </svg>
            </PanelToggleButton>
            <PanelToggleButton
              active={panelLayout === 'split'}
              onClick={() => setPanelLayout('split')}
              title="Split view"
            >
              {/* Split columns icon */}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 4.5v15m6-15v15M4.5 19.5h15a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5h-15A1.5 1.5 0 0 0 3 6v12a1.5 1.5 0 0 0 1.5 1.5Z"
                />
              </svg>
            </PanelToggleButton>
            <PanelToggleButton
              active={panelLayout === 'terminal-only'}
              onClick={() =>
                setPanelLayout(panelLayout === 'terminal-only' ? 'split' : 'terminal-only')
              }
              title={panelLayout === 'terminal-only' ? 'Show chat' : 'Maximize terminal'}
            >
              {/* Terminal icon */}
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 17.25V6.75A2.25 2.25 0 0 0 18.75 4.5H5.25A2.25 2.25 0 0 0 3 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
            </PanelToggleButton>
          </div>
        }
      </div>

      {/* Content area */}
      <div ref={containerRef} className="flex-1 flex min-h-0">
        {/* Chat panel */}
        {panelLayout !== 'terminal-only' && (
          <div className="flex-1 flex flex-col min-w-0">
            <ChatView
              serverId={activeServerId}
              isConnected={isConnected}
              connectionStatus={connection?.status}
            />
          </div>
        )}

        {/* Resize handle — only in split mode */}
        {panelLayout === 'split' && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1 flex-shrink-0 bg-zinc-800 hover:bg-zinc-600 cursor-col-resize transition-colors relative group"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* Terminal panel */}
        {panelLayout !== 'chat-only' && (
          <div
            style={panelLayout === 'split' ? { width: terminalWidth } : undefined}
            className={`flex-shrink-0 flex flex-col min-h-0 ${panelLayout === 'terminal-only' ? 'flex-1' : ''}`}
          >
            <TerminalConsole serverId={activeServerId} isConnected={isConnected} />
          </div>
        )}
      </div>
    </div>
  )
}

function PanelToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}
