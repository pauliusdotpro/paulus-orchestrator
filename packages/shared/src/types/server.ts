export const DEFAULT_SERVER_CATEGORY = 'Uncategorized'

export interface ServerConfig {
  id: string
  name: string
  category: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  privateKeyPath?: string
  hasPassword?: boolean
  autoConnect?: boolean
  color?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface ServerConnection {
  serverId: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}
