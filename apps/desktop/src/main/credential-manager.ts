import type { StorageService } from './storage'

const CREDENTIALS_KEY = 'credentials'

interface StoredCredentials {
  [serverId: string]: string
}

export class CredentialManager {
  private storage: StorageService

  constructor(storage: StorageService) {
    this.storage = storage
  }

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
