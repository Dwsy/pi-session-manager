import { useEffect } from 'react'

import { listen } from '../transport'

export function useRpcExitNotice(enabled: boolean, onExit: (message: string) => void): void {
  useEffect(() => {
    if (!enabled) return
    const unlisten = (async () => {
      return await listen('pi-rpc-exited', () => {
        onExit('RPC 连接已断开')
      })
    })()

    return () => {
      void unlisten.then(off => off && off())
    }
  }, [enabled, onExit])
}
