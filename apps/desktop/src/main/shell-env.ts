import { execFileSync } from 'child_process'

const PATH_MARKER_START = '__PAULUS_PATH_START__'
const PATH_MARKER_END = '__PAULUS_PATH_END__'

export function syncDesktopShellPath(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const shell = process.env['SHELL']
  if (!shell) {
    throw new Error('SHELL is not set. Cannot initialize PATH for the packaged desktop app.')
  }

  const output = execFileSync(
    shell,
    ['-l', '-c', `printf '${PATH_MARKER_START}%s${PATH_MARKER_END}' "$PATH"`],
    {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const start = output.indexOf(PATH_MARKER_START)
  const end = output.indexOf(PATH_MARKER_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Failed to read PATH from the login shell.')
  }

  const shellPath = output.slice(start + PATH_MARKER_START.length, end).trim()
  if (!shellPath) {
    throw new Error('The login shell returned an empty PATH.')
  }

  process.env.PATH = shellPath
}
