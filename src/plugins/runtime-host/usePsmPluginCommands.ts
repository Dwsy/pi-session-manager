import { useEffect, useSyncExternalStore } from 'react'

import { initializePsmPluginHost, psmPluginHost } from './host'
import type { PsmPluginCommandRuntimeRegistration } from './types'

function subscribe(listener: () => void) {
  return psmPluginHost.subscribe(listener)
}

function getSnapshot(): PsmPluginCommandRuntimeRegistration[] {
  return psmPluginHost.listCommands()
}

export function usePsmPluginCommands(): PsmPluginCommandRuntimeRegistration[] {
  useEffect(() => {
    initializePsmPluginHost().catch((error) => {
      console.error('[PSM plugins] Failed to initialize command contributions:', error)
    })
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
