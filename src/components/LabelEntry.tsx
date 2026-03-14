import { Bookmark } from 'lucide-react'
import { formatDate } from '../utils/format'

interface LabelEntryProps {
  label?: string
  timestamp?: string
}

export default function LabelEntry({ label, timestamp }: LabelEntryProps) {
  if (!label) return null

  return (
    <div className="label-entry flex items-center gap-2 px-3 py-1.5 text-sm border border-info/30 rounded-lg bg-info/10 my-1">
      <Bookmark className="h-3.5 w-3.5 text-info" />
      <span className="text-info font-medium">{label}</span>
      {timestamp && (
        <span className="text-xs text-muted-foreground/60 ml-auto">
          {formatDate(timestamp)}
        </span>
      )}
    </div>
  )
}
