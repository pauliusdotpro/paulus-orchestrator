type InspectorLogLevel = 'log' | 'info' | 'warn' | 'error'

type InspectorLogEntry = {
  timestamp: string
  level: InspectorLogLevel
  text: string
}

type InspectorSnapshotEntry = {
  tag: string
  text: string
  role: string | null
  id: string | null
  name: string | null
  placeholder: string | null
}

type InspectorApi = {
  clearLogs: () => void
  getLogs: () => InspectorLogEntry[]
  getSnapshot: () => InspectorSnapshotEntry[]
}

declare global {
  interface Window {
    __PAULUS_INSPECTOR__?: InspectorApi
    __PAULUS_LOG_BUFFER__?: InspectorLogEntry[]
  }
}

const MAX_LOG_ENTRIES = 500

export function installDevtoolsInspector(): void {
  if (window.__PAULUS_INSPECTOR__) {
    return
  }

  const buffer = window.__PAULUS_LOG_BUFFER__ ?? []
  window.__PAULUS_LOG_BUFFER__ = buffer

  const appendLog = (level: InspectorLogLevel, args: unknown[]): void => {
    const text = args.map((arg) => formatValue(arg)).join(' ')
    buffer.push({
      timestamp: new Date().toISOString(),
      level,
      text,
    })

    if (buffer.length > MAX_LOG_ENTRIES) {
      buffer.splice(0, buffer.length - MAX_LOG_ENTRIES)
    }
  }

  const originalConsole = {
    log: window.console.log.bind(window.console),
    info: window.console.info.bind(window.console),
    warn: window.console.warn.bind(window.console),
    error: window.console.error.bind(window.console),
  }

  window.console.log = (...args: unknown[]) => {
    appendLog('log', args)
    originalConsole.log(...args)
  }

  window.console.info = (...args: unknown[]) => {
    appendLog('info', args)
    originalConsole.info(...args)
  }

  window.console.warn = (...args: unknown[]) => {
    appendLog('warn', args)
    originalConsole.warn(...args)
  }

  window.console.error = (...args: unknown[]) => {
    appendLog('error', args)
    originalConsole.error(...args)
  }

  window.addEventListener('error', (event) => {
    appendLog('error', [
      event.message,
      event.error instanceof Error ? (event.error.stack ?? event.error.message) : '',
    ])
  })

  window.addEventListener('unhandledrejection', (event) => {
    appendLog('error', ['Unhandled rejection', formatValue(event.reason)])
  })

  window.__PAULUS_INSPECTOR__ = {
    clearLogs: () => {
      buffer.length = 0
    },
    getLogs: () => [...buffer],
    getSnapshot: () => getSnapshot(),
  }
}

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  return String(value)
}

function getSnapshot(): InspectorSnapshotEntry[] {
  const elements = [
    ...document.querySelectorAll<HTMLElement>(
      'button, [role="button"], a, input, textarea, select',
    ),
  ]

  return elements
    .filter((element) => {
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: normalizeText(
        element.textContent ||
          ('value' in element ? String((element as HTMLInputElement).value || '') : ''),
      ),
      role: element.getAttribute('role'),
      id: element.id || null,
      name: element.getAttribute('name'),
      placeholder: element.getAttribute('placeholder'),
    }))
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export {}
