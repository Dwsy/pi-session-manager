import { Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats } from '../../types'

interface TopModelsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
}

const MODEL_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function TopModelsChart({ stats, title = 'Most Used AI Models', limit = 8 }: TopModelsChartProps) {
  const { t } = useTranslation()
  const topModels = Object.entries(stats.sessions_by_model)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }
      return a[0].localeCompare(b[0])
    })
    .slice(0, limit)

  // Format model name to be more readable
  const formatModelName = (name: string) => {
    // Remove common prefixes and make it shorter
    return name
      .replace(/^anthropic\//, '')
      .replace(/^openai\//, '')
      .replace(/^google\//, '')
      .replace(/^claude-3-/, 'claude-')
      .replace(/^gpt-4-/, 'gpt-4-')
      .replace(/-latest$/, '')
  }

  // Get full model name for tooltip
  const getFullModelName = (name: string) => {
    const providers: Record<string, string> = {
      'anthropic': 'Anthropic',
      'openai': 'OpenAI',
      'google': 'Google',
    }
    
    for (const [prefix, provider] of Object.entries(providers)) {
      if (name.startsWith(`${prefix}/`)) {
        return `${provider} - ${name.replace(`${prefix}/`, '')}`
      }
    }
    return name
  }

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#c792ea]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-white">
            <div className="p-1 rounded bg-[#c792ea]/10">
              <Cpu className="h-3 w-3 text-[#c792ea]" />
            </div>
            {title}
          </h3>
          <div className="text-[10px] text-[#6a6f85] bg-[#1a1b26]/60 px-2 py-0.5 rounded">
            {Object.keys(stats.sessions_by_model).length} models
          </div>
        </div>

        <div className="text-[9px] text-[#6a6f85] mb-2 px-1">
          Sessions count by AI model
        </div>

        {topModels.length > 0 ? (
          <div className="space-y-1.5">
            {topModels.map(([name, count], index) => {
              const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0
              const color = MODEL_COLORS[index % MODEL_COLORS.length]

              return (
                <div
                  key={name}
                  className="flex items-center justify-between p-2 bg-[#1a1b26]/60 rounded-lg border border-white/5 hover:bg-[#1a1b26]/90 hover:border-white/10 transition-all duration-300"
                  title={getFullModelName(name)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: color,
                        boxShadow: `0 0 6px ${color}50`
                      }}
                    />
                    <span className="text-xs truncate text-white/90" title={getFullModelName(name)}>
                      {formatModelName(name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-[#1e1f2e]/80 rounded-full overflow-hidden inner-shadow">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-[#6a6f85] w-10 text-right">
                      {count} <span className="text-[8px]">({percent.toFixed(0)}%)</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-[#6a6f85]">
            <Cpu className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">{t('components.dashboard.noModelData')}</p>
          </div>
        )}
      </div>
    </div>
  )
}