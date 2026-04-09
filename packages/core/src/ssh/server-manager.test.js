import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { DEFAULT_SERVER_CATEGORY } from '@paulus/shared'
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
      category: DEFAULT_SERVER_CATEGORY,
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
      category: DEFAULT_SERVER_CATEGORY,
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
      category: DEFAULT_SERVER_CATEGORY,
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
      category: DEFAULT_SERVER_CATEGORY,
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

  test('init migrates stored servers without a category into Uncategorized', async () => {
    const legacyServer = {
      id: 'legacy-server',
      name: 'Legacy Server',
      host: 'legacy.example.com',
      port: 22,
      username: 'root',
      authMethod: 'key',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }

    await storage.set('servers', [legacyServer])
    await manager.init()

    expect(await manager.list()).toEqual([
      {
        ...legacyServer,
        category: DEFAULT_SERVER_CATEGORY,
      },
    ])
    expect(await storage.get('servers')).toEqual([
      {
        ...legacyServer,
        category: DEFAULT_SERVER_CATEGORY,
      },
    ])
    expect(await manager.listCategories()).toEqual([DEFAULT_SERVER_CATEGORY])
    expect(await storage.get('server-categories')).toEqual([DEFAULT_SERVER_CATEGORY])
  })

  test('init reconciles stored categories with server categories and default', async () => {
    const servers = [
      {
        id: 'a',
        name: 'A',
        category: 'Production',
        host: 'a.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ]
    await storage.set('servers', servers)
    await storage.set('server-categories', ['Staging'])
    await manager.init()

    expect(await manager.listCategories()).toEqual([
      'Staging',
      'Production',
      DEFAULT_SERVER_CATEGORY,
    ])
  })

  test('createCategory adds an empty category and persists it', async () => {
    await storage.set('servers', [])
    await manager.init()

    const categories = await manager.createCategory('Work')
    expect(categories).toEqual([DEFAULT_SERVER_CATEGORY, 'Work'])
    expect(await storage.get('server-categories')).toEqual([DEFAULT_SERVER_CATEGORY, 'Work'])
  })

  test('renameCategory updates stored category and moves servers to new name', async () => {
    const server = {
      id: 'a',
      name: 'A',
      category: 'Work',
      host: 'a.example.com',
      port: 22,
      username: 'root',
      authMethod: 'key',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }
    await storage.set('servers', [server])
    await manager.init()

    const result = await manager.renameCategory('Work', 'Office')

    expect(result.categories).toEqual(['Office', DEFAULT_SERVER_CATEGORY])
    expect(result.servers[0].category).toBe('Office')
    expect(result.servers[0].updatedAt).not.toBe('2026-04-09T00:00:00.000Z')
    expect(await storage.get('server-categories')).toEqual(['Office', DEFAULT_SERVER_CATEGORY])
  })

  test('renameCategory merges into existing target category', async () => {
    const servers = [
      {
        id: 'a',
        name: 'A',
        category: 'Work',
        host: 'a.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      {
        id: 'b',
        name: 'B',
        category: 'Office',
        host: 'b.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ]
    await storage.set('servers', servers)
    await manager.init()

    const result = await manager.renameCategory('Work', 'Office')

    expect(result.categories).toEqual(['Office', DEFAULT_SERVER_CATEGORY])
    expect(result.servers.map((s) => s.category)).toEqual(['Office', 'Office'])
  })

  test('renameCategory rejects renaming the default category', async () => {
    await storage.set('servers', [])
    await manager.init()

    await expect(manager.renameCategory(DEFAULT_SERVER_CATEGORY, 'Other')).rejects.toThrow(
      /default category/,
    )
  })

  test('removeCategory moves servers to the default category', async () => {
    const server = {
      id: 'a',
      name: 'A',
      category: 'Work',
      host: 'a.example.com',
      port: 22,
      username: 'root',
      authMethod: 'key',
      createdAt: '2026-04-09T00:00:00.000Z',
      updatedAt: '2026-04-09T00:00:00.000Z',
    }
    await storage.set('servers', [server])
    await manager.init()

    const result = await manager.removeCategory('Work')

    expect(result.categories).toEqual([DEFAULT_SERVER_CATEGORY])
    expect(result.servers[0].category).toBe(DEFAULT_SERVER_CATEGORY)
    expect(await storage.get('server-categories')).toEqual([DEFAULT_SERVER_CATEGORY])
  })

  test('removeCategory rejects removing the default category', async () => {
    await storage.set('servers', [])
    await manager.init()

    await expect(manager.removeCategory(DEFAULT_SERVER_CATEGORY)).rejects.toThrow(
      /default category/,
    )
  })

  test('move reorders servers and changes category in persisted storage', async () => {
    const servers = [
      {
        id: 'alpha-1',
        name: 'Alpha 1',
        category: 'Work',
        host: 'alpha-1.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      {
        id: 'alpha-2',
        name: 'Alpha 2',
        category: 'Work',
        host: 'alpha-2.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
      {
        id: 'home-1',
        name: 'Home 1',
        category: 'Home',
        host: 'home-1.example.com',
        port: 22,
        username: 'root',
        authMethod: 'key',
        createdAt: '2026-04-09T00:00:00.000Z',
        updatedAt: '2026-04-09T00:00:00.000Z',
      },
    ]

    await storage.set('servers', servers)
    await manager.init()

    const movedServers = await manager.move('home-1', 'Work', 'alpha-2')

    expect(movedServers.map((server) => `${server.category}:${server.id}`)).toEqual([
      'Work:alpha-1',
      'Work:home-1',
      'Work:alpha-2',
    ])
    expect(movedServers[1].updatedAt).not.toBe('2026-04-09T00:00:00.000Z')
    expect(await storage.get('servers')).toEqual(movedServers)
  })
})
