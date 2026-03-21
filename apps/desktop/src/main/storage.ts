import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, rename, unlink } from 'fs/promises'
import { existsSync } from 'fs'

export class StorageService {
  private basePath: string

  constructor() {
    this.basePath = join(app.getPath('userData'), 'data')
    if (!existsSync(this.basePath)) {
      mkdir(this.basePath, { recursive: true })
    }
  }

  private filePath(key: string): string {
    return join(this.basePath, `${key}.json`)
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await readFile(this.filePath(key), 'utf-8')
      return JSON.parse(data) as T
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const path = this.filePath(key)
    const dir = join(path, '..')
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    const tmp = path + '.tmp'
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
    await rename(tmp, path)
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key))
    } catch {
      // ignore if not found
    }
  }
}
