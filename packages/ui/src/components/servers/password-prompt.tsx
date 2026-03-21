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
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80 space-y-4"
      >
        <h2 className="text-lg font-medium text-zinc-100">Enter Password</h2>
        <p className="text-sm text-zinc-400">
          Password required for <span className="text-zinc-200">{serverName}</span>
        </p>

        <div>
          <input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            placeholder="SSH password"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          <span className="text-sm text-zinc-300">Save to keychain</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-zinc-100 text-zinc-900 rounded hover:bg-zinc-200"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  )
}
