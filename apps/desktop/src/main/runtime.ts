import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { createPaulusRuntime, type PaulusRuntime, type RuntimeEventSink } from '@paulus/core'
import { AppDataManager } from './app-data-manager'
import { DesktopCredentialStoreManager } from './credential-store'

export interface DesktopPaulusRuntime extends PaulusRuntime {
  appData: AppDataManager
}

export async function createDesktopRuntime(win: BrowserWindow): Promise<DesktopPaulusRuntime> {
  const eventSink: RuntimeEventSink = {
    emitAIEvent(event) {
      win.webContents.send('ai:event', event)
    },
    emitSSHOutput(event) {
      win.webContents.send('ssh:output', event)
    },
    emitConnectionStatus(status) {
      win.webContents.send('server:connection-status', status)
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
