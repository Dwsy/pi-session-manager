import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { BarChart3, Clock, RefreshCw, Activity, Zap, DollarSign } from 'lucide-react'
import type { SessionInfo, SessionStats } from '../types'
import StatCard from './dashboard/StatCard'
import ActivityHeatmap from './dashboard/ActivityHeatmap'
import MessageDistribution from './dashboard/MessageDistribution'
import ProjectsChart from './dashboard/ProjectsChart'
import RecentSessions from './dashboard/RecentSessions'
import TopModelsChart from './dashboard/TopModelsChart'
import TimeDistribution from './dashboard/TimeDistribution'
import TokenTrendChart from './dashboard/TokenTrendChart'

interface DashboardProps {
  sessions: SessionInfo[]
  onSessionSelect?: (session: SessionInfo) => void
  projectName?: string
}

// Helper function to extract project name from path
function getProjectName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export default function Dashboard({ sessions, onSessionSelect, projectName }: DashboardProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [sessions])

  const loadStats = async () => {
    try {
      setLoading(true)
      const result = await invoke<SessionStats>('get_session_stats', { sessions })
      setStats(result)
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#569cd6] border-t-transparent rounded-full animate-spin" />
          <div className="text-[#6a6f85]">{t('dashboard.loading')}</div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[#6a6f85]">{t('dashboard.noData')}</div>
      </div>
    )
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
          label={t('stats.cards.sessions')}
          value={stats.total_sessions}
          color="#569cd6"
        />
        <StatCard
          icon={Activity}
          label={t('stats.cards.messages')}
          value={stats.total_messages}
          color="#7ee787"
        />
        <StatCard
          icon={Clock}
          label={t('stats.cards.avgPerSession')}
          value={stats.average_messages_per_session.toFixed(1)}
          color="#ffa657"
        />
        <StatCard
          icon={Zap}
          label="Total Tokens"
          value={stats.total_tokens > 1000000 
            ? `${(stats.total_tokens / 1000000).toFixed(1)}M` 
            : stats.total_tokens > 1000 
              ? `${(stats.total_tokens / 1000).toFixed(1)}k`
              : stats.total_tokens
          }
          color="#c792ea"
        />
        <StatCard
          icon={DollarSign}
          label="Total Cost"
          value={stats.token_details.total_cost < 0.01 
            ? `$${stats.token_details.total_cost.toFixed(4)}` 
            : stats.token_details.total_cost < 1
              ? `$${stats.token_details.total_cost.toFixed(3)}`
              : `$${stats.token_details.total_cost.toFixed(2)}`
          }
          color="#ff6b6b"
        />
      </div>

      {/* Main Grid - Dense Layout */}
      <div className="grid grid-cols-12 gap-3">
        {/* Left Column - 8 cols */}
        <div className="col-span-8 space-y-3">
          {/* Token Trend Chart - Full Width */}
          <TokenTrendChart stats={stats} days={30} />

          {/* Message Distribution + Heatmap */}
          <div className="grid grid-cols-2 gap-3">
            <MessageDistribution stats={stats} />
            <ActivityHeatmap data={stats.heatmap_data} size="mini" showLabels={false} />
          </div>

          {/* Recent Sessions */}
          <RecentSessions sessions={sessions} limit={8} onSessionSelect={onSessionSelect} />
        </div>

        {/* Right Column - 4 cols */}
        <div className="col-span-4 space-y-3">
          {/* Top Models */}
          <TopModelsChart stats={stats} limit={5} />

          {/* Projects */}
          <ProjectsChart stats={stats} limit={5} />

          {/* Time Distribution */}
          <TimeDistribution stats={stats} type="hourly" />
        </div>
      </div>
    </div>
  )
}