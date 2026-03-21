import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIPCHandlers } from './ipc'
import { initLogger } from './logger'

const isDev = !app.isPackaged

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Paulus Orchestrator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  await registerIPCHandlers(win)

  if (isDev) {
    // Forward main process logs to renderer DevTools console
    win.webContents.on('did-finish-load', () => {
      initLogger(win)
    })
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
