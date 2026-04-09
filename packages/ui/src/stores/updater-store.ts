import { create } from 'zustand'
import type { Bridge } from '@paulus/bridge'
import type { UpdaterEvent, UpdaterState, UpdateInfo } from '@paulus/shared'

interface UpdaterStore extends UpdaterState {
  bannerDismissed: boolean
  _bridge: Bridge | null
  _unsubscribe: (() => void) | null

  init(bridge: Bridge): Promise<void>
  check(): Promise<void>
  download(): Promise<void>
  install(): Promise<void>
  dismissBanner(): void
}

function applyEvent(state: UpdaterState, event: UpdaterEvent): Partial<UpdaterState> {
  switch (event.type) {
    case 'checking-for-update':
      return { status: 'checking', error: null }
    case 'update-available':
      return { status: 'available', info: event.info, error: null }
    case 'update-not-available':
      return { status: 'not-available', info: event.info, error: null }
    case 'download-progress':
      return { status: 'downloading', progress: event.progress }
    case 'update-downloaded':
      return { status: 'downloaded', info: event.info, progress: null }
    case 'error':
      return { status: 'error', error: event.message }
    default:
      return state
  }
}

const initialInfo: UpdateInfo | null = null

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: 'idle',
  currentVersion: '0.0.0',
  info: initialInfo,
  progress: null,
  error: null,
  supported: true,
  bannerDismissed: false,
  _bridge: null,
  _unsubscribe: null,

  async init(bridge) {
    // Tear down any previous subscription first (HMR safety).
    const prev = get()._unsubscribe
    if (prev) prev()

    const unsubscribe = bridge.updater.onEvent((event) => {
      set((s) => {
        const patch = applyEvent(s, event)
        // A new update appearing should un-dismiss any previously-dismissed banner
        // so the user sees the new version.
        if (
          event.type === 'update-available' &&
          (!s.info || s.info.version !== event.info.version)
        ) {
          return { ...patch, bannerDismissed: false }
        }
        return patch
      })
    })

    set({ _bridge: bridge, _unsubscribe: unsubscribe })

    try {
      const state = await bridge.updater.getState()
      set({
        status: state.status,
        currentVersion: state.currentVersion,
        info: state.info,
        progress: state.progress,
        error: state.error,
        supported: state.supported,
      })
    } catch {
      // Bridge may not have updater surface (e.g. web bridge) — ignore.
    }
  },

  async check() {
    const bridge = get()._bridge
    if (!bridge) return
    try {
      await bridge.updater.check()
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  async download() {
    const bridge = get()._bridge
    if (!bridge) return
    try {
      await bridge.updater.download()
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  async install() {
    const bridge = get()._bridge
    if (!bridge) return
    try {
      await bridge.updater.install()
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  dismissBanner() {
    set({ bannerDismissed: true })
  },
}))
