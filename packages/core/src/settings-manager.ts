import type { AppSettings } from '@paulus/shared'
import { AI_PROVIDER_TYPES, DEFAULT_AI_PROVIDER, isAIProviderType } from '@paulus/shared'
import type { StorageService } from './storage'

const SETTINGS_KEY = 'settings'

const DEFAULT_SETTINGS: AppSettings = {
  activeProvider: DEFAULT_AI_PROVIDER,
  providers: [
    { type: 'claude-acp', cliPath: '', enabled: true },
    { type: 'codex-acp', cliPath: '', enabled: false },
  ],
  theme: 'dark',
  terminalFontSize: 14,
  terminalFontFamily: 'Menlo, Monaco, Consolas, monospace',
  sidebarCollapsed: false,
  panelLayout: 'split',
  terminalWidth: 480,
  anonymousMode: false,
}

export class SettingsManager {
  private settings: AppSettings | null = null

  constructor(private readonly storage: StorageService) {}

  async get(): Promise<AppSettings> {
    if (!this.settings) {
      const stored = await this.storage.get<AppSettings>(SETTINGS_KEY)
      const hasValidProviderList =
        stored?.providers.every((provider) => isAIProviderType(provider.type)) ?? false
      const hasValidActiveProvider = isAIProviderType(stored?.activeProvider)

      if (
        !stored ||
        !hasValidActiveProvider ||
        !hasValidProviderList ||
        stored.providers.length !== AI_PROVIDER_TYPES.length
      ) {
        this.settings = { ...DEFAULT_SETTINGS }
        await this.storage.set(SETTINGS_KEY, this.settings)
      } else {
        // Merge with defaults so new fields introduced after the settings file
        // was first written get populated instead of remaining undefined.
        this.settings = { ...DEFAULT_SETTINGS, ...stored }
      }
    }

    return this.settings
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get()
    this.settings = { ...current, ...partial }
    const hasValidProviderList = this.settings.providers.every((provider) =>
      isAIProviderType(provider.type),
    )
    if (!isAIProviderType(this.settings.activeProvider) || !hasValidProviderList) {
      this.settings = { ...DEFAULT_SETTINGS }
    }
    await this.storage.set(SETTINGS_KEY, this.settings)
    return this.settings
  }
}
