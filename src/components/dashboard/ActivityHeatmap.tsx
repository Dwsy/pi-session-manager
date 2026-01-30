import { Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { HeatmapPoint } from '../../types'

interface ActivityHeatmapProps {
  data: HeatmapPoint[]
  title?: string
  size?: 'mini' | 'full'
  showLabels?: boolean
}

const HEATMAP_COLORS = [
  '#1a1b26', // level 0 - no data
  '#0d4436', // level 1 - very low
  '#1b6e54', // level 2 - low
  '#2e9973', // level 3 - medium
  '#46c492', // level 4 - high
  '#6eebb1', // level 5 - very high
]

export default function ActivityHeatmap({
  data,
  title = 'Activity Heatmap',
  size = 'full',
}: ActivityHeatmapProps) {
  const weeks = 52
  const daysPerWeek = 7
  const cellSize = size === 'mini' ? 'w-2 h-2' : 'w-3 h-3'

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2 text-white">
            <Calendar className="h-4 w-4 text-[#6a6f85]" />
            {title}
          </h3>
          <div className="flex items-center gap-2 text-xs text-[#6a6f85]">
            <span>Less</span>
            <div className="flex gap-0.5">
              {HEATMAP_COLORS.slice(1).map((color, i) => (
                <div
                  key={i}
                  className={cellSize.replace('w-', 'w-4 ').replace('h-', 'h-4 ')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col gap-0.5">
          {Array.from({ length: daysPerWeek }).map((_, dayIndex) => (
            <div key={dayIndex} className="flex gap-0.5">
              {Array.from({ length: weeks }).map((_, weekIndex) => {
                const dataIndex = weekIndex * daysPerWeek + dayIndex
                const point = data[dataIndex]

                return (
                  <div
                    key={weekIndex}
                    className={`${cellSize} rounded-sm transition-all duration-200 hover:scale-150 cursor-pointer`}
                    style={{
                      backgroundColor: HEATMAP_COLORS[point?.level || 0],
                      opacity: point?.level === 0 ? 0.2 : 1,
                      boxShadow: point?.level > 0 ? `0 0 4px ${HEATMAP_COLORS[point.level]}40` : 'none',
                    }}
                    title={point?.date ? `${format(parseISO(point.date), 'MMM dd, yyyy')}: Activity Level ${point.level}` : ''}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {size === 'full' && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1a1b26]">
          <div className="flex items-center gap-4 text-xs text-[#6a6f85]">
            <span>Active Days: <strong className="text-white">{data.filter(p => p.level > 0).length}</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}