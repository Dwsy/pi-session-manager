import { useEffect } from 'react'

import { rpcDebug, rpcWarn } from '../utils/rpcDebug'

interface UseRpcAutoStartOptions {
  piPath?: string
  startRPC: (piPath?: string) => Promise<void>
  detectSupport: (piPath?: string) => Promise<boolean>
  setRpcAvailable: React.Dispatch<React.SetStateAction<boolean>>
  setUseRPCMode: React.Dispatch<React.SetStateAction<boolean>>
}

export function useRpcAutoStart({
  piPath,
  startRPC,
  detectSupport,
  setRpcAvailable,
  setUseRPCMode,
}: UseRpcAutoStartOptions): void {
  useEffect(() => {
    let disposed = false

    const initRPC = async () => {
      try {
        await startRPC(piPath)
        if (disposed) return
        setRpcAvailable(true)
        setUseRPCMode(true)
        rpcDebug('SessionViewer', 'rpc mode enabled')
      } catch (err) {
        const supported = await detectSupport(piPath)
        if (disposed) return
        setRpcAvailable(supported)
        setUseRPCMode(false)
        rpcWarn('SessionViewer', 'failed to start rpc, fallback to file mode', err)
      }
    }

    void initRPC()

    return () => {
      disposed = true
    }
  }, [piPath, detectSupport, setRpcAvailable, setUseRPCMode, startRPC])
}
