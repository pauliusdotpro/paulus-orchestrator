import { useState } from 'react'
import type { ServerConfig } from '@paulus/shared'
import { useServerStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'

interface ServerFormProps {
  server?: ServerConfig
  onClose: () => void
  onDelete?: () => Promise<void> | void
}

export function ServerForm({ server, onClose, onDelete }: ServerFormProps) {
  const bridge = useBridge()
  const addServer = useServerStore((s) => s.addServer)
  const updateServer = useServerStore((s) => s.updateServer)
  const isEditing = Boolean(server)
  const [form, setForm] = useState(() => ({
    name: server?.name ?? '',
    host: server?.host ?? '',
    port: server?.port ?? 22,
    username: server?.username ?? 'root',
    authMethod: server?.authMethod ?? ('key' as 'password' | 'key'),
    privateKeyPath: server?.privateKeyPath ?? '',
    password: '',
    autoConnect: server?.autoConnect ?? false,
  }))
  const [clearSavedPassword, setClearSavedPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const autoConnectAvailable = form.authMethod === 'key'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const nextConfig = {
        name: form.name,
        host: form.host,
        port: form.port,
        username: form.username,
        authMethod: form.authMethod,
        privateKeyPath: form.authMethod === 'key' ? form.privateKeyPath || undefined : undefined,
        autoConnect: autoConnectAvailable ? form.autoConnect : false,
      }
      const password =
        form.authMethod === 'key'
          ? isEditing
            ? ''
            : undefined
          : form.password.length > 0
            ? form.password
            : clearSavedPassword
              ? ''
              : undefined

      if (server) {
        await updateServer(
          bridge,
          {
            ...server,
            ...nextConfig,
            hasPassword: form.authMethod === 'password' ? server.hasPassword : false,
          },
          password,
        )
      } else {
        await addServer(bridge, nextConfig, password)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !server) return
    if (
      !window.confirm(
        `Remove ${server.name}?\n\nThis deletes the server, any saved password, and all chat sessions for it.`,
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-[28rem] space-y-4"
      >
        <h2 className="text-lg font-medium text-zinc-100">
          {isEditing ? 'Server Settings' : 'Add Server'}
        </h2>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="My Server"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Host</label>
            <input
              type="text"
              required
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              placeholder="192.168.1.1"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Username</label>
          <input
            type="text"
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Auth Method</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm text-zinc-300">
              <input
                type="radio"
                name="auth"
                checked={form.authMethod === 'key'}
                onChange={() => setForm({ ...form, authMethod: 'key' })}
              />
              SSH Key
            </label>
            <label className="flex items-center gap-1.5 text-sm text-zinc-300">
              <input
                type="radio"
                name="auth"
                checked={form.authMethod === 'password'}
                onChange={() => setForm({ ...form, authMethod: 'password', autoConnect: false })}
              />
              Password
            </label>
          </div>
        </div>

        {form.authMethod === 'key' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Private Key Path</label>
            <input
              type="text"
              value={form.privateKeyPath}
              onChange={(e) => setForm({ ...form, privateKeyPath: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              placeholder="~/.ssh/id_rsa"
            />
          </div>
        )}

        {form.authMethod === 'password' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {isEditing ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => {
                const password = e.target.value
                setForm({ ...form, password })
                if (password.length > 0) {
                  setClearSavedPassword(false)
                }
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              placeholder={isEditing ? 'Leave blank to keep current password' : 'Enter password'}
            />
            <p className="text-xs text-zinc-600 mt-1">
              {isEditing && server?.hasPassword
                ? 'Leave blank to keep the current saved password.'
                : 'Encrypted and stored locally via OS keychain. Paulus only reads it when you connect.'}
            </p>
            {isEditing && server?.hasPassword && form.password.length === 0 && (
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearSavedPassword}
                  onChange={(e) => setClearSavedPassword(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-800"
                />
                <span className="text-sm text-zinc-300">Remove saved password</span>
              </label>
            )}
          </div>
        )}

        {isEditing && form.authMethod === 'key' && server?.hasPassword && (
          <p className="text-xs text-zinc-500">
            Switching to SSH key authentication removes the saved password.
          </p>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoConnectAvailable && form.autoConnect}
            onChange={(e) => setForm({ ...form, autoConnect: e.target.checked })}
            disabled={!autoConnectAvailable}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          <span className={`text-sm ${autoConnectAvailable ? 'text-zinc-300' : 'text-zinc-500'}`}>
            Auto-connect on launch
          </span>
        </label>

        {!autoConnectAvailable && (
          <p className="text-xs text-zinc-500">
            Launch auto-connect is only available for SSH key authentication. Password-based servers
            require manual connect so the OS keychain prompt never appears on app open.
          </p>
        )}

        {isEditing && (
          <p className="text-xs text-zinc-500">
            If this server is already connected, reconnect to apply updated connection details.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {isEditing && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-2 text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
            >
              {deleting ? 'Removing...' : 'Remove Server'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving
              ? isEditing
                ? 'Saving...'
                : 'Adding...'
              : isEditing
                ? 'Save Changes'
                : 'Add Server'}
          </button>
        </div>
      </form>
    </div>
  )
}
