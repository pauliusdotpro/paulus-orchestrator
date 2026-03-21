import { Client } from 'ssh2'
import { readFileSync } from 'fs'
import type { BrowserWindow } from 'electron'
import type { ServerConfig, ServerConnection } from '@paulus/shared'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class ConnectionPool {
  private connections = new Map<string, Client>()
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
  }

  private emitStatus(status: ServerConnection): void {
    this.win.webContents.send('server:connection-status', status)
  }

  async connect(config: ServerConfig, password?: string): Promise<void> {
    if (this.connections.has(config.id)) {
      await this.disconnect(config.id)
    }

    this.emitStatus({ serverId: config.id, status: 'connecting' })

    const client = new Client()

    return new Promise<void>((resolve, reject) => {
      client.on('ready', () => {
        this.connections.set(config.id, client)
        this.emitStatus({ serverId: config.id, status: 'connected' })
        resolve()
      })

      client.on('error', (err) => {
        this.connections.delete(config.id)
        this.emitStatus({
          serverId: config.id,
          status: 'error',
          error: err.message,
        })
        reject(err)
      })

      client.on('close', () => {
        this.connections.delete(config.id)
        this.emitStatus({ serverId: config.id, status: 'disconnected' })
      })

      const connectConfig: any = {
        host: config.host,
        port: config.port,
        username: config.username,
      }

      if (config.authMethod === 'key' && config.privateKeyPath) {
        connectConfig.privateKey = readFileSync(config.privateKeyPath)
      } else if (password) {
        connectConfig.password = password
        // Also handle keyboard-interactive auth (common on cloud servers)
        connectConfig.tryKeyboard = true
        client.on(
          'keyboard-interactive',
          (
            _name: string,
            _instructions: string,
            _instructionsLang: string,
            prompts: any[],
            finish: (responses: string[]) => void,
          ) => {
            finish(prompts.map(() => password!))
          },
        )
      }

      client.connect(connectConfig)
    })
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.connections.get(serverId)
    if (client) {
      client.end()
      this.connections.delete(serverId)
    }
  }

  getConnection(serverId: string): Client | undefined {
    return this.connections.get(serverId)
  }

  isConnected(serverId: string): boolean {
    return this.connections.has(serverId)
  }

  async exec(serverId: string, command: string): Promise<ExecResult> {
    const client = this.connections.get(serverId)
    if (!client) throw new Error(`Not connected to server: ${serverId}`)

    return new Promise<ExecResult>((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err)

        let stdout = ''
        let stderr = ''

        stream.on('data', (data: Buffer) => {
          const text = data.toString()
          stdout += text
          this.win.webContents.send('ssh:output', {
            serverId,
            data: text,
            stream: 'stdout',
          })
        })

        stream.stderr.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          this.win.webContents.send('ssh:output', {
            serverId,
            data: text,
            stream: 'stderr',
          })
        })

        stream.on('close', (code: number) => {
          resolve({ stdout, stderr, exitCode: code ?? 0 })
        })
      })
    })
  }

  disconnectAll(): void {
    for (const [id, client] of this.connections) {
      client.end()
      this.connections.delete(id)
    }
  }
}
