import { ArrowDown } from 'lucide-react'

interface UnreadIndicatorProps {
  visible: boolean
  count: number
  bottomOffset: number
  onClick: () => void
  label: string
}

export default function UnreadIndicator({
  visible,
  count,
  bottomOffset,
  onClick,
  label,
}: UnreadIndicatorProps) {
  if (!visible) return null
  return (
    <button
      onClick={onClick}
      className="absolute right-4 z-10 flex items-center gap-1 rounded-full bg-[#2c2d3b] hover:bg-[#3c3d4b] text-xs text-white px-3 py-2 shadow-lg transition-colors"
      style={{ bottom: `${bottomOffset}px` }}
      title="滚动到底部"
    >
      <ArrowDown className="h-3.5 w-3.5" />
      {count > 0 ? `${label} (${count})` : label}
    </button>
  )
}
