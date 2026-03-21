import { readFileSync } from 'fs'
import { Client, type ClientChannel } from 'ssh2'
import type { ServerConfig, ServerConnection } from '@paulus/shared'
import type { RuntimeEventSink } from '../events'

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class ConnectionPool {
  private readonly connections = new Map<string, Client>()

  constructor(private readonly eventSink: RuntimeEventSink) {}

  private emitStatus(status: ServerConnection): void {
    this.eventSink.emitConnectionStatus(status)
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

      client.on('error', (err: Error) => {
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

      const connectConfig: {
        host: string
        port: number
        username: string
        privateKey?: Buffer
        password?: string
        tryKeyboard?: boolean
      } = {
        host: config.host,
        port: config.port,
        username: config.username,
      }

      if (config.authMethod === 'key') {
        if (!config.privateKeyPath) {
          reject(
            new Error(
              `Server ${config.name} is configured for key auth without a private key path`,
            ),
          )
          return
        }
        connectConfig.privateKey = readFileSync(config.privateKeyPath)
      } else {
        if (!password) {
          reject(new Error(`Password auth requires a password for server ${config.name}`))
          return
        }

        connectConfig.password = password
        connectConfig.tryKeyboard = true
        ;(client as any).on(
          'keyboard-interactive',
          (
            _name: string,
            _instructions: string,
            _instructionsLang: string,
            prompts: Array<{ prompt: string; echo: boolean }>,
            finish: (responses: string[]) => void,
          ) => {
            finish(prompts.map(() => password))
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

  isConnected(serverId: string): boolean {
    return this.connections.has(serverId)
  }

  async exec(serverId: string, sessionId: string, command: string): Promise<ExecResult> {
    const client = this.connections.get(serverId)
    if (!client) throw new Error(`Not connected to server: ${serverId}`)

    return new Promise<ExecResult>((resolve, reject) => {
      client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''

        stream.on('data', (data: Buffer) => {
          const text = data.toString()
          stdout += text
          this.eventSink.emitSSHOutput({ serverId, sessionId, data: text, stream: 'stdout' })
        })

        stream.stderr.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          this.eventSink.emitSSHOutput({ serverId, sessionId, data: text, stream: 'stderr' })
        })

        stream.on('close', (code: number | undefined) => {
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
