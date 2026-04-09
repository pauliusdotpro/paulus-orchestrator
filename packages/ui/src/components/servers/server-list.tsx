import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SERVER_CATEGORY, type ServerConfig, type ServerConnection } from '@paulus/shared'

interface ServerListProps {
  servers: ServerConfig[]
  categories: string[]
  connections: Record<string, ServerConnection>
  activeServerId: string | null
  onSelect: (id: string) => void
  onEdit: (id: string) => void
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onMove: (serverId: string, targetCategory: string, beforeServerId?: string) => void
  onRenameCategory: (oldName: string, newName: string) => Promise<void> | void
  onRemoveCategory: (name: string) => Promise<void> | void
}

interface ContextMenuState {
  serverId: string
  x: number
  y: number
}

interface DropTarget {
  category: string
  beforeServerId?: string
}

interface ServerCategoryGroup {
  name: string
  servers: ServerConfig[]
}

export function ServerList({
  servers,
  categories,
  connections,
  activeServerId,
  onSelect,
  onEdit,
  onConnect,
  onDisconnect,
  onMove,
  onRenameCategory,
  onRemoveCategory,
}: ServerListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [draggedServerId, setDraggedServerId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)

  const categoryGroups = buildCategoryGroups(servers, categories)
  const categoryNames = categoryGroups.map((group) => group.name)

  const openContextMenu = (serverId: string, x: number, y: number) => {
    const menuWidth = 200
    const categoriesCount = Math.max(1, categoryNames.length)
    const menuHeight = 140 + categoriesCount * 28
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

  if (servers.length === 0 && categoryGroups.length === 0) {
    return <p className="text-xs text-zinc-600 px-2 py-4 text-center">No servers yet</p>
  }

  const handleDrop = (targetCategory: string, beforeServerId?: string) => {
    if (!draggedServerId) {
      return
    }

    if (draggedServerId === beforeServerId) {
      setDropTarget(null)
      return
    }

    onMove(draggedServerId, targetCategory, beforeServerId)
    setDraggedServerId(null)
    setDropTarget(null)
  }

  const activeServer = contextMenu
    ? servers.find((candidate) => candidate.id === contextMenu.serverId)
    : null

  return (
    <div className="mt-1 space-y-3">
      {categoryGroups.map((group) => {
        const isCategoryDropTarget =
          dropTarget?.category === group.name && dropTarget.beforeServerId == null
        const isRenaming = renamingCategory === group.name

        return (
          <section
            key={group.name}
            className={`rounded-lg border px-1 py-1 ${
              isCategoryDropTarget
                ? 'border-zinc-600 bg-zinc-900'
                : 'border-transparent bg-transparent'
            }`}
            onDragOver={(event) => {
              if (!draggedServerId) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget({ category: group.name })
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleDrop(group.name)
            }}
          >
            <CategoryHeader
              name={group.name}
              count={group.servers.length}
              isRenaming={isRenaming}
              onStartRename={() => setRenamingCategory(group.name)}
              onCancelRename={() => setRenamingCategory(null)}
              onCommitRename={async (nextName) => {
                setRenamingCategory(null)
                if (nextName !== group.name) {
                  await onRenameCategory(group.name, nextName)
                }
              }}
              onRemove={async () => {
                await onRemoveCategory(group.name)
              }}
            />

            <div className="space-y-0.5">
              {group.servers.length === 0 && (
                <EmptyCategorySlot highlighted={isCategoryDropTarget} />
              )}
              {group.servers.map((server) => {
                const connection = connections[server.id]
                const isActive = server.id === activeServerId
                const isConnected = connection?.status === 'connected'
                const isConnecting = connection?.status === 'connecting'
                const isBeforeDropTarget = dropTarget?.beforeServerId === server.id

                return (
                  <div key={server.id}>
                    {isBeforeDropTarget && <DropIndicator />}
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', server.id)
                        setContextMenu(null)
                        setDraggedServerId(server.id)
                        setDropTarget(null)
                      }}
                      onDragEnd={() => {
                        setDraggedServerId(null)
                        setDropTarget(null)
                      }}
                      onDragOver={(event) => {
                        if (!draggedServerId || draggedServerId === server.id) return
                        event.preventDefault()
                        event.stopPropagation()
                        event.dataTransfer.dropEffect = 'move'
                        setDropTarget({ category: group.name, beforeServerId: server.id })
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleDrop(group.name, server.id)
                      }}
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
                      className={`cursor-pointer select-none rounded px-2 py-2 ${
                        isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/50'
                      } ${draggedServerId === server.id ? 'opacity-50' : ''}`}
                      style={
                        server.color
                          ? {
                              backgroundImage: `linear-gradient(${server.color}26, ${server.color}26)`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div
                          className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                            isConnected
                              ? 'bg-emerald-400'
                              : connection?.status === 'connecting'
                                ? 'bg-yellow-400'
                                : connection?.status === 'error'
                                  ? 'bg-red-400'
                                  : 'bg-zinc-600'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm leading-5 text-zinc-200">{server.name}</p>
                          <p className="truncate text-xs text-zinc-500">{server.host}</p>
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
                  </div>
                )
              })}

              {isCategoryDropTarget && group.servers.length > 0 && <DropIndicator />}
            </div>
          </section>
        )
      })}

      {contextMenu && activeServer && (
        <ServerContextMenu
          isConnected={connections[contextMenu.serverId]?.status === 'connected'}
          isConnecting={connections[contextMenu.serverId]?.status === 'connecting'}
          currentCategory={activeServer.category}
          categories={categoryNames}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => onEdit(contextMenu.serverId)}
          onConnect={() => onConnect(contextMenu.serverId)}
          onDisconnect={() => onDisconnect(contextMenu.serverId)}
          onMoveToCategory={(category) => onMove(contextMenu.serverId, category)}
        />
      )}
    </div>
  )
}

