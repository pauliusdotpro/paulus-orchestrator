import { useEffect } from 'react'
import { useServerStore, useSettingsStore, useLayoutStore } from './stores'
import { useBridge } from './hooks/use-bridge'
import { Sidebar } from './components/layout/sidebar'
import { MainPanel } from './components/layout/main-panel'

export function App() {
  const bridge = useBridge()
  const initServers = useServerStore((s) => s.init)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const initLayout = useLayoutStore((s) => s.init)
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)

  useEffect(() => {
    initServers(bridge).catch(() => {})
    loadSettings(bridge)
      .then((settings) => {
        if (settings) {
          initLayout(bridge, {
            sidebarCollapsed: settings.sidebarCollapsed,
            panelLayout: settings.panelLayout,
            terminalWidth: settings.terminalWidth,
          })
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100 flex overflow-hidden">
      {!sidebarCollapsed && <Sidebar />}
      <MainPanel />
    </div>
  )
}
