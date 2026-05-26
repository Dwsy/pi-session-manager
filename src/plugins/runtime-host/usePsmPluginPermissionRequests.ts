import { useSyncExternalStore } from 'react'

import { psmPluginPermissionRequests } from './permissionRequests'

export function usePsmPluginPermissionRequest() {
  return useSyncExternalStore(
    psmPluginPermissionRequests.subscribe,
    psmPluginPermissionRequests.getSnapshot,
    psmPluginPermissionRequests.getSnapshot,
  )
}
