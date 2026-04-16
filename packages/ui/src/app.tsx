import { useEffect } from 'react'
import { useServerStore, useSettingsStore, useLayoutStore, useUpdaterStore } from './stores'
import { useBridge } from './hooks/use-bridge'
import { Sidebar } from './components/layout/sidebar'
import { MainPanel } from './components/layout/main-panel'
import { UpdateBanner } from './components/layout/update-banner'

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const isDark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export function App() {
  const bridge = useBridge()
  const initServers = useServerStore((s) => s.init)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const initLayout = useLayoutStore((s) => s.init)
  const initUpdater = useUpdaterStore((s) => s.init)
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const theme = useSettingsStore((s) => s.settings?.theme)

  // Apply theme class to <html> and listen for system preference changes
  useEffect(() => {
    const current = theme ?? 'dark'
    applyTheme(current)

    if (current !== 'system') return

    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    initServers(bridge).catch(() => {})
    initUpdater(bridge).catch(() => {})
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
    <div className="h-screen w-screen bg-surface text-fg flex flex-col overflow-hidden">
      <UpdateBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!sidebarCollapsed && <Sidebar />}
        <MainPanel />
      </div>
    </div>
  )
}
