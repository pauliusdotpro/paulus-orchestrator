import { create } from 'zustand'
import type { PanelLayout } from '@paulus/shared'
import type { Bridge } from '@paulus/bridge'

interface LayoutStore {
  sidebarCollapsed: boolean
  panelLayout: PanelLayout
  terminalWidth: number
  _bridge: Bridge | null

  init(
    bridge: Bridge,
    settings: { sidebarCollapsed?: boolean; panelLayout?: PanelLayout; terminalWidth?: number },
  ): void
  toggleSidebar(): void
  setPanelLayout(layout: PanelLayout): void
  setTerminalWidth(width: number): void
}

function persist(state: LayoutStore) {
  const bridge = state._bridge
  if (!bridge) return
  bridge.settings
    .update({
      sidebarCollapsed: state.sidebarCollapsed,
      panelLayout: state.panelLayout,
      terminalWidth: state.terminalWidth,
    })
    .catch(() => {})
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  sidebarCollapsed: false,
  panelLayout: 'split',
  terminalWidth: 480,
  _bridge: null,

  init(bridge, settings) {
    set({
      _bridge: bridge,
      sidebarCollapsed: settings.sidebarCollapsed ?? false,
      panelLayout: settings.panelLayout ?? 'split',
      terminalWidth: settings.terminalWidth ?? 480,
    })
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
    persist(get())
  },

  setPanelLayout(layout) {
    set({ panelLayout: layout })
    persist(get())
  },

  setTerminalWidth(width) {
    set({ terminalWidth: width })
    persist(get())
  },
}))