function buildCategoryGroups(
  servers: ServerConfig[],
  categoryOrder: string[],
): ServerCategoryGroup[] {
  const serversByCategory = new Map<string, ServerConfig[]>()
  for (const server of servers) {
    const bucket = serversByCategory.get(server.category)
    if (bucket) {
      bucket.push(server)
    } else {
      serversByCategory.set(server.category, [server])
    }
  }

  const groups: ServerCategoryGroup[] = []
  const seen = new Set<string>()

  for (const name of categoryOrder) {
    if (seen.has(name)) continue
    seen.add(name)
    groups.push({ name, servers: serversByCategory.get(name) ?? [] })
  }

  // Surface any servers whose category is not yet in the known list (defensive).
  for (const [name, categoryServers] of serversByCategory.entries()) {
    if (seen.has(name)) continue
    seen.add(name)
    groups.push({ name, servers: categoryServers })
  }

  return groups
}

function DropIndicator() {
  return <div className="mx-2 my-1 h-1 rounded-full bg-zinc-100/90" />
}

function EmptyCategorySlot({ highlighted }: { highlighted: boolean }) {
  return (
    <div
      className={`mx-2 my-1 rounded border border-dashed px-2 py-3 text-center text-[11px] ${
        highlighted ? 'border-zinc-500 text-zinc-300' : 'border-zinc-800 text-zinc-600'
      }`}
    >
      Drop servers here
    </div>
  )
}

function CategoryHeader({
  name,
  count,
  isRenaming,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onRemove,
}: {
  name: string
  count: number
  isRenaming: boolean
  onStartRename: () => void
  onCancelRename: () => void
  onCommitRename: (nextName: string) => void | Promise<void>
  onRemove: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isDefaultCategory = name === DEFAULT_SERVER_CATEGORY

  useEffect(() => {
    if (isRenaming) {
      setDraft(name)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isRenaming, name])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0 || trimmed === name) {
      onCancelRename()
      return
    }
    onCommitRename(trimmed)
  }

  if (isRenaming) {
    return (
      <div className="px-2 py-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancelRename()
            }
          }}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-200 focus:border-zinc-500 focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div className="group flex items-center justify-between gap-2 px-2 py-1.5">
      <button
        type="button"
        onDoubleClick={() => {
          if (!isDefaultCategory) onStartRename()
        }}
        className="min-w-0 flex-1 cursor-default truncate text-left text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
        title={isDefaultCategory ? name : `${name} — double-click to rename`}
      >
        {name}
      </button>
      <div className="flex items-center gap-1">
        <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {count}
        </span>
        {!isDefaultCategory && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={onStartRename}
              title="Rename category"
              aria-label={`Rename ${name}`}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.379-8.379-2.828-2.828Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete the "${name}" category?\n\n${
                      count > 0
                        ? `${count} server${count === 1 ? '' : 's'} will move to "${DEFAULT_SERVER_CATEGORY}".`
                        : 'This category is empty.'
                    }`,
                  )
                ) {
                  onRemove()
                }
              }}
              title="Delete category"
              aria-label={`Delete ${name}`}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.75 3a.75.75 0 0 0-.75.75V4h-3a.75.75 0 0 0 0 1.5h.31l.77 9.25A1.75 1.75 0 0 0 7.82 16.5h4.36a1.75 1.75 0 0 0 1.74-1.75l.77-9.25H15a.75.75 0 0 0 0-1.5h-3v-.25A.75.75 0 0 0 11.25 3h-2.5ZM8.5 7.75a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm2.5 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ServerContextMenu({
  isConnected,
  isConnecting,
  currentCategory,
  categories,
  x,
  y,
  onClose,
  onEdit,
  onConnect,
  onDisconnect,
  onMoveToCategory,
}: {
  isConnected: boolean
  isConnecting: boolean
  currentCategory: string
  categories: string[]
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  onConnect: () => void
  onDisconnect: () => void
  onMoveToCategory: (category: string) => void
}) {
  return (
    <div
      className="fixed z-50 min-w-48 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
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

      {categories.length > 0 && (
        <>
          <div className="my-1 border-t border-zinc-800" />
          <div className="px-3 pb-0.5 pt-1 text-[10px] uppercase tracking-wider text-zinc-500">
            Move to
          </div>
          <div className="max-h-48 overflow-y-auto">
            {categories.map((category) => {
              const isCurrent = category === currentCategory
              return (
                <button
                  key={category}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    onClose()
                    if (!isCurrent) {
                      onMoveToCategory(category)
                    }
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-default disabled:text-zinc-500 disabled:hover:bg-transparent"
                >
                  <span className="truncate">{category}</span>
                  {isCurrent && (
                    <svg
                      className="h-3.5 w-3.5 text-zinc-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 0 1 .007 1.415l-8 8.08a1 1 0 0 1-1.42.005l-4-4a1 1 0 0 1 1.415-1.415l3.29 3.29 7.292-7.367a1 1 0 0 1 1.416-.007Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </>
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
