import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionInfo, SessionStats } from '@/types'
import { getRuntimeStats } from '@/runtime-data/sessionSource'
import { useRecapEasterEgg } from '@/hooks/useRecapEasterEgg'
import DashboardRecapModal from './DashboardRecapModal'
import { filterSessionsByPeriod } from './dashboardInsights'
import {
  DASHBOARD_RECAP_EVENT,
  DASHBOARD_RECAP_SETTINGS_EVENT,
  getAutomaticDashboardRecap,
  getEasterEggDashboardRecap,
  hasShownDashboardRecap,
  isDashboardRecapPeriodAutoEnabled,
  markDashboardRecapShown,
  type DashboardRecapRequest,
} from './dashboardRecap'

interface DashboardRecapControllerProps {
  sessions: SessionInfo[]
}

/**
 * Owns the recap lifecycle: listens for open requests (settings buttons, the
 * seasonal automatic window, the hidden keyboard triggers), scopes sessions
 * to the requested period, fetches period stats, and hands everything to the
 * modal. Mounted once in AppOverlays.
 */
export default function DashboardRecapController({ sessions }: DashboardRecapControllerProps) {
  const [request, setRequest] = useState<DashboardRecapRequest | null>(null)
  const [periodSessions, setPeriodSessions] = useState<SessionInfo[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openedAutomaticCycleRef = useRef<string | null>(null)

  const openRecap = useCallback(async (nextRequest: DashboardRecapRequest) => {
    const { start, end, cycleKey } = nextRequest.period
    const matchingSessions = filterSessionsByPeriod(sessions, start, end)
    setRequest(nextRequest)
    setPeriodSessions(matchingSessions)
    setStats(null)
    setError(null)
    if (nextRequest.source === 'automatic') {
      openedAutomaticCycleRef.current = cycleKey
    }
    if (matchingSessions.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setStats(await getRuntimeStats(matchingSessions))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [sessions])

  const checkAutomaticRecap = useCallback(() => {
    if (!sessions.length || request) return
    const automatic = getAutomaticDashboardRecap()
    if (!automatic || !isDashboardRecapPeriodAutoEnabled(automatic.period.kind)) return
    const { cycleKey } = automatic.period
    if (openedAutomaticCycleRef.current === cycleKey) return
    if (hasShownDashboardRecap(cycleKey)) return
    void openRecap(automatic)
  }, [openRecap, request, sessions.length])

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<DashboardRecapRequest>).detail
      if (!detail?.period) return
      void openRecap(detail)
    }
    const handleSettings = () => checkAutomaticRecap()
    window.addEventListener(DASHBOARD_RECAP_EVENT, handleRequest as EventListener)
    window.addEventListener(DASHBOARD_RECAP_SETTINGS_EVENT, handleSettings)
    return () => {
      window.removeEventListener(DASHBOARD_RECAP_EVENT, handleRequest as EventListener)
      window.removeEventListener(DASHBOARD_RECAP_SETTINGS_EVENT, handleSettings)
    }
  }, [checkAutomaticRecap, openRecap])

  useEffect(() => {
    checkAutomaticRecap()
  }, [checkAutomaticRecap])

  useRecapEasterEgg({
    onTrigger: useCallback(() => {
      void openRecap(getEasterEggDashboardRecap())
    }, [openRecap]),
    // Disable the hidden shortcut while the report dialog is open.
    enabled: request === null,
  })

  const handleClose = () => {
    if (request?.source === 'automatic') {
      markDashboardRecapShown(request.period.cycleKey)
    }
    setRequest(null)
  }

  const handleRetry = () => {
    if (request) void openRecap(request)
  }

  if (!request) return null

  return (
    <DashboardRecapModal
      request={request}
      sessions={periodSessions}
      stats={stats}
      loading={loading}
      error={error}
      onRetry={handleRetry}
      onClose={handleClose}
    />
  )
}
