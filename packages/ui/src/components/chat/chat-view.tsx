import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  type ReasoningMessagePartProps,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { AISessionConfig, AIProviderType, AIToolKind, AIToolStatus } from '@paulus/shared'
import { useChatStore, useServerStore, useSettingsStore } from '../../stores'
import { useBridge } from '../../hooks/use-bridge'
import { useAssistantRuntime } from '../../hooks/use-assistant-runtime'
import { MarkdownText } from './markdown-text'
import { AI_PROVIDER_LABELS, getSupportedAIProviders } from '../../lib/ai'
import { setNextSendMode } from '../../hooks/use-assistant-runtime'

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
  const [debugMode, setDebugMode] = useState(false)
  const {
    init,
    loadSessions,
    ensureDraftConfig,
    loadModels,
    activeSessionId,
    sessions,
    draftConfigs,
  } = useChatStore()
  const servers = useServerStore((s) => s.servers)
  const activeSession = activeSessionId ? sessions[activeSessionId] : null
  // Use the session's serverIds (multi-server) or fall back to the single selected server
  const sessionServerIds = activeSession?.serverIds ?? [serverId]
  const isMultiServer = sessionServerIds.length > 1
  const runtime = useAssistantRuntime(sessionServerIds)
  const sessionForServer = activeSession?.serverIds.includes(serverId) ? activeSession : null
  const serverNamesList = useMemo(
    () => sessionServerIds.map((id) => servers.find((s) => s.id === id)?.name ?? id).join(', '),
    [sessionServerIds, servers],
  )
  const selectedConfig: AISessionConfig | null = sessionForServer
    ? {
        provider: sessionForServer.provider,
        model: sessionForServer.model,
        yoloMode: sessionForServer.yoloMode,
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
          <div className="border-b border-edge-subtle px-4 py-2 text-xs text-fg-faint">
            {connectionStatus === 'connecting'
              ? 'Connecting. Session history is available now, and chat input will unlock once the server is connected.'
              : 'Viewing session history. Reconnect to continue chatting or approve commands.'}
          </div>
        )}

        {isMultiServer && (
          <div className="border-b border-sky-900/50 bg-sky-950/30 px-4 py-2 text-xs text-sky-300">
            Multi-server session: {serverNamesList}
          </div>
        )}

        {selectedConfig?.yoloMode ? (
          <div className="border-b border-red-900/70 bg-red-950/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-red-200">
            Danger: YOLO mode is on. AI command tool calls auto-approve for this chat.
          </div>
        ) : null}

        <Thread
          serverId={serverId}
          isConnected={isConnected}
          isMultiServer={isMultiServer}
          debugMode={debugMode}
          setDebugMode={setDebugMode}
        />
      </div>
    </AssistantRuntimeProvider>
  )
}

function Thread({
  serverId,
  isConnected,
  isMultiServer,
  debugMode,
  setDebugMode,
}: {
  serverId: string
  isConnected: boolean
  isMultiServer: boolean
  debugMode: boolean
  setDebugMode: (v: boolean) => void
}) {
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <ThreadPrimitive.Empty>
          <div className="text-center text-fg-dim py-12">
            <p className="text-sm">
              {isMultiServer
                ? 'Ask the AI to work across your servers — compare configs, set up replication, and more.'
                : 'Ask the AI to inspect, debug, or manage this server.'}
            </p>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => <UserMessage />,
            AssistantMessage: () => <AssistantMessage isConnected={isConnected} />,
          }}
        />
      </ThreadPrimitive.Viewport>

      {debugMode && <SessionDebugPanel />}

      <PendingCommandBar isConnected={isConnected} />
      <Composer
        serverId={serverId}
        isConnected={isConnected}
        isMultiServer={isMultiServer}
        debugMode={debugMode}
        setDebugMode={setDebugMode}
      />
    </ThreadPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] min-w-0 px-4 py-2.5 rounded-lg text-sm bg-surface-raised text-fg">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage({ isConnected }: { isConnected: boolean }) {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.If hasContent>
        <div className="min-w-0 px-4 py-3 rounded-lg text-sm bg-surface-alt border border-edge-subtle text-fg-tertiary space-y-3">
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
      </MessagePrimitive.If>
      <MessagePrimitive.If hasContent={false}>
        <AssistantMessagePending />
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  )
}

