import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createPaulusRuntime, type PaulusRuntime, type RuntimeEventSink } from '@paulus/core'
import { AppDataManager } from './app-data-manager'
import { DesktopCredentialStoreManager } from './credential-store'

export interface DesktopPaulusRuntime extends PaulusRuntime {
  appData: AppDataManager
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(channel, payload)
  }
}

export async function createDesktopRuntime(): Promise<DesktopPaulusRuntime> {
  const eventSink: RuntimeEventSink = {
    emitAIEvent(event) {
      broadcast('ai:event', event)
    },
    emitSSHOutput(event) {
      broadcast('ssh:output', event)
    },
    emitConnectionStatus(status) {
      broadcast('server:connection-status', status)
    },
  }

  let credentials: DesktopCredentialStoreManager | null = null

  const runtime = await createPaulusRuntime({
    basePath: join(app.getPath('userData'), 'data'),
    credentialStoreFactory: (storage) => {
      credentials = new DesktopCredentialStoreManager(storage)
      return credentials
    },
    eventSink,
    autoConnect: true,
  })

  if (!credentials) {
    throw new Error('Desktop credential store was not initialized')
  }

  return {
    ...runtime,
    appData: new AppDataManager(runtime.storage, runtime.serverManager, credentials),
  }
}
