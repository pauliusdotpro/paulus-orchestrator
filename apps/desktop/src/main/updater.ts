import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo as ElectronUpdateInfo, ProgressInfo } from 'electron-updater'
import type { UpdaterEvent, UpdateInfo, UpdaterState } from '@paulus/shared'

const isDev = !app.isPackaged

let state: UpdaterState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  info: null,
  progress: null,
  error: null,
  // electron-updater only works in packaged builds; in dev we surface
  // a clear disabled state instead of triggering dev-update-config errors.
  supported: !isDev,
}

let win: BrowserWindow | null = null
let wired = false

function sanitizeInfo(info: ElectronUpdateInfo): UpdateInfo {
  return {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes:
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note ?? '').join('\n\n')
          : null,
    releaseDate: info.releaseDate ?? null,
  }
}

function emit(event: UpdaterEvent): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('updater:event', event)
}

function setState(patch: Partial<UpdaterState>): void {
  state = { ...state, ...patch }
}

function wire(): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = {
    info: (msg) => console.log('[updater]', msg),
    warn: (msg) => console.warn('[updater]', msg),
    error: (msg) => console.error('[updater]', msg),
    debug: () => {},
  }

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: null })
    emit({ type: 'checking-for-update' })
  })

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    const clean = sanitizeInfo(info)
    setState({ status: 'available', info: clean, error: null })
    emit({ type: 'update-available', info: clean })
  })

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    const clean = sanitizeInfo(info)
    setState({ status: 'not-available', info: clean, error: null })
    emit({ type: 'update-not-available', info: clean })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const clean = {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    }
    setState({ status: 'downloading', progress: clean })
    emit({ type: 'download-progress', progress: clean })
  })

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    const clean = sanitizeInfo(info)
    setState({ status: 'downloaded', info: clean, progress: null })
    emit({ type: 'update-downloaded', info: clean })
  })

  autoUpdater.on('error', (err: Error) => {
    const message = err?.message ?? String(err)
    setState({ status: 'error', error: message })
    emit({ type: 'error', message })
  })
}

export function initUpdater(browserWindow: BrowserWindow): void {
  win = browserWindow

  if (!state.supported) {
    console.log('[updater] disabled in dev — skipping auto-check')
    return
  }

  wire()

  // Silent startup check — never blocks the UI, only surfaces if an update is found.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] startup check failed:', err)
  })
}

export function getUpdaterState(): UpdaterState {
  return state
}

export async function checkForUpdates(): Promise<UpdaterState> {
  if (!state.supported) {
    return state
  }

  wire()

  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setState({ status: 'error', error: message })
    emit({ type: 'error', message })
  }

  return state
}

export async function downloadUpdate(): Promise<UpdaterState> {
  if (!state.supported) {
    return state
  }

  wire()

  try {
    setState({ status: 'downloading', error: null })
    await autoUpdater.downloadUpdate()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setState({ status: 'error', error: message })
    emit({ type: 'error', message })
  }

  return state
}

export function quitAndInstall(): void {
  if (!state.supported) return
  // isSilent=false, isForceRunAfter=true — show installer on Windows, relaunch after install.
  autoUpdater.quitAndInstall(false, true)
}
