import { useState } from 'react'
import type { ServerConfig } from '@paulus/shared'
import { useBridge } from '../../hooks/use-bridge'
import { useChatStore, useServerStore, useSettingsStore } from '../../stores'
import { ServerColorPicker } from './server-color-picker'

type ServerSettingsTab = 'general' | 'authentication' | 'advanced' | 'danger'

const TABS: Array<{ id: ServerSettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'danger', label: 'Danger Zone' },
]

interface ServerSettingsViewProps {
  server: ServerConfig
}

export function ServerSettingsView({ server }: ServerSettingsViewProps) {
  const bridge = useBridge()
  const updateServer = useServerStore((s) => s.updateServer)
  const removeServer = useServerStore((s) => s.removeServer)
  const removeSessionsForServer = useChatStore((s) => s.removeSessionsForServer)
  const closeSettingsView = useSettingsStore((s) => s.closeSettingsView)
  const [activeTab, setActiveTab] = useState<ServerSettingsTab>('general')
  const [form, setForm] = useState(() => ({
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    authMethod: server.authMethod,
    privateKeyPath: server.privateKeyPath ?? '',
    password: '',
    autoConnect: server.autoConnect ?? false,
    color: server.color,
  }))
  const [clearSavedPassword, setClearSavedPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const autoConnectAvailable = form.authMethod === 'key'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const password =
        form.authMethod === 'key'
          ? ''
          : form.password.length > 0
            ? form.password
            : clearSavedPassword
              ? ''
              : undefined

      await updateServer(
        bridge,
        {
          ...server,
          name: form.name,
          host: form.host,
          port: form.port,
          username: form.username,
          authMethod: form.authMethod,
          privateKeyPath: form.authMethod === 'key' ? form.privateKeyPath || undefined : undefined,
          autoConnect: autoConnectAvailable ? form.autoConnect : false,
          color: form.color,
          hasPassword: form.authMethod === 'password' ? server.hasPassword : false,
        },
        password,
      )
      closeSettingsView()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Remove ${server.name}?\n\nThis deletes the server, any saved password, and all chat sessions for it.`,
      )
    ) {
      return
    }

    setDeleting(true)
    try {
      await removeServer(bridge, server.id)
      removeSessionsForServer(server.id)
      closeSettingsView()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Server Settings</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {server.username}@{server.host}:{server.port}
          </p>
        </div>
        <button
          onClick={closeSettingsView}
          className="text-zinc-400 hover:text-zinc-100 text-sm px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-2 overflow-x-auto py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'general' && (
            <GeneralTab form={form} onChange={(patch) => setForm({ ...form, ...patch })} />
          )}

          {activeTab === 'authentication' && (
            <AuthenticationTab
              authMethod={form.authMethod}
              privateKeyPath={form.privateKeyPath}
              password={form.password}
              hasSavedPassword={Boolean(server.hasPassword)}
              clearSavedPassword={clearSavedPassword}
              onAuthMethodChange={(authMethod) =>
                setForm({
                  ...form,
                  authMethod,
                  autoConnect: authMethod === 'key' ? form.autoConnect : false,
                })
              }
              onPrivateKeyPathChange={(privateKeyPath) => setForm({ ...form, privateKeyPath })}
              onPasswordChange={(password) => {
                setForm({ ...form, password })
                if (password.length > 0) {
                  setClearSavedPassword(false)
                }
              }}
              onClearSavedPasswordChange={setClearSavedPassword}
            />
          )}

          {activeTab === 'advanced' && (
            <AdvancedTab
              authMethod={form.authMethod}
              autoConnect={form.autoConnect}
              onAutoConnectChange={(autoConnect) => setForm({ ...form, autoConnect })}
            />
          )}

          {activeTab === 'danger' && (
            <DangerTab deleting={deleting} saving={saving} onDelete={handleDelete} />
          )}
        </div>

        <div className="border-t border-zinc-800 px-6 py-4 bg-zinc-950 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeSettingsView}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

function GeneralTab({
  form,
  onChange,
}: {
  form: {
    name: string
    host: string
    port: number
    username: string
    color: string | undefined
  }
  onChange: (
    patch: Partial<{
      name: string
      host: string
      port: number
      username: string
      color: string | undefined
    }>,
  ) => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">General</h3>
        <p className="text-sm text-zinc-500 mt-1">Basic server identity and connection target.</p>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Name</label>
        <input
          type="text"
          required
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full max-w-md px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-2">Color</label>
        <ServerColorPicker value={form.color} onChange={(color) => onChange({ color })} />
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md">
        <div className="col-span-2">
          <label className="block text-xs text-zinc-500 mb-1.5">Host</label>
          <input
            type="text"
            required
            value={form.host}
            onChange={(e) => onChange({ host: e.target.value })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Port</label>
          <input
            type="number"
            value={form.port}
            onChange={(e) => onChange({ port: parseInt(e.target.value) || 22 })}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Username</label>
        <input
          type="text"
          required
          value={form.username}
          onChange={(e) => onChange({ username: e.target.value })}
          className="w-full max-w-md px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>
    </section>
  )
}

function AuthenticationTab({
  authMethod,
  privateKeyPath,
  password,
  hasSavedPassword,
  clearSavedPassword,
  onAuthMethodChange,
  onPrivateKeyPathChange,
  onPasswordChange,
  onClearSavedPasswordChange,
}: {
  authMethod: 'password' | 'key'
  privateKeyPath: string
  password: string
  hasSavedPassword: boolean
  clearSavedPassword: boolean
  onAuthMethodChange: (authMethod: 'password' | 'key') => void
  onPrivateKeyPathChange: (privateKeyPath: string) => void
  onPasswordChange: (password: string) => void
  onClearSavedPasswordChange: (clearSavedPassword: boolean) => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">
          Authentication Settings
        </h3>
        <p className="text-sm text-zinc-500 mt-1">
          Choose how Paulus authenticates when connecting to this server.
        </p>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <input
            type="radio"
            name="auth"
            checked={authMethod === 'key'}
            onChange={() => onAuthMethodChange('key')}
          />
          SSH Key
        </label>
        <label className="flex items-center gap-1.5 text-sm text-zinc-300">
          <input
            type="radio"
            name="auth"
            checked={authMethod === 'password'}
            onChange={() => onAuthMethodChange('password')}
          />
          Password
        </label>
      </div>

      {authMethod === 'key' && (
        <>
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Private Key Path</label>
            <input
              type="text"
              value={privateKeyPath}
              onChange={(e) => onPrivateKeyPathChange(e.target.value)}
              className="w-full max-w-md px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
              placeholder="~/.ssh/id_rsa"
            />
          </div>

          {hasSavedPassword && (
            <p className="text-xs text-zinc-500">
              Switching to SSH key authentication removes the saved password.
            </p>
          )}
        </>
      )}

      {authMethod === 'password' && (
        <div className="max-w-md">
          <label className="block text-xs text-zinc-500 mb-1.5">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
            placeholder="Leave blank to keep current password"
          />
          <p className="text-xs text-zinc-500 mt-1.5">
            {hasSavedPassword
              ? 'Leave blank to keep the current saved password.'
              : 'Encrypted and stored locally via OS keychain. Paulus only reads it when you connect.'}
          </p>
          {hasSavedPassword && password.length === 0 && (
            <label className="mt-3 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clearSavedPassword}
                onChange={(e) => onClearSavedPasswordChange(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              <span className="text-sm text-zinc-300">Remove saved password</span>
            </label>
          )}
        </div>
      )}
    </section>
  )
}

function AdvancedTab({
  authMethod,
  autoConnect,
  onAutoConnectChange,
}: {
  authMethod: 'password' | 'key'
  autoConnect: boolean
  onAutoConnectChange: (autoConnect: boolean) => void
}) {
  const autoConnectAvailable = authMethod === 'key'

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">Advanced</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Runtime behavior and connection convenience settings.
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoConnectAvailable && autoConnect}
          onChange={(e) => onAutoConnectChange(e.target.checked)}
          disabled={!autoConnectAvailable}
          className="rounded border-zinc-600 bg-zinc-800"
        />
        <span className={`text-sm ${autoConnectAvailable ? 'text-zinc-300' : 'text-zinc-500'}`}>
          Auto-connect on launch
        </span>
      </label>

      {autoConnectAvailable ? (
        <p className="text-xs text-zinc-500">
          If this server is already connected, reconnect to apply updated connection details.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          Launch auto-connect is only available for SSH key authentication. Password-based servers
          require manual connect so the OS keychain prompt never appears on app open.
        </p>
      )}
    </section>
  )
}

function DangerTab({
  deleting,
  saving,
  onDelete,
}: {
  deleting: boolean
  saving: boolean
  onDelete: () => Promise<void>
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-red-300 uppercase tracking-wide">Danger Zone</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Remove this server, its saved password, and all related sessions.
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-100">Remove server</div>
          <div className="text-xs text-zinc-500 mt-1">
            This cannot be undone. Session history for this server will be deleted.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onDelete().catch(() => {})
          }}
          disabled={deleting || saving}
          className="px-4 py-2 text-sm rounded-md bg-red-500/15 text-red-200 hover:bg-red-500/25 disabled:opacity-50"
        >
          {deleting ? 'Removing...' : 'Remove Server'}
        </button>
      </div>
    </section>
  )
}
