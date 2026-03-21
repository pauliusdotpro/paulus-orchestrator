export interface ServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  privateKeyPath?: string
  hasPassword?: boolean
  autoConnect?: boolean
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export interface ServerConnection {
  serverId: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}
