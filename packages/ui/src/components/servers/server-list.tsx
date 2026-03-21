import { useEffect, useState } from 'react'
import type { ServerConfig, ServerConnection } from '@paulus/shared'

interface ServerListProps {
  servers: ServerConfig[]
  connections: Record<string, ServerConnection>
  activeServerId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
}

interface ContextMenuState {
  serverId: string
  x: number
  y: number
}

export function ServerList({
  servers,
  connections,
  activeServerId,
  onSelect,
  onEdit,
  onConnect,
  onDisconnect,
}: ServerListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const openContextMenu = (serverId: string, x: number, y: number) => {
    const menuWidth = 176
    const menuHeight = 84
    const padding = 8
    const maxX = window.innerWidth - menuWidth - padding
    const maxY = window.innerHeight - menuHeight - padding

    setContextMenu({
      serverId,
      x: Math.max(padding, Math.min(x, maxX)),
      y: Math.max(padding, Math.min(y, maxY)),
    })
  }

  useEffect(() => {
    if (!contextMenu) return

    const closeMenu = () => setContextMenu(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('contextmenu', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('contextmenu', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  if (servers.length === 0) {
    return <p className="text-xs text-zinc-600 px-2 py-4 text-center">No servers yet</p>
  }

  return (
    <div className="space-y-0.5 mt-1">
      {servers.map((server) => {
        const connection = connections[server.id]
        const isActive = server.id === activeServerId
        const isConnected = connection?.status === 'connected'
        const isConnecting = connection?.status === 'connecting'

        return (
          <div
            key={server.id}
            onClick={() => {
              setContextMenu(null)
              onSelect(server.id)
            }}
            onDoubleClick={() => {
              if (!isConnected && !isConnecting) {
                onConnect(server.id)
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              onSelect(server.id)
              openContextMenu(server.id, event.clientX, event.clientY)
            }}
            className={`px-2 py-2 rounded cursor-pointer select-none ${
              isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                  isConnected
                    ? 'bg-emerald-400'
                    : connection?.status === 'connecting'
                      ? 'bg-yellow-400'
                      : connection?.status === 'error'
                        ? 'bg-red-400'
                        : 'bg-zinc-600'
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate leading-5">{server.name}</p>
                <p className="text-xs text-zinc-500 truncate">{server.host}</p>
              </div>
              <button
                type="button"
                aria-label={`Open actions for ${server.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(server.id)
                  const rect = event.currentTarget.getBoundingClientRect()
                  openContextMenu(server.id, rect.right - 8, rect.bottom + 4)
                }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                  />
                </svg>
              </button>
            </div>
          </div>
        )
      })}

      {contextMenu && (
        <ServerContextMenu
          isConnected={connections[contextMenu.serverId]?.status === 'connected'}
          isConnecting={connections[contextMenu.serverId]?.status === 'connecting'}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => onEdit(contextMenu.serverId)}
          onConnect={() => onConnect(contextMenu.serverId)}
          onDisconnect={() => onDisconnect(contextMenu.serverId)}
        />
      )}
    </div>
  )
}

function ServerContextMenu({
  isConnected,
  isConnecting,
  x,
  y,
  onClose,
  onEdit,
  onConnect,
  onDisconnect,
}: {
  isConnected: boolean
  isConnecting: boolean
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <div
      className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <ContextMenuButton
        label="Edit"
        onClick={() => {
          onClose()
          onEdit()
        }}
      />
      {isConnected ? (
        <ContextMenuButton
          label="Disconnect"
          onClick={() => {
            onClose()
            onDisconnect()
          }}
        />
      ) : (
        <ContextMenuButton
          label={isConnecting ? 'Connecting...' : 'Connect'}
          disabled={isConnecting}
          onClick={() => {
            onClose()
            onConnect()
          }}
        />
      )}
    </div>
  )
}

function ContextMenuButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-default disabled:text-zinc-500 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
}
