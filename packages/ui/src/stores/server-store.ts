import { create } from 'zustand'
import type { ServerConfig, ServerConnection } from '@paulus/shared'
import type { Bridge } from '@paulus/bridge'

interface ServerStore {
  servers: ServerConfig[]
  categories: string[]
  connections: Record<string, ServerConnection>
  activeServerId: string | null
  initialized: boolean

  init(bridge: Bridge): Promise<void>
  loadServers(bridge: Bridge): Promise<void>
  loadCategories(bridge: Bridge): Promise<void>
  addServer(
    bridge: Bridge,
    config: Omit<ServerConfig, 'id' | 'createdAt' | 'updatedAt'>,
    password?: string,
  ): Promise<ServerConfig>
  updateServer(bridge: Bridge, config: ServerConfig, password?: string): Promise<ServerConfig>
  moveServer(
    bridge: Bridge,
    serverId: string,
    targetCategory: string,
    beforeServerId?: string,
  ): Promise<void>
  createCategory(bridge: Bridge, name: string): Promise<void>
  renameCategory(bridge: Bridge, oldName: string, newName: string): Promise<void>
  removeCategory(bridge: Bridge, name: string): Promise<void>
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
  categories: [],
  connections: {},
  activeServerId: null,
  initialized: false,

  async init(bridge) {
    if (get().initialized) return
    bridge.servers.onConnectionStatus((status) => {
      get().updateConnectionStatus(status)
    })
    await Promise.all([get().loadServers(bridge), get().loadCategories(bridge)])
    set({ initialized: true })
  },

  async loadServers(bridge) {
    const servers = await bridge.servers.list()
    set({ servers })
  },

  async loadCategories(bridge) {
    const categories = await bridge.servers.listCategories()
    set({ categories })
  },

  async addServer(bridge, config, password) {
    const server = await bridge.servers.add(config, password)
    set((state) => ({
      servers: [...state.servers, server],
      categories: state.categories.includes(server.category)
        ? state.categories
        : [...state.categories, server.category],
    }))
    return server
  },

  async updateServer(bridge, config, password) {
    const server = await bridge.servers.update(config, password)
    set((state) => ({
      servers: state.servers.map((existing) => (existing.id === server.id ? server : existing)),
      categories: state.categories.includes(server.category)
        ? state.categories
        : [...state.categories, server.category],
    }))
    return server
  },

  async moveServer(bridge, serverId, targetCategory, beforeServerId) {
    const servers = await bridge.servers.move(serverId, targetCategory, beforeServerId)
    set((state) => ({
      servers,
      categories: state.categories.includes(targetCategory)
        ? state.categories
        : [...state.categories, targetCategory],
    }))
  },

  async createCategory(bridge, name) {
    const categories = await bridge.servers.createCategory(name)
    set({ categories })
  },

  async renameCategory(bridge, oldName, newName) {
    const result = await bridge.servers.renameCategory(oldName, newName)
    set({ categories: result.categories, servers: result.servers })
  },

  async removeCategory(bridge, name) {
    const result = await bridge.servers.removeCategory(name)
    set({ categories: result.categories, servers: result.servers })
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
