import { Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionStats } from '../../types'

interface TopModelsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
  onModelClick?: (model: string) => void
}

const MODEL_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function TopModelsChart({
  stats,
  title = 'Most Used AI Models',
  limit = 8,
  onModelClick,
}: TopModelsChartProps) {
  const { t } = useTranslation()
  const topModels = Object.entries(stats.sessions_by_model)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1]
      }
      return a[0].localeCompare(b[0])
    })
    .slice(0, limit)

  const formatModelName = (name: string) => {
    return name
      .replace(/^anthropic\//, '')
      .replace(/^openai\//, '')
      .replace(/^google\//, '')
      .replace(/^claude-3-/, 'claude-')
      .replace(/^gpt-4-/, 'gpt-4-')
      .replace(/-latest$/, '')
  }

  const getFullModelName = (name: string) => {
    const providers: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
    }

    for (const [prefix, provider] of Object.entries(providers)) {
      if (name.startsWith(`${prefix}/`)) {
        return `${provider} - ${name.replace(`${prefix}/`, '')}`
      }
    }
    return name
  }

  return (
    <DashboardCardShell
      className="rounded-lg p-3"
      overlayClassName="bg-gradient-to-br from-purple/5 via-transparent to-transparent"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium flex items-center gap-1.5 text-foreground">
          <div className="p-1 rounded bg-purple/10">
            <Cpu className="h-3 w-3 text-purple" />
          </div>
          {title}
        </h3>
        <div className="text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded">
          {Object.keys(stats.sessions_by_model).length} models
        </div>
      </div>

      <div className="text-[9px] text-muted-foreground mb-2 px-1">
        Sessions count by AI model
      </div>

      {topModels.length > 0 ? (
        <div className="space-y-1.5">
          {topModels.map(([name, count], index) => {
            const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0
            const color = MODEL_COLORS[index % MODEL_COLORS.length]
            const clickable = Boolean(onModelClick)

            return (
              <button
                type="button"
                key={name}
                className={`w-full flex items-center justify-between p-2 bg-background/60 rounded-lg border border-foreground/5 ${clickable ? 'hover:bg-background/90 hover:border-purple/25 motion-surface motion-color motion-press focus-ring cursor-pointer' : 'cursor-default'}`}
                title={getFullModelName(name)}
                onClick={() => onModelClick?.(name)}
                disabled={!clickable}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}50`,
                    }}
                  />
                  <span className="text-xs truncate text-foreground/90" title={getFullModelName(name)}>
                    {formatModelName(name)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-surface-dark/80 rounded-full overflow-hidden inner-shadow">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">
                    {count} <span className="text-[8px]">({percent.toFixed(0)}%)</span>
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <Cpu className="h-6 w-6 mx-auto mb-1 opacity-50" />
          <p className="text-xs">{t('components.dashboard.noModelData')}</p>
        </div>
      )}
    </DashboardCardShell>
  )
}
