import { useUpdaterStore } from '../../stores'

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

export function UpdateBanner() {
  const status = useUpdaterStore((s) => s.status)
  const info = useUpdaterStore((s) => s.info)
  const progress = useUpdaterStore((s) => s.progress)
  const error = useUpdaterStore((s) => s.error)
  const dismissed = useUpdaterStore((s) => s.bannerDismissed)
  const dismiss = useUpdaterStore((s) => s.dismissBanner)
  const download = useUpdaterStore((s) => s.download)
  const install = useUpdaterStore((s) => s.install)

  // Only show the banner for states the user should act on.
  const shouldShow =
    !dismissed && (status === 'available' || status === 'downloading' || status === 'downloaded')

  if (!shouldShow) return null

  return (
    <div className="flex items-center justify-between gap-4 border-b border-blue-500/30 bg-blue-500/10 px-6 py-2.5 text-sm text-blue-100">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" aria-hidden />
        <div className="min-w-0">
          {status === 'available' && info && (
            <span>
              Update available — <span className="font-medium">v{info.version}</span>
            </span>
          )}
          {status === 'downloading' && (
            <span>
              Downloading update
              {progress ? ` — ${formatPercent(progress.percent)}` : '…'}
            </span>
          )}
          {status === 'downloaded' && info && (
            <span>
              Update downloaded — <span className="font-medium">v{info.version}</span>. Restart to
              install.
            </span>
          )}
          {error && <span className="ml-2 text-red-300">({error})</span>}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {status === 'available' && (
          <button
            type="button"
            onClick={() => {
              download().catch(() => {})
            }}
            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-400"
          >
            Download
          </button>
        )}
        {status === 'downloaded' && (
          <button
            type="button"
            onClick={() => {
              install().catch(() => {})
            }}
            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-400"
          >
            Restart &amp; install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20 hover:text-blue-100"
          aria-label="Dismiss update banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
