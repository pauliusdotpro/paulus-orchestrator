import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { AIServerContext } from './provider'

export interface CommandExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
}

interface McpToolServerOptions {
  server: AIServerContext
  executeCommand(command: string): Promise<CommandExecutionResult>
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
}

type McpToolContent = Array<{ type: 'text'; text: string }>
type McpToolResult = { content: McpToolContent; isError?: boolean }

function formatToolError(toolName: string, error: unknown): McpToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Tool ${toolName} failed: ${message}`,
      },
    ],
  }
}

function defineMcpTool<TArgs extends Record<string, unknown>>(
  toolName: string,
  schema: z.ZodType<TArgs>,
  options: McpToolServerOptions,
  handler: (args: TArgs) => Promise<McpToolResult>,
): (rawArgs: unknown) => Promise<McpToolResult> {
  return async (rawArgs: unknown) => {
    const parsed = schema.safeParse(rawArgs ?? {})
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid arguments for ${toolName}: ${parsed.error.message}`,
          },
        ],
      }
    }

    options.onToolCall?.(toolName, parsed.data)

    try {
      return await handler(parsed.data)
    } catch (error) {
      return formatToolError(toolName, error)
    }
  }
}

function registerTools(mcpServer: McpServer, options: McpToolServerOptions): void {
  const commandSchema: z.ZodType<{ command: string }> = z.object({
    command: z.string().min(1).describe('Shell command to run on the selected remote server'),
  })
  const emptySchema: z.ZodType<Record<string, never>> = z.object({})

  mcpServer.registerTool(
    'paulus_exec_server_command',
    {
      description:
        'Execute a shell command on the selected remote server through Paulus Orchestrator.',
      inputSchema: commandSchema,
    },
    defineMcpTool('paulus_exec_server_command', commandSchema, options, async ({ command }) => {
      const result = await options.executeCommand(command)
      return {
        content: [
          {
            type: 'text',
            text:
              `Command: ${command}\n` +
              `Exit code: ${result.exitCode}\n` +
              `STDOUT:\n${result.stdout || '(empty)'}\n` +
              `STDERR:\n${result.stderr || '(empty)'}`,
          },
        ],
      }
    }),
  )

  mcpServer.registerTool(
    'paulus_get_server_context',
    {
      description: 'Return the selected server metadata Paulus already knows.',
      inputSchema: emptySchema,
    },
    defineMcpTool('paulus_get_server_context', emptySchema, options, async () => {
      const server = options.server
      return {
        content: [
          {
            type: 'text',
            text:
              `Name: ${server.name}\n` +
              `Host/IP: ${server.host}\n` +
              `Port: ${server.port}\n` +
              `Username: ${server.username}\n` +
              `Auth method: ${server.authMethod}\n` +
              `Connected in Paulus: ${server.connected ? 'yes' : 'no'}\n` +
              `Tags: ${server.tags.join(', ') || 'none'}`,
          },
        ],
      }
    }),
  )
}

export class PaulusMcpServer {
  private readonly mcpServer: McpServer
  private readonly transports: Record<string, StreamableHTTPServerTransport> = {}
  private httpServer = createServer(this.handleRequest.bind(this))
  private listenPort: number | null = null

  constructor(private readonly options: McpToolServerOptions) {
    this.mcpServer = new McpServer({
      name: 'paulus-orchestrator',
      version: '0.3.0',
    })

    registerTools(this.mcpServer, options)
  }

  get url(): string {
    if (this.listenPort === null) {
      throw new Error('Paulus MCP server is not started')
    }

    return `http://127.0.0.1:${this.listenPort}/mcp`
  }

  async start(): Promise<void> {
    if (this.listenPort !== null) return

    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject)
      this.httpServer.listen(0, '127.0.0.1', () => {
        this.httpServer.off('error', reject)
        const address = this.httpServer.address()
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind Paulus MCP server'))
          return
        }

        this.listenPort = address.port
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    for (const transport of Object.values(this.transports)) {
      await transport.close()
    }

    await this.mcpServer.close().catch(() => {})

    if (this.listenPort === null) return

    await new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
    this.listenPort = null
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url || !req.url.startsWith('/mcp')) {
      res.statusCode = 404
      res.end('Not found')
      return
    }

    const body = req.method === 'POST' ? await this.readJsonBody(req, res) : undefined
    if (req.method === 'POST' && body === undefined) {
      return
    }

    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader

    try {
      let transport: StreamableHTTPServerTransport | undefined

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId]
      } else if (!sessionId && body && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            this.transports[initializedSessionId] = transport!
          },
        })
        transport.onclose = () => {
          const activeSessionId = transport?.sessionId
          if (activeSessionId) {
            delete this.transports[activeSessionId]
          }
        }

        await this.mcpServer.connect(transport)
      } else {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid MCP session ID provided',
            },
            id: null,
          }),
        )
        return
      }

      await transport.handleRequest(req, res, body)
    } catch (err) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : String(err),
          },
          id: null,
        }),
      )
    }
  }

  private async readJsonBody(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<unknown | undefined> {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }

    const raw = Buffer.concat(chunks).toString('utf-8')
    if (!raw) return undefined

    try {
      return JSON.parse(raw)
    } catch {
      res.statusCode = 400
      res.end('Invalid JSON')
      return undefined
    }
  }
}
