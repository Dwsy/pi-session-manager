import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { X, BarChart3, Calendar, Folder, Clock, Zap, RefreshCw, Download, Settings, Award } from 'lucide-react'
import type { SessionInfo, SessionStats } from '../types'
import StatCard from './dashboard/StatCard'
import ActivityHeatmap from './dashboard/ActivityHeatmap'
import MessageDistribution from './dashboard/MessageDistribution'
import ProjectsChart from './dashboard/ProjectsChart'
import TimeDistribution from './dashboard/TimeDistribution'
import ActivityTrend from './dashboard/ActivityTrend'
import RecentSessions from './dashboard/RecentSessions'
import TopModelsChart from './dashboard/TopModelsChart'
import ProductivityMetrics from './dashboard/ProductivityMetrics'
import SessionLengthChart from './dashboard/SessionLengthChart'
import WeeklyComparison from './dashboard/WeeklyComparison'
import TokenStats from './dashboard/TokenStats'
import Achievements from './dashboard/Achievements'

interface StatsPanelProps {
  sessions: SessionInfo[]
  onClose: () => void
}

type TabType = 'overview' | 'activity' | 'projects' | 'time' | 'tokens' | 'productivity' | 'achievements'

export default function StatsPanel({ sessions, onClose }: StatsPanelProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const TABS = [
    { id: 'overview' as TabType, label: t('stats.tabs.overview'), icon: BarChart3 },
    { id: 'activity' as TabType, label: t('stats.tabs.activity'), icon: Calendar },
    { id: 'projects' as TabType, label: t('stats.tabs.projects'), icon: Folder },
    { id: 'time' as TabType, label: t('stats.tabs.time'), icon: Clock },
    { id: 'tokens' as TabType, label: t('stats.tabs.tokens'), icon: Zap },
    { id: 'productivity' as TabType, label: t('stats.tabs.productivity'), icon: Zap },
    { id: 'achievements' as TabType, label: t('stats.tabs.achievements'), icon: Award },
  ]

  // 只在组件挂载时加载统计，不自动跟随 sessions 变化
  useEffect(() => {
    loadStats()
  }, []) // 空依赖数组

  const loadStats = async () => {
    try {
      setLoading(true)
      const result = await invoke<SessionStats>('get_session_stats', { sessions })
      console.log('Stats loaded:', result)
      console.log('Heatmap data:', result.heatmap_data)
      console.log('Time distribution:', result.time_distribution)
      setStats(result)
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-[#1a1b26] border border-[#2c2d3b] rounded-xl p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-3 border-[#569cd6] border-t-transparent rounded-full animate-spin" />
            <div className="text-[#6a6f85]">{t('stats.panel.loading')}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!stats || !stats.heatmap_data) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-[#1a1b26] border border-[#2c2d3b] rounded-xl p-8">
          <div className="text-center text-[#6a6f85]">{t('stats.panel.noData')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1b26] border border-[#2c2d3b] rounded-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2c2d3b] bg-[#1e1f2e]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#569cd6]/10 rounded-xl">
              <BarChart3 className="h-5 w-5 text-[#569cd6]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{t('stats.panel.title')}</h2>
              <p className="text-xs text-[#6a6f85]">{t('stats.panel.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadStats}
              className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
              title={t('stats.panel.tooltips.refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors" title={t('stats.panel.tooltips.export')}>
              <Download className="h-4 w-4" />
            </button>
            <button className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors" title={t('stats.panel.tooltips.settings')}>
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
              title={t('stats.panel.tooltips.close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-[#2c2d3b] bg-[#1a1b26] overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-[#569cd6] bg-[#569cd6]/10'
                    : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && <OverviewTab stats={stats} sessions={sessions} />}
          {activeTab === 'activity' && <ActivityTab stats={stats} />}
          {activeTab === 'projects' && <ProjectsTab stats={stats} />}
          {activeTab === 'time' && <TimeTab stats={stats} />}
          {activeTab === 'tokens' && <TokensTab stats={stats} />}
          {activeTab === 'productivity' && <ProductivityTab stats={stats} sessions={sessions} />}
          {activeTab === 'achievements' && <AchievementsTab stats={stats} />}
        </div>
      </div>
    </div>
  )
}

// Overview Tab
function OverviewTab({ stats, sessions }: { stats: SessionStats; sessions: SessionInfo[] }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={BarChart3}
          label="Total Sessions"
          value={stats.total_sessions}
          color="#569cd6"
          change="+12%"
          trend="up"
        />
        <StatCard
          icon={Zap}
          label="Total Messages"
          value={stats.total_messages}
          color="#7ee787"
          change="+8%"
          trend="up"
        />
        <StatCard
          icon={Clock}
          label="Avg/Session"
          value={stats.average_messages_per_session.toFixed(1)}
          color="#ffa657"
          change="+5%"
          trend="up"
        />
        <StatCard
          icon={Calendar}
          label="Active Days"
          value={stats.heatmap_data.filter((p) => p.level > 0).length}
          color="#ff6b6b"
          change=""
          trend="neutral"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        <MessageDistribution stats={stats} />
        <ActivityHeatmap data={stats.heatmap_data} size="mini" showLabels={false} />
      </div>

      {/* Activity & Recent Sessions */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <ActivityTrend stats={stats} type="area" />
        </div>
        <RecentSessions sessions={sessions} limit={5} />
      </div>
    </div>
  )
}

// Activity Tab
function ActivityTab({ stats }: { stats: SessionStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <ActivityHeatmap data={stats.heatmap_data} size="full" showLabels={true} />
        <WeeklyComparison stats={stats} />
      </div>

      <ActivityTrend stats={stats} type="line" days={60} />

      <div className="grid grid-cols-2 gap-6">
        <SessionLengthChart sessions={[]} />
        <div className="bg-[#2c2d3b] rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4">Activity Levels</h3>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map(level => {
              const count = stats.heatmap_data.filter(p => p.level === level).length
              const colors = ['#6eebb1', '#46c492', '#2e9973', '#1b6e54', '#0d4436']
              const labels = ['Very High', 'High', 'Medium', 'Low', 'Very Low']

              return (
                <div key={level} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-[#6a6f85]">{labels[level - 1]}</div>
                  <div className="flex-1 h-3 bg-[#1a1b26] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / stats.heatmap_data.length) * 100}%`,
                        backgroundColor: colors[level - 1],
                      }}
                    />
                  </div>
                  <div className="w-12 text-right text-xs text-white">{count}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Projects Tab
function ProjectsTab({ stats }: { stats: SessionStats }) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <ProjectsChart stats={stats} limit={10} />
      <TopModelsChart stats={stats} limit={8} />
    </div>
  )
}

// Time Tab
function TimeTab({ stats }: { stats: SessionStats }) {
  return (
    <div className="space-y-6">
      <TimeDistribution stats={stats} type="hourly" title="Hourly Activity" />
      <div className="grid grid-cols-2 gap-6">
        <TimeDistribution stats={stats} type="weekly" title="Weekly Activity" />
        <TimeDistribution stats={stats} type="daily" title="Monthly Activity" />
      </div>
    </div>
  )
}

// Tokens Tab
function TokensTab({ stats }: { stats: SessionStats }) {
  return (
    <div className="max-w-4xl mx-auto">
      <TokenStats stats={stats} />
    </div>
  )
}

// Productivity Tab
function ProductivityTab({ stats, sessions }: { stats: SessionStats; sessions: SessionInfo[] }) {
  return (
    <div className="space-y-6">
      <ProductivityMetrics stats={stats} />
      <div className="grid grid-cols-2 gap-6">
        <SessionLengthChart sessions={sessions} />
        <div className="bg-[#2c2d3b] rounded-xl p-5">
          <h3 className="text-sm font-medium mb-4">Session Insights</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-[#1a1b26] rounded-lg">
              <span className="text-xs text-[#6a6f85]">Total Sessions</span>
              <span className="text-sm font-medium text-white">{stats.total_sessions}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-[#1a1b26] rounded-lg">
              <span className="text-xs text-[#6a6f85]">Total Messages</span>
              <span className="text-sm font-medium text-white">{stats.total_messages.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-[#1a1b26] rounded-lg">
              <span className="text-xs text-[#6a6f85]">Messages/Session</span>
              <span className="text-sm font-medium text-white">{stats.average_messages_per_session.toFixed(1)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-[#1a1b26] rounded-lg">
              <span className="text-xs text-[#6a6f85]">User Messages</span>
              <span className="text-sm font-medium text-white">{stats.user_messages.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-[#1a1b26] rounded-lg">
              <span className="text-xs text-[#6a6f85]">Assistant Messages</span>
              <span className="text-sm font-medium text-white">{stats.assistant_messages.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Achievements Tab
function AchievementsTab({ stats }: { stats: SessionStats }) {
  return (
    <div className="max-w-3xl mx-auto">
      <Achievements stats={stats} />
    </div>
  )
}