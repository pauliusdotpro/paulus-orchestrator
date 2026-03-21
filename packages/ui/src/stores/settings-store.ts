import { create } from 'zustand'
import type { AppSettings } from '@paulus/shared'
import type { Bridge } from '@paulus/bridge'

type SettingsView = 'none' | 'global' | 'server'

interface SettingsStore {
  settings: AppSettings | null
  activeView: SettingsView
  editingServerId: string | null
  openGlobalSettings(): void
  openServerSettings(serverId: string): void
  closeSettingsView(): void
  loadSettings(bridge: Bridge): Promise<AppSettings>
  updateSettings(bridge: Bridge, partial: Partial<AppSettings>): Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  activeView: 'none',
  editingServerId: null,

  openGlobalSettings() {
    set({ activeView: 'global', editingServerId: null })
  },

  openServerSettings(serverId) {
    set({ activeView: 'server', editingServerId: serverId })
  },

  closeSettingsView() {
    set({ activeView: 'none', editingServerId: null })
  },

  async loadSettings(bridge) {
    const settings = await bridge.settings.get()
    set({ settings })
    return settings
  },

  async updateSettings(bridge, partial) {
    const settings = await bridge.settings.update(partial)
    set({ settings })
  },
}))
