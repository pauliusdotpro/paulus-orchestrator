import { spawn } from 'child_process'

const SHELL_ENV_TIMEOUT_MS = 5000
const SHELL_ENV_COMMAND = 'env -0'

type ShellEnvProbe =
  | { type: 'Loaded'; value: Record<string, string> }
  | { type: 'Timeout' }
  | { type: 'Unavailable' }

type ShellEnvMode = '-il'

let shellEnvSyncPromise: Promise<void> | null = null

export function getDesktopUserShell(): string {
  return process.env['SHELL'] || '/bin/sh'
}

export function buildDesktopShellEnvArgs(mode: ShellEnvMode = '-il'): string[] {
  return [mode, '-c', SHELL_ENV_COMMAND]
}

export function parseDesktopShellEnv(output: Buffer): Record<string, string> {
  const env: Record<string, string> = {}

  for (const entry of output.toString('utf8').split('\0')) {
    if (!entry) continue

    const equalsIndex = entry.indexOf('=')
    if (equalsIndex <= 0) continue

    env[entry.slice(0, equalsIndex)] = entry.slice(equalsIndex + 1)
  }

  return env
}

export function mergeDesktopShellEnv(
  shellEnv: Record<string, string> | null,
  appEnv: NodeJS.ProcessEnv,
): Record<string, string> {
  const merged: Record<string, string> = { ...(shellEnv ?? {}) }

  for (const [key, value] of Object.entries(appEnv)) {
    if (typeof value !== 'string') continue
    if (shellEnv && (key === 'PATH' || key === 'Path')) continue
    merged[key] = value
  }

  return merged
}

async function probeDesktopShellEnv(shell: string, mode: ShellEnvMode): Promise<ShellEnvProbe> {
  return new Promise((resolve) => {
    const child = spawn(shell, buildDesktopShellEnvArgs(mode), {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const finish = (probe: ShellEnvProbe): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      resolve(probe)
    }

    const timeoutId = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ type: 'Timeout' })
    }, SHELL_ENV_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    child.on('error', (error) => {
      console.warn(`Failed to load shell environment from ${shell} ${mode}: ${error.message}`)
      finish({ type: 'Unavailable' })
    })

    child.on('close', (code) => {
      if (settled) {
        return
      }

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
        console.warn(
          stderr
            ? `Failed to load shell environment from ${shell} ${mode}: ${stderr}`
            : `Failed to load shell environment from ${shell} ${mode}: exit code ${code}`,
        )
        finish({ type: 'Unavailable' })
        return
      }

      const shellEnv = parseDesktopShellEnv(Buffer.concat(stdoutChunks))
      if (Object.keys(shellEnv).length === 0) {
        console.warn(
          `Failed to load shell environment from ${shell} ${mode}: shell returned no variables.`,
        )
        finish({ type: 'Unavailable' })
        return
      }

      if (!shellEnv['PATH']) {
        console.warn(
          `Failed to load shell environment from ${shell} ${mode}: shell returned no PATH.`,
        )
        finish({ type: 'Unavailable' })
        return
      }

      finish({ type: 'Loaded', value: shellEnv })
    })
  })
}

export async function loadDesktopShellEnv(shell: string): Promise<Record<string, string> | null> {
  const interactive = await probeDesktopShellEnv(shell, '-il')

  if (interactive.type === 'Loaded') {
    return interactive.value
  }

  if (interactive.type === 'Timeout') {
    console.warn(
      `Interactive shell environment probe timed out for ${shell}. Using app environment.`,
    )
    return null
  }

  console.warn(`Shell environment probe failed for ${shell}. Using app environment.`)
  return null
}

export async function ensureDesktopShellEnv(): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }

  if (!shellEnvSyncPromise) {
    shellEnvSyncPromise = (async () => {
      const shell = getDesktopUserShell()
      const env = mergeDesktopShellEnv(await loadDesktopShellEnv(shell), process.env)
      for (const [key, value] of Object.entries(env)) {
        process.env[key] = value
      }
    })()
  }

  await shellEnvSyncPromise
}
