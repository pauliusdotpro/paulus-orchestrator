import { useEffect, useRef, useState } from 'react'
import { useChatStore, useServerStore, useSettingsStore, useLayoutStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import { ServerList } from '../servers/server-list'
import { ServerForm } from '../servers/server-form'
import { CategoryForm } from '../servers/category-form'
import { PasswordPrompt } from '../servers/password-prompt'
import { SessionList } from '../sessions/session-list'

type SidebarPanel = 'servers' | 'sessions'

export function Sidebar() {
  const [activePanel, setActivePanel] = useState<SidebarPanel>('servers')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false)
  const [passwordPromptServerId, setPasswordPromptServerId] = useState<string | null>(null)
  const bridge = useBridge()
  const {
    servers,
    categories,
    connections,
    activeServerId,
    setActiveServer,
    connectServer,
    connectServerWithPassword,
    disconnectServer,
    moveServer,
    renameCategory,
    removeCategory,
  } = useServerStore()
  const activeView = useSettingsStore((s) => s.activeView)
  const openGlobalSettings = useSettingsStore((s) => s.openGlobalSettings)
  const openServerSettings = useSettingsStore((s) => s.openServerSettings)
  const closeSettingsView = useSettingsStore((s) => s.closeSettingsView)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)

  const handleConnect = (id: string) => {
    const server = servers.find((s) => s.id === id)
    if (server?.authMethod === 'password' && !server.hasPassword) {
      setPasswordPromptServerId(id)
    } else {
      connectServer(bridge, id).catch(() => {
        if (server?.authMethod === 'password') {
          setPasswordPromptServerId(id)
        }
      })
    }
  }

  const promptServer = passwordPromptServerId
    ? servers.find((s) => s.id === passwordPromptServerId)
    : null

  return (
    <div className="flex h-full">
      {/* Activity bar — thin icon strip */}
      <div className="w-12 bg-surface border-r border-edge-subtle flex flex-col items-center py-3 gap-1 flex-shrink-0">
        <ActivityBarButton
          active={activePanel === 'servers'}
          onClick={() => setActivePanel('servers')}
          label="Servers"
        >
          {/* Server icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"
            />
          </svg>
        </ActivityBarButton>

        <ActivityBarButton
          active={activePanel === 'sessions'}
          onClick={() => setActivePanel('sessions')}
          label="Sessions"
        >
          {/* Chat bubble icon */}
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
            />
          </svg>
        </ActivityBarButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings at bottom of activity bar */}
        <ActivityBarButton
          active={activeView === 'global'}
          onClick={() => {
            if (activeView === 'global') {
              closeSettingsView()
            } else {
              openGlobalSettings()
            }
          }}
          label="Settings"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </ActivityBarButton>
      </div>

      {/* Panel content */}
      <div className="w-56 bg-surface-alt border-r border-edge-subtle flex flex-col h-full">
        <div className="p-4 border-b border-edge-subtle flex items-center justify-between">
          <h1 className="text-sm font-bold text-fg tracking-wide uppercase">Paulus</h1>
          <button
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="text-fg-faint hover:text-fg-tertiary hover:bg-surface-raised rounded-md p-1 transition-colors"
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
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {activePanel === 'servers' ? (
              <>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-medium text-fg-faint uppercase">Servers</span>
                  <AddMenu
                    onAddServer={() => setShowAddForm(true)}
                    onAddCategory={() => setShowAddCategoryForm(true)}
                  />
                </div>

                <ServerList
                  servers={servers}
                  categories={categories}
                  connections={connections}
                  activeServerId={activeServerId}
                  onSelect={(id) => {
                    setActiveServer(id)
                    closeSettingsView()
                  }}
                  onEdit={(id) => openServerSettings(id)}
                  onConnect={handleConnect}
                  onDisconnect={(id) => disconnectServer(bridge, id)}
                  onMove={(serverId, targetCategory, beforeServerId) =>
                    moveServer(bridge, serverId, targetCategory, beforeServerId).catch(() => {})
                  }
                  onRenameCategory={(oldName, newName) =>
                    renameCategory(bridge, oldName, newName).catch(() => {})
                  }
                  onRemoveCategory={(name) => removeCategory(bridge, name).catch(() => {})}
                />
              </>
            ) : (
              <SessionList />
            )}
          </div>
        </div>

        <div className="border-t border-edge-subtle" />
      </div>

      {showAddForm && <ServerForm onClose={() => setShowAddForm(false)} />}

      {showAddCategoryForm && <CategoryForm onClose={() => setShowAddCategoryForm(false)} />}

      {promptServer && (
        <PasswordPrompt
          serverName={promptServer.name}
          onSubmit={(password, save) => {
            connectServerWithPassword(bridge, promptServer.id, password, save).catch(() => {})
            setPasswordPromptServerId(null)
          }}
          onCancel={() => setPasswordPromptServerId(null)}
        />
      )}
    </div>
  )
}

function ActivityBarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-surface-raised text-fg'
          : 'text-fg-faint hover:text-fg-tertiary hover:bg-surface-raised/50'
      }`}
    >
      {children}
    </button>
  )
}

function AddMenu({
  onAddServer,
  onAddCategory,
}: {
  onAddServer: () => void
  onAddCategory: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Add"
        aria-label="Add server or category"
        className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface-raised hover:text-fg"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 4a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 10 4Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-44 overflow-hidden rounded-md border border-edge bg-surface-alt py-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAddServer()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg-secondary hover:bg-surface-raised"
          >
            <svg
              className="h-4 w-4 text-fg-faint"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z"
              />
            </svg>
            New server
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAddCategory()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg-secondary hover:bg-surface-raised"
          >
            <svg
              className="h-4 w-4 text-fg-faint"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            New category
          </button>
        </div>
      )}
    </div>
  )
}
