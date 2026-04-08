import { useEffect } from 'react'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  type ReasoningMessagePartProps,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { AISessionConfig, AIProviderType, AIToolKind, AIToolStatus } from '@paulus/shared'
import { useChatStore, useSettingsStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import { useAssistantRuntime } from '../../hooks/use-assistant-runtime'
import { MarkdownText } from './markdown-text'
import { AI_PROVIDER_LABELS, getSupportedAIProviders } from '../../lib/ai'

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

interface ChatViewProps {
  serverId: string
  isConnected: boolean
  connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'error'
}

export function ChatView({ serverId, isConnected, connectionStatus }: ChatViewProps) {
  const bridge = useBridge()
  const {
    init,
    loadSessions,
    ensureDraftConfig,
    loadModels,
    activeSessionId,
    sessions,
    draftConfigs,
  } = useChatStore()
  const runtime = useAssistantRuntime(serverId)
  const activeSession = activeSessionId ? sessions[activeSessionId] : null
  const sessionForServer = activeSession?.serverId === serverId ? activeSession : null
  const selectedConfig: AISessionConfig | null = sessionForServer
    ? {
        provider: sessionForServer.provider,
        model: sessionForServer.model,
      }
    : (draftConfigs[serverId] ?? null)

  useEffect(() => {
    init(bridge)
    loadSessions(bridge, serverId)
    ensureDraftConfig(bridge, serverId).catch(() => {})
  }, [serverId])

  useEffect(() => {
    if (!selectedConfig) return
    loadModels(bridge, selectedConfig.provider).catch(() => {})
  }, [bridge, loadModels, selectedConfig?.provider])

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex-1 flex flex-col min-h-0">
        {!isConnected && (
          <div className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            {connectionStatus === 'connecting'
              ? 'Connecting. Session history is available now, and chat input will unlock once the server is connected.'
              : 'Viewing session history. Reconnect to continue chatting or approve commands.'}
          </div>
        )}

        <Thread serverId={serverId} isConnected={isConnected} />
      </div>
    </AssistantRuntimeProvider>
  )
}

