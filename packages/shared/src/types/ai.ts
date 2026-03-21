export type AIProviderType = 'claude-acp' | 'codex-acp'

export const AI_PROVIDER_TYPES = ['claude-acp', 'codex-acp'] as const
export const DEFAULT_AI_PROVIDER: AIProviderType = 'claude-acp'

export function isAIProviderType(value: unknown): value is AIProviderType {
  return typeof value === 'string' && AI_PROVIDER_TYPES.includes(value as AIProviderType)
}

export interface AIModelOption {
  id: string
  name: string
  description?: string
}

export interface AIProviderConfig {
  type: AIProviderType
  cliPath: string
  enabled: boolean
}

export interface AIProviderTestResult {
  provider: AIProviderType
  ok: boolean
  toolCalled: boolean
  toolName: string
  responseText: string
  detail: string
}

export type TerminalLineType = 'stdout' | 'stderr' | 'stdin' | 'system'

export interface TerminalLine {
  id: number
  text: string
  type: TerminalLineType
}

export interface TerminalSessionState {
  lines: TerminalLine[]
  history: string[]
}

export type AIEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool_call'
      id: string
      toolName: string
      args: Record<string, unknown>
      argsText: string
      title?: string
    }
  | {
      type: 'tool_result'
      id: string
      result: unknown
      isError?: boolean
    }
  | { type: 'command_proposal'; id: string; command: string; explanation: string }
  | { type: 'command_running'; id: string; command: string }
  | { type: 'command_output'; id: string; data: string; stream: 'stdout' | 'stderr' }
  | { type: 'command_done'; id: string; exitCode: number }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  events?: AIEvent[]
  timestamp: string
}

export interface AISession {
  id: string
  serverId: string
  messages: AIMessage[]
  provider: AIProviderType
  model: string | null
  createdAt: string
  updatedAt: string
}

export interface AISessionConfig {
  provider: AIProviderType
  model: string | null
}
