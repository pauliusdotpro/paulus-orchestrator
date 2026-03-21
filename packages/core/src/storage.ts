import { existsSync } from 'fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export class StorageService {
  constructor(private readonly basePath: string) {}

  async init(): Promise<void> {
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true })
    }
  }

  get path(): string {
    return this.basePath
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
    const dir = dirname(path)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
    await rename(tmp, path)
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key))
    } catch {
      // ignore missing files
    }
  }
}
