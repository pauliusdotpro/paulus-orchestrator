import { contextBridge, ipcRenderer } from 'electron'

function onEvent(channel: string, cb: (...args: any[]) => void): () => void {
  const handler = (_event: any, ...args: any[]) => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    add: (config: any, password?: string) =>
      ipcRenderer.invoke('servers:add', { config, password }),
    update: (server: any, password?: string) =>
      ipcRenderer.invoke('servers:update', { config: server, password }),
    move: (serverId: string, targetCategory: string, beforeServerId?: string) =>
      ipcRenderer.invoke('servers:move', { serverId, targetCategory, beforeServerId }),
    listCategories: () => ipcRenderer.invoke('servers:list-categories'),
    createCategory: (name: string) => ipcRenderer.invoke('servers:create-category', name),
    renameCategory: (oldName: string, newName: string) =>
      ipcRenderer.invoke('servers:rename-category', { oldName, newName }),
    removeCategory: (name: string) => ipcRenderer.invoke('servers:remove-category', name),
    remove: (id: string) => ipcRenderer.invoke('servers:remove', id),
    connect: (id: string) => ipcRenderer.invoke('servers:connect', id),
    connectWithPassword: (id: string, password: string, save: boolean) =>
      ipcRenderer.invoke('servers:connect-with-password', { id, password, save }),
    disconnect: (id: string) => ipcRenderer.invoke('servers:disconnect', id),
    exec: (serverId: string, sessionId: string, command: string) =>
      ipcRenderer.invoke('servers:exec', { serverId, sessionId, command }),
    onConnectionStatus: (cb: any) => onEvent('server:connection-status', cb),
    onOutput: (cb: any) => onEvent('ssh:output', cb),
  },
  ai: {
    send: (serverId: string, sessionId: string, message: string) =>
      ipcRenderer.invoke('ai:send', { serverId, sessionId, message }),
    approve: (sessionId: string, commandId: string) =>
      ipcRenderer.invoke('ai:approve', { sessionId, commandId }),
    reject: (sessionId: string, commandId: string) =>
      ipcRenderer.invoke('ai:reject', { sessionId, commandId }),
    getProviders: () => ipcRenderer.invoke('ai:providers'),
    getModels: (provider: string) => ipcRenderer.invoke('ai:models', provider),
    onEvent: (cb: any) => onEvent('ai:event', cb),
  },
  sessions: {
    list: (serverId: string) => ipcRenderer.invoke('sessions:list', serverId),
    get: (sessionId: string) => ipcRenderer.invoke('sessions:get', sessionId),
    create: (
      serverId: string,
      config: { provider: string; model: string | null; yoloMode: boolean },
    ) => ipcRenderer.invoke('sessions:create', { serverId, config }),
    update: (
      sessionId: string,
      config: { provider: string; model: string | null; yoloMode: boolean },
    ) => ipcRenderer.invoke('sessions:update', { sessionId, config }),
    delete: (sessionId: string) => ipcRenderer.invoke('sessions:delete', sessionId),
  },
  terminals: {
    get: (sessionId: string) => ipcRenderer.invoke('terminals:get', sessionId),
    clear: (sessionId: string) => ipcRenderer.invoke('terminals:clear', sessionId),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: any) => ipcRenderer.invoke('settings:update', settings),
    testProvider: (provider: string) => ipcRenderer.invoke('settings:test-provider', provider),
  },
  appData: {
    getOverview: () => ipcRenderer.invoke('app-data:overview'),
    openDirectory: () => ipcRenderer.invoke('app-data:open-directory'),
    exportServers: () => ipcRenderer.invoke('app-data:export-servers'),
    importRoyalTsx: (documentPassword: string) =>
      ipcRenderer.invoke('app-data:import-royal-tsx', { documentPassword }),
    setPasswordStorageMode: (mode: string) =>
      ipcRenderer.invoke('app-data:set-password-storage-mode', mode),
  },
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('storage:set', { key, value }),
  },
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onEvent: (cb: any) => onEvent('updater:event', cb),
  },
})
