import { Pencil } from 'lucide-react'
import { formatDate } from '../utils/format'

interface SessionInfoEntryProps {
  name?: string
  timestamp?: string
}

export default function SessionInfoEntry({ name, timestamp }: SessionInfoEntryProps) {
  // Get name from translation if empty
  const displayName = name || 'Untitled Session'

  return (
    <div className="session-info-entry flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground border border-border/50 rounded-lg bg-secondary/30 my-2">
      <Pencil className="h-3.5 w-3.5 text-info" />
      <span className="text-foreground font-medium">
        Renamed to "{displayName}"
      </span>
      {timestamp && (
        <span className="text-xs text-muted-foreground/60 ml-auto">
          {formatDate(timestamp)}
        </span>
      )}
    </div>
  )
}
