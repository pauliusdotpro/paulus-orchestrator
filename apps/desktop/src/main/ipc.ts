import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { createDesktopRuntime } from './runtime'
import { testAIProvider } from './provider-self-test'

export async function registerIPCHandlers(win: BrowserWindow): Promise<void> {
  const runtime = await createDesktopRuntime(win)
  const { storage, settings, sessions, terminalSessions, serverManager, aiOrchestrator, appData } =
    runtime

  // Servers
  ipcMain.handle('servers:list', () => serverManager.list())
  ipcMain.handle('servers:add', (_, { config, password }) => serverManager.add(config, password))
  ipcMain.handle('servers:update', (_, { config, password }) =>
    serverManager.update(config, password),
  )
  ipcMain.handle('servers:move', (_, { serverId, targetCategory, beforeServerId }) =>
    serverManager.move(serverId, targetCategory, beforeServerId),
  )
  ipcMain.handle('servers:list-categories', () => serverManager.listCategories())
  ipcMain.handle('servers:create-category', (_, name) => serverManager.createCategory(name))
  ipcMain.handle('servers:rename-category', (_, { oldName, newName }) =>
    serverManager.renameCategory(oldName, newName),
  )
  ipcMain.handle('servers:remove-category', (_, name) => serverManager.removeCategory(name))
  ipcMain.handle('servers:remove', async (_, id) => {
    await sessions.deleteForServer(id)
    await serverManager.remove(id)
  })
  ipcMain.handle('servers:connect', (_, id) => serverManager.connect(id))
  ipcMain.handle('servers:connect-with-password', (_, { id, password, save }) =>
    serverManager.connectWithPassword(id, password, save),
  )
  ipcMain.handle('servers:disconnect', (_, id) => serverManager.disconnect(id))
  ipcMain.handle('servers:exec', (_, { serverId, sessionId, command }) =>
    serverManager.exec(serverId, sessionId, command),
  )

  // AI
  ipcMain.handle('ai:send', (_, { serverId, sessionId, message }) =>
    aiOrchestrator.send(serverId, sessionId, message),
  )
  ipcMain.handle('ai:approve', (_, { sessionId, commandId }) =>
    aiOrchestrator.approve(sessionId, commandId),
  )
  ipcMain.handle('ai:reject', (_, { sessionId, commandId }) =>
    aiOrchestrator.reject(sessionId, commandId),
  )
  ipcMain.handle('ai:providers', async () => {
    const s = await settings.get()
    return s.providers
  })
  ipcMain.handle('ai:models', (_, provider) => aiOrchestrator.getModels(provider))

  // Sessions
  ipcMain.handle('sessions:list', (_, serverId) => sessions.list(serverId))
  ipcMain.handle('sessions:get', (_, sessionId) => sessions.get(sessionId))
  ipcMain.handle('sessions:create', (_, { serverId, config }) => sessions.create(serverId, config))
  ipcMain.handle('sessions:update', (_, { sessionId, config }) =>
    sessions.update(sessionId, config),
  )
  ipcMain.handle('sessions:delete', (_, sessionId) => sessions.delete(sessionId))
  ipcMain.handle('terminals:get', (_, sessionId) => terminalSessions.get(sessionId))
  ipcMain.handle('terminals:clear', (_, sessionId) => terminalSessions.clear(sessionId))

  // Settings
  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:update', (_, partial) => settings.update(partial))
  ipcMain.handle('settings:test-provider', (_, provider) => testAIProvider(provider))

  // App data
  ipcMain.handle('app-data:overview', () => appData.getOverview())
  ipcMain.handle('app-data:open-directory', () => appData.openDirectory())
  ipcMain.handle('app-data:export-servers', () => appData.exportServers())
  ipcMain.handle('app-data:import-royal-tsx', (_, { documentPassword }) =>
    appData.importRoyalTsx(documentPassword),
  )
  ipcMain.handle('app-data:set-password-storage-mode', (_, mode) =>
    appData.setPasswordStorageMode(mode),
  )

  // Storage
  ipcMain.handle('storage:get', (_, key) => storage.get(key))
  ipcMain.handle('storage:set', (_, { key, value }) => storage.set(key, value))
}
