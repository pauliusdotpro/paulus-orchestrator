import { SERVER_COLORS } from './server-colors'

interface ServerColorPickerProps {
  value: string | undefined
  onChange: (color: string | undefined) => void
}

export function ServerColorPicker({ value, onChange }: ServerColorPickerProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        aria-label="No color"
        aria-pressed={!value}
        className={`h-6 w-6 rounded-full border flex items-center justify-center text-zinc-500 hover:text-zinc-300 ${
          !value ? 'border-zinc-300' : 'border-zinc-700'
        }`}
      >
        <svg
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <line x1="4" y1="16" x2="16" y2="4" strokeLinecap="round" />
        </svg>
      </button>
      {SERVER_COLORS.map((color) => {
        const isSelected = value?.toLowerCase() === color.value.toLowerCase()
        return (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            aria-label={color.name}
            aria-pressed={isSelected}
            title={color.name}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              isSelected ? 'border-zinc-100' : 'border-transparent'
            }`}
            style={{ backgroundColor: color.value }}
          />
        )
      })}
    </div>
  )
}
