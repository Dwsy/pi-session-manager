import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { BarChart3, Calendar, Clock, RefreshCw, Activity } from 'lucide-react'
import type { SessionInfo, SessionStats } from '../types'
import StatCard from './dashboard/StatCard'
import ActivityHeatmap from './dashboard/ActivityHeatmap'
import MessageDistribution from './dashboard/MessageDistribution'
import ProjectsChart from './dashboard/ProjectsChart'
import RecentSessions from './dashboard/RecentSessions'
import TokenStats from './dashboard/TokenStats'

interface DashboardProps {
  sessions: SessionInfo[]
}

export default function Dashboard({ sessions }: DashboardProps) {
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
          <div className="text-[#6a6f85]">Loading dashboard...</div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[#6a6f85]">No statistics available</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
          <p className="text-sm text-[#6a6f85]">Session insights and activity metrics</p>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-4 py-2 bg-[#2c2d3b] hover:bg-[#3d3d4d] rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={BarChart3}
          label="Total Sessions"
          value={stats.total_sessions}
          color="#569cd6"
        />
        <StatCard
          icon={Activity}
          label="Total Messages"
          value={stats.total_messages}
          color="#7ee787"
        />
        <StatCard
          icon={Clock}
          label="Avg/Session"
          value={stats.average_messages_per_session.toFixed(1)}
          color="#ffa657"
        />
        <StatCard
          icon={Calendar}
          label="Active Days"
          value={stats.heatmap_data.filter(p => p.level > 0).length}
          color="#ff6b6b"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <MessageDistribution stats={stats} />
        <ActivityHeatmap data={stats.heatmap_data} size="mini" showLabels={false} />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <RecentSessions sessions={sessions} limit={5} />
        </div>
        <ProjectsChart stats={stats} limit={6} />
      </div>

      {/* Token Stats */}
      <div className="mt-6">
        <TokenStats stats={stats} />
      </div>
    </div>
  )
}