function Thread({ serverId, isConnected }: { serverId: string; isConnected: boolean }) {
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <ThreadPrimitive.Empty>
          <div className="text-center text-zinc-600 py-12">
            <p className="text-sm">Ask the AI to inspect, debug, or manage this server.</p>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage: () => <AssistantMessage isConnected={isConnected} />,
          }}
        />
      </ThreadPrimitive.Viewport>

      <Composer serverId={serverId} isConnected={isConnected} />
    </ThreadPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] min-w-0 px-4 py-2.5 rounded-lg text-sm bg-zinc-800 text-zinc-100">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage({ isConnected }: { isConnected: boolean }) {
  return (
    <MessagePrimitive.Root>
      <div className="min-w-0 px-4 py-3 rounded-lg text-sm bg-zinc-900 border border-zinc-800 text-zinc-300 space-y-3">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: ReasoningPart,
            tools: {
              Override: (props) => <ToolCallPart {...props} isConnected={isConnected} />,
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

function Composer({ serverId, isConnected }: { serverId: string; isConnected: boolean }) {
  return (
    <ComposerPrimitive.Root className="border-t border-zinc-800/60 bg-zinc-900/50 px-4 py-3">
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/60 shadow-lg shadow-black/20 focus-within:border-zinc-600/70 transition-colors">
        <ComposerPrimitive.Input
          autoFocus={isConnected}
          disabled={!isConnected}
          placeholder={isConnected ? 'Ask about this server...' : 'Reconnect to continue chatting'}
          rows={1}
          className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
          <SessionConfigControls serverId={serverId} />
          <ComposerPrimitive.Send
            disabled={!isConnected}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed"
          >
            Send
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </ComposerPrimitive.Send>
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}

function SessionConfigControls({ serverId }: { serverId: string }) {
  const bridge = useBridge()
  const settings = useSettingsStore((state) => state.settings)
  const {
    activeSessionId,
    sessions,
    draftConfigs,
    modelOptions,
    modelLoadState,
    modelLoadErrors,
    isStreaming,
    setDraftConfig,
    updateSessionConfig,
    loadModels,
  } = useChatStore()
  const activeSession = activeSessionId ? sessions[activeSessionId] : null
  const sessionForServer = activeSession?.serverId === serverId ? activeSession : null

  const config: AISessionConfig | null = sessionForServer
    ? {
        provider: sessionForServer.provider,
        model: sessionForServer.model,
      }
    : (draftConfigs[serverId] ?? null)

  if (!settings || !config) return null

  const providerOptions = getSupportedAIProviders()
  const models = modelOptions[config.provider] ?? []
  const modelState = modelLoadState[config.provider] ?? 'idle'
  const modelError = modelLoadErrors[config.provider]
  const selectedModelMissing =
    Boolean(config.model) && !models.some((model) => model.id === config.model)
  const selectionDisabled = isStreaming

  const applyConfig = (nextConfig: AISessionConfig) => {
    if (sessionForServer) {
      updateSessionConfig(bridge, sessionForServer.id, nextConfig).catch(() => {})
      return
    }

    setDraftConfig(serverId, nextConfig)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={config.provider}
        disabled={selectionDisabled}
        onChange={(event) => {
          const provider = event.target.value as AIProviderType
          const nextConfig = {
            provider,
            model: null,
          } satisfies AISessionConfig
          applyConfig(nextConfig)
          loadModels(bridge, provider).catch(() => {})
        }}
        className="rounded-md border-none bg-zinc-700/40 px-2.5 py-1.5 text-[11px] text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 cursor-pointer hover:bg-zinc-700/60 transition-colors appearance-none"
      >
        {providerOptions.map((provider) => (
          <option key={provider} value={provider}>
            {AI_PROVIDER_LABELS[provider]}
          </option>
        ))}
      </select>

      <span className="text-zinc-600 text-[10px]">/</span>

      <select
        value={config.model ?? ''}
        disabled={selectionDisabled || (modelState === 'loading' && models.length === 0)}
        onChange={(event) =>
          applyConfig({
            provider: config.provider,
            model: event.target.value || null,
          })
        }
        className="max-w-44 rounded-md border-none bg-zinc-700/40 px-2.5 py-1.5 text-[11px] text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 cursor-pointer hover:bg-zinc-700/60 transition-colors appearance-none"
      >
        <option value="">Default model</option>
        {selectedModelMissing && config.model ? (
          <option value={config.model}>{config.model}</option>
        ) : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>

      {modelError ? (
        <span className="text-[10px] text-amber-400/80 ml-1" title={modelError}>
          !
        </span>
      ) : modelState === 'loading' ? (
        <span className="text-[10px] text-zinc-500 ml-1">Loading...</span>
      ) : null}
    </div>
  )
}

function ReasoningPart({ text }: ReasoningMessagePartProps) {
  return (
    <details open className="rounded-md border border-sky-900/70 bg-sky-950/30 overflow-hidden">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-sky-300">
        Thinking
      </summary>
      <div className="border-t border-sky-900/70 px-3 py-3 text-xs leading-5 text-sky-100/85 whitespace-pre-wrap">
        {text}
      </div>
    </details>
  )
}

function ToolCallPart({
  toolCallId,
  toolName,
  args,
  argsText,
  result,
  isError,
  artifact,
  isConnected,
}: ToolCallMessagePartProps & { isConnected: boolean }) {
  const bridge = useBridge()
  const { approveCommand, rejectCommand } = useChatStore()
  const meta = (artifact ?? {}) as ToolArtifact
  const isServerCommand =
    meta.kind === 'server-command' || toolName === 'paulus_exec_server_command'
  const status = meta.status ?? (result ? 'completed' : 'pending')
  const command = meta.command ?? (typeof args?.command === 'string' ? args.command : null)
  const title = meta.title ?? humanizeToolName(toolName)
  const exitCode =
    typeof meta.exitCode === 'number'
      ? meta.exitCode
      : typeof result === 'object' &&
          result &&
          'exitCode' in result &&
          typeof result.exitCode === 'number'
        ? result.exitCode
        : null
  const stdout =
    meta.stdout ??
    (typeof result === 'object' && result && 'stdout' in result && typeof result.stdout === 'string'
      ? result.stdout
      : '')
  const stderr =
    meta.stderr ??
    (typeof result === 'object' && result && 'stderr' in result && typeof result.stderr === 'string'
      ? result.stderr
      : '')
  const detailText =
    argsText && !isEmptyToolDetails(argsText) ? argsText : (formatToolArgs(args) ?? null)
  const showStatus =
    isServerCommand || status !== 'pending' || Boolean(detailText) || Boolean(result)
  const showApprovalActions = status === 'pending' && isServerCommand
  const showExitCode = typeof exitCode === 'number'
  const showGenericResult = !stdout && !stderr && Boolean(result) && !isServerCommand
  const hasBody =
    Boolean(command) ||
    Boolean(detailText) ||
    Boolean(meta.explanation) ||
    Boolean(meta.error) ||
    showApprovalActions ||
    showExitCode ||
    Boolean(stdout) ||
    Boolean(stderr) ||
    Boolean(meta.stdoutTruncated) ||
    Boolean(meta.stderrTruncated) ||
    showGenericResult ||
    status === 'rejected'

  return (
    <div className="rounded-md border border-amber-900/70 bg-amber-950/20 overflow-hidden">
      {hasBody ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 marker:content-none">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs text-zinc-500 transition-transform group-open:rotate-90">
                &gt;
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-300">
                  {title}
                </div>
                <div className="text-[11px] text-zinc-500 truncate">{toolName}</div>
              </div>
            </div>
            {showStatus ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(status)}`}
              >
                {statusLabel(status)}
              </span>
            ) : null}
          </summary>

          <div className="space-y-3 border-t border-amber-900/70 px-3 py-3">
            {command ? (
              <pre className="overflow-x-auto rounded bg-zinc-950 px-3 py-2 text-xs text-zinc-100 whitespace-pre-wrap">
                <code>{command}</code>
              </pre>
            ) : detailText ? (
              <pre className="overflow-x-auto rounded bg-zinc-950 px-3 py-2 text-xs text-zinc-100 whitespace-pre-wrap">
                <code>{detailText}</code>
              </pre>
            ) : null}

            {meta.explanation ? (
              <p className="text-xs leading-5 text-zinc-400">{meta.explanation}</p>
            ) : null}

            {meta.error ? <p className="text-xs leading-5 text-rose-300">{meta.error}</p> : null}

            {showApprovalActions ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => approveCommand(bridge, toolCallId)}
                  disabled={!isConnected}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  onClick={() => rejectCommand(bridge, toolCallId)}
                  disabled={!isConnected}
                  className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>
                {!isConnected ? (
                  <span className="text-[11px] text-zinc-500">
                    Reconnect to approve this command.
                  </span>
                ) : null}
              </div>
            ) : null}

            {showExitCode ? (
              <div className="text-xs text-zinc-400">
                Exit code:{' '}
                <span className={exitCode === 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {exitCode}
                </span>
              </div>
            ) : null}

            {stdout ? <OutputBlock label="stdout" tone="text-emerald-200" value={stdout} /> : null}

            {meta.stdoutTruncated ? (
              <p className="text-[11px] text-zinc-500">stdout was truncated for display.</p>
            ) : null}

            {stderr ? <OutputBlock label="stderr" tone="text-rose-200" value={stderr} /> : null}

            {meta.stderrTruncated ? (
              <p className="text-[11px] text-zinc-500">stderr was truncated for display.</p>
            ) : null}

            {showGenericResult ? (
              <OutputBlock
                label={isError ? 'error' : 'result'}
                tone={isError ? 'text-rose-200' : 'text-zinc-200'}
                value={formatValue(result)}
              />
            ) : null}

            {status === 'rejected' ? (
              <p className="text-xs text-zinc-400">Command rejected.</p>
            ) : null}
          </div>
        </details>
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-amber-300">
              {title}
            </div>
            <div className="text-[11px] text-zinc-500 truncate">{toolName}</div>
          </div>
          {showStatus ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(status)}`}
            >
              {statusLabel(status)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function OutputBlock({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <pre
        className={`overflow-x-auto rounded bg-zinc-950 px-3 py-2 text-xs whitespace-pre-wrap ${tone}`}
      >
        <code>{value}</code>
      </pre>
    </div>
  )
}

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/^paulus_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function statusLabel(status: ToolArtifact['status']): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'completed':
      return 'Complete'
    case 'error':
      return 'Error'
    case 'rejected':
      return 'Rejected'
    case 'pending':
    default:
      return 'Pending'
  }
}

function statusTone(status: ToolArtifact['status']): string {
  switch (status) {
    case 'running':
      return 'bg-sky-950 text-sky-300 border border-sky-900/70'
    case 'completed':
      return 'bg-emerald-950 text-emerald-300 border border-emerald-900/70'
    case 'error':
      return 'bg-rose-950 text-rose-300 border border-rose-900/70'
    case 'rejected':
      return 'bg-zinc-800 text-zinc-300 border border-zinc-700'
    case 'pending':
    default:
      return 'bg-amber-950 text-amber-300 border border-amber-900/70'
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isEmptyToolDetails(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '{}' || trimmed === '') return true

  try {
    const parsed = JSON.parse(trimmed)
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    )
  } catch {
    return false
  }
}

function formatToolArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  if (Object.keys(args).length === 0) return null
  return JSON.stringify(args, null, 2)
}
