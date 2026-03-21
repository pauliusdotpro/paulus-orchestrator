import { app, dialog, shell } from 'electron'
import { readdir, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AppDataOverview, PasswordStorageMode } from '@paulus/shared'
import type { StorageService } from '@paulus/core'
import type { ServerManager } from '@paulus/core'
import { DesktopCredentialStoreManager } from './credential-store'

export class AppDataManager {
  constructor(
    private readonly storage: StorageService,
    private readonly serverManager: ServerManager,
    private readonly credentials: DesktopCredentialStoreManager,
  ) {}

  async getOverview(): Promise<AppDataOverview> {
    const [servers, rawCredentials, sessionCount, passwordStorageMode] = await Promise.all([
      this.serverManager.list(),
      this.storage.get<Record<string, string>>('credentials'),
      this.countSessionFiles(),
      this.credentials.getMode(),
    ])

    return {
      dataDirectory: this.storage.path,
      serversFile: join(this.storage.path, 'servers.json'),
      settingsFile: join(this.storage.path, 'settings.json'),
      credentialsFile: join(this.storage.path, 'credentials.json'),
      sessionFilePattern: join(this.storage.path, 'sessions', '<server-id>', '<session-id>.json'),
      sessionIndexFilePattern: join(this.storage.path, 'sessions', '<server-id>', 'index.json'),
      serverCount: servers.length,
      savedPasswordCount: Object.keys(rawCredentials ?? {}).length,
      sessionCount,
      passwordStorageMode,
      passwordStorageOptions: this.credentials.getModeOptions(),
    }
  }

  async openDirectory(): Promise<void> {
    const error = await shell.openPath(this.storage.path)
    if (error) {
      throw new Error(error)
    }
  }

  async exportServers(): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Export servers and passwords',
      defaultPath: join(
        app.getPath('downloads'),
        `paulus-servers-export-${new Date().toISOString().slice(0, 10)}.json`,
      ),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const [servers, passwords, passwordStorageMode] = await Promise.all([
      this.serverManager.list(),
      this.credentials.exportAll(),
      this.credentials.getMode(),
    ])

    const payload = {
      exportedAt: new Date().toISOString(),
      passwordStorageMode,
      servers: servers.map((server) => ({
        ...server,
        password: passwords[server.id] ?? null,
      })),
    }

    const tmpPath = `${result.filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
    await rename(tmpPath, result.filePath)

    return result.filePath
  }

  async setPasswordStorageMode(mode: PasswordStorageMode): Promise<AppDataOverview> {
    await this.credentials.setMode(mode)
    return this.getOverview()
  }

  private async countSessionFiles(): Promise<number> {
    return this.countSessionFilesInDirectory(join(this.storage.path, 'sessions'))
  }

  private async countSessionFilesInDirectory(directoryPath: string): Promise<number> {
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true })
      let count = 0

      for (const entry of entries) {
        const entryPath = join(directoryPath, entry.name)

        if (entry.isDirectory()) {
          count += await this.countSessionFilesInDirectory(entryPath)
          continue
        }

        if (!entry.name.endsWith('.json') || entry.name === 'index.json') {
          continue
        }

        count += 1
      }

      return count
    } catch {
      return 0
    }
  }
}
