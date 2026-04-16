import type { AIEvent, AIModelOption, AIProviderType } from '@paulus/shared'
import { ClaudeAcpProvider } from './providers/claude-acp'
import { CodexAcpProvider } from './providers/codex-acp'

export interface AIServerContext {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  hasStoredPassword: boolean
  privateKeyPath?: string
  tags: string[]
  connected: boolean
}

export interface AIContext {
  /** All servers available in this session */
  servers: AIServerContext[]
  systemInfo?: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  onPaulusToolCall?: (toolName: string, args: Record<string, unknown>) => void
}

export interface AIProcess {
  events: AsyncIterable<AIEvent>
  write(input: string): void
  kill(): void
}

export interface AIRunOptions {
  model: string | null
}

export interface AIProvider {
  readonly name: string
  available(): Promise<boolean>
  listModels(): Promise<AIModelOption[]>
  spawn(prompt: string, context: AIContext, options: AIRunOptions): AIProcess
}

export function createProvider(type: AIProviderType): AIProvider {
  switch (type) {
    case 'claude-acp':
      return new ClaudeAcpProvider()
    case 'codex-acp':
      return new CodexAcpProvider()
    default:
      throw new Error(`Unknown AI provider: ${type}`)
  }
}
