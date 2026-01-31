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

  const getGlowClass = () => {
    if (color === '#569cd6') return 'group-hover:shadow-[0_0_30px_rgba(86,156,214,0.25)]'
    if (color === '#7ee787') return 'group-hover:shadow-[0_0_30px_rgba(126,231,135,0.25)]'
    if (color === '#ffa657') return 'group-hover:shadow-[0_0_30px_rgba(255,166,87,0.25)]'
    if (color === '#ff6b6b') return 'group-hover:shadow-[0_0_30px_rgba(255,107,107,0.25)]'
    return ''
  }

  return (
    <div className={`glass-card glass-card-hover rounded-lg p-3 group cursor-pointer relative overflow-hidden ${getGlowClass()}`}>
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at top right, ${color}08 0%, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <div
            className="p-2 rounded-lg transition-all duration-300 group-hover:scale-110"
            style={{
              backgroundColor: `${color}15`,
              boxShadow: `0 2px 8px ${color}10`
            }}
          >
            <Icon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-3" style={{ color }} />
          </div>
          {change && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full bg-[#1a1b26]/80 border border-white/5 ${getTrendColor()} flex items-center gap-0.5 backdrop-blur-sm`}>
              {getTrendIcon()} {change}
            </span>
          )}
        </div>
        <div className="text-xl font-bold mb-0.5 text-gradient">{value}</div>
        <div className="text-[10px] text-[#6a6f85] uppercase tracking-wider font-medium">{label}</div>
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color}60 50%, transparent 100%)`
        }}
      />
    </div>
  )
}