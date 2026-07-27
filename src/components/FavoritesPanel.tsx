import { FolderOpen, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FavoriteItem, SessionInfo } from '@/types'
import { SessionBadge } from './session-viewer/SessionBadge'
import { FavoritesSkeleton } from './ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { getPathBasename, pathsEqual } from '@/utils/path'
import { getSessionSourceSlug, getSessionSourceTag } from '@/utils/session'
import { useSettings } from '@/hooks/useSettings'

interface FavoritesPanelProps {
  sessions: SessionInfo[]
  favorites: FavoriteItem[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onRemoveFavorite: (item: FavoriteItem) => void
  onSelectProject?: (projectPath: string) => void
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  loading?: boolean
  liveSessionIds?: Set<string>
  compact?: boolean
}

export default function FavoritesPanel({
  sessions,
  favorites,
  selectedSession,
  onSelectSession,
  onRemoveFavorite,
  onSelectProject,
  getBadgeType,
  loading = false,
  liveSessionIds,
  compact = false,
}: FavoritesPanelProps) {
  const { t } = useTranslation()
  const { getSessionSetting } = useSettings()
  const showAgentIconInBadge = getSessionSetting('showAgentIconInSessionBadge') !== false
  const favoriteSessions = favorites.filter((favorite) => favorite.type === 'session')
  const favoriteProjects = favorites.filter((favorite) => favorite.type === 'project')
  const showDelayedLoading = useDelayedLoading(loading)

  if (showDelayedLoading) return <FavoritesSkeleton />
  if (loading) return <div className="min-h-[120px] flex-1" aria-hidden="true" />

  if (favorites.length === 0) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center px-4 text-muted-foreground">
        <Star className="mb-3 h-10 w-10 opacity-25" />
        <p className="text-center text-xs">{t('favorites.empty')}</p>
      </div>
    )
  }

  const sectionTitleClass = 'px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
  const removeButtonClass = 'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 group-hover:opacity-100'

  return (
    <div className={`favorites-panel flex flex-col ${compact ? 'text-xs' : ''}`}>
      {favoriteProjects.length > 0 ? (
        <section className={compact ? 'mb-1' : 'mb-4'} aria-labelledby="favorite-projects-heading">
          <h3 id="favorite-projects-heading" className={sectionTitleClass}>
            {t('favorites.projects')} ({favoriteProjects.length})
          </h3>
          {favoriteProjects.map((favorite) => {
            const projectSessions = sessions.filter((session) => pathsEqual(session.cwd, favorite.path))
            return (
              <div key={favorite.id} className="group flex items-center border-b border-border/50 hover:bg-secondary/55">
                <button
                  type="button"
                  onClick={() => onSelectProject?.(favorite.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
                >
                  <FolderOpen className="h-4 w-4 flex-shrink-0 text-info" />
                  <span className={`${compact ? 'text-xs' : 'text-sm'} min-w-0 flex-1 truncate`}>{favorite.name}</span>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground">{projectSessions.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveFavorite(favorite)}
                  className={removeButtonClass}
                  title={t('favorites.remove')}
                  aria-label={`${t('favorites.remove')}: ${favorite.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </section>
      ) : null}

      {favoriteSessions.length > 0 ? (
        <section aria-labelledby="favorite-sessions-heading">
          <h3 id="favorite-sessions-heading" className={sectionTitleClass}>
            {t('favorites.sessions')} ({favoriteSessions.length})
          </h3>
          {favoriteSessions.map((favorite) => {
            const session = sessions.find((item) => item.id === favorite.id)
            if (!session) return null

            const badgeType = getBadgeType?.(session.id)
            const isSelected = selectedSession?.id === session.id
            const sourceTag = getSessionSourceTag(session.path)
            const sourceSlug = getSessionSourceSlug(session.path)
            const isLive = session.isLive || (liveSessionIds?.has(session.id) ?? false)

            return (
              <div
                key={favorite.id}
                className={`group flex items-start border-b border-border/50 ${isSelected ? 'bg-info/8' : 'hover:bg-secondary/55'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(session)}
                  className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isLive ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" title="Live" /> : null}
                    <span className={`${compact ? 'text-xs' : 'text-sm'} min-w-0 truncate`}>{session.name || t('common.untitled')}</span>
                    {sourceTag ? (
                      <SessionBadge
                        label={sourceTag}
                        tone="source"
                        sourceSlug={sourceSlug || undefined}
                        showIcon={showAgentIconInBadge}
                      />
                    ) : null}
                    {badgeType ? <SessionBadge type={badgeType} /> : null}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{getPathBasename(session.cwd)}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveFavorite(favorite)}
                  className={`${removeButtonClass} mt-1.5`}
                  title={t('favorites.remove')}
                  aria-label={`${t('favorites.remove')}: ${session.name || t('common.untitled')}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
