import { invoke as baseInvoke, isTauri } from '@/transport'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { PsmTransport } from './types'

export const appPsmTransport: PsmTransport = {
  invoke(command, payload) {
    if (isTauri()) {
      return tauriInvoke('plugin_dispatch_command', {
        command,
        payload: (payload ?? {}) as Record<string, unknown>,
      })
    }
    return baseInvoke(command, payload)
  },
}
