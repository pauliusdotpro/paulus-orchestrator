import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { StorageService } from '@paulus/core'

function createSafeStorageStub() {
  return {
    isEncryptionAvailable() {
      return true
    },
    encryptString(value) {
      return Buffer.from(`enc:${value}`, 'utf-8')
    },
    decryptString(value) {
      const decoded = value.toString('utf-8')
      if (!decoded.startsWith('enc:')) {
        throw new Error('undecryptable')
      }
      return decoded.slice(4)
    },
  }
}

mock.module('electron', () => ({
  safeStorage: createSafeStorageStub(),
}))

const { DesktopCredentialStoreManager } = await import('./credential-store')

describe('DesktopCredentialStoreManager', () => {
  let basePath
  let storage
  let manager

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'paulus-credential-store-'))
    storage = new StorageService(basePath)
    await storage.init()
    manager = new DesktopCredentialStoreManager(storage, createSafeStorageStub())
    await storage.set('credentials-meta', { mode: 'safe-storage' })
  })

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true })
  })

  test('reads one safe-storage password without decrypting unrelated broken entries', async () => {
    await storage.set('credentials', {
      valid: Buffer.from('enc:topsecret', 'utf-8').toString('base64'),
      broken: Buffer.from('corrupt', 'utf-8').toString('base64'),
    })

    await expect(manager.getPassword('valid')).resolves.toBe('topsecret')
  })

  test('saves one safe-storage password without decrypting unrelated broken entries', async () => {
    const brokenValue = Buffer.from('corrupt', 'utf-8').toString('base64')
    await storage.set('credentials', {
      broken: brokenValue,
    })

    await manager.savePassword('fresh', 'new-secret')

    await expect(manager.getPassword('fresh')).resolves.toBe('new-secret')
    await expect(storage.get('credentials')).resolves.toEqual({
      broken: brokenValue,
      fresh: Buffer.from('enc:new-secret', 'utf-8').toString('base64'),
    })
  })

  test('still errors when the requested password entry cannot be decrypted', async () => {
    await storage.set('credentials', {
      broken: Buffer.from('corrupt', 'utf-8').toString('base64'),
    })

    await expect(manager.getPassword('broken')).rejects.toThrow(
      'Saved passwords could not be decrypted with the current OS-backed encryption context.',
    )
  })
})
