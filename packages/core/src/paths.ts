import { homedir } from 'os'
import { join } from 'path'

export function getDefaultDataPath(appName = '@paulus/desktop'): string {
  const override = process.env['PAULUS_DATA_PATH']
  if (override) {
    return override
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', appName, 'data')
  }

  if (process.platform === 'win32') {
    const appData = process.env['APPDATA']
    if (!appData) throw new Error('APPDATA is required on Windows')
    return join(appData, appName, 'data')
  }

  if (process.platform === 'linux') {
    const configHome = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
    return join(configHome, appName, 'data')
  }

  throw new Error(`Unsupported platform: ${process.platform}`)
}
