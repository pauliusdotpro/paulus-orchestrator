import { execFileSync } from 'child_process'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import type { AIEvent, AIModelOption } from '@paulus/shared'
import type { AIProvider, AIProcess, AIContext, AIRunOptions } from '../provider'
import { AcpClient } from '../acp-client'
import { buildSystemPrompt } from '../context'
import { PaulusMcpServer } from '../paulus-mcp-server'

interface PendingToolCall {
  commandId: string
  resolve: (result: { stdout: string; stderr: string; exitCode: number }) => void
  reject: (err: Error) => void
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
        clientInfo: { name: 'paulus-orchestrator', version: '0.1.0' },
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
    const client = this.createClient()

    // --- State ---
    const pendingToolCalls = new Map<string, PendingToolCall>()
    const eventQueue: AIEvent[] = []
    let eventResolve: (() => void) | null = null
    let finished = false
    const paulusMcpServer = new PaulusMcpServer({
      server: context.server,
      onToolCall: context.onPaulusToolCall,
      executeCommand: async (command) => {
        return new Promise((resolve, reject) => {
          const cmdId = randomUUID()

          pendingToolCalls.set(cmdId, {
            commandId: cmdId,
            resolve,
            reject,
          })

          pushEvent({
            type: 'command_proposal',
            id: cmdId,
            command,
            explanation:
              'AI wants Paulus to run a command on the selected server via paulus_exec_server_command',
          })
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

    function finish(): void {
      if (!finished) {
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
          if (toolCall && !this.isCommandTool(toolCall.toolName)) {
            pushEvent({
              type: 'tool_call',
              id: toolCall.id,
              toolName: toolCall.toolName,
              args: toolCall.args,
              argsText: toolCall.argsText,
              title: toolCall.title,
            })
          }
          break
        }
        case 'tool_result': {
          const toolResult = this.extractToolResult(update)
          if (toolResult) {
            pushEvent({
              type: 'tool_result',
              id: toolResult.id,
              result: toolResult.result,
              isError: toolResult.isError,
            })
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
      client.onRequest(method, (params) => {
        const toolName = this.getToolName(method, params)

        // Reject all non-Paulus tools — they would run locally, not on the remote server
        if (!this.isPaulusTool(toolName) && !this.isCommandTool(toolName)) {
          return Promise.resolve({
            error: `Tool "${toolName}" is not available. You MUST use the paulus_exec_server_command MCP tool to run commands on the remote server. Do not attempt to use built-in Bash, terminal, or shell tools.`,
          })
        }

        return new Promise((resolve, reject) => {
          const command = this.extractCommand(params)
          const cmdId = randomUUID()

          pendingToolCalls.set(cmdId, {
            commandId: cmdId,
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

          pushEvent({
            type: 'command_proposal',
            id: cmdId,
            command,
            explanation: this.buildCommandExplanation(toolName),
          })
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

      // Only allow Paulus MCP tools — these route through SSH
      const isPaulusTool = this.isPaulusTool(toolName)
      if (isPaulusTool && allowOption) {
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
      finish()
    })

    // --- Start the ACP session ---
    ;(async () => {
      try {
        // 1. Initialize — protocolVersion is required (uint16)
        console.log(`[${this.name}] Sending initialize...`)
        const initResult = await client.request('initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'paulus-orchestrator', version: '0.1.0' },
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
        const inspectionInstruction = this.buildInspectionInstruction(prompt)
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
        finish()
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
        for (const [, pending] of pendingToolCalls) {
          pending.reject(new Error('Process killed'))
        }
        pendingToolCalls.clear()
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

  /** Check if a tool name represents a command/shell execution tool */
  protected isCommandTool(toolName: string): boolean {
    const cmdTools = [
      'paulus_exec_server_command',
      'bash',
      'shell',
      'terminal',
      'execute',
      'run',
      'command',
      'exec',
      'sh',
      'Bash',
      'Terminal',
    ]
    const normalized = toolName.toLowerCase()
    return cmdTools.some((tool) => {
      const candidate = tool.toLowerCase()
      return normalized === candidate || normalized.includes(candidate)
    })
  }

  protected isPaulusTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase()

    return (
      normalized.startsWith('paulus_') ||
      normalized.includes('__paulus__') ||
      normalized.includes('mcp__paulus') ||
      normalized.includes('paulus_exec_server_command') ||
      normalized.includes('paulus_get_server_context')
    )
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

  private buildCommandExplanation(toolName: string): string {
    return `AI wants Paulus to run a command on the selected server via ${toolName}`
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

  private buildInspectionInstruction(prompt: string): string | null {
    const normalized = prompt.toLowerCase()

    if (
      /(what|which).*(linux|os|distro|distribution|kernel)/.test(normalized) ||
      /(linux|os|distro|kernel).*(running|version)/.test(normalized)
    ) {
      return (
        'MANDATORY TOOL USE FOR THIS REQUEST: ' +
        'Call paulus_exec_server_command with exactly "cat /etc/os-release && uname -srmo" before any answer. ' +
        'Do not answer from local runtime context. An answer without that tool result is invalid.'
      )
    }

    return null
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
