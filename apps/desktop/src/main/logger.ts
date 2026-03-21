import type { BrowserWindow } from 'electron'

let win: BrowserWindow | null = null

export function initLogger(browserWindow: BrowserWindow): void {
  win = browserWindow

  if (process.env.NODE_ENV !== 'production') {
    // Intercept console.log/error/warn in main process and forward to renderer DevTools
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    console.log = (...args: any[]) => {
      originalLog(...args)
      sendToRenderer('log', args)
    }

    console.error = (...args: any[]) => {
      originalError(...args)
      sendToRenderer('error', args)
    }

    console.warn = (...args: any[]) => {
      originalWarn(...args)
      sendToRenderer('warn', args)
    }
  }
}

function sendToRenderer(level: string, args: any[]): void {
  if (!win || win.isDestroyed()) return
  try {
    const message = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 0)))
      .join(' ')
    win.webContents
      .executeJavaScript(`console.${level}('[main]', ${JSON.stringify(message)})`)
      .catch(() => {})
  } catch {
    // ignore — window might not be ready
  }
}
