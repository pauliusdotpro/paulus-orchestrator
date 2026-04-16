import { ipcMain } from 'electron'
import { createDesktopRuntime, type DesktopPaulusRuntime } from './runtime'
import { testAIProvider } from './provider-self-test'
import { ensureDesktopShellEnv } from './shell-env'
import {
  checkForUpdates as checkUpdater,
  downloadUpdate as downloadUpdaterUpdate,
  getUpdaterState,
  quitAndInstall,
} from './updater'

let handlersRegistered = false
let runtimePromise: Promise<DesktopPaulusRuntime> | null = null

function getRuntime(): Promise<DesktopPaulusRuntime> {
  if (!runtimePromise) {
    runtimePromise = createDesktopRuntime()
  }

  return runtimePromise
}

function withRuntime<T>(fn: (runtime: DesktopPaulusRuntime) => Promise<T> | T): Promise<T> {
  return getRuntime().then((runtime) => fn(runtime))
}

export function warmDesktopRuntime(): Promise<DesktopPaulusRuntime> {
  return getRuntime()
}

export function registerIPCHandlers(): void {
  if (handlersRegistered) {
    return
  }

  handlersRegistered = true

  // Servers
  ipcMain.handle('servers:list', () => withRuntime(({ serverManager }) => serverManager.list()))
  ipcMain.handle('servers:add', (_, { config, password }) =>
    withRuntime(({ serverManager }) => serverManager.add(config, password)),
  )
  ipcMain.handle('servers:update', (_, { config, password }) =>
    withRuntime(({ serverManager }) => serverManager.update(config, password)),
  )
  ipcMain.handle('servers:move', (_, { serverId, targetCategory, beforeServerId }) =>
    withRuntime(({ serverManager }) =>
      serverManager.move(serverId, targetCategory, beforeServerId),
    ),
  )
  ipcMain.handle('servers:list-categories', () =>
    withRuntime(({ serverManager }) => serverManager.listCategories()),
  )
  ipcMain.handle('servers:create-category', (_, name) =>
    withRuntime(({ serverManager }) => serverManager.createCategory(name)),
  )
  ipcMain.handle('servers:rename-category', (_, { oldName, newName }) =>
    withRuntime(({ serverManager }) => serverManager.renameCategory(oldName, newName)),
  )
  ipcMain.handle('servers:remove-category', (_, name) =>
    withRuntime(({ serverManager }) => serverManager.removeCategory(name)),
  )
  ipcMain.handle('servers:remove', (_, id) =>
    withRuntime(async ({ sessions, serverManager }) => {
      await sessions.deleteForServer(id)
      await serverManager.remove(id)
    }),
  )
  ipcMain.handle('servers:connect', (_, id) =>
    withRuntime(({ serverManager }) => serverManager.connect(id)),
  )
  ipcMain.handle('servers:connect-with-password', (_, { id, password, save }) =>
    withRuntime(({ serverManager }) => serverManager.connectWithPassword(id, password, save)),
  )
  ipcMain.handle('servers:disconnect', (_, id) =>
    withRuntime(({ serverManager }) => serverManager.disconnect(id)),
  )
  ipcMain.handle('servers:exec', (_, { serverId, sessionId, command }) =>
    withRuntime(({ serverManager }) => serverManager.exec(serverId, sessionId, command)),
  )

  // AI
  ipcMain.handle('ai:send', async (_, { serverId, sessionId, message }) => {
    await ensureDesktopShellEnv()
    return withRuntime(({ aiOrchestrator }) => aiOrchestrator.send(serverId, sessionId, message))
  })
  ipcMain.handle('ai:approve', (_, { sessionId, commandId }) =>
    withRuntime(({ aiOrchestrator }) => aiOrchestrator.approve(sessionId, commandId)),
  )
  ipcMain.handle('ai:reject', (_, { sessionId, commandId }) =>
    withRuntime(({ aiOrchestrator }) => aiOrchestrator.reject(sessionId, commandId)),
  )
  ipcMain.handle('ai:providers', () =>
    withRuntime(async ({ settings }) => {
      const currentSettings = await settings.get()
      return currentSettings.providers
    }),
  )
  ipcMain.handle('ai:models', async (_, provider) => {
    await ensureDesktopShellEnv()
    return withRuntime(({ aiOrchestrator }) => aiOrchestrator.getModels(provider))
  })

  // Sessions
  ipcMain.handle('sessions:list', (_, serverId) =>
    withRuntime(({ sessions }) => sessions.list(serverId)),
  )
  ipcMain.handle('sessions:get', (_, sessionId) =>
    withRuntime(({ sessions }) => sessions.get(sessionId)),
  )
  ipcMain.handle('sessions:create', (_, { serverId, config }) =>
    withRuntime(({ sessions }) => sessions.create(serverId, config)),
  )
  ipcMain.handle('sessions:update', (_, { sessionId, config }) =>
    withRuntime(({ sessions }) => sessions.update(sessionId, config)),
  )
  ipcMain.handle('sessions:delete', (_, sessionId) =>
    withRuntime(({ sessions }) => sessions.delete(sessionId)),
  )
  ipcMain.handle('terminals:get', (_, sessionId) =>
    withRuntime(({ terminalSessions }) => terminalSessions.get(sessionId)),
  )
  ipcMain.handle('terminals:clear', (_, sessionId) =>
    withRuntime(({ terminalSessions }) => terminalSessions.clear(sessionId)),
  )

  // Settings
  ipcMain.handle('settings:get', () => withRuntime(({ settings }) => settings.get()))
  ipcMain.handle('settings:update', (_, partial) =>
    withRuntime(({ settings }) => settings.update(partial)),
  )
  ipcMain.handle('settings:test-provider', async (_, provider) => {
    await ensureDesktopShellEnv()
    return testAIProvider(provider)
  })

  // App data
  ipcMain.handle('app-data:overview', () => withRuntime(({ appData }) => appData.getOverview()))
  ipcMain.handle('app-data:open-directory', () =>
    withRuntime(({ appData }) => appData.openDirectory()),
  )
  ipcMain.handle('app-data:export-servers', () =>
    withRuntime(({ appData }) => appData.exportServers()),
  )
  ipcMain.handle('app-data:import-royal-tsx', (_, { documentPassword }) =>
    withRuntime(({ appData }) => appData.importRoyalTsx(documentPassword)),
  )
  ipcMain.handle('app-data:set-password-storage-mode', (_, mode) =>
    withRuntime(({ appData }) => appData.setPasswordStorageMode(mode)),
  )

  // Storage
  ipcMain.handle('storage:get', (_, key) => withRuntime(({ storage }) => storage.get(key)))
  ipcMain.handle('storage:set', (_, { key, value }) =>
    withRuntime(({ storage }) => storage.set(key, value)),
  )

  // Updater
  ipcMain.handle('updater:get-state', () => getUpdaterState())
  ipcMain.handle('updater:check', () => checkUpdater())
  ipcMain.handle('updater:download', () => downloadUpdaterUpdate())
  ipcMain.handle('updater:install', () => {
    quitAndInstall()
  })
}
