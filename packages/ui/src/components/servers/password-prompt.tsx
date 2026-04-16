import { useState } from 'react'

interface PasswordPromptProps {
  serverName: string
  onSubmit: (password: string, save: boolean) => void
  onCancel: () => void
}

export function PasswordPrompt({ serverName, onSubmit, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState('')
  const [save, setSave] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password) {
      onSubmit(password, save)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-alt border border-edge rounded-lg p-6 w-80 space-y-4"
      >
        <h2 className="text-lg font-medium text-fg">Enter Password</h2>
        <p className="text-sm text-fg-muted">
          Password required for <span className="text-fg-secondary">{serverName}</span>
        </p>

        <div>
          <input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-raised border border-edge rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-edge-strong"
            placeholder="SSH password"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="rounded border-edge-strong bg-surface-raised"
          />
          <span className="text-sm text-fg-tertiary">Save to keychain</span>
        </label>

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
            className="px-4 py-2 text-sm bg-surface-invert text-fg-invert rounded hover:bg-surface-invert-hover"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  )
}
