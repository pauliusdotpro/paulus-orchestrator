import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { noopRuntimeEventSink } from '../events'
import { StorageService } from '../storage'
import { TerminalSessionManager } from '../terminal-session-manager'
import { ServerManager } from './server-manager'

describe('ServerManager connection behavior', () => {
  let basePath
  let storage
  let terminalSessions
  let passwordLookups
  let credentials
  let manager

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'paulus-server-manager-'))
    storage = new StorageService(basePath)
    await storage.init()
    terminalSessions = new TerminalSessionManager(storage)
    passwordLookups = []
    credentials = {
      savePassword: async () => {},
      getPassword: async (serverId) => {
        passwordLookups.push(serverId)
        return `${serverId}-password`
      },
      removePassword: async () => {},
    }
    manager = new ServerManager(storage, credentials, terminalSessions, noopRuntimeEventSink)
  })

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true })
  })

  test('connect skips credential lookups for key auth servers', async () => {
    const server = {
      id: 'key-server',
      name: 'Key Server',
      host: 'example.com',
      port: 22,
      username: 'root',
      authMethod: 'key',
      privateKeyPath: '/tmp/id_ed25519',
      autoConnect: true,
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }

    await storage.set('servers', [server])
    await manager.init()

    const connectCalls = []
    manager.pool.connect = async (config, password) => {
      connectCalls.push({ config, password })
    }

    await manager.connect(server.id)

    expect(passwordLookups).toEqual([])
    expect(connectCalls).toEqual([{ config: server, password: undefined }])
  })

  test('connect loads credentials for password auth servers', async () => {
    const server = {
      id: 'password-server',
      name: 'Password Server',
      host: 'example.com',
      port: 22,
      username: 'root',
      authMethod: 'password',
      autoConnect: false,
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }

    await storage.set('servers', [server])
    await manager.init()

    const connectCalls = []
    manager.pool.connect = async (config, password) => {
      connectCalls.push({ config, password })
    }

    await manager.connect(server.id)

    expect(passwordLookups).toEqual([server.id])
    expect(connectCalls).toEqual([{ config: server, password: `${server.id}-password` }])
  })

  test('autoConnectAll only connects key auth servers on launch', async () => {
    const keyServer = {
      id: 'key-server',
      name: 'Key Server',
      host: 'example.com',
      port: 22,
      username: 'root',
      authMethod: 'key',
      privateKeyPath: '/tmp/id_ed25519',
      autoConnect: true,
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }
    const passwordServer = {
      id: 'password-server',
      name: 'Password Server',
      host: 'example.org',
      port: 22,
      username: 'root',
      authMethod: 'password',
      hasPassword: true,
      autoConnect: true,
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }

    await storage.set('servers', [keyServer, passwordServer])
    await manager.init()

    const connectedServerIds = []
    manager.connect = async (serverId) => {
      connectedServerIds.push(serverId)
    }

    await manager.autoConnectAll()

    expect(connectedServerIds).toEqual([keyServer.id])
  })
})