function SessionDebugPanel() {
  const { activeSessionId, sessions, streamingText, streamingEvents, isStreaming, messageQueue } =
    useChatStore()
  const session = activeSessionId ? sessions[activeSessionId] : null

  const debugData = {
    activeSessionId,
    isStreaming,
    messageQueue,
    session: session
      ? {
          id: session.id,
          serverIds: session.serverIds,
          provider: session.provider,
          model: session.model,
          yoloMode: session.yoloMode,
          messageCount: session.messages.length,
          messages: session.messages,
        }
      : null,
    streaming: isStreaming
      ? {
          textLength: streamingText.length,
          eventCount: streamingEvents.length,
          events: streamingEvents,
        }
      : null,
  }

  return (
    <div className="border-t border-violet-900/50 bg-violet-950/20 max-h-64 overflow-y-auto">
      <pre className="px-4 py-3 text-[10px] leading-4 text-violet-300/80 whitespace-pre-wrap font-mono">
        {JSON.stringify(debugData, null, 2)}
      </pre>
    </div>
  )
}

function AssistantMessagePending() {
  return (
    <div
      className="flex items-center gap-1.5 px-4 py-3"
      role="status"
      aria-label="Assistant is thinking"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-fg-faint animate-pulse [animation-delay:300ms]" />
    </div>
  )
}

type PendingCommand = { id: string; command: string; explanation: string }

