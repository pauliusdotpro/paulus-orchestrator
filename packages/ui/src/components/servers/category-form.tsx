import { useState } from 'react'
import { useServerStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'

interface CategoryFormProps {
  onClose: () => void
}

export function CategoryForm({ onClose }: CategoryFormProps) {
  const bridge = useBridge()
  const createCategory = useServerStore((s) => s.createCategory)
  const categories = useServerStore((s) => s.categories)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Name is required')
      return
    }
    if (categories.includes(trimmed)) {
      setError('A category with this name already exists')
      return
    }
    setSaving(true)
    try {
      await createCategory(bridge, trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-surface-alt border border-edge rounded-lg p-6 w-[24rem] space-y-4"
      >
        <h2 className="text-lg font-medium text-fg">Add Category</h2>

        <div>
          <label className="block text-xs text-fg-muted mb-1">Name</label>
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
            className="w-full bg-surface-raised border border-edge rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-edge-strong"
            placeholder="Production"
          />
          {error && <p className="text-xs text-red-300 mt-1.5">{error}</p>}
        </div>

        <p className="text-xs text-fg-faint">
          Categories group servers in the sidebar. You can also assign a category when adding or
          editing a server.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-fg-muted hover:text-fg-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-surface-invert text-fg-invert rounded hover:bg-surface-invert-hover disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Category'}
          </button>
        </div>
      </form>
    </div>
  )
}
