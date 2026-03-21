import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: any
  result?: any
  error?: { code: number; message: string; data?: any }
}

type RequestHandler = (params: any) => Promise<any>
type NotificationHandler = (params: any) => void

/**
 * Lightweight JSON-RPC 2.0 client over stdio (NDJSON).
 * Communicates with ACP agent subprocesses via stdin/stdout.
 */
export class AcpClient {
  private proc: ChildProcess
  private nextId = 1
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >()
  private requestHandlers = new Map<string, RequestHandler>()
  private notificationHandlers = new Map<string, NotificationHandler>()
  private _closed = false
  private onCloseCallbacks: Array<(code: number | null) => void> = []

  constructor(command: string, args: string[], env?: NodeJS.ProcessEnv) {
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env || process.env,
    })

    this.proc.on('error', (err) => {
      console.error('[AcpClient] Spawn error:', err.message)
      this._closed = true
      this.rejectAllPending(`Spawn error: ${err.message}`)
    })

    this.proc.on('close', (code) => {
      console.log(`[AcpClient] Process exited: ${code}`)
      this._closed = true
      this.rejectAllPending(`Process exited with code ${code}`)
      for (const cb of this.onCloseCallbacks) cb(code)
    })

    this.proc.stderr?.on('data', (data: Buffer) => {
      console.error('[AcpClient stderr]', data.toString().trim())
    })

    // Parse NDJSON from stdout
    const rl = createInterface({ input: this.proc.stdout!, crlfDelay: Infinity })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        const msg: JsonRpcMessage = JSON.parse(trimmed)
        this.handleMessage(msg)
      } catch {
        console.warn('[AcpClient] Failed to parse:', trimmed.slice(0, 120))
      }
    })
  }

  private rejectAllPending(reason: string): void {
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }

  private handleMessage(msg: JsonRpcMessage): void {
    // Response to our request (has id + result/error, no method)
    if (msg.id !== undefined && !msg.method) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (msg.error) {
          pending.reject(new Error(msg.error.message))
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    // Request from agent to us (has id + method)
    if (msg.id !== undefined && msg.method) {
      const handler = this.requestHandlers.get(msg.method)
      if (handler) {
        handler(msg.params)
          .then((result) => this.sendResponse(msg.id!, result))
          .catch((err) => this.sendError(msg.id!, -32603, err.message))
      } else {
        console.warn(`[AcpClient] Unhandled request method: ${msg.method}`)
        this.sendError(msg.id!, -32601, `Method not found: ${msg.method}`)
      }
      return
    }

    // Notification from agent (has method, no id)
    if (msg.method && msg.id === undefined) {
      const handler = this.notificationHandlers.get(msg.method)
      if (handler) {
        handler(msg.params)
      }
    }
  }

  private sendMessage(msg: JsonRpcMessage): void {
    if (this._closed || !this.proc.stdin?.writable) return
    const json = JSON.stringify(msg)
    console.log('[AcpClient] SENDING:', json.slice(0, 300))
    this.proc.stdin.write(json + '\n')
  }

  private sendResponse(id: number, result: any): void {
    this.sendMessage({ jsonrpc: '2.0', id, result } as JsonRpcMessage)
  }

  private sendError(id: number, code: number, message: string): void {
    this.sendMessage({ jsonrpc: '2.0', id, error: { code, message } } as JsonRpcMessage)
  }

  /** Send a JSON-RPC request and wait for the response */
  async request(method: string, params?: any): Promise<any> {
    if (this._closed) throw new Error('ACP client is closed')
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.sendMessage({ jsonrpc: '2.0', id, method, params } as JsonRpcMessage)
    })
  }

  /** Send a JSON-RPC notification (no response expected) */
  notify(method: string, params?: any): void {
    this.sendMessage({ jsonrpc: '2.0', method, params } as JsonRpcMessage)
  }

  /** Register a handler for incoming requests from the agent */
  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler)
  }

  /** Register a handler for incoming notifications from the agent */
  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler)
  }

  /** Register a callback for when the process closes */
  onClose(callback: (code: number | null) => void): void {
    this.onCloseCallbacks.push(callback)
  }

  get closed(): boolean {
    return this._closed
  }

  kill(): void {
    if (!this._closed) {
      this.proc.kill('SIGTERM')
    }
  }
}