function PendingCommandBar({ isConnected }: { isConnected: boolean }) {
  const bridge = useBridge()
  const { streamingEvents, isStreaming, approveCommand, rejectCommand } = useChatStore()
  const barRef = useRef<HTMLDivElement>(null)

  const pendingCommands = useMemo(() => {
    if (!isStreaming) return []
    const resolved = new Set<string>()
    for (const e of streamingEvents) {
      if (e.type === 'command_running' || e.type === 'command_done') {
        resolved.add(e.id)
      }
    }
    const pending: PendingCommand[] = []
    for (const e of streamingEvents) {
      if (e.type === 'command_proposal' && !resolved.has(e.id)) {
        pending.push({ id: e.id, command: e.command, explanation: e.explanation })
      }
    }
    return pending
  }, [isStreaming, streamingEvents])

  // Auto-scroll the bar into view when new commands arrive
  const latestId = pendingCommands.at(-1)?.id
  useEffect(() => {
    if (latestId && barRef.current) {
      barRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [latestId])

  if (pendingCommands.length === 0) return null

  const approveAll = () => {
    for (const cmd of pendingCommands) approveCommand(bridge, cmd.id)
  }

  return (
    <div
      ref={barRef}
      className="border-t border-amber-700/60 bg-gradient-to-b from-amber-950/50 to-amber-950/30 px-4 py-3 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-amber-400/80">
          {pendingCommands.length === 1
            ? 'Command awaiting approval'
            : `${pendingCommands.length} commands awaiting approval`}
        </div>
        {pendingCommands.length > 1 && (
          <button
            onClick={approveAll}
            disabled={!isConnected}
            className="rounded-md bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            Approve all
          </button>
        )}
      </div>
      {pendingCommands.map((cmd) => (
        <div
          key={cmd.id}
          className="rounded-lg border border-amber-900/50 bg-surface/40 px-3 py-2.5"
        >
          <pre className="text-sm text-fg overflow-x-auto whitespace-pre-wrap mb-1.5">
            <code>{cmd.command}</code>
          </pre>
          {cmd.explanation && <p className="text-xs text-fg-muted mb-2">{cmd.explanation}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={() => approveCommand(bridge, cmd.id)}
              disabled={!isConnected}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => rejectCommand(bridge, cmd.id)}
              disabled={!isConnected}
              className="rounded-lg bg-surface-active px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
      {!isConnected && <span className="text-[11px] text-fg-faint">Reconnect to approve.</span>}
    </div>
  )
}

function Composer({
  serverId,
  isConnected,
  isMultiServer,
  debugMode,
  setDebugMode,
}: {
  serverId: string
  isConnected: boolean
  isMultiServer?: boolean
  debugMode: boolean
  setDebugMode: (v: boolean) => void
}) {
  const bridge = useBridge()
  const { isStreaming, killSession, messageQueue } = useChatStore()
  const serverColor = useServerStore((s) => s.servers.find((srv) => srv.id === serverId)?.color)
  const tintStyle = serverColor
    ? { backgroundImage: `linear-gradient(${serverColor}1f, ${serverColor}1f)` }
    : undefined

  return (
    <ComposerPrimitive.Root className="border-t border-edge-subtle/60 bg-surface-alt/50 px-4 py-3">
      <div
        className="rounded-xl border border-edge/50 bg-surface-raised/60 shadow-lg shadow-black/20 focus-within:border-edge-strong/70 transition-colors"
        style={tintStyle}
      >
        <ComposerPrimitive.Input
          autoFocus={isConnected}
          disabled={!isConnected}
          placeholder={
            !isConnected
              ? 'Reconnect to continue chatting'
              : isMultiServer
                ? 'Ask about your servers...'
                : 'Ask about this server...'
          }
          rows={1}
          className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-fg placeholder-fg-faint resize-none focus:outline-none disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <SessionConfigControls serverId={serverId} />
            <button
              type="button"
              onClick={() => setDebugMode(!debugMode)}
              title="Toggle debug mode — show raw message data"
              className={`rounded-md px-2 py-1.5 text-[11px] font-mono transition-colors ${
                debugMode
                  ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50'
                  : 'bg-surface-active/40 text-fg-faint hover:bg-surface-active/60 hover:text-fg-muted'
              }`}
            >
              {'{}'}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {messageQueue.length > 0 && (
              <span className="text-[11px] text-fg-faint mr-0.5">{messageQueue.length} queued</span>
            )}
            {isStreaming ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => killSession(bridge)}
                  title="Stop"
                  className="flex items-center justify-center rounded-lg bg-red-500/90 px-2.5 py-1.5 text-white transition-colors hover:bg-red-400"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
                <ComposerPrimitive.Send
                  disabled={!isConnected}
                  onMouseDown={() => setNextSendMode('queue')}
                  title="Queue this message — send after the current response finishes"
                  className="flex items-center gap-1 rounded-lg bg-surface-active px-3 py-1.5 text-xs font-medium text-fg-tertiary transition-colors hover:bg-surface-strong disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  Queue
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14" />
                    <path d="m5 12 7 7 7-7" />
                  </svg>
                </ComposerPrimitive.Send>
                <ComposerPrimitive.Send
                  disabled={!isConnected}
                  title="Interrupt the current response and send this message now"
                  className="flex items-center gap-1.5 rounded-lg bg-surface-invert px-3 py-1.5 text-xs font-medium text-fg-invert transition-colors hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  Send
                  <svg
                    width="12"
                    height="12"
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
            ) : (
              <ComposerPrimitive.Send
                disabled={!isConnected}
                className="flex items-center gap-1.5 rounded-lg bg-surface-invert px-3.5 py-1.5 text-xs font-medium text-fg-invert transition-colors hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed"
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
            )}
          </div>
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
  const sessionForServer = activeSession?.serverIds.includes(serverId) ? activeSession : null

  const config: AISessionConfig | null = sessionForServer
    ? {
        provider: sessionForServer.provider,
        model: sessionForServer.model,
        yoloMode: sessionForServer.yoloMode,
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
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      <select
        value={config.provider}
        disabled={selectionDisabled}
        onChange={(event) => {
          const provider = event.target.value as AIProviderType
          const nextConfig = {
            provider,
            model: null,
            yoloMode: config.yoloMode,
          } satisfies AISessionConfig
          applyConfig(nextConfig)
          loadModels(bridge, provider).catch(() => {})
        }}
        className="min-w-0 rounded-md border-none bg-surface-active/40 px-2.5 py-1.5 text-[11px] text-fg-muted focus:outline-none focus:ring-1 focus:ring-edge-strong disabled:opacity-50 cursor-pointer hover:bg-surface-active/60 transition-colors appearance-none"
      >
        {providerOptions.map((provider) => (
          <option key={provider} value={provider}>
            {AI_PROVIDER_LABELS[provider]}
          </option>
        ))}
      </select>

      <span className="text-fg-dim text-[10px]">/</span>

      <select
        value={config.model ?? ''}
        disabled={selectionDisabled || (modelState === 'loading' && models.length === 0)}
        onChange={(event) =>
          applyConfig({
            provider: config.provider,
            model: event.target.value || null,
            yoloMode: config.yoloMode,
          })
        }
        className="min-w-0 max-w-44 rounded-md border-none bg-surface-active/40 px-2.5 py-1.5 text-[11px] text-fg-muted focus:outline-none focus:ring-1 focus:ring-edge-strong disabled:opacity-50 cursor-pointer hover:bg-surface-active/60 transition-colors appearance-none"
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

      <button
        type="button"
        disabled={selectionDisabled}
        onClick={() =>
          applyConfig({
            provider: config.provider,
            model: config.model,
            yoloMode: !config.yoloMode,
          })
        }
        title="Danger: when enabled, AI command tool calls are auto-approved for this chat."
        className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          config.yoloMode
            ? 'border border-red-500/80 bg-red-600 text-white shadow-sm shadow-red-950/60 hover:bg-red-500'
            : 'border border-edge/70 bg-surface-raised/50 text-fg-faint hover:bg-surface-active/70 hover:text-fg-tertiary'
        }`}
      >
        YOLO
      </button>

      {modelError ? (
        <span className="text-[10px] text-amber-400/80 ml-1" title={modelError}>
          !
        </span>
      ) : modelState === 'loading' ? (
        <span className="text-[10px] text-fg-faint ml-1">Loading...</span>
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
              <span className="text-xs text-fg-faint transition-transform group-open:rotate-90">
                &gt;
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-300">
                  {title}
                </div>
                <div className="text-[11px] text-fg-faint truncate">{toolName}</div>
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
              <pre className="overflow-x-auto rounded bg-surface px-3 py-2 text-xs text-fg whitespace-pre-wrap">
                <code>{command}</code>
              </pre>
            ) : detailText ? (
              <pre className="overflow-x-auto rounded bg-surface px-3 py-2 text-xs text-fg whitespace-pre-wrap">
                <code>{detailText}</code>
              </pre>
            ) : null}

            {meta.explanation ? (
              <p className="text-xs leading-5 text-fg-muted">{meta.explanation}</p>
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
                  className="rounded bg-surface-active px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject
                </button>
                {!isConnected ? (
                  <span className="text-[11px] text-fg-faint">
                    Reconnect to approve this command.
                  </span>
                ) : null}
              </div>
            ) : null}

            {showExitCode ? (
              <div className="text-xs text-fg-muted">
                Exit code:{' '}
                <span className={exitCode === 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {exitCode}
                </span>
              </div>
            ) : null}

            {stdout ? <OutputBlock label="stdout" tone="text-emerald-200" value={stdout} /> : null}

            {meta.stdoutTruncated ? (
              <p className="text-[11px] text-fg-faint">stdout was truncated for display.</p>
            ) : null}

            {stderr ? <OutputBlock label="stderr" tone="text-rose-200" value={stderr} /> : null}

            {meta.stderrTruncated ? (
              <p className="text-[11px] text-fg-faint">stderr was truncated for display.</p>
            ) : null}

            {showGenericResult ? (
              <OutputBlock
                label={isError ? 'error' : 'result'}
                tone={isError ? 'text-rose-200' : 'text-fg-secondary'}
                value={formatValue(result)}
              />
            ) : null}

            {status === 'rejected' ? (
              <p className="text-xs text-fg-muted">Command rejected.</p>
            ) : null}
          </div>
        </details>
      ) : (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-amber-300">
              {title}
            </div>
            <div className="text-[11px] text-fg-faint truncate">{toolName}</div>
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
      <div className="text-[11px] font-medium uppercase tracking-wide text-fg-faint">{label}</div>
      <pre
        className={`overflow-x-auto rounded bg-surface px-3 py-2 text-xs whitespace-pre-wrap ${tone}`}
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
      return 'bg-surface-raised text-fg-tertiary border border-edge'
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
