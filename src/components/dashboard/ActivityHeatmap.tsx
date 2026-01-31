import { Calendar } from 'lucide-react'
import { format, parseISO, getDay } from 'date-fns'
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
  const weeks = 20 // Show last 20 weeks
  const daysPerWeek = 7
  const cellSize = size === 'mini' ? 'w-3 h-3' : 'w-4 h-4'

  // Build heatmap grid properly aligned by day of week
  const getHeatmapGrid = () => {
    if (!data || data.length === 0) return []

    // Create a map for quick lookup by date
    const dataMap = new Map(data.map(d => [d.date, d]))

    // Calculate the start date (weeks ago from today, aligned to Sunday)
    const today = new Date()
    const todayDayOfWeek = getDay(today) // 0 = Sunday, 6 = Saturday
    
    // Calculate how many days back to go to reach the start of the grid
    // We want to show 'weeks' complete weeks, starting from a Sunday
    // Days back to the most recent Sunday (or today if today is Sunday)
    const daysBackToLastSunday = todayDayOfWeek === 0 ? 0 : todayDayOfWeek
    // Then go back (weeks - 1) complete weeks
    const additionalWeeksBack = (weeks - 1) * daysPerWeek
    const totalDaysBack = daysBackToLastSunday + additionalWeeksBack
    
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - totalDaysBack)
    startDate.setHours(0, 0, 0, 0)

    // Generate grid: 7 rows (days of week) x N columns (weeks)
    // Each row represents a day of the week (Sunday to Saturday)
    // Each column represents a week
    const grid: (HeatmapPoint | null)[][] = []

    for (let dayOfWeek = 0; dayOfWeek < daysPerWeek; dayOfWeek++) {
      const row: (HeatmapPoint | null)[] = []

      for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
        // Calculate the actual date for this cell
        const cellDate = new Date(startDate)
        const daysOffset = weekIndex * daysPerWeek + dayOfWeek
        cellDate.setDate(startDate.getDate() + daysOffset)
        
        // Format date as YYYY-MM-DD to match data format
        const dateStr = cellDate.toISOString().split('T')[0]
        
        // Look up the data point for this date
        const point = dataMap.get(dateStr) || null
        row.push(point)
      }

      grid.push(row)
    }

    return grid
  }

  const grid = getHeatmapGrid()

  return (
    <div className="glass-card rounded-xl p-4 relative overflow-hidden group">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#46c492]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        {title && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium flex items-center gap-2 text-white">
              <div className="p-1.5 rounded-lg bg-[#46c492]/10">
                <Calendar className="h-4 w-4 text-[#46c492]" />
              </div>
              {title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-[#6a6f85]">
              <span>Less</span>
              <div className="flex gap-0.5">
                {HEATMAP_COLORS.slice(1).map((color, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto pb-1">
          <div className="flex flex-col gap-1">
            {grid.map((row, dayIndex) => (
              <div key={dayIndex} className="flex gap-1">
                {row.map((point, weekIndex) => (
                  <div
                    key={weekIndex}
                    className={`${cellSize} rounded-[2px] transition-all duration-200 hover:scale-150 hover:z-10 cursor-pointer`}
                    style={{
                      backgroundColor: point ? HEATMAP_COLORS[point.level] : HEATMAP_COLORS[0],
                      opacity: point && point.level > 0 ? 1 : 0.15,
                      boxShadow: point && point.level > 0 ? `0 0 4px ${HEATMAP_COLORS[point.level]}40` : 'none',
                    }}
                    title={point?.date ? `${format(parseISO(point.date), 'MMM dd, yyyy')}: Activity Level ${point.level}` : 'No data'}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {size === 'full' && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-4 text-xs text-[#6a6f85]">
              <span>Active Days: <strong className="text-white">{data.filter(p => p.level > 0).length}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
