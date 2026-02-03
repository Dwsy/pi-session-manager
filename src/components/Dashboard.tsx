import { useState, useEffect, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { BarChart3, Clock, RefreshCw, Activity, Zap, DollarSign } from 'lucide-react'
import type { SessionInfo, SessionStats, SessionStatsInput } from '../types'
import { getDemoStats } from '../hooks/useDemoMode'
import StatCard from './dashboard/StatCard'
import ActivityHeatmap from './dashboard/ActivityHeatmap'
import MessageDistribution from './dashboard/MessageDistribution'
import ProjectsChart from './dashboard/ProjectsChart'
import RecentSessions from './dashboard/RecentSessions'
import TopModelsChart from './dashboard/TopModelsChart'
import TimeDistribution from './dashboard/TimeDistribution'
import TokenTrendChart from './dashboard/TokenTrendChart'
import { DashboardSkeleton } from './Skeleton'

interface DashboardProps {
  sessions: SessionInfo[]
  onSessionSelect?: (session: SessionInfo) => void
  projectName?: string
  loading?: boolean
}

// Helper function to extract project name from path
function getProjectName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export default function Dashboard({ sessions, onSessionSelect, projectName, loading: parentLoading = false }: DashboardProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const isLoadingRef = useRef(false)
  const minShowSkeletonTimeRef = useRef<number>(0)
  const statsKey = useMemo(() => {
    const first = sessions[0]
    const last = sessions[sessions.length - 1]
    return [
      projectName ?? 'all',
      sessions.length,
      first?.path ?? '',
      first?.modified ?? '',
      last?.path ?? '',
      last?.modified ?? '',
    ].join('|')
  }, [projectName, sessions])

  // sessions 或项目切换时重新加载统计
  useEffect(() => {
    // 如果父组件还在加载 sessions，显示骨架屏
    if (parentLoading) {
      setShowSkeleton(true)
      return
    }
    if (sessions.length === 0) {
      setStats(null)
      setShowSkeleton(false)
      return
    }
    // 设置最小显示骨架屏的时间（300ms）
    minShowSkeletonTimeRef.current = Date.now() + 300
    loadStats()
  }, [statsKey, parentLoading])

  const loadStats = async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setShowSkeleton(true)

    try {
      // Check if in demo mode
      const isDemoMode = localStorage.getItem('pi-session-manager-settings')
        ? JSON.parse(localStorage.getItem('pi-session-manager-settings') || '{}')?.advanced?.demoMode === true
        : false

      if (isDemoMode) {
        // Use demo stats in demo mode
        const result = getDemoStats()
        setStats(result)
      } else {
        const statsSessions: SessionStatsInput[] = sessions.map((session) => ({
          path: session.path,
          cwd: session.cwd,
          modified: session.modified,
          message_count: session.message_count,
        }))
        let result: SessionStats
        try {
          result = await invoke<SessionStats>('get_session_stats_light', { sessions: statsSessions })
        } catch (error: any) {
          const message = typeof error === 'string' ? error : error?.message
          if (message && String(message).includes('get_session_stats_light')) {
            result = await invoke<SessionStats>('get_session_stats', { sessions })
          } else {
            throw error
          }
        }
        setStats(result)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      isLoadingRef.current = false
      // 确保骨架屏至少显示最小时间，避免闪烁
      const remainingTime = minShowSkeletonTimeRef.current - Date.now()
      if (remainingTime > 0) {
        setTimeout(() => setShowSkeleton(false), remainingTime)
      } else {
        setShowSkeleton(false)
      }
    }
  }

  // 显示骨架屏加载状态
  if (showSkeleton) {
    return <DashboardSkeleton />
  }

  // 不显示加载状态，直接显示空数据或实际数据
  const displayStats: SessionStats = stats || {
    total_sessions: 0,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    total_tokens: 0,
    sessions_by_project: {},
    sessions_by_model: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 0,
    heatmap_data: [],
    time_distribution: [],
    token_details: {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_cost: 0,
      tokens_by_model: {},
    },
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient mb-0.5">
            {projectName ? (
              <>
                {t('dashboard.title')} - <span className="text-[#569cd6]">{getProjectName(projectName)}</span>
              </>
            ) : (
              t('dashboard.title')
            )}
          </h1>
          <p className="text-xs text-[#6a6f85]">
            {projectName ? t('dashboard.projectSubtitle') : t('dashboard.subtitle')}
          </p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-3 py-2 glass-card rounded-lg text-xs transition-all duration-300 hover:scale-105 active:scale-95 group"
        >
          <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" />
          {t('common.refresh')}
        </button>
      </div>

      {/* Stats Grid - Compact - 5 cards */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <StatCard
          icon={BarChart3}
          label={t('components.displayStats.cards.sessions')}
          value={displayStats.total_sessions}
          color="#569cd6"
        />
        <StatCard
          icon={Activity}
          label={t('components.displayStats.cards.messages')}
          value={displayStats.total_messages}
          color="#7ee787"
        />
        <StatCard
          icon={Clock}
          label={t('components.displayStats.cards.avgPerSession')}
          value={displayStats.average_messages_per_session.toFixed(1)}
          color="#ffa657"
        />
        <StatCard
          icon={Zap}
          label={t('components.displayStats.cards.totalTokens')}
          value={displayStats.total_tokens > 1000000 
            ? `${(displayStats.total_tokens / 1000000).toFixed(1)}M` 
            : displayStats.total_tokens > 1000 
              ? `${(displayStats.total_tokens / 1000).toFixed(1)}k`
              : displayStats.total_tokens
          }
          color="#c792ea"
        />
        <StatCard
          icon={DollarSign}
          label={t('components.displayStats.cards.totalCost')}
          value={displayStats.token_details.total_cost < 0.01 
            ? `$${displayStats.token_details.total_cost.toFixed(4)}` 
            : displayStats.token_details.total_cost < 1
              ? `$${displayStats.token_details.total_cost.toFixed(3)}`
              : `$${displayStats.token_details.total_cost.toFixed(2)}`
          }
          color="#ff6b6b"
        />
      </div>

      {/* Main Grid - Dense Layout */}
      <div className="grid grid-cols-12 gap-3">
        {/* Left Column - 8 cols */}
        <div className="col-span-8 space-y-3">
          {/* Token Trend Chart - Full Width */}
          <TokenTrendChart stats={displayStats} days={30} />

          {/* Message Distribution + Heatmap */}
          <div className="grid grid-cols-2 gap-3">
            <MessageDistribution stats={displayStats} />
            <ActivityHeatmap data={displayStats.heatmap_data} size="mini" showLabels={false} />
          </div>

          {/* Recent Sessions */}
          <RecentSessions sessions={sessions} limit={8} onSessionSelect={onSessionSelect} />
        </div>

        {/* Right Column - 4 cols */}
        <div className="col-span-4 space-y-3">
          {/* Top Models */}
          <TopModelsChart stats={displayStats} limit={5} />

          {/* Projects */}
          <ProjectsChart stats={displayStats} limit={5} />

          {/* Time Distribution */}
          <TimeDistribution stats={displayStats} type="hourly" />
        </div>
      </div>
    </div>
  )
}
