import {
  AI_PROVIDER_TYPES,
  type AISessionConfig,
  type AIProviderType,
  isAIProviderType,
} from '@paulus/shared'

export const AI_PROVIDER_LABELS: Record<AIProviderType, string> = {
  'claude-acp': 'Claude ACP',
  'codex-acp': 'Codex ACP',
}

export function getSupportedAIProviders(): AIProviderType[] {
  return [...AI_PROVIDER_TYPES]
}

export function filterSupportedAIProviders(values: unknown[]): AIProviderType[] {
  return values.filter((value): value is AIProviderType => isAIProviderType(value))
}

export function formatSessionConfigLabel(config: AISessionConfig): string {
  const providerLabel = AI_PROVIDER_LABELS[config.provider]
  return config.model ? `${providerLabel} · ${config.model}` : providerLabel
}
