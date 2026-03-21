import type { Bridge } from './types'

export function createElectronBridge(): Bridge {
  const api = (window as any).electronAPI

  return {
    servers: {
      list: () => api.servers.list(),
      add: (server, password) => api.servers.add(server, password),
      update: (server, password) => api.servers.update(server, password),
      remove: (id) => api.servers.remove(id),
      connect: (id) => api.servers.connect(id),
      connectWithPassword: (id, password, save) =>
        api.servers.connectWithPassword(id, password, save),
      disconnect: (id) => api.servers.disconnect(id),
      exec: (serverId, sessionId, command) => api.servers.exec(serverId, sessionId, command),
      onConnectionStatus: (cb) => api.servers.onConnectionStatus(cb),
      onOutput: (cb) => api.servers.onOutput(cb),
    },
    ai: {
      send: (serverId, sessionId, message) => api.ai.send(serverId, sessionId, message),
      approve: (sessionId, commandId) => api.ai.approve(sessionId, commandId),
      reject: (sessionId, commandId) => api.ai.reject(sessionId, commandId),
      getProviders: () => api.ai.getProviders(),
      getModels: (provider) => api.ai.getModels(provider),
      onEvent: (cb) => api.ai.onEvent(cb),
    },
    sessions: {
      list: (serverId) => api.sessions.list(serverId),
      get: (sessionId) => api.sessions.get(sessionId),
      create: (serverId, config) => api.sessions.create(serverId, config),
      update: (sessionId, config) => api.sessions.update(sessionId, config),
      delete: (sessionId) => api.sessions.delete(sessionId),
    },
    terminals: {
      get: (sessionId) => api.terminals.get(sessionId),
      clear: (sessionId) => api.terminals.clear(sessionId),
    },
    settings: {
      get: () => api.settings.get(),
      update: (settings) => api.settings.update(settings),
      testProvider: (provider) => api.settings.testProvider(provider),
    },
    appData: {
      getOverview: () => api.appData.getOverview(),
      openDirectory: () => api.appData.openDirectory(),
      exportServers: () => api.appData.exportServers(),
      setPasswordStorageMode: (mode) => api.appData.setPasswordStorageMode(mode),
    },
    storage: {
      get: (key) => api.storage.get(key),
      set: (key, value) => api.storage.set(key, value),
    },
  }
}
