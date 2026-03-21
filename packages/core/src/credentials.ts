import type { StorageService } from './storage'

export interface CredentialStore {
  savePassword(serverId: string, password: string): Promise<void>
  getPassword(serverId: string): Promise<string | null>
  removePassword(serverId: string): Promise<void>
}

export type CredentialStoreFactory = (storage: StorageService) => CredentialStore

const CREDENTIALS_KEY = 'credentials'

interface StoredCredentials {
  [serverId: string]: string
}

export class PlaintextCredentialStore implements CredentialStore {
  constructor(private readonly storage: StorageService) {}

  async savePassword(serverId: string, password: string): Promise<void> {
    const creds = (await this.storage.get<StoredCredentials>(CREDENTIALS_KEY)) ?? {}
    creds[serverId] = password
    await this.storage.set(CREDENTIALS_KEY, creds)
  }

  async getPassword(serverId: string): Promise<string | null> {
    const creds = await this.storage.get<StoredCredentials>(CREDENTIALS_KEY)
    return creds?.[serverId] ?? null
  }

  async removePassword(serverId: string): Promise<void> {
    const creds = (await this.storage.get<StoredCredentials>(CREDENTIALS_KEY)) ?? {}
    delete creds[serverId]
    await this.storage.set(CREDENTIALS_KEY, creds)
  }
}
