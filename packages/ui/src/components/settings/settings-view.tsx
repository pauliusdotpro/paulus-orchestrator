import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import type {
  AIProviderType,
  AIProviderTestResult,
  AppDataOverview,
  PasswordStorageModeOption,
} from '@paulus/shared'

type GlobalSettingsTab = 'ai' | 'appearance' | 'terminal' | 'storage'

const PROVIDER_INFO: Record<AIProviderType, { label: string; description: string }> = {
  'claude-acp': {
    label: 'Claude (ACP)',
    description: 'Anthropic Claude via Agent Client Protocol — @zed-industries/claude-agent-acp',
  },
  'codex-acp': {
    label: 'Codex (ACP)',
    description: 'OpenAI Codex via Agent Client Protocol — @zed-industries/codex-acp',
  },
}

const TABS: Array<{ id: GlobalSettingsTab; label: string }> = [
  { id: 'ai', label: 'AI' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'storage', label: 'Data Storage' },
]

interface SettingsViewProps {
  onClose: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const bridge = useBridge()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [activeTab, setActiveTab] = useState<GlobalSettingsTab>('ai')
  const [appDataOverview, setAppDataOverview] = useState<AppDataOverview | null>(null)
  const [appDataError, setAppDataError] = useState<string | null>(null)
  const [appDataStatus, setAppDataStatus] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [providerTestResults, setProviderTestResults] = useState<
    Partial<Record<AIProviderType, AIProviderTestResult>>
  >({})
  const [providerTestError, setProviderTestError] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'storage') {
      return
    }

    let cancelled = false

    const loadOverview = async () => {
      try {
        setAppDataError(null)
        const overview = await bridge.appData.getOverview()
        if (!cancelled) {
          setAppDataOverview(overview)
        }
      } catch (error) {
        if (!cancelled) {
          setAppDataError(getErrorMessage(error))
        }
      }
    }

    loadOverview().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeTab, bridge])

  if (!settings) return null

  const handleProviderChange = (type: AIProviderType) => {
    updateSettings(bridge, { activeProvider: type })
  }

  const handleProviderTest = async (type: AIProviderType) => {
    try {
      setBusyAction(`test-provider-${type}`)
      setProviderTestError(null)
      const result = await bridge.settings.testProvider(type)
      setProviderTestResults((current) => ({ ...current, [type]: result }))
    } catch (error) {
      setProviderTestError(getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const handleOpenDirectory = async () => {
    try {
      setBusyAction('open-directory')
      setAppDataError(null)
      setAppDataStatus(null)
      await bridge.appData.openDirectory()
      setAppDataStatus('Opened the Paulus data directory.')
    } catch (error) {
      setAppDataError(getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const handleExportServers = async () => {
    try {
      setBusyAction('export-servers')
      setAppDataError(null)
      setAppDataStatus(null)
      const filePath = await bridge.appData.exportServers()
      if (filePath) {
        setAppDataStatus(`Exported servers and passwords to ${filePath}.`)
      }
    } catch (error) {
      setAppDataError(getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  const handlePasswordStorageModeChange = async (option: PasswordStorageModeOption) => {
    if (
      !appDataOverview ||
      option.mode === appDataOverview.passwordStorageMode ||
      !option.available
    ) {
      return
    }

    const confirmation =
      option.mode === 'safe-storage'
        ? 'Switch password storage to OS-backed encryption?\n\nThis rewrites credentials.json. Saved passwords will stop being readable as plaintext, and the CLI will no longer be able to reuse saved passwords until you switch back.'
        : 'Switch password storage to plaintext JSON?\n\nThis rewrites credentials.json and stores every saved password as readable text.'

    if (!window.confirm(confirmation)) {
      return
    }

    try {
      setBusyAction(`password-mode-${option.mode}`)
      setAppDataError(null)
      setAppDataStatus(null)
      const overview = await bridge.appData.setPasswordStorageMode(option.mode)
      setAppDataOverview(overview)
      setAppDataStatus(`Password storage mode changed to ${option.label}.`)
    } catch (error) {
      setAppDataError(getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
          <p className="text-xs text-zinc-500 mt-1">Global behavior, appearance, and storage.</p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-100 text-sm px-3 py-1.5 rounded-md hover:bg-zinc-800 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-2 overflow-x-auto py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'ai' && (
          <AIProviderTab
            activeProvider={settings.activeProvider}
            busyAction={busyAction}
            providerTestResults={providerTestResults}
            providerTestError={providerTestError}
            onChange={handleProviderChange}
            onTest={handleProviderTest}
          />
        )}

        {activeTab === 'appearance' && (
          <AppearanceTab
            theme={settings.theme}
            onThemeChange={(theme) => updateSettings(bridge, { theme })}
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalTab
            fontSize={settings.terminalFontSize}
            fontFamily={settings.terminalFontFamily}
            onFontSizeChange={(terminalFontSize) => updateSettings(bridge, { terminalFontSize })}
            onFontFamilyChange={(terminalFontFamily) =>
              updateSettings(bridge, { terminalFontFamily })
            }
          />
        )}

        {activeTab === 'storage' && (
          <DataStorageTab
            overview={appDataOverview}
            error={appDataError}
            status={appDataStatus}
            busyAction={busyAction}
            onOpenDirectory={handleOpenDirectory}
            onExportServers={handleExportServers}
            onPasswordStorageModeChange={handlePasswordStorageModeChange}
          />
        )}
      </div>

      <div className="border-t border-zinc-800 px-6 py-4 bg-zinc-950 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Changes save immediately.</p>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function AIProviderTab({
  activeProvider,
  busyAction,
  providerTestResults,
  providerTestError,
  onChange,
  onTest,
}: {
  activeProvider: AIProviderType
  busyAction: string | null
  providerTestResults: Partial<Record<AIProviderType, AIProviderTestResult>>
  providerTestError: string | null
  onChange: (type: AIProviderType) => void
  onTest: (type: AIProviderType) => Promise<void>
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">AI Provider</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Choose the default backend for new chat sessions. Active chats can override provider and
          model directly in the composer.
        </p>
        {providerTestError && <p className="text-xs text-red-400 mt-2">{providerTestError}</p>}
      </div>

      <div className="space-y-2">
        {(Object.keys(PROVIDER_INFO) as AIProviderType[]).map((type) => {
          const info = PROVIDER_INFO[type]
          const isActive = activeProvider === type
          const isTesting = busyAction === `test-provider-${type}`
          const testResult = providerTestResults[type]

          return (
            <div
              key={type}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                isActive
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => onChange(type)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div
                    className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                      isActive ? 'border-blue-400 bg-blue-400' : 'border-zinc-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-100">{info.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{info.description}</div>
                  </div>
                </button>

                <div className="flex items-center gap-2 pl-3">
                  {isActive && (
                    <span className="text-xs text-blue-400 font-medium flex-shrink-0">Default</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onTest(type).catch(() => {})
                    }}
                    disabled={busyAction !== null}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-3 text-xs ${
                    testResult.ok
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}
                >
                  <div className="font-medium">{testResult.detail}</div>
                  <div className="mt-1 text-zinc-300">
                    Tool: {testResult.toolName} · called: {testResult.toolCalled ? 'yes' : 'no'}
                  </div>
                  {testResult.responseText && (
                    <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-300 whitespace-pre-wrap break-words">
                      {testResult.responseText}
                    </div>
                  )}
                </div>
              )}

              {!testResult && isTesting && (
                <div className="mt-3 text-xs text-zinc-500">
                  Waiting for the provider to call the Paulus self-test tool and return a short
                  response.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AppearanceTab({
  theme,
  onThemeChange,
}: {
  theme: 'light' | 'dark' | 'system'
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">Appearance</h3>
        <p className="text-sm text-zinc-500 mt-1">Control the app theme.</p>
      </div>

      <div className="flex gap-2">
        {(['dark', 'light', 'system'] as const).map((option) => (
          <button
            key={option}
            onClick={() => onThemeChange(option)}
            className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
              theme === option
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  )
}

function TerminalTab({
  fontSize,
  fontFamily,
  onFontSizeChange,
  onFontFamilyChange,
}: {
  fontSize: number
  fontFamily: string
  onFontSizeChange: (fontSize: number) => void
  onFontFamilyChange: (fontFamily: string) => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">Terminal</h3>
        <p className="text-sm text-zinc-500 mt-1">Tune the embedded terminal rendering.</p>
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Font Size</label>
        <input
          type="number"
          min={10}
          max={24}
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value) || 14)}
          className="w-24 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Font Family</label>
        <input
          type="text"
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>
    </section>
  )
}

function DataStorageTab({
  overview,
  error,
  status,
  busyAction,
  onOpenDirectory,
  onExportServers,
  onPasswordStorageModeChange,
}: {
  overview: AppDataOverview | null
  error: string | null
  status: string | null
  busyAction: string | null
  onOpenDirectory: () => Promise<void>
  onExportServers: () => Promise<void>
  onPasswordStorageModeChange: (option: PasswordStorageModeOption) => Promise<void>
}) {
  const currentPasswordStorageOption = overview?.passwordStorageOptions.find(
    (option) => option.mode === overview.passwordStorageMode,
  )

  const storageLocations = overview
    ? [
        {
          label: 'Servers',
          description: 'Server definitions are stored as plain JSON.',
          path: overview.serversFile,
        },
        {
          label: 'Settings',
          description: 'Global app settings are stored as plain JSON.',
          path: overview.settingsFile,
        },
        {
          label: 'Passwords',
          description:
            currentPasswordStorageOption?.description ??
            'Saved passwords are stored in the credentials file.',
          path: overview.credentialsFile,
        },
        {
          label: 'Sessions',
          description:
            'Each chat session is stored as its own JSON file inside a per-server folder, with indexes alongside it.',
          path: `${overview.sessionFilePattern} and ${overview.sessionIndexFilePattern}`,
        },
      ]
    : []

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">Data Storage</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Make storage behavior explicit and export everything when needed.
        </p>
      </div>

      {!overview && !error && <div className="text-sm text-zinc-500">Loading storage details…</div>}

      {overview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="text-sm text-zinc-100">
              Paulus data directory: <span className="font-medium">{overview.dataDirectory}</span>
            </div>
            <div className="text-xs text-zinc-500">
              {overview.serverCount} servers, {overview.savedPasswordCount} saved passwords,{' '}
              {overview.sessionCount} stored sessions.
            </div>
          </div>

          <div className="space-y-3">
            {storageLocations.map((location) => (
              <div
                key={location.label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <div className="text-sm font-medium text-zinc-100">{location.label}</div>
                <div className="mt-1 text-xs text-zinc-500">{location.description}</div>
                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 break-all">
                  {location.path}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                onOpenDirectory().catch(() => {})
              }}
              disabled={busyAction !== null}
              className="px-4 py-2 rounded-lg text-sm bg-zinc-900 text-zinc-200 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busyAction === 'open-directory' ? 'Opening...' : 'Open data directory'}
            </button>
            <button
              onClick={() => {
                onExportServers().catch(() => {})
              }}
              disabled={busyAction !== null}
              className="px-4 py-2 rounded-lg text-sm bg-zinc-900 text-zinc-200 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busyAction === 'export-servers' ? 'Exporting...' : 'Export servers and passwords'}
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-zinc-500">
              Password storage is explicit. Switching modes rewrites `credentials.json`, and
              OS-backed encryption is not compatible with the CLI saved-password flow.
            </div>
            <div className="space-y-2">
              {overview.passwordStorageOptions.map((option) => {
                const isActive = option.mode === overview.passwordStorageMode
                const isBusy = busyAction === `password-mode-${option.mode}`

                return (
                  <button
                    key={option.mode}
                    onClick={() => {
                      onPasswordStorageModeChange(option).catch(() => {})
                    }}
                    disabled={busyAction !== null || (!option.available && !isActive)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                      isActive
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                          isActive ? 'border-emerald-400 bg-emerald-400' : 'border-zinc-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100">{option.label}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{option.description}</div>
                        {!option.available && option.unavailableReason && (
                          <div className="text-xs text-amber-400 mt-1">
                            {option.unavailableReason}
                          </div>
                        )}
                      </div>
                      <span
                        className={`ml-auto text-xs font-medium flex-shrink-0 ${
                          isActive ? 'text-emerald-400' : 'text-zinc-500'
                        }`}
                      >
                        {isBusy ? 'Switching...' : isActive ? 'Current' : 'Use'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {status && <div className="text-sm text-emerald-400">{status}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
    </section>
  )
}
