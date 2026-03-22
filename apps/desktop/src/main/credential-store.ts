import { safeStorage } from 'electron'
import type { CredentialStore } from '@paulus/core'
import type { PasswordStorageMode, PasswordStorageModeOption } from '@paulus/shared'
import type { StorageService } from '@paulus/core'

const CREDENTIALS_KEY = 'credentials'
const CREDENTIALS_META_KEY = 'credentials-meta'
const DEFAULT_PASSWORD_STORAGE_MODE: PasswordStorageMode = 'safe-storage'

interface StoredCredentials {
  [serverId: string]: string
}

interface CredentialMetadata {
  mode: PasswordStorageMode
}

interface ManagedCredentialStore extends CredentialStore {
  exportAll(): Promise<Record<string, string>>
  importAll(passwords: Record<string, string>): Promise<void>
}

class PlaintextJsonCredentialStore implements ManagedCredentialStore {
  constructor(private readonly storage: StorageService) {}

  async savePassword(serverId: string, password: string): Promise<void> {
    const creds = await this.exportAll()
    creds[serverId] = password
    await this.importAll(creds)
  }

  async getPassword(serverId: string): Promise<string | null> {
    const creds = await this.exportAll()
    return creds[serverId] ?? null
  }

  async removePassword(serverId: string): Promise<void> {
    const creds = await this.exportAll()
    delete creds[serverId]
    await this.importAll(creds)
  }

  async exportAll(): Promise<Record<string, string>> {
    return (await this.storage.get<StoredCredentials>(CREDENTIALS_KEY)) ?? {}
  }

  async importAll(passwords: Record<string, string>): Promise<void> {
    await this.storage.set(CREDENTIALS_KEY, passwords)
  }
}

class SafeStorageCredentialStore implements ManagedCredentialStore {
  constructor(private readonly storage: StorageService) {}

  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'OS-backed encryption is not available on this machine. Saved passwords cannot be switched to safe storage.',
      )
    }
  }

  async savePassword(serverId: string, password: string): Promise<void> {
    const creds = await this.exportAll()
    creds[serverId] = password
    await this.importAll(creds)
  }

  async getPassword(serverId: string): Promise<string | null> {
    const creds = await this.exportAll()
    return creds[serverId] ?? null
  }

  async removePassword(serverId: string): Promise<void> {
    const creds = await this.exportAll()
    delete creds[serverId]
    await this.importAll(creds)
  }

  async exportAll(): Promise<Record<string, string>> {
    this.assertAvailable()

    const encrypted = (await this.storage.get<StoredCredentials>(CREDENTIALS_KEY)) ?? {}
    const decryptedEntries = await Promise.all(
      Object.entries(encrypted).map(async ([serverId, value]) => {
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(value, 'base64'))
          return [serverId, decrypted] as const
        } catch {
          throw new Error(
            'Saved passwords could not be decrypted with the current OS-backed encryption context.',
          )
        }
      }),
    )

    return Object.fromEntries(decryptedEntries)
  }

  async importAll(passwords: Record<string, string>): Promise<void> {
    this.assertAvailable()

    const encryptedEntries = Object.entries(passwords).map(([serverId, password]) => [
      serverId,
      safeStorage.encryptString(password).toString('base64'),
    ])

    await this.storage.set(CREDENTIALS_KEY, Object.fromEntries(encryptedEntries))
  }
}

export class DesktopCredentialStoreManager implements CredentialStore {
  private readonly plaintextStore: ManagedCredentialStore
  private readonly safeStore: ManagedCredentialStore

  constructor(private readonly storage: StorageService) {
    this.plaintextStore = new PlaintextJsonCredentialStore(storage)
    this.safeStore = new SafeStorageCredentialStore(storage)
  }

  async savePassword(serverId: string, password: string): Promise<void> {
    const store = await this.getActiveStore()
    await store.savePassword(serverId, password)
  }

  async getPassword(serverId: string): Promise<string | null> {
    const store = await this.getActiveStore()
    return store.getPassword(serverId)
  }

  async removePassword(serverId: string): Promise<void> {
    const store = await this.getActiveStore()
    await store.removePassword(serverId)
  }

  async getMode(): Promise<PasswordStorageMode> {
    const metadata = await this.storage.get<CredentialMetadata>(CREDENTIALS_META_KEY)
    if (metadata?.mode) {
      return metadata.mode
    }

    await this.storage.set<CredentialMetadata>(CREDENTIALS_META_KEY, {
      mode: DEFAULT_PASSWORD_STORAGE_MODE,
    })
    return DEFAULT_PASSWORD_STORAGE_MODE
  }

  getModeOptions(): PasswordStorageModeOption[] {
    const safeStorageAvailable = safeStorage.isEncryptionAvailable()

    return [
      {
        mode: 'plaintext-json',
        label: 'Plaintext JSON',
        description: 'Passwords are stored as readable text inside credentials.json.',
        available: true,
      },
      {
        mode: 'safe-storage',
        label: 'OS-backed encryption',
        description:
          'Passwords are encrypted with Electron safeStorage and decrypted through your OS user account. Default for desktop installs.',
        available: safeStorageAvailable,
        unavailableReason: safeStorageAvailable
          ? undefined
          : 'Electron safeStorage is not available on this machine.',
      },
    ]
  }

  async setMode(mode: PasswordStorageMode): Promise<void> {
    const currentMode = await this.getMode()
    if (currentMode === mode) {
      return
    }

    const nextStore = this.getStore(mode)
    const currentStore = this.getStore(currentMode)
    const passwords = await currentStore.exportAll()

    await nextStore.importAll(passwords)
    await this.storage.set<CredentialMetadata>(CREDENTIALS_META_KEY, { mode })
  }

  async exportAll(): Promise<Record<string, string>> {
    const store = await this.getActiveStore()
    return store.exportAll()
  }

  private async getActiveStore(): Promise<ManagedCredentialStore> {
    return this.getStore(await this.getMode())
  }

  private getStore(mode: PasswordStorageMode): ManagedCredentialStore {
    if (mode === 'plaintext-json') {
      return this.plaintextStore
    }

    return this.safeStore
  }
}
