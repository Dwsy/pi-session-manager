import { useMemo } from 'react'
import { Clock, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionStats } from '@/types'

interface TimeDistributionProps {
  stats: SessionStats
  onClick?: () => void
}

export default function TimeDistribution({ stats, onClick }: TimeDistributionProps) {
  const { t, i18n } = useTranslation()

  const hourLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric' })
    return Array.from({ length: 24 }, (_, hour) => formatter.format(new Date(2000, 0, 1, hour)))
  }, [i18n.language])

  // Top 8 active hours, descending; first 3 flagged as peaks
  const hourlyData = stats.time_distribution
    .filter(p => p.message_count > 0)
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 8)
    .map((p, index) => ({
      hour: hourLabels[p.hour] ?? p.hour.toString(),
      value: p.message_count,
      isPeak: index < 3,
    }))

  const maxValue = Math.max(...hourlyData.map(d => d.value), 1)

  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium flex items-center gap-1.5 text-foreground">
          <div className="p-1 rounded bg-warning/10">
            <Clock className="h-3 w-3 text-warning" />
          </div>
          {t('dashboard.hourly.activeHours')}
        </h3>
      </div>

      <div className="text-[9px] text-muted-foreground mb-2 px-1">
        {t('dashboard.timeDistribution.hourlyHint')}
      </div>

      {hourlyData.length === 0 ? (
        <div className="text-center text-muted-foreground py-4 text-xs">
          {t('components.dashboard.noActivityData')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {hourlyData.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-12 text-right text-[10px] text-muted-foreground font-medium flex items-center justify-end gap-0.5">
                {item.isPeak && <Star className="h-2 w-2 text-warning" aria-hidden="true" />}
                {item.hour}
              </div>
              <div className="flex-1 h-4 bg-background/60 rounded overflow-hidden inner-shadow relative">
                <div
                  className={`h-full rounded motion-width ${item.isPeak ? 'bg-warning' : 'bg-info'}`}
                  style={{ width: `${Math.min((item.value / maxValue) * 100, 100)}%` }}
                />
              </div>
              <div className="w-8 text-right text-[10px] text-foreground font-medium">
                {item.value.toLocaleString(i18n.language)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <DashboardCardShell
      className={`rounded-lg p-3 ${onClick ? 'focus-within:ring-2 focus-within:ring-warning/30' : ''}`}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full text-left">
          {content}
        </button>
      ) : (
        content
      )}
    </DashboardCardShell>
  )
}
