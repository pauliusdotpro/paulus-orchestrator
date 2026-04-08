import { spawnSync } from 'child_process'

const SHELL_ENV_TIMEOUT_MS = 5000
const SHELL_ENV_COMMAND = 'env -0'

type ShellEnvProbe =
  | { type: 'Loaded'; value: Record<string, string> }
  | { type: 'Timeout' }
  | { type: 'Unavailable' }

type ShellEnvMode = '-il' | '-l'

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

function probeDesktopShellEnv(shell: string, mode: ShellEnvMode): ShellEnvProbe {
  const result = spawnSync(shell, buildDesktopShellEnvArgs(mode), {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: SHELL_ENV_TIMEOUT_MS,
    windowsHide: true,
  })

  const error = result.error as NodeJS.ErrnoException | undefined
  if (error) {
    if (error.code === 'ETIMEDOUT') return { type: 'Timeout' }
    console.warn(`Failed to load shell environment from ${shell} ${mode}: ${error.message}`)
    return { type: 'Unavailable' }
  }

  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8').trim()
    console.warn(
      stderr
        ? `Failed to load shell environment from ${shell} ${mode}: ${stderr}`
        : `Failed to load shell environment from ${shell} ${mode}: exit code ${result.status}`,
    )
    return { type: 'Unavailable' }
  }

  const shellEnv = parseDesktopShellEnv(result.stdout)
  if (Object.keys(shellEnv).length === 0) {
    console.warn(
      `Failed to load shell environment from ${shell} ${mode}: shell returned no variables.`,
    )
    return { type: 'Unavailable' }
  }

  if (!shellEnv['PATH']) {
    console.warn(`Failed to load shell environment from ${shell} ${mode}: shell returned no PATH.`)
    return { type: 'Unavailable' }
  }

  return { type: 'Loaded', value: shellEnv }
}

export function loadDesktopShellEnv(shell: string): Record<string, string> | null {
  const interactive = probeDesktopShellEnv(shell, '-il')
  if (interactive.type === 'Loaded') {
    return interactive.value
  }

  if (interactive.type === 'Timeout') {
    console.warn(
      `Interactive shell environment probe timed out for ${shell}. Using app environment.`,
    )
    return null
  }

  const login = probeDesktopShellEnv(shell, '-l')
  if (login.type === 'Loaded') {
    return login.value
  }

  console.warn(`Shell environment probe failed for ${shell}. Using app environment.`)
  return null
}

export function syncDesktopShellEnv(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const shell = getDesktopUserShell()
  const env = mergeDesktopShellEnv(loadDesktopShellEnv(shell), process.env)
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
}
