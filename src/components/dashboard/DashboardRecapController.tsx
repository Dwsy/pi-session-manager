import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionInfo, SessionStats } from '@/types'
import { getRuntimeStats } from '@/runtime-data/sessionSource'
import DashboardRecapModal from './DashboardRecapModal'
import { filterSessionsByPeriod } from './dashboardInsights'
import {
  DASHBOARD_RECAP_EVENT,
  DASHBOARD_RECAP_SETTINGS_EVENT,
  getAutomaticDashboardRecap,
  hasShownDashboardRecap,
  isDashboardRecapAutoEnabled,
  markDashboardRecapShown,
  type DashboardRecapRequest,
} from './dashboardRecap'

interface DashboardRecapControllerProps {
  sessions: SessionInfo[]
}

export default function DashboardRecapController({ sessions }: DashboardRecapControllerProps) {
  const [request, setRequest] = useState<DashboardRecapRequest | null>(null)
  const [periodSessions, setPeriodSessions] = useState<SessionInfo[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openedAutomaticCycleRef = useRef<string | null>(null)

  const openRecap = useCallback(async (nextRequest: DashboardRecapRequest) => {
    const matchingSessions = filterSessionsByPeriod(sessions, nextRequest.start, nextRequest.end)
    setRequest(nextRequest)
    setPeriodSessions(matchingSessions)
    setStats(null)
    setError(null)
    if (nextRequest.source === 'automatic') {
      openedAutomaticCycleRef.current = nextRequest.cycleKey
    }
    if (matchingSessions.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const nextStats = await getRuntimeStats(matchingSessions)
      setStats(nextStats)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [sessions])

  const checkAutomaticRecap = useCallback(() => {
    if (!sessions.length || !isDashboardRecapAutoEnabled() || request) return
    const automatic = getAutomaticDashboardRecap()
    if (!automatic) return
    if (openedAutomaticCycleRef.current === automatic.cycleKey) return
    if (hasShownDashboardRecap(automatic.cycleKey)) return
    void openRecap(automatic)
  }, [openRecap, request, sessions.length])

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<DashboardRecapRequest>).detail
      if (!detail) return
      void openRecap({ ...detail, source: 'manual' })
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

  const handleClose = () => {
    if (request?.source === 'automatic') {
      markDashboardRecapShown(request.cycleKey)
    }
    setRequest(null)
  }

  if (!request) return null

  return (
    <DashboardRecapModal
      request={request}
      sessions={periodSessions}
      stats={stats}
      loading={loading}
      error={error}
      onClose={handleClose}
    />
  )
}
