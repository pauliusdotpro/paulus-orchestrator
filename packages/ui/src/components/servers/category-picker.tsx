import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SERVER_CATEGORY } from '@paulus/shared'

interface CategoryPickerProps {
  value: string
  categories: string[]
  onChange: (category: string) => void
}

export function CategoryPicker({ value, categories, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLInputElement | null>(null)

  const selected = value.trim().length > 0 ? value : DEFAULT_SERVER_CATEGORY
  const allCategories = categories.includes(selected) ? categories : [...categories, selected]

  useEffect(() => {
    if (!open) return

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setCreating(false)
        setDraft('')
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setCreating(false)
        setDraft('')
      }
    }

    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  useEffect(() => {
    if (creating) {
      draftRef.current?.focus()
    }
  }, [creating])

  const commitDraft = () => {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setCreating(false)
      setDraft('')
      return
    }
    onChange(trimmed)
    setCreating(false)
    setDraft('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-edge bg-surface-raised px-3 py-2 text-sm text-fg hover:border-edge-strong focus:border-edge-strong focus:outline-none"
      >
        <span className="truncate">{selected}</span>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-fg-faint transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.084l3.71-3.853a.75.75 0 0 1 1.08 1.04l-4.24 4.4a.75.75 0 0 1-1.08 0l-4.24-4.4a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-edge bg-surface-alt shadow-2xl">
          <ul className="max-h-56 overflow-y-auto py-1">
            {allCategories.map((category) => {
              const isSelected = category === selected
              return (
                <li key={category}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(category)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                      isSelected
                        ? 'bg-surface-raised text-fg'
                        : 'text-fg-tertiary hover:bg-surface-raised hover:text-fg'
                    }`}
                  >
                    <span className="truncate">{category}</span>
                    {isSelected && (
                      <svg
                        className="h-4 w-4 text-fg-muted"
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
                </li>
              )
            })}
          </ul>

          <div className="border-t border-edge-subtle bg-surface/40 p-1.5">
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={draftRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitDraft()
                    }
                  }}
                  placeholder="New category name"
                  className="flex-1 rounded border border-edge bg-surface-alt px-2 py-1 text-sm text-fg focus:border-edge-strong focus:outline-none"
                />
                <button
                  type="button"
                  onClick={commitDraft}
                  className="rounded bg-surface-invert px-2 py-1 text-xs font-medium text-fg-invert hover:bg-surface-invert-hover"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg-tertiary hover:bg-surface-raised hover:text-fg"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 4a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 10 4Z" />
                </svg>
                New category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
