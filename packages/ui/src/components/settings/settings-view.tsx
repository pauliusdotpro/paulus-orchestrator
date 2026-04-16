import { useEffect, useState } from 'react'
import { useServerStore, useSettingsStore, useUpdaterStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import type {
  AIProviderType,
  AIProviderTestResult,
  AppDataOverview,
  PasswordStorageModeOption,
  RoyalTsxImportResult,
  UpdaterStatus,
} from '@paulus/shared'

type GlobalSettingsTab = 'ai' | 'appearance' | 'terminal' | 'storage' | 'updates'

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
  { id: 'updates', label: 'Updates' },
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

export async function syncRoyalTsxImportState({
  bridge,
  loadServers,
  setAppDataOverview,
}: {
  bridge: ReturnType<typeof useBridge>
  loadServers: (bridge: ReturnType<typeof useBridge>) => Promise<void>
  setAppDataOverview: (overview: AppDataOverview) => void
}): Promise<void> {
  await loadServers(bridge)
  setAppDataOverview(await bridge.appData.getOverview())
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const bridge = useBridge()
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const loadServers = useServerStore((s) => s.loadServers)
  const [activeTab, setActiveTab] = useState<GlobalSettingsTab>('ai')
  const [appDataOverview, setAppDataOverview] = useState<AppDataOverview | null>(null)
  const [appDataError, setAppDataError] = useState<string | null>(null)
  const [appDataStatus, setAppDataStatus] = useState<string | null>(null)
  const [royalTsxImportResult, setRoyalTsxImportResult] = useState<RoyalTsxImportResult | null>(
    null,
  )
  const [isRoyalTsxImportDialogOpen, setIsRoyalTsxImportDialogOpen] = useState(false)
  const [royalTsxDocumentPassword, setRoyalTsxDocumentPassword] = useState('')
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

  const handleOpenRoyalTsxImportDialog = () => {
    setAppDataError(null)
    setAppDataStatus(null)
    setRoyalTsxDocumentPassword('')
    setIsRoyalTsxImportDialogOpen(true)
  }

  const handleCloseRoyalTsxImportDialog = () => {
    if (busyAction === 'import-royal-tsx') {
      return
    }

    setRoyalTsxDocumentPassword('')
    setIsRoyalTsxImportDialogOpen(false)
  }

  const handleImportRoyalTsx = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setBusyAction('import-royal-tsx')
      setAppDataError(null)
      setAppDataStatus(null)
      const result = await bridge.appData.importRoyalTsx(royalTsxDocumentPassword)
      if (!result) {
        setRoyalTsxDocumentPassword('')
        setIsRoyalTsxImportDialogOpen(false)
        return
      }

      setRoyalTsxImportResult(result)
      await syncRoyalTsxImportState({
        bridge,
        loadServers,
        setAppDataOverview,
      })
      setRoyalTsxDocumentPassword('')
      setIsRoyalTsxImportDialogOpen(false)

      const skippedSummary =
        result.skippedServerCount > 0
          ? ` Skipped ${result.skippedServerCount} unsupported entr${
              result.skippedServerCount === 1 ? 'y' : 'ies'
            }.`
          : ''

      setAppDataStatus(
        `Imported ${result.importedServerCount} Royal TSX SSH server${
          result.importedServerCount === 1 ? '' : 's'
        } and saved ${result.savedPasswordCount} password${
          result.savedPasswordCount === 1 ? '' : 's'
        } from ${result.filePath}.${skippedSummary}`,
      )
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
    <div className="flex-1 flex flex-col min-h-0 bg-surface">
      <div className="px-6 py-4 border-b border-edge-subtle flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Settings</h2>
          <p className="text-xs text-fg-faint mt-1">Global behavior, appearance, and storage.</p>
        </div>
        <button
          onClick={onClose}
          className="text-fg-muted hover:text-fg text-sm px-3 py-1.5 rounded-md hover:bg-surface-raised transition-colors"
        >
          Close
        </button>
      </div>

      <div className="border-b border-edge-subtle px-6">
        <div className="flex gap-2 overflow-x-auto py-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-surface-invert text-fg-invert'
                  : 'text-fg-muted hover:text-fg hover:bg-surface-raised'
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
            anonymousMode={settings.anonymousMode ?? false}
            onThemeChange={(theme) => updateSettings(bridge, { theme })}
            onAnonymousModeChange={(anonymousMode) => updateSettings(bridge, { anonymousMode })}
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
            importResult={royalTsxImportResult}
            busyAction={busyAction}
            onOpenDirectory={handleOpenDirectory}
            onExportServers={handleExportServers}
            onOpenRoyalTsxImportDialog={handleOpenRoyalTsxImportDialog}
            onPasswordStorageModeChange={handlePasswordStorageModeChange}
          />
        )}

        {activeTab === 'updates' && <UpdatesTab />}
      </div>

      <div className="border-t border-edge-subtle px-6 py-4 bg-surface flex items-center justify-between gap-3">
        <p className="text-xs text-fg-faint">Changes save immediately.</p>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-fg-muted hover:text-fg-secondary"
        >
          Close
        </button>
      </div>

      {isRoyalTsxImportDialogOpen && (
        <RoyalTsxImportDialog
          documentPassword={royalTsxDocumentPassword}
          busyAction={busyAction}
          onPasswordChange={setRoyalTsxDocumentPassword}
          onCancel={handleCloseRoyalTsxImportDialog}
          onSubmit={handleImportRoyalTsx}
        />
      )}
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
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">
          AI Provider
        </h3>
        <p className="text-sm text-fg-faint mt-1">
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
                  : 'border-edge-subtle bg-surface-alt hover:border-edge hover:bg-surface-raised/50'
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
                      isActive ? 'border-blue-400 bg-blue-400' : 'border-edge-strong'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-fg">{info.label}</div>
                    <div className="text-xs text-fg-faint mt-0.5">{info.description}</div>
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
                    className="rounded-md border border-edge px-3 py-1.5 text-xs text-fg-secondary hover:border-edge-strong disabled:cursor-not-allowed disabled:opacity-50"
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
                  <div className="mt-1 text-fg-tertiary">
                    Tool: {testResult.toolName} · called: {testResult.toolCalled ? 'yes' : 'no'}
                  </div>
                  {testResult.responseText && (
                    <div className="mt-2 rounded-md border border-edge-subtle bg-surface/80 px-3 py-2 text-fg-tertiary whitespace-pre-wrap break-words">
                      {testResult.responseText}
                    </div>
                  )}
                </div>
              )}

              {!testResult && isTesting && (
                <div className="mt-3 text-xs text-fg-faint">
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
  anonymousMode,
  onThemeChange,
  onAnonymousModeChange,
}: {
  theme: 'light' | 'dark' | 'system'
  anonymousMode: boolean
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void
  onAnonymousModeChange: (anonymousMode: boolean) => void
}) {
  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">Appearance</h3>
        <p className="text-sm text-fg-faint mt-1">Control the app theme.</p>
      </div>

      <div className="flex gap-2">
        {(['dark', 'light', 'system'] as const).map((option) => (
          <button
            key={option}
            onClick={() => onThemeChange(option)}
            className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
              theme === option
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-surface-alt text-fg-muted border border-edge-subtle hover:border-edge'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="pt-2 border-t border-edge-subtle">
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">Privacy</h3>
        <p className="text-sm text-fg-faint mt-1">
          Useful for screen sharing, demos, or recordings.
        </p>

        <label className="mt-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={anonymousMode}
            onChange={(e) => onAnonymousModeChange(e.target.checked)}
            className="mt-0.5 rounded border-edge-strong bg-surface-raised"
          />
          <div>
            <div className="text-sm text-fg-secondary">Anonymous mode</div>
            <div className="text-xs text-fg-faint mt-0.5">
              Hide sensitive connection details — host, IP, username, and port — by masking them
              with asterisks (e.g. <span className="font-mono">***.***.***.***</span>). Your server
              configuration is unchanged; only the display is masked.
            </div>
          </div>
        </label>
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
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">Terminal</h3>
        <p className="text-sm text-fg-faint mt-1">Tune the embedded terminal rendering.</p>
      </div>

      <div>
        <label className="block text-xs text-fg-faint mb-1.5">Font Size</label>
        <input
          type="number"
          min={10}
          max={24}
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value) || 14)}
          className="w-24 px-3 py-2 bg-surface-alt border border-edge rounded-md text-sm text-fg focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs text-fg-faint mb-1.5">Font Family</label>
        <input
          type="text"
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-surface-alt border border-edge rounded-md text-sm text-fg focus:outline-none focus:border-blue-500"
        />
      </div>
    </section>
  )
}

