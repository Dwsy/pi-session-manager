import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { HeatmapPoint } from '../types'

interface ActivityHeatmapProps {
  data: HeatmapPoint[]
  title?: string
  size?: 'mini' | 'full'
  showLabels?: boolean
}

const HEATMAP_COLORS = [
  '#1a1b26',
  '#0d4436',
  '#1b6e54',
  '#2e9973',
  '#46c492',
  '#6eebb1',
]

export default function ActivityHeatmap({
  data,
  title,
  size = 'full',
}: ActivityHeatmapProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('components.activityHeatmap.title')
  const weeks = 52
  const daysPerWeek = 7
  const cellSize = size === 'mini' ? 'w-2 h-2' : 'w-3 h-3'

  return (
    <div className="glass-card rounded-xl p-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#46c492]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        {displayTitle && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2 text-white">
              <div className="p-1.5 rounded-lg bg-[#46c492]/10">
                <Calendar className="h-4 w-4 text-[#46c492]" />
              </div>
              {displayTitle}
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#6a6f85]">
              <span>{t('components.activityHeatmap.less')}</span>
              <div className="flex gap-0.5">
                {HEATMAP_COLORS.slice(1).map((color, i) => (
                  <div
                    key={i}
                    className={`${cellSize.replace('w-', 'w-4 ').replace('h-', 'h-4 ')} rounded-sm`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span>{t('components.activityHeatmap.more')}</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto pb-2">
          <div className="flex flex-col gap-[3px]">
            {Array.from({ length: daysPerWeek }).map((_, dayIndex) => (
              <div key={dayIndex} className="flex gap-[3px]">
                {Array.from({ length: weeks }).map((_, weekIndex) => {
                  const dataIndex = weekIndex * daysPerWeek + dayIndex
                  const point = data[dataIndex]

                  return (
                    <div
                      key={weekIndex}
                      className={`${cellSize} rounded-[3px] transition-all duration-200 hover:scale-175 hover:z-10 cursor-pointer`}
                      style={{
                        backgroundColor: HEATMAP_COLORS[point?.level || 0],
                        opacity: point?.level === 0 ? 0.15 : 1,
                        boxShadow: point?.level > 0 ? `0 0 6px ${HEATMAP_COLORS[point.level]}50` : 'none',
                      }}
                      title={point?.date ? `${format(parseISO(point.date), 'MMM dd, yyyy')}: ${t('components.activityHeatmap.activityLevel')} ${point.level}` : ''}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {size === 'full' && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-4 text-xs text-[#6a6f85]">
              <span>{t('components.activityHeatmap.activeDays')}: <strong className="text-white">{data.filter(p => p.level > 0).length}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}