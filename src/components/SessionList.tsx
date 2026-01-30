import { formatDistanceToNow } from 'date-fns'
import type { SessionInfo } from '../types'
import { MessageSquare, Calendar, FileText, Trash2, Loader2, Search } from 'lucide-react'

interface SessionListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  searchQuery?: string
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
}: SessionListProps) {
  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
        <p className="text-sm">Loading sessions...</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No sessions found</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelectSession(session)}
          className={`p-4 cursor-pointer hover:bg-accent transition-colors group ${
            selectedSession?.id === session.id ? 'bg-accent' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate">
                {session.name || session.first_message || 'Untitled Session'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {session.cwd || 'Unknown directory'}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDistanceToNow(new Date(session.modified), { addSuffix: true })}
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {session.message_count} messages
                </div>
              </div>
            </div>
            {onDeleteSession && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteSession(session)
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
                title="Delete session"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}