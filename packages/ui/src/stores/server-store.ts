import { create } from 'zustand'
import type { ServerConfig, ServerConnection } from '@paulus/shared'
import type { Bridge } from '@paulus/bridge'

interface ServerStore {
  servers: ServerConfig[]
  connections: Record<string, ServerConnection>
  activeServerId: string | null
  initialized: boolean

  init(bridge: Bridge): Promise<void>
  loadServers(bridge: Bridge): Promise<void>
  addServer(
    bridge: Bridge,
    config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>,
    password?: string,
  ): Promise<ServerConfig>
  updateServer(bridge: Bridge, config: ServerConfig, password?: string): Promise<ServerConfig>
  removeServer(bridge: Bridge, id: string): Promise<void>
  connectServer(bridge: Bridge, id: string): Promise<void>
  connectServerWithPassword(
    bridge: Bridge,
    id: string,
    password: string,
    save: boolean,
  ): Promise<void>
  disconnectServer(bridge: Bridge, id: string): Promise<void>
  setActiveServer(id: string | null): void
  updateConnectionStatus(status: ServerConnection): void
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  connections: {},
  activeServerId: null,
  initialized: false,

  async init(bridge) {
    if (get().initialized) return
    bridge.servers.onConnectionStatus((status) => {
      get().updateConnectionStatus(status)
    })
    await get().loadServers(bridge)
    set({ initialized: true })
  },

  async loadServers(bridge) {
    const servers = await bridge.servers.list()
    set({ servers })
  },

  async addServer(bridge, config, password) {
    const server = await bridge.servers.add(config, password)
    set((state) => ({ servers: [...state.servers, server] }))
    return server
  },

  async updateServer(bridge, config, password) {
    const server = await bridge.servers.update(config, password)
    set((state) => ({
      servers: state.servers.map((existing) => (existing.id === server.id ? server : existing)),
    }))
    return server
  },

  async removeServer(bridge, id) {
    await bridge.servers.remove(id)
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
      connections: Object.fromEntries(
        Object.entries(state.connections).filter(([serverId]) => serverId !== id),
      ),
    }))
  },

  async connectServer(bridge, id) {
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { serverId: id, status: 'connecting' },
      },
    }))
    await bridge.servers.connect(id)
  },

  async connectServerWithPassword(bridge, id, password, save) {
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { serverId: id, status: 'connecting' },
      },
    }))
    await bridge.servers.connectWithPassword(id, password, save)
    if (save) {
      await get().loadServers(bridge)
    }
  },

  async disconnectServer(bridge, id) {
    await bridge.servers.disconnect(id)
  },

  setActiveServer(id) {
    set({ activeServerId: id })
  },

  updateConnectionStatus(status) {
    set((state) => ({
      connections: { ...state.connections, [status.serverId]: status },
    }))
  },
}))
