export type PasswordStorageMode = 'plaintext-json' | 'safe-storage'

export interface PasswordStorageModeOption {
  mode: PasswordStorageMode
  label: string
  description: string
  available: boolean
  unavailableReason?: string
}

export interface AppDataOverview {
  dataDirectory: string
  serversFile: string
  settingsFile: string
  credentialsFile: string
  sessionFilePattern: string
  sessionIndexFilePattern: string
  serverCount: number
  savedPasswordCount: number
  sessionCount: number
  passwordStorageMode: PasswordStorageMode
  passwordStorageOptions: PasswordStorageModeOption[]
}