function DataStorageTab({
  overview,
  error,
  status,
  importResult,
  busyAction,
  onOpenDirectory,
  onExportServers,
  onOpenRoyalTsxImportDialog,
  onPasswordStorageModeChange,
}: {
  overview: AppDataOverview | null
  error: string | null
  status: string | null
  importResult: RoyalTsxImportResult | null
  busyAction: string | null
  onOpenDirectory: () => Promise<void>
  onExportServers: () => Promise<void>
  onOpenRoyalTsxImportDialog: () => void
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
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">
          Data Storage
        </h3>
        <p className="text-sm text-fg-faint mt-1">
          Make storage behavior explicit and export everything when needed.
        </p>
      </div>

      {!overview && !error && <div className="text-sm text-fg-faint">Loading storage details…</div>}

      {overview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-edge-subtle bg-surface-alt/60 p-4 space-y-2">
            <div className="text-sm text-fg">
              Paulus data directory: <span className="font-medium">{overview.dataDirectory}</span>
            </div>
            <div className="text-xs text-fg-faint">
              {overview.serverCount} servers, {overview.savedPasswordCount} saved passwords,{' '}
              {overview.sessionCount} stored sessions.
            </div>
          </div>

          <div className="space-y-3">
            {storageLocations.map((location) => (
              <div
                key={location.label}
                className="rounded-xl border border-edge-subtle bg-surface-alt/60 p-4"
              >
                <div className="text-sm font-medium text-fg">{location.label}</div>
                <div className="mt-1 text-xs text-fg-faint">{location.description}</div>
                <div className="mt-3 rounded-md border border-edge-subtle bg-surface px-3 py-2 text-xs text-fg-tertiary break-all">
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
              className="px-4 py-2 rounded-lg text-sm bg-surface-alt text-fg-secondary border border-edge-subtle hover:border-edge disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busyAction === 'open-directory' ? 'Opening...' : 'Open data directory'}
            </button>
            <button
              onClick={() => {
                onExportServers().catch(() => {})
              }}
              disabled={busyAction !== null}
              className="px-4 py-2 rounded-lg text-sm bg-surface-alt text-fg-secondary border border-edge-subtle hover:border-edge disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busyAction === 'export-servers' ? 'Exporting...' : 'Export servers and passwords'}
            </button>
            <button
              onClick={() => {
                onOpenRoyalTsxImportDialog()
              }}
              disabled={busyAction !== null}
              className="px-4 py-2 rounded-lg text-sm bg-blue-500/15 text-blue-200 border border-blue-500/30 hover:border-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busyAction === 'import-royal-tsx' ? 'Importing...' : 'Import Royal TSX'}
            </button>
          </div>

          {importResult && (
            <div className="rounded-xl border border-edge-subtle bg-surface-alt/60 p-4 space-y-3">
              <div>
                <div className="text-sm font-medium text-fg">Last Royal TSX import</div>
                <div className="mt-1 text-xs text-fg-faint break-all">{importResult.filePath}</div>
              </div>
              <div className="grid gap-2 text-xs text-fg-tertiary sm:grid-cols-2">
                <div>Imported servers: {importResult.importedServerCount}</div>
                <div>Saved passwords: {importResult.savedPasswordCount}</div>
                <div>Encrypted secrets read: {importResult.encryptedSecretCount}</div>
                <div>Skipped entries: {importResult.skippedServerCount}</div>
              </div>
              {importResult.skippedServers.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-fg-muted uppercase tracking-wide">
                    Skipped entries
                  </div>
                  {importResult.skippedServers.map((entry) => (
                    <div
                      key={`${entry.name}:${entry.reason}`}
                      className="rounded-md border border-edge-subtle bg-surface px-3 py-2"
                    >
                      <div className="text-sm text-fg">{entry.name}</div>
                      <div className="mt-1 text-xs text-fg-faint">{entry.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs text-fg-faint">
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
                        : 'border-edge-subtle bg-surface-alt hover:border-edge hover:bg-surface-raised/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                          isActive ? 'border-emerald-400 bg-emerald-400' : 'border-edge-strong'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-fg">{option.label}</div>
                        <div className="text-xs text-fg-faint mt-0.5">{option.description}</div>
                        {!option.available && option.unavailableReason && (
                          <div className="text-xs text-amber-400 mt-1">
                            {option.unavailableReason}
                          </div>
                        )}
                      </div>
                      <span
                        className={`ml-auto text-xs font-medium flex-shrink-0 ${
                          isActive ? 'text-emerald-400' : 'text-fg-faint'
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

function formatStatusLabel(status: UpdaterStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return 'Update available'
    case 'not-available':
      return 'Up to date'
    case 'downloading':
      return 'Downloading update…'
    case 'downloaded':
      return 'Update ready to install'
    case 'error':
      return 'Error'
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function UpdatesTab() {
  const status = useUpdaterStore((s) => s.status)
  const currentVersion = useUpdaterStore((s) => s.currentVersion)
  const info = useUpdaterStore((s) => s.info)
  const progress = useUpdaterStore((s) => s.progress)
  const error = useUpdaterStore((s) => s.error)
  const supported = useUpdaterStore((s) => s.supported)
  const check = useUpdaterStore((s) => s.check)
  const download = useUpdaterStore((s) => s.download)
  const install = useUpdaterStore((s) => s.install)

  const isBusy = status === 'checking' || status === 'downloading'

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-fg-tertiary uppercase tracking-wide">Updates</h3>
        <p className="text-sm text-fg-faint mt-1">
          Paulus Orchestrator checks for updates on startup. You can also check manually.
        </p>
      </div>

      <div className="rounded-xl border border-edge-subtle bg-surface-alt/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-fg-faint">Current version</div>
            <div className="mt-1 text-sm font-medium text-fg">v{currentVersion}</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-xs uppercase tracking-wide text-fg-faint">Status</div>
            <div
              className={`mt-1 text-sm font-medium ${
                status === 'error'
                  ? 'text-red-400'
                  : status === 'available' || status === 'downloaded'
                    ? 'text-blue-300'
                    : 'text-fg-secondary'
              }`}
            >
              {formatStatusLabel(status)}
            </div>
          </div>
        </div>

        {!supported && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Auto-update is disabled in dev builds. Run a packaged build to test updates.
          </div>
        )}

        {(status === 'available' || status === 'downloaded') && info && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
            <div className="font-medium">v{info.version}</div>
            {info.releaseDate && (
              <div className="mt-0.5 text-blue-200/80">
                Released {new Date(info.releaseDate).toLocaleDateString()}
              </div>
            )}
            {info.releaseNotes && (
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-fg-secondary">
                {info.releaseNotes}
              </pre>
            )}
          </div>
        )}

        {status === 'downloading' && progress && (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full bg-blue-500 transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>
                {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
              </span>
              <span>{formatBytes(progress.bytesPerSecond)}/s</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              check().catch(() => {})
            }}
            disabled={!supported || isBusy}
            className="rounded-md border border-edge bg-surface-alt px-3 py-1.5 text-xs text-fg-secondary hover:border-edge-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>

          {status === 'available' && (
            <button
              type="button"
              onClick={() => {
                download().catch(() => {})
              }}
              disabled={!supported}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download update
            </button>
          )}

          {status === 'downloaded' && (
            <button
              type="button"
              onClick={() => {
                install().catch(() => {})
              }}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400"
            >
              Restart &amp; install
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

export function RoyalTsxImportDialog({
  documentPassword,
  busyAction,
  onPasswordChange,
  onCancel,
  onSubmit,
}: {
  documentPassword: string
  busyAction: string | null
  onPasswordChange: (value: string) => void
  onCancel: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={(event) => {
          onSubmit(event).catch(() => {})
        }}
        className="w-[28rem] space-y-4 rounded-lg border border-edge bg-surface-alt p-6"
      >
        <div>
          <h2 className="text-lg font-medium text-fg">Import Royal TSX</h2>
          <p className="mt-1 text-sm text-fg-faint">
            Choose your `.rtsz` file next. Enter the document password only if the Royal document is
            password-protected.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-fg-muted">Royal TSX Document Password</label>
          <input
            type="password"
            value={documentPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="w-full rounded border border-edge bg-surface-raised px-3 py-2 text-sm text-fg focus:outline-none focus:border-edge-strong"
            placeholder="Leave blank if the document has no password"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busyAction === 'import-royal-tsx'}
            className="px-4 py-2 text-sm text-fg-muted hover:text-fg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busyAction === 'import-royal-tsx'}
            className="rounded bg-surface-invert px-4 py-2 text-sm text-fg-invert hover:bg-surface-invert-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === 'import-royal-tsx' ? 'Importing...' : 'Choose File'}
          </button>
        </div>
      </form>
    </div>
  )
}
