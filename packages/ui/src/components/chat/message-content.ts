import type { ThreadMessageLike } from '@assistant-ui/react'
import type {
  AICommandToolOutput,
  AIEvent,
  AIMessage,
  AIToolKind,
  AIToolStatus,
} from '@paulus/shared'

type ToolArtifact = {
  kind?: AIToolKind
  status?: AIToolStatus
  title?: string
  command?: string
  explanation?: string
  stdout?: string
  stderr?: string
  stdoutTruncated?: boolean
  stderrTruncated?: boolean
  exitCode?: number
  error?: string
  startedAt?: string
  endedAt?: string
}

type MessageContent = Exclude<ThreadMessageLike['content'], string>
type MutableTextPart = { type: 'text'; text: string }
type MutableReasoningPart = { type: 'reasoning'; text: string }
type MutableToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  argsText: string
  result?: unknown
  isError?: boolean
  parentId?: string
  messages?: unknown[]
  artifact?: ToolArtifact
}
type MutableMessagePart = MutableTextPart | MutableReasoningPart | MutableToolCallPart
type MutableMessageContent = MutableMessagePart[]

function appendTextPart(
  parts: MutableMessageContent,
  type: 'text' | 'reasoning',
  text: string,
): void {
  if (!text) return

  const previous = parts.at(-1)
  if (previous?.type === type) {
    previous.text += text
    return
  }

  parts.push({ type, text })
}

function mergeArtifact(
  current: ToolArtifact | undefined,
  next: Partial<ToolArtifact> | undefined,
): ToolArtifact | undefined {
  if (!current && !next) return undefined
  return {
    ...(current ?? {}),
    ...(next ?? {}),
  }
}

function normalizeToolCallArgs(event: Extract<AIEvent, { type: 'tool_call' }>): {
  args: Record<string, unknown>
  argsText: string
} {
  return {
    args: event.args,
    argsText: event.argsText || JSON.stringify(event.args ?? {}, null, 2) || '{}',
  }
}

function getCommandOutput(output: unknown): AICommandToolOutput | null {
  if (!output || typeof output !== 'object') return null

  const candidate = output as Partial<AICommandToolOutput>
  if (
    typeof candidate.exitCode === 'number' &&
    candidate.stdout &&
    typeof candidate.stdout === 'object' &&
    typeof candidate.stdout.text === 'string' &&
    candidate.stderr &&
    typeof candidate.stderr === 'object' &&
    typeof candidate.stderr.text === 'string'
  ) {
    return candidate as AICommandToolOutput
  }

  return null
}

function upsertToolCall(
  parts: MutableMessageContent,
  toolIndex: Map<string, number>,
  toolCallId: string,
  patch: Omit<MutableToolCallPart, 'type' | 'toolCallId'> & { artifact?: Partial<ToolArtifact> },
): MutableToolCallPart {
  const existingIndex = toolIndex.get(toolCallId)
  const existing =
    existingIndex === undefined ? null : (parts[existingIndex] as MutableToolCallPart)
  const next: MutableToolCallPart = {
    type: 'tool-call',
    toolCallId,
    toolName: patch.toolName ?? existing?.toolName ?? 'tool',
    args: patch.args ?? existing?.args ?? {},
    argsText: patch.argsText ?? existing?.argsText ?? '{}',
    result: patch.result ?? existing?.result,
    isError: patch.isError ?? existing?.isError,
    parentId: patch.parentId ?? existing?.parentId,
    messages: patch.messages ?? existing?.messages,
    artifact: mergeArtifact(existing?.artifact as ToolArtifact | undefined, patch.artifact),
  }

  if (existingIndex === undefined) {
    parts.push(next)
    toolIndex.set(toolCallId, parts.length - 1)
    return next
  }

  parts[existingIndex] = next
  return next
}

