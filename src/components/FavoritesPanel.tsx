import { Star, FolderOpen, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, FavoriteItem } from '../types'
import { SessionBadge } from './SessionBadge'

interface FavoritesPanelProps {
  sessions: SessionInfo[]
  favorites: FavoriteItem[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onRemoveFavorite: (item: FavoriteItem) => void
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  loading?: boolean
}

export default function FavoritesPanel({
  sessions,
  favorites,
  selectedSession,
  onSelectSession,
  onRemoveFavorite,
  getBadgeType,
  loading = false,
}: FavoritesPanelProps) {
  const { t } = useTranslation()

  const favoriteSessions = favorites.filter(f => f.type === 'session')
  const favoriteProjects = favorites.filter(f => f.type === 'project')

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border border-t-foreground/50 mb-3" />
        <p className="text-sm text-center">{t('session.list.loading')}</p>
      </div>
    )
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-4">
        <Star className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm text-center">{t('favorites.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {favoriteProjects.length > 0 && (
        <div className="mb-4">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('favorites.projects')} ({favoriteProjects.length})
          </div>
          {favoriteProjects.map(favorite => {
            const projectSessions = sessions.filter(s => s.cwd === favorite.path)
            return (
              <div
                key={favorite.id}
                className="group px-3 py-2 hover:bg-[#2c2d3b] cursor-pointer border-b border-border/50"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{favorite.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {projectSessions.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveFavorite(favorite)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity flex-shrink-0"
                    title={t('favorites.remove')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {favoriteSessions.length > 0 && (
        <div>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('favorites.sessions')} ({favoriteSessions.length})
          </div>
          {favoriteSessions.map(favorite => {
            const session = sessions.find(s => s.id === favorite.id)
            if (!session) return null

            const badgeType = getBadgeType?.(session.id)
            const isSelected = selectedSession?.id === session.id

            return (
              <div
                key={favorite.id}
                onClick={() => onSelectSession(session)}
                className={`group px-3 py-2 cursor-pointer border-b border-border/50 ${
                  isSelected ? 'bg-[#569cd6]/10' : 'hover:bg-[#2c2d3b]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{session.name || t('common.untitled')}</span>
                      {badgeType && <SessionBadge type={badgeType} />}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {session.cwd.split('/').pop()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveFavorite(favorite)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity flex-shrink-0"
                    title={t('favorites.remove')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}