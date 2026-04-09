import type { AICommandToolOutput, AIEvent, AITextPreview, AIToolState } from '@paulus/shared'

export const PAULUS_SERVER_COMMAND_TOOL = 'paulus_exec_server_command'
export const TOOL_OUTPUT_PREVIEW_LIMIT = 20_000

export interface CommandExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ToolStateInput {
  id: string
  toolName: string
  args?: Record<string, unknown>
  argsText?: string
  title?: string
  startedAt?: string
  endedAt?: string
  metadata?: Record<string, unknown>
}

export function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase()
}

export function normalizePaulusToolName(toolName: string): string {
  const normalized = normalizeToolName(toolName)
  if (normalized.includes(PAULUS_SERVER_COMMAND_TOOL)) {
    return PAULUS_SERVER_COMMAND_TOOL
  }

  if (normalized.includes('paulus_get_server_context')) {
    return 'paulus_get_server_context'
  }

  return toolName
}

export function createOutputPreview(
  value: string,
  limit = TOOL_OUTPUT_PREVIEW_LIMIT,
): AITextPreview {
  if (value.length <= limit) {
    return {
      text: value,
      truncated: false,
      omittedCharacters: 0,
    }
  }

  return {
    text: value.slice(0, limit),
    truncated: true,
    omittedCharacters: value.length - limit,
  }
}

export function createCommandToolOutput(
  result: CommandExecutionResult,
  limit = TOOL_OUTPUT_PREVIEW_LIMIT,
): AICommandToolOutput {
  return {
    exitCode: result.exitCode,
    stdout: createOutputPreview(result.stdout, limit),
    stderr: createOutputPreview(result.stderr, limit),
  }
}

export function formatCommandResultForModel(
  result: CommandExecutionResult,
  limit = TOOL_OUTPUT_PREVIEW_LIMIT,
): string {
  const output = createCommandToolOutput(result, limit)
  const stdoutTruncation = output.stdout.truncated
    ? `\n[stdout truncated; omitted ${output.stdout.omittedCharacters} characters]`
    : ''
  const stderrTruncation = output.stderr.truncated
    ? `\n[stderr truncated; omitted ${output.stderr.omittedCharacters} characters]`
    : ''

  return (
    `Command completed (exit ${output.exitCode}):\n` +
    `STDOUT:\n${output.stdout.text}${stdoutTruncation}\n` +
    `STDERR:\n${output.stderr.text}${stderrTruncation}`
  )
}

export function buildServerCommandToolState(
  input: Omit<ToolStateInput, 'toolName'> & {
    command: string
    status: AIToolState['status']
    explanation?: string
    output?: AICommandToolOutput
    error?: string
  },
): AIToolState {
  return {
    id: input.id,
    toolName: PAULUS_SERVER_COMMAND_TOOL,
    kind: 'server-command',
    status: input.status,
    args: input.args ?? { command: input.command },
    argsText: input.argsText ?? JSON.stringify({ command: input.command }, null, 2),
    title: input.title ?? 'Run On Server',
    command: input.command,
    explanation: input.explanation,
    output: input.output,
    error: input.error,
    isError: input.status === 'error' || Boolean(input.output && input.output.exitCode > 0),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    metadata: input.metadata,
  }
}

export function buildGenericToolState(
  input: ToolStateInput & {
    status: AIToolState['status']
    result?: unknown
    isError?: boolean
    error?: string
  },
): AIToolState {
  return {
    id: input.id,
    toolName: normalizePaulusToolName(input.toolName),
    kind: 'tool',
    status: input.status,
    args: input.args ?? {},
    argsText: input.argsText ?? JSON.stringify(input.args ?? {}, null, 2),
    title: input.title,
    result: input.result,
    isError: input.isError ?? input.status === 'error',
    error: input.error,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    metadata: input.metadata,
  }
}

export function buildInvalidToolState(input: ToolStateInput & { error: string }): AIToolState {
  return {
    id: input.id,
    toolName: input.toolName || 'invalid',
    kind: 'invalid',
    status: 'error',
    args: input.args ?? {},
    argsText: input.argsText ?? JSON.stringify(input.args ?? {}, null, 2),
    title: input.title ?? 'Invalid Tool Call',
    error: input.error,
    isError: true,
    endedAt: input.endedAt ?? new Date().toISOString(),
    metadata: input.metadata,
  }
}

export function toolStateEvent(tool: AIToolState): AIEvent {
  return {
    type: 'tool_state',
    tool,
  }
}
