import type { Bridge } from './types'
import { createElectronBridge } from './electron'
import { createWebBridge } from './web'

export function createBridge(): Bridge {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return createElectronBridge()
  }
  return createWebBridge()
}
