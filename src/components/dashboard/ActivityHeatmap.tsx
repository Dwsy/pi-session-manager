import { Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getDay } from 'date-fns'
import DashboardCardShell from './DashboardCardShell'
import HeatmapTooltip from './HeatmapTooltip'
import type { HeatmapPoint } from '@/types'

interface ActivityHeatmapProps {
  data: HeatmapPoint[]
  title?: string
  size?: 'mini' | 'full'
  showLabels?: boolean
  onDayClick?: (point: HeatmapPoint) => void
  onProjectFilter?: (projectName: string) => void
}

const HEATMAP_COLORS = [
  '#161b22', // level 0: empty
  '#aceebb', // level 1
  '#4ac26b', // level 2
  '#2da44e', // level 3
  '#116329', // level 4
  '#116329', // level 5 (deepest)
]

export default function ActivityHeatmap({
  data,
  title,
  size = 'full',
  onDayClick,
  onProjectFilter,
}: ActivityHeatmapProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('components.activityHeatmap.title')
  const weeks = 26
  const daysPerWeek = 7

  const getHeatmapGrid = () => {
    if (!data || data.length === 0) return []

    const dataMap = new Map(data.map((d) => [d.date, d]))
    const today = new Date()
    const todayDayOfWeek = getDay(today)
    const daysBackToLastSunday = todayDayOfWeek === 0 ? 0 : todayDayOfWeek
    const additionalWeeksBack = (weeks - 1) * daysPerWeek
    const totalDaysBack = daysBackToLastSunday + additionalWeeksBack

    const startDate = new Date(today)
    startDate.setDate(today.getDate() - totalDaysBack)
    startDate.setHours(0, 0, 0, 0)

    const grid: (HeatmapPoint | null)[][] = []

    for (let dayOfWeek = 0; dayOfWeek < daysPerWeek; dayOfWeek++) {
      const row: (HeatmapPoint | null)[] = []
      for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
        const cellDate = new Date(startDate)
        const daysOffset = weekIndex * daysPerWeek + dayOfWeek
        cellDate.setDate(startDate.getDate() + daysOffset)
        const y = cellDate.getFullYear()
        const m = String(cellDate.getMonth() + 1).padStart(2, '0')
        const d = String(cellDate.getDate()).padStart(2, '0')
        const dateStr = `${y}-${m}-${d}`
        row.push(dataMap.get(dateStr) || null)
      }
      grid.push(row)
    }

    return grid
  }

  const grid = getHeatmapGrid()

  const renderCell = (point: HeatmapPoint | null, key: string) => {
    const cell = (
      <button
        type="button"
        className="w-full aspect-square rounded-sm focus-ring focus:ring-1 focus:ring-primary/70"
        style={{
          backgroundColor: point ? HEATMAP_COLORS[point.level] : HEATMAP_COLORS[0],
          opacity: point && point.level > 0 ? 1 : 0.35,
        }}
        onClick={() => point && onDayClick?.(point)}
        aria-label={point ? `${point.date}: ${point.total_messages}` : 'No activity'}
      />
    )

    if (point && point.level > 0) {
      return (
        <HeatmapTooltip
          key={key}
          point={point}
          onViewDetails={onDayClick}
          onFilterProject={onProjectFilter}
        >
          {cell}
        </HeatmapTooltip>
      )
    }

    return <div key={key}>{cell}</div>
  }

  return (
    <DashboardCardShell
      className="rounded-xl p-3"
    >
        {displayTitle && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
              <div className="p-1.5 rounded-lg bg-success/10">
                <Calendar className="h-4 w-4 text-success" />
              </div>
              {displayTitle}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('components.activityHeatmap.less')}</span>
              <div className="flex gap-0.5">
                {HEATMAP_COLORS.slice(1).map((color, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                ))}
              </div>
              <span>{t('components.activityHeatmap.more')}</span>
            </div>
          </div>
        )}

        <div className="space-y-[2px]">
          {grid.map((row, dayIndex) => (
            <div
              key={dayIndex}
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
            >
              {row.map((point, weekIndex) => renderCell(point, `${dayIndex}-${weekIndex}`))}
            </div>
          ))}
        </div>

        {size === 'full' && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-foreground/5">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                {t('components.activityHeatmap.activeDays')}:{' '}
                <strong className="text-foreground">{data.filter((p) => p.level > 0).length}</strong>
              </span>
            </div>
          </div>
        )}
    </DashboardCardShell>
  )
}
