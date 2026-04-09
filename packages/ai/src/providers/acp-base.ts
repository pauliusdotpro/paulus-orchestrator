import { execFile, execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import type { AIEvent, AIModelOption } from '@paulus/shared'
import type { AIProvider, AIProcess, AIContext, AIRunOptions } from '../provider'
import { AcpClient } from '../acp-client'
import { buildSystemPrompt } from '../context'
import { PaulusMcpServer } from '../paulus-mcp-server'
import {
  buildInspectionInstruction,
  detectExecutionScope,
  isLocalShellToolName,
  isPaulusServerCommandToolName,
  isPaulusToolName,
} from '../execution-scope'
import {
  buildGenericToolState,
  buildInvalidToolState,
  buildServerCommandToolState,
  toolStateEvent,
} from '../tool-state'

interface PendingToolCall {
  commandId: string
  command: string
  startedAt: string
  resolve: (result: { stdout: string; stderr: string; exitCode: number }) => void
  reject: (err: Error) => void
}

interface ObservedToolCall {
  toolName: string
  args: Record<string, unknown>
  argsText: string
  title?: string
  startedAt: string
}

/**
 * Base ACP provider — handles the ACP (Agent Client Protocol) lifecycle
 * for any agent that speaks JSON-RPC 2.0 over stdio.
 *
 * Subclasses only need to specify the binary/package name and
 * any provider-specific env var stripping.
 */
export abstract class AcpBaseProvider implements AIProvider {
  abstract readonly name: string

  /** npx package name, e.g. '@zed-industries/claude-agent-acp' */
  protected abstract readonly packageName: string

  /** Env var prefixes to strip (to avoid nested session issues) */
  protected abstract readonly stripEnvPrefixes: string[]

  /** Extra env var names to strip */
  protected abstract readonly stripEnvExact: string[]

  async available(): Promise<boolean> {
    try {
      const { command, args } = this.getLaunchCommand()
      execFileSync(command, [...args, '--help'], {
        encoding: 'utf-8',
        timeout: 15000,
        stdio: 'pipe',
        env: this.buildEnv(),
      })
      return true
    } catch {
      return false
    }
  }

  async listModels(): Promise<AIModelOption[]> {
    const client = this.createClient()

    try {
      await client.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'paulus-orchestrator', version: '0.1.1' },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      })

      const sessionResult = await client.request('session/new', {
        cwd: tmpdir(),
        mcpServers: [],
        system_prompt: 'You are Paulus. Return ACP session metadata only.',
      })

      return this.extractModelOptions(sessionResult)
    } finally {
      client.kill()
    }
  }

  spawn(prompt: string, context: AIContext, options: AIRunOptions): AIProcess {
    const systemPrompt = buildSystemPrompt(context)
    const executionScope = detectExecutionScope(prompt)
    const client = this.createClient()

    // --- State ---
    const pendingToolCalls = new Map<string, PendingToolCall>()
    const observedToolCalls = new Map<string, ObservedToolCall>()
    const eventQueue: AIEvent[] = []
    let eventResolve: (() => void) | null = null
    let finished = false
    const paulusMcpServer = new PaulusMcpServer({
      server: context.server,
      onToolCall: context.onPaulusToolCall,
      executeCommand: async (command) => {
        return new Promise((resolve, reject) => {
          const cmdId = randomUUID()
          const startedAt = new Date().toISOString()

          pendingToolCalls.set(cmdId, {
            commandId: cmdId,
            command,
            startedAt,
            resolve,
            reject,
          })

          pushEvent(
            toolStateEvent(
              buildServerCommandToolState({
                id: cmdId,
                command,
                status: 'pending',
                startedAt,
                explanation:
                  'AI wants Paulus to run a command on the selected server via paulus_exec_server_command',
              }),
            ),
          )
        })
      },
    })

    function pushEvent(event: AIEvent): void {
      eventQueue.push(event)
      if (eventResolve) {
        eventResolve()
        eventResolve = null
      }
    }

    function failPendingToolCalls(reason: string): void {
      const endedAt = new Date().toISOString()
      for (const [cmdId, pending] of pendingToolCalls) {
        pushEvent(
          toolStateEvent(
            buildServerCommandToolState({
              id: cmdId,
              command: pending.command,
              status: 'error',
              startedAt: pending.startedAt,
              endedAt,
              error: reason,
            }),
          ),
        )
        pending.reject(new Error(reason))
      }
      pendingToolCalls.clear()
    }

    function finish(reason = 'Tool execution aborted'): void {
      if (!finished) {
        failPendingToolCalls(reason)
        finished = true
        pushEvent({ type: 'done' })
      }
    }

    // --- Handle session/update notifications (streaming text, tool calls) ---
    client.onNotification('session/update', (params) => {
      const update = params?.update
      if (!update) return

      const kind = update.sessionUpdate
      switch (kind) {
        case 'agent_message_chunk': {
          const block = update.content
          if (block?.type === 'text' && block.text) {
            pushEvent({ type: 'text', text: block.text })
          }
          break
        }
        case 'tool_call': {
          const toolCall = this.extractToolCall(update)
          if (toolCall && !isPaulusServerCommandToolName(toolCall.toolName)) {
            const startedAt = new Date().toISOString()
            observedToolCalls.set(toolCall.id, {
              ...toolCall,
              startedAt,
            })
            pushEvent(
              toolStateEvent(
                buildGenericToolState({
                  id: toolCall.id,
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  argsText: toolCall.argsText,
                  title: toolCall.title,
                  status: 'pending',
                  startedAt,
                }),
              ),
            )
          }
          break
        }
        case 'tool_result': {
          const toolResult = this.extractToolResult(update)
          if (toolResult) {
            const observed = observedToolCalls.get(toolResult.id)
            observedToolCalls.delete(toolResult.id)
            const endedAt = new Date().toISOString()
            pushEvent(
              toolStateEvent(
                buildGenericToolState({
                  id: toolResult.id,
                  toolName: observed?.toolName ?? 'tool',
                  args: observed?.args ?? {},
                  argsText: observed?.argsText ?? '{}',
                  title: observed?.title,
                  status: toolResult.isError ? 'error' : 'completed',
                  result: toolResult.result,
                  isError: toolResult.isError,
                  error: toolResult.isError
                    ? this.stringifyToolResult(toolResult.result)
                    : undefined,
                  startedAt: observed?.startedAt,
                  endedAt,
                }),
              ),
            )
          } else if (update.content?.type === 'text' && update.content?.text) {
            pushEvent({ type: 'text', text: update.content.text })
          }
          break
        }
        case 'thought_chunk': {
          if (update.content?.type === 'text' && update.content?.text) {
            pushEvent({ type: 'thinking', text: update.content.text })
          }
          break
        }
        // available_commands_update, usage_update — ignore
      }
    })

    // --- Handle terminal/execute requests from agent ---
    // Intercept ALL tool execution requests. Only paulus_exec_server_command
    // gets routed through SSH approval. Everything else is rejected to prevent
    // the agent from running commands locally on the host machine.
    for (const method of [
      'terminal/execute',
      'terminal/run',
      'tools/execute',
      'tools/call',
      'bash',
      'shell',
      'exec',
    ]) {
      client.onRequest(method, (params): Promise<any> => {
        const toolName = this.getToolName(method, params)

        if (isPaulusServerCommandToolName(toolName)) {
          return new Promise((resolve, reject) => {
            const command = this.extractCommand(params)
            const cmdId = randomUUID()
            const startedAt = new Date().toISOString()

            pendingToolCalls.set(cmdId, {
              commandId: cmdId,
              command,
              startedAt,
              resolve: (result) => {
                resolve({
                  stdout: result.stdout,
                  stderr: result.stderr,
                  exit_code: result.exitCode,
                })
              },
              reject: (err) => {
                resolve({
                  stdout: '',
                  stderr: `Rejected: ${err.message}`,
                  exit_code: 1,
                })
              },
            })

            pushEvent(
              toolStateEvent(
                buildServerCommandToolState({
                  id: cmdId,
                  command,
                  status: 'pending',
                  startedAt,
                  explanation: this.buildCommandExplanation(toolName),
                }),
              ),
            )
          })
        }

        if (executionScope === 'local' && isLocalShellToolName(toolName)) {
          return this.executeLocalCommand(this.extractCommand(params), this.extractTimeout(params))
        }

        // Default ambiguous execution to the selected remote server, not the host machine.
        if (!isPaulusServerCommandToolName(toolName)) {
          pushEvent(
            toolStateEvent(
              buildInvalidToolState({
                id: randomUUID(),
                toolName,
                args: this.extractToolArgs(params),
                error: `Tool "${toolName}" is not available for this remote-first request. Use the paulus_exec_server_command MCP tool to run commands on the selected server, or explicitly say you want the local machine.`,
                metadata: { method },
              }),
            ),
          )

          return Promise.resolve({
            error: `Tool "${toolName}" is not available for this remote-first request. Use the paulus_exec_server_command MCP tool to run commands on the selected server, or explicitly say you want the local machine.`,
          })
        }

        return Promise.resolve({
          error: `Tool "${toolName}" could not be handled.`,
        })
      })
    }

    // --- Handle session/request_permission from agent ---
    // ONLY allow Paulus MCP tools. Reject all built-in agent tools (Bash, terminal, etc.)
    // to force the agent to use paulus_exec_server_command via MCP instead of
    // executing commands locally on the host machine.
    client.onRequest('session/request_permission', (params) => {
      const permission = params?.permission || params || {}
      const toolName = this.getToolName('session/request_permission', permission)
      const allowOption = this.findPermissionOption(permission, 'allow')
      const rejectOption = this.findPermissionOption(permission, 'reject')

      // Default to remote-only unless the user explicitly requested local execution.
      const isPaulusTool = isPaulusToolName(toolName)
      if (isPaulusTool && allowOption) {
        return Promise.resolve({
          outcome: {
            outcome: 'selected',
            optionId: allowOption.optionId,
          },
        })
      }

      if (executionScope === 'local' && isLocalShellToolName(toolName) && allowOption) {
        return Promise.resolve({
          outcome: {
            outcome: 'selected',
            optionId: allowOption.optionId,
          },
        })
      }

      // Reject everything else (built-in Bash, terminal, file tools, etc.)
      if (rejectOption) {
        return Promise.resolve({
          outcome: {
            outcome: 'selected',
            optionId: rejectOption.optionId,
          },
        })
      }

      return Promise.resolve({
        outcome: {
          outcome: 'cancelled',
        },
      })
    })

    // --- Handle fs operations (deny — server files must be accessed via SSH) ---
    for (const method of ['fs/read_text_file', 'fs/write_text_file', 'fs/list_directory']) {
      client.onRequest(method, async () => {
        return {
          error: 'File system access is not available. Use SSH commands to access server files.',
        }
      })
    }

    // Clean up on process exit
    client.onClose(() => {
      finish('ACP process exited before tool execution completed')
    })

    // --- Start the ACP session ---
    ;(async () => {
      try {
        // 1. Initialize — protocolVersion is required (uint16)
        console.log(`[${this.name}] Sending initialize...`)
        const initResult = await client.request('initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'paulus-orchestrator', version: '0.1.1' },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        })
        console.log(`[${this.name}] Initialized:`, JSON.stringify(initResult).slice(0, 200))

        // 2. Create session
        await paulusMcpServer.start()
        console.log(`[${this.name}] Creating session...`)
        const sessionResult = await client.request('session/new', {
          cwd: tmpdir(),
          mcpServers: [
            {
              name: 'paulus',
              type: 'http',
              url: paulusMcpServer.url,
              headers: [],
            },
          ],
          system_prompt: systemPrompt,
        })
        const acpSessionId =
          sessionResult?.sessionId || sessionResult?.session_id || sessionResult?.id
        console.log(`[${this.name}] Session created: ${acpSessionId}`)

        if (options.model) {
          await client.request('session/set_config_option', {
            sessionId: acpSessionId,
            configId: 'model',
            value: options.model,
          })
        }

        // 3. Build full prompt with conversation history
        const inspectionInstruction = buildInspectionInstruction(prompt)
        const effectivePrompt = inspectionInstruction
          ? `${inspectionInstruction}\n\nUser request: ${prompt}`
          : prompt
        const fullPrompt =
          context.conversationHistory.length > 0
            ? `Previous conversation:\n${context.conversationHistory
                .map((m) => `${m.role}: ${m.content}`)
                .join('\n')}\n\nNew message: ${effectivePrompt}`
            : effectivePrompt

        // 4. Send prompt (this blocks until the agent finishes processing)
        console.log(`[${this.name}] Sending prompt: ${fullPrompt.slice(0, 80)}...`)
        await client.request('session/prompt', {
          sessionId: acpSessionId,
          prompt: [{ type: 'text', text: fullPrompt }],
        })
        console.log(`[${this.name}] Prompt completed`)
      } catch (err: any) {
        console.error(`[${this.name}] ACP error:`, err.message)
        pushEvent({ type: 'error', message: err.message })
      } finally {
        await paulusMcpServer.close().catch(() => {})
        finish('ACP run finished before tool execution completed')
      }
    })()

    // --- Build the AIProcess ---
    const events: AsyncIterable<AIEvent> = {
      [Symbol.asyncIterator]: async function* () {
        while (true) {
          if (eventQueue.length > 0) {
            const event = eventQueue.shift()!
            yield event
            if (event.type === 'done') return
          } else if (finished && eventQueue.length === 0) {
            return
          } else {
            await new Promise<void>((resolve) => {
              eventResolve = resolve
            })
          }
        }
      },
    }

    return {
      events,

      write(input: string) {
        // Resolve the most recent pending tool call with the command result.
        // Called by the orchestrator after SSH execution or rejection.
        //
        // For approval: "Command completed (exit X):\nSTDOUT:\n...\nSTDERR:\n..."
        // For rejection: "Command rejected by user"

        // Find the oldest pending tool call
        const firstEntry = pendingToolCalls.entries().next()
        if (firstEntry.done) return

        const [cmdId, pending] = firstEntry.value
        pendingToolCalls.delete(cmdId)

        if (input.includes('Command rejected')) {
          pending.reject(new Error('Command rejected by user'))
        } else {
          const exitMatch = input.match(/exit\s+(\d+)/)
          const stdoutMatch = input.match(/STDOUT:\n([\s\S]*?)(?=\nSTDERR:|$)/)
          const stderrMatch = input.match(/STDERR:\n([\s\S]*)$/)

          pending.resolve({
            exitCode: exitMatch ? parseInt(exitMatch[1]) : 0,
            stdout: stdoutMatch ? stdoutMatch[1].trim() : input,
            stderr: stderrMatch ? stderrMatch[1].trim() : '',
          })
        }
      },

      kill() {
        // Reject all pending tool calls
        failPendingToolCalls('Process killed')
        void paulusMcpServer.close()
        client.kill()
      },
    }
  }

  private createClient(): AcpClient {
    const { command, args } = this.getLaunchCommand()
    console.log(`[${this.name}] Spawning ACP agent: ${command} ${args.join(' ')}`)
    return new AcpClient(command, args, this.buildEnv())
  }

  private getLaunchCommand(): { command: string; args: string[] } {
    return {
      command: 'npx',
      args: ['--yes', this.packageName],
    }
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const [key, val] of Object.entries(process.env)) {
      if (this.stripEnvExact.includes(key)) continue
      if (this.stripEnvPrefixes.some((prefix) => key.startsWith(prefix))) continue
      env[key] = val
    }
    return env
  }

  private extractModelOptions(sessionResult: any): AIModelOption[] {
    const configOptions = Array.isArray(sessionResult?.configOptions)
      ? sessionResult.configOptions
      : Array.isArray(sessionResult?.config_options)
        ? sessionResult.config_options
        : []

    const modelOption = configOptions.find((option: any) => option?.id === 'model')
    const optionEntries = this.flattenConfigOptions(modelOption?.options)
    if (optionEntries.length > 0) {
      return optionEntries
    }

    const availableModels = Array.isArray(sessionResult?.models?.availableModels)
      ? sessionResult.models.availableModels
      : Array.isArray(sessionResult?.models?.available_models)
        ? sessionResult.models.available_models
        : []

    return availableModels
      .map((model: any) => {
        const id = this.pickString(model?.modelId, model?.model_id, model?.id, model?.value)
        const name = this.pickString(model?.name, model?.displayName, model?.display_name, id)
        if (!id || !name) return null
        return {
          id,
          name,
          description: this.pickString(model?.description) ?? undefined,
        } satisfies AIModelOption
      })
      .filter((model: AIModelOption | null): model is AIModelOption => model !== null)
  }

  private flattenConfigOptions(options: any): AIModelOption[] {
    if (!Array.isArray(options)) return []

    const models: AIModelOption[] = []
    for (const option of options) {
      if (Array.isArray(option?.options)) {
        models.push(...this.flattenConfigOptions(option.options))
        continue
      }

      const id = this.pickString(option?.value, option?.id)
      const name = this.pickString(option?.name, option?.label, id)
      if (!id || !name) continue

      models.push({
        id,
        name,
        description: this.pickString(option?.description) ?? undefined,
      })
    }

    return models
  }

  private getToolName(method: string, params: any): string {
    if (method === 'tools/call') {
      return params?.name || params?.tool_name || ''
    }

    if (method === 'session/request_permission') {
      return (
        params?.toolCall?.toolName ||
        params?.toolCall?._meta?.claudeCode?.toolName ||
        params?.toolCall?.rawInput?.tool_name ||
        params?.toolCall?.rawInput?.name ||
        params?.toolCall?.title ||
        params?.toolCall?.name ||
        params?.tool_name ||
        params?.name ||
        ''
      )
    }

    return params?.tool_name || params?.name || method
  }

  private extractCommand(params: any): string {
    const input = params?.input || params?.arguments || params || {}

    if (typeof input === 'string') {
      return input
    }

    for (const field of ['command', 'cmd', 'script', 'text']) {
      if (typeof input?.[field] === 'string' && input[field].trim().length > 0) {
        return input[field]
      }
    }

    if (typeof params?.command === 'string' && params.command.trim().length > 0) {
      return params.command
    }

    return JSON.stringify(input)
  }

  private extractTimeout(params: any): number | undefined {
    const input = params?.input || params?.arguments || params || {}
    const timeout =
      typeof input?.timeout === 'number'
        ? input.timeout
        : typeof params?.timeout === 'number'
          ? params.timeout
          : undefined

    if (timeout === undefined || !Number.isFinite(timeout) || timeout <= 0) {
      return undefined
    }

    return Math.min(timeout, 10 * 60 * 1000)
  }

  private extractToolArgs(params: any): Record<string, unknown> {
    const input = params?.input || params?.arguments || params || {}
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>
    }

    return { value: input }
  }

  private buildCommandExplanation(toolName: string): string {
    return `AI wants Paulus to run a command on the selected server via ${toolName}`
  }

  private executeLocalCommand(
    command: string,
    timeout = 60_000,
  ): Promise<{
    stdout: string
    stderr: string
    exit_code: number
  }> {
    const shell = process.env.SHELL || '/bin/zsh'

    return new Promise((resolve) => {
      execFile(
        shell,
        ['-lc', command],
        {
          encoding: 'utf-8',
          timeout,
          maxBuffer: 20 * 1024 * 1024,
          env: process.env,
        },
        (error, stdout, stderr) => {
          const exitCode = typeof error?.code === 'number' ? error.code : error ? 1 : 0
          const timeoutMessage =
            error && 'killed' in error && error.killed
              ? `\nCommand timed out after ${timeout}ms`
              : ''

          resolve({
            stdout: stdout ?? '',
            stderr: `${stderr ?? ''}${timeoutMessage}`.trim(),
            exit_code: exitCode,
          })
        },
      )
    })
  }

  private stringifyToolResult(result: unknown): string {
    if (typeof result === 'string') return result
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }

  private extractToolCall(update: any): {
    id: string
    toolName: string
    args: Record<string, unknown>
    argsText: string
    title?: string
  } | null {
    const payload = update?.content ?? update?.toolCall ?? update ?? {}
    const id =
      this.pickString(
        payload?.toolCallId,
        payload?.tool_call_id,
        payload?.id,
        update?.toolCallId,
        update?.tool_call_id,
        update?.id,
      ) ?? null
    const toolName =
      this.pickString(
        payload?.toolName,
        payload?._meta?.claudeCode?.toolName,
        payload?.tool_name,
        payload?.name,
        payload?.title,
        update?.toolName,
        update?._meta?.claudeCode?.toolName,
        update?.tool_name,
        update?.name,
        update?.title,
      ) ?? null

    if (!id || !toolName) return null

    const rawArgs = payload?.args ?? payload?.arguments ?? payload?.input ?? {}
    const args =
      rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : { value: rawArgs }

    return {
      id,
      toolName,
      args,
      argsText:
        typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs ?? {}, null, 2) || '{}',
      title: this.pickString(payload?.title, update?.title) ?? undefined,
    }
  }

  private extractToolResult(update: any): {
    id: string
    result: unknown
    isError?: boolean
  } | null {
    const payload = update?.content ?? update?.toolResult ?? update ?? {}
    const id =
      this.pickString(
        payload?.toolCallId,
        payload?.tool_call_id,
        payload?.id,
        update?.toolCallId,
        update?.tool_call_id,
        update?.id,
      ) ?? null

    if (!id) return null

    const result =
      payload?.result ??
      payload?.output ??
      payload?.text ??
      update?.result ??
      update?.output ??
      update?.text ??
      payload

    return {
      id,
      result,
      isError:
        Boolean(payload?.isError) ||
        Boolean(payload?.is_error) ||
        Boolean(update?.isError) ||
        Boolean(update?.is_error),
    }
  }
  private findPermissionOption(
    permission: any,
    kind: 'allow' | 'reject',
  ): { optionId: string; kind?: string } | null {
    const options: Array<{ optionId?: string; kind?: string }> = Array.isArray(permission?.options)
      ? permission.options
      : []
    const matchingOption =
      options.find((option) => typeof option?.kind === 'string' && option.kind.startsWith(kind)) ??
      options.find(
        (option) => typeof option?.optionId === 'string' && option.optionId.includes(kind),
      )

    if (!matchingOption || typeof matchingOption.optionId !== 'string') {
      return null
    }

    return {
      optionId: matchingOption.optionId,
      kind: matchingOption.kind,
    }
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value
      }
    }

    return null
  }
}
