import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'
import { MessageSquare, Calendar, FileText, Trash2, FolderOpen, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react'

interface SessionListByDirectoryProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
}

export default function SessionListByDirectory({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
}: SessionListByDirectoryProps) {
  const { t } = useTranslation()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const groupedSessions = sessions.reduce((acc, session) => {
    const cwd = session.cwd || t('common.unknown')
    if (!acc[cwd]) {
      acc[cwd] = []
    }
    acc[cwd].push(session)
    return acc
  }, {} as Record<string, SessionInfo[]>)

  const sortedDirs = Object.keys(groupedSessions).sort()

  for (const dir of sortedDirs) {
    groupedSessions[dir].sort((a, b) =>
      new Date(b.modified).getTime() - new Date(a.modified).getTime()
    )
  }

  useEffect(() => {
    setExpandedDirs(new Set(sortedDirs))
  }, [sortedDirs])

  const toggleDir = (dir: string) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dir)) {
        newSet.delete(dir)
      } else {
        newSet.add(dir)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
        <p className="text-sm">{t('session.loading')}</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">{t('session.noSessions')}</p>
      </div>
    )
  }

  return (
    <div>
      {sortedDirs.map((dir) => {
        const dirSessions = groupedSessions[dir]
        const isExpanded = expandedDirs.has(dir)
        const dirName = getDirectoryName(dir, t)

        return (
          <div key={dir} className="border-b border-border">
            <button
              onClick={() => toggleDir(dir)}
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-accent transition-colors text-left sticky top-0 bg-background z-10"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <FolderOpen className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium flex-1">{dirName}</span>
              <span className="text-xs text-muted-foreground">{dirSessions.length}</span>
            </button>

            {isExpanded && (
              <div className="divide-y divide-border/50">
                {dirSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className={`p-4 cursor-pointer hover:bg-accent transition-colors group pl-6 ${
                      selectedSession?.id === session.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {session.name || session.first_message || t('session.untitled')}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {session.cwd || t('session.unknownDirectory')}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(new Date(session.modified), { addSuffix: true })}
                          </div>
                          <div className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {session.message_count} {t('session.messages')}
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
                          title={t('session.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function getDirectoryName(cwd: string, t: any): string {
  if (!cwd || cwd === 'Unknown' || cwd === '未知') {
    return cwd || t('session.unknownDirectory')
  }

  const parts = cwd.split(/[\\/]/)
  const lastPart = parts[parts.length - 1]

  if (lastPart && lastPart.length > 0) {
    return lastPart
  }

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`
  }

  return cwd
}