import { useEffect, useSyncExternalStore } from 'react'

import { initializePsmPluginHost, psmPluginHost } from './host'
import type { PsmPluginSessionUiSnapshot } from './types'

function subscribe(listener: () => void) {
  return psmPluginHost.subscribe(listener)
}

function getSnapshot(): PsmPluginSessionUiSnapshot {
  return psmPluginHost.getSessionUiSnapshot()
}

export function usePsmPluginSessionUi(): PsmPluginSessionUiSnapshot {
  useEffect(() => {
    initializePsmPluginHost().catch((error) => {
      console.error('[PSM plugins] Failed to initialize session UI contributions:', error)
    })
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export const usePsmPluginUi = usePsmPluginSessionUi
