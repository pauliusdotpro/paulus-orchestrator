import { useState } from 'react'
import type { ServerConfig, ServerConnection } from '@paulus/shared'

interface NewSessionDialogProps {
  servers: ServerConfig[]
  connections: Record<string, ServerConnection>
  activeServerId: string | null
  onSubmit: (serverIds: string[]) => void
  onCancel: () => void
}

export function NewSessionDialog({
  servers,
  connections,
  activeServerId,
  onSubmit,
  onCancel,
}: NewSessionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeServerId) initial.add(activeServerId)
    return initial
  })

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedIds.size === 0) return
    // Put the active server first so it remains the "primary"
    const ids = [...selectedIds].sort((a, b) => {
      if (a === activeServerId) return -1
      if (b === activeServerId) return 1
      return 0
    })
    onSubmit(ids)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-alt border border-edge rounded-lg p-6 w-96 space-y-4"
      >
        <h2 className="text-lg font-medium text-fg">New Chat Session</h2>
        <p className="text-sm text-fg-muted">
          Select which servers the AI should have access to in this session.
        </p>

        <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border border-edge-subtle bg-surface p-2">
          {servers.length === 0 ? (
            <p className="text-xs text-fg-faint py-3 text-center">No servers configured</p>
          ) : (
            servers.map((server) => {
              const conn = connections[server.id]
              const isConnected = conn?.status === 'connected'
              const isSelected = selectedIds.has(server.id)

              return (
                <label
                  key={server.id}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-surface-raised text-fg'
                      : 'text-fg-muted hover:bg-surface-raised/50 hover:text-fg-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(server.id)}
                    className="rounded border-edge-strong bg-surface-raised text-fg focus:ring-edge-strong"
                  />
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      isConnected ? 'bg-emerald-400' : 'bg-surface-strong'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{server.name}</div>
                    <div className="text-[11px] text-fg-faint truncate">
                      {server.username}@{server.host}
                    </div>
                  </div>
                </label>
              )
            })
          )}
        </div>

        {selectedIds.size > 1 && (
          <p className="text-xs text-fg-faint">
            {selectedIds.size} servers selected — the AI will be able to run commands on all of
            them.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-fg-muted hover:text-fg-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={selectedIds.size === 0}
            className="px-4 py-2 text-sm bg-surface-invert text-fg-invert rounded hover:bg-surface-invert-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
