import { useState, useEffect } from 'react'
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
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
        <p className="text-xs">{t('session.list.loading')}</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">{t('session.list.noSessions')}</p>
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
          <div key={dir} className="border-b border-border/30">
            <button
              onClick={() => toggleDir(dir)}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-accent transition-colors text-left sticky top-0 bg-background z-10"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-medium flex-1 truncate">{dirName}</span>
              <span className="text-[11px] text-muted-foreground">{dirSessions.length}</span>
            </button>

            {isExpanded && (
              <div className="divide-y divide-border/30">
                {dirSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className={`px-3 py-2 cursor-pointer hover:bg-accent transition-colors group pl-5 ${
                      selectedSession?.id === session.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate leading-tight">
                          {session.name || session.first_message || t('session.list.untitled')}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatShortTime(session.modified)}
                          </span>
                          <span className="text-border">·</span>
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {session.message_count}
                          </span>
                        </div>
                      </div>
                      {onDeleteSession && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSession(session)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-all flex-shrink-0"
                          title={t('common.deleteSession')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
    return cwd || t('session.list.unknownDirectory')
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

function formatShortTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`
  return `${Math.floor(diffDays / 30)}月前`
}