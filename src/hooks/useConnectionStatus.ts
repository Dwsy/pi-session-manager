import { useState, useEffect } from 'react'
import { getTransport } from '../transport'
import type { ConnectionStatus } from '../transport'

/**
 * Track transport connection status.
 * Returns 'connected' | 'connecting' | 'disconnected'.
 * Tauri IPC is always 'connected'.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const transport = getTransport()
    if (!transport.onStatusChange) {
      // TauriTransport — always connected
      setStatus('connected')
      return
    }
    return transport.onStatusChange(setStatus)
  }, [])

  return status
}
