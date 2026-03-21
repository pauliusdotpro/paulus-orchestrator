import type { Bridge } from '@paulus/bridge'
import { createBridge } from '@paulus/bridge'

let bridge: Bridge | null = null

export function useBridge(): Bridge {
  if (!bridge) {
    bridge = createBridge()
  }
  return bridge
}
