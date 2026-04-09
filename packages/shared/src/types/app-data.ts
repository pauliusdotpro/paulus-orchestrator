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

export interface RoyalTsxImportSkippedEntry {
  name: string
  reason: string
}

export interface RoyalTsxImportResult {
  filePath: string
  importedServerCount: number
  savedPasswordCount: number
  encryptedSecretCount: number
  skippedServerCount: number
  skippedServers: RoyalTsxImportSkippedEntry[]
}
