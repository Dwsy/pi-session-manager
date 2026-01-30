import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  color: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
}

export default function StatCard({ icon: Icon, label, value, color, change, trend = 'neutral' }: StatCardProps) {
  const getTrendColor = () => {
    if (trend === 'up') return 'text-[#7ee787]'
    if (trend === 'down') return 'text-[#ff6b6b]'
    return 'text-[#6a6f85]'
  }

  const getTrendIcon = () => {
    if (trend === 'up') return '↑'
    if (trend === 'down') return '↓'
    return ''
  }

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5 hover:bg-[#323344] transition-all duration-300 group cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: `${color}20` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        {change && (
          <span className={`text-xs px-2 py-1 rounded-full bg-[#1a1b26] ${getTrendColor()} flex items-center gap-1`}>
            {getTrendIcon()} {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold mb-1 text-white">{value}</div>
      <div className="text-xs text-[#6a6f85] uppercase tracking-wide">{label}</div>
    </div>
  )
}