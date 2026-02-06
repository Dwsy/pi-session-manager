import { useEffect, useRef } from 'react'

import { rpcError, rpcWarn } from '../utils/rpcDebug'
import { sessionPathMatches } from '../utils/sessionPath'

interface UseRpcSessionSwitchOptions {
  enabled: boolean
  rpcConnected: boolean
  sessionPath: string
  sessionIsDraft: boolean
  rpcSessionReady: boolean
  rpcActiveSessionFile: string | null
  switchSession: (path: string) => Promise<void>
  restartRPC: (piPath?: string) => Promise<void>
  piPath?: string
  setRpcSessionReady: React.Dispatch<React.SetStateAction<boolean>>
  onSwitchSuccess?: () => void
}

export function useRpcSessionSwitch({
  enabled,
  rpcConnected,
  sessionPath,
  sessionIsDraft,
  rpcSessionReady,
  rpcActiveSessionFile,
  switchSession,
  restartRPC,
  piPath,
  setRpcSessionReady,
  onSwitchSuccess,
}: UseRpcSessionSwitchOptions): void {
  const rpcSwitchRetryRef = useRef<NodeJS.Timeout | null>(null)
  const rpcSwitchInFlightRef = useRef(false)
  const rpcSwitchAttemptRef = useRef(0)
  const lastTargetRef = useRef<string | null>(null)
  const lastSuccessRef = useRef<{ path: string; at: number } | null>(null)
  const readyDeferRef = useRef<NodeJS.Timeout | null>(null)

  const isWithinGrace = (path: string, now: number) => {
    const last = lastSuccessRef.current
    if (!last || last.path !== path) return false
    return now - last.at < 1500
  }

  useEffect(() => {
    if (!enabled || !rpcConnected || !sessionPath) {
      setRpcSessionReady(false)
      return
    }

    if (sessionIsDraft) {
      rpcSwitchAttemptRef.current = 0
      if (rpcSwitchRetryRef.current) {
        clearTimeout(rpcSwitchRetryRef.current)
        rpcSwitchRetryRef.current = null
      }
      setRpcSessionReady(true)
      return
    }

    const activeMatches =
      rpcActiveSessionFile && sessionPathMatches(sessionPath, rpcActiveSessionFile)
    if (activeMatches) {
      if (rpcSwitchRetryRef.current) {
        clearTimeout(rpcSwitchRetryRef.current)
        rpcSwitchRetryRef.current = null
      }
      if (!rpcSessionReady) {
        setRpcSessionReady(true)
      }
      return
    }

    const now = Date.now()
    if (rpcSessionReady && isWithinGrace(sessionPath, now)) {
      if (rpcSwitchRetryRef.current) {
        clearTimeout(rpcSwitchRetryRef.current)
        rpcSwitchRetryRef.current = null
      }
      return
    }

    if (readyDeferRef.current) {
      clearTimeout(readyDeferRef.current)
      readyDeferRef.current = null
    }
    readyDeferRef.current = setTimeout(() => {
      readyDeferRef.current = null
      setRpcSessionReady(false)
    }, 200)

    let cancelled = false

    const runSwitch = async () => {
      if (cancelled || rpcSwitchInFlightRef.current) return
      if (lastTargetRef.current !== sessionPath) {
        rpcSwitchAttemptRef.current = 0
        lastTargetRef.current = sessionPath
      }
      rpcSwitchInFlightRef.current = true
      try {
        await switchSession(sessionPath)
        if (cancelled) return
        if (readyDeferRef.current) {
          clearTimeout(readyDeferRef.current)
          readyDeferRef.current = null
        }
        rpcSwitchAttemptRef.current = 0
        lastSuccessRef.current = { path: sessionPath, at: Date.now() }
        setRpcSessionReady(true)
        onSwitchSuccess?.()
      } catch (err) {
        if (cancelled) return
        if (readyDeferRef.current) {
          clearTimeout(readyDeferRef.current)
          readyDeferRef.current = null
        }
        setRpcSessionReady(false)
        rpcSwitchAttemptRef.current += 1
        if (rpcSwitchAttemptRef.current % 5 === 0) {
          rpcWarn('SessionViewer', 'switch retries reached threshold, restarting rpc connection', {
            sessionPath,
            attempt: rpcSwitchAttemptRef.current,
          })
          try {
            await restartRPC(piPath)
          } catch (restartErr) {
            rpcError('SessionViewer', 'failed to restart rpc while switching session', restartErr)
          }
        }
        const delay = Math.min(600 * rpcSwitchAttemptRef.current, 5000)
        rpcWarn('SessionViewer', 'failed to switch rpc session, scheduling retry', {
          sessionPath,
          attempt: rpcSwitchAttemptRef.current,
          delay,
          err,
        })
        if (rpcSwitchRetryRef.current) {
          clearTimeout(rpcSwitchRetryRef.current)
        }
        rpcSwitchRetryRef.current = setTimeout(() => {
          rpcSwitchRetryRef.current = null
          void runSwitch()
        }, delay)
      } finally {
        rpcSwitchInFlightRef.current = false
      }
    }

    void runSwitch()

    return () => {
      cancelled = true
      if (readyDeferRef.current) {
        clearTimeout(readyDeferRef.current)
        readyDeferRef.current = null
      }
      if (rpcSwitchRetryRef.current) {
        clearTimeout(rpcSwitchRetryRef.current)
        rpcSwitchRetryRef.current = null
      }
    }
  }, [
    enabled,
    rpcConnected,
    sessionPath,
    sessionIsDraft,
    rpcSessionReady,
    rpcActiveSessionFile,
    switchSession,
    restartRPC,
    piPath,
    setRpcSessionReady,
    onSwitchSuccess,
  ])
}