export function buildMessageContent(message: AIMessage): MessageContent | string {
  if (message.role !== 'assistant') {
    return message.content
  }

  const events = message.events ?? []
  if (events.length === 0) {
    return message.content
  }

  const parts: MutableMessageContent = []
  const toolIndex = new Map<string, number>()

  for (const event of events) {
    switch (event.type) {
      case 'text':
        appendTextPart(parts, 'text', event.text)
        break
      case 'thinking':
        appendTextPart(parts, 'reasoning', event.text)
        break
      case 'tool_state': {
        const tool = event.tool
        const commandOutput = getCommandOutput(tool.output)
        const result =
          tool.result ??
          (commandOutput
            ? {
                exitCode: commandOutput.exitCode,
                stdout: commandOutput.stdout.text,
                stderr: commandOutput.stderr.text,
                stdoutTruncated: commandOutput.stdout.truncated,
                stderrTruncated: commandOutput.stderr.truncated,
              }
            : tool.error
              ? { error: tool.error }
              : undefined)

        upsertToolCall(parts, toolIndex, tool.id, {
          toolName: tool.toolName,
          args: tool.args,
          argsText: tool.argsText,
          result,
          isError:
            tool.isError ??
            (tool.status === 'error' || (commandOutput ? commandOutput.exitCode > 0 : false)),
          artifact: {
            kind: tool.kind,
            status: tool.status,
            title: tool.title,
            command: tool.command,
            explanation: tool.explanation,
            stdout: commandOutput?.stdout.text,
            stderr: commandOutput?.stderr.text,
            stdoutTruncated: commandOutput?.stdout.truncated,
            stderrTruncated: commandOutput?.stderr.truncated,
            exitCode: commandOutput?.exitCode,
            error: tool.error,
            startedAt: tool.startedAt,
            endedAt: tool.endedAt,
          },
        })
        break
      }
      case 'tool_call': {
        const { args, argsText } = normalizeToolCallArgs(event)
        upsertToolCall(parts, toolIndex, event.id, {
          toolName: event.toolName,
          args,
          argsText,
          artifact: {
            kind: 'tool',
            status: 'pending',
            title: event.title,
          },
        })
        break
      }
      case 'tool_result':
        upsertToolCall(parts, toolIndex, event.id, {
          toolName: 'tool',
          args: {},
          argsText: '{}',
          result: event.result,
          isError: event.isError,
          artifact: {
            kind: 'tool',
            status: event.isError ? 'error' : 'completed',
          },
        })
        break
      case 'command_proposal':
        upsertToolCall(parts, toolIndex, event.id, {
          toolName: 'paulus_exec_server_command',
          args: { command: event.command },
          argsText: JSON.stringify({ command: event.command }, null, 2),
          artifact: {
            kind: 'server-command',
            status: 'pending',
            title: 'Run On Server',
            command: event.command,
            explanation: event.explanation,
          },
        })
        break
      case 'command_running':
        upsertToolCall(parts, toolIndex, event.id, {
          toolName: 'paulus_exec_server_command',
          args: { command: event.command },
          argsText: JSON.stringify({ command: event.command }, null, 2),
          artifact: {
            kind: 'server-command',
            status: 'running',
            command: event.command,
          },
        })
        break
      case 'command_output': {
        const part = upsertToolCall(parts, toolIndex, event.id, {
          toolName: 'paulus_exec_server_command',
          args: {},
          argsText: '{}',
          artifact: {
            kind: 'server-command',
            [event.stream]: `${((parts[toolIndex.get(event.id) ?? -1] as MutableToolCallPart | undefined)?.artifact as ToolArtifact | undefined)?.[event.stream] ?? ''}${event.data}`,
          },
        })

        const artifact = (part.artifact ?? {}) as ToolArtifact
        part.result = {
          exitCode: artifact.exitCode,
          stdout: artifact.stdout ?? '',
          stderr: artifact.stderr ?? '',
        }
        break
      }
      case 'command_done': {
        const part = upsertToolCall(parts, toolIndex, event.id, {
          toolName: 'paulus_exec_server_command',
          args: {},
          argsText: '{}',
          isError: event.exitCode > 0,
          artifact: {
            kind: 'server-command',
            status: event.exitCode === -1 ? 'rejected' : 'completed',
            exitCode: event.exitCode,
          },
        })

        const artifact = (part.artifact ?? {}) as ToolArtifact
        part.result =
          event.exitCode === -1
            ? { rejected: true }
            : {
                exitCode: event.exitCode,
                stdout: artifact.stdout ?? '',
                stderr: artifact.stderr ?? '',
              }
        break
      }
      case 'error':
        appendTextPart(parts, 'text', `\n\nError: ${event.message}`)
        break
      case 'done':
        break
    }
  }

  if (parts.length === 0) {
    return message.content
  }

  return parts as MessageContent
}
