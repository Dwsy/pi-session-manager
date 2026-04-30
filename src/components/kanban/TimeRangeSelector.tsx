import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import type { TimeRange } from '@/utils/sessionFilters'

export type { TimeRange }

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  compact?: boolean
}

const TIME_RANGES: TimeRange[] = ['any', '1h', '24h', '7d', '30d']

export default function TimeRangeSelector({ value, onChange, compact }: TimeRangeSelectorProps) {
  const { t } = useTranslation()

  const labels: Record<TimeRange, string> = {
    any: t('kanban.timeRange.any', 'Any time'),
    '1h': t('kanban.timeRange.1h', 'Last hour'),
    '24h': t('kanban.timeRange.24h', 'Last 24 hours'),
    '7d': t('kanban.timeRange.7d', 'Last 7 days'),
    '30d': t('kanban.timeRange.30d', 'Last 30 days'),
  }

  return (
    <div className="flex items-center gap-1">
      {!compact && (
        <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1" />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TimeRange)}
        className="h-7 px-2 rounded-md border border-border/50 bg-background text-[11px] focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer"
      >
        {TIME_RANGES.map((range) => (
          <option key={range} value={range}>
            {labels[range]}
          </option>
        ))}
      </select>
    </div>
  )
}
