import type { Bridge } from './types'

export function createWebBridge(): Bridge {
  const notImplemented = () => {
    throw new Error('Web bridge not yet implemented')
  }

  return {
    servers: {
      list: notImplemented,
      add: notImplemented,
      update: notImplemented,
      remove: notImplemented,
      connect: notImplemented,
      connectWithPassword: notImplemented,
      disconnect: notImplemented,
      exec: notImplemented,
      onConnectionStatus: notImplemented,
      onOutput: notImplemented,
    },
    ai: {
      send: notImplemented,
      approve: notImplemented,
      reject: notImplemented,
      getProviders: notImplemented,
      getModels: notImplemented,
      onEvent: notImplemented,
    },
    sessions: {
      list: notImplemented,
      get: notImplemented,
      create: notImplemented,
      update: notImplemented,
      delete: notImplemented,
    },
    terminals: {
      get: notImplemented,
      clear: notImplemented,
    },
    settings: {
      get: notImplemented,
      update: notImplemented,
      testProvider: notImplemented,
    },
    appData: {
      getOverview: notImplemented,
      openDirectory: notImplemented,
      exportServers: notImplemented,
      importRoyalTsx: notImplemented,
      setPasswordStorageMode: notImplemented,
    },
    storage: {
      get: notImplemented,
      set: notImplemented,
    },
  }
}
