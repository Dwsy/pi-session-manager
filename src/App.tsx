import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Star, Settings, ArrowLeft, Play } from 'lucide-react'
import SessionList from './components/SessionList'
import ProjectList from './components/ProjectList'
import SessionViewer from './components/SessionViewer'
import ExportDialog from './components/ExportDialog'
import RenameDialog from './components/RenameDialog'
import Dashboard from './components/Dashboard'
import FavoritesPanel from './components/FavoritesPanel'
import SettingsPanel from './components/settings/SettingsPanel'
import { CommandPalette } from './components/command'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useSessionBadges } from './hooks/useSessionBadges'
import { useSessions } from './hooks/useSessions'
import { useAppSettings } from './hooks/useAppSettings'
import { useSessionActions } from './hooks/useSessionActions'
import { useDemoMode } from './hooks/useDemoMode'
import { useAllSettings } from './hooks/useAllSettings'
import { registerBuiltinPlugins } from './plugins'
import type { SessionInfo, FavoriteItem } from './types'
import type { SearchContext } from './plugins/types'
import { invoke } from '@tauri-apps/api/core'
import { isTauriReady } from './utils/session'

// Define sqlite_cache types for Tauri responses
namespace sqlite_cache {
  export interface FavoriteItem {
    id: string
    favorite_type: string
    name: string
    path: string
    added_at: string
  }
}

function App() {
  const { t } = useTranslation()
  const listScrollRef = useRef<HTMLDivElement>(null)

  const {
    sessions,
    loading,
    selectedSession,
    setSelectedSession,
    loadSessions,
    handleDeleteSession,
    handleRenameSession,
  } = useSessions()

  const { terminal, piPath, customCommand, loadSettings } = useAppSettings()
  const { handleExportSession } = useSessionActions()
  const { getBadgeType, clearBadge } = useSessionBadges(sessions)

  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'project'>('project')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)

  const loadFavorites = useCallback(async () => {
    setLoadingFavorites(true)
    try {
      const result = await invoke<sqlite_cache.FavoriteItem[]>('get_all_favorites')
      const formattedFavorites: FavoriteItem[] = result.map(f => ({
        id: f.id,
        type: f.favorite_type as 'session' | 'project',
        name: f.name,
        path: f.path,
        addedAt: f.added_at,
      }))
      setFavorites(formattedFavorites)
    } catch (error) {
      console.error('Failed to load favorites:', error)
      setFavorites([])
    } finally {
      setLoadingFavorites(false)
    }
  }, [])

  const removeFavorite = useCallback(async (item: FavoriteItem) => {
    if (!isTauriReady()) {
      console.warn('Tauri not ready, skipping remove favorite')
      return
    }
    try {
      await invoke('remove_favorite', { id: item.id })
      await loadFavorites()
    } catch (error) {
      console.error('Failed to remove favorite:', error)
    }
  }, [loadFavorites])

  const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'addedAt'>) => {
    if (!isTauriReady()) {
      console.warn('Tauri not ready, skipping toggle favorite')
      return
    }
    try {
      await invoke('toggle_favorite', {
        id: item.id,
        favoriteType: item.type,
        name: item.name,
        path: item.path,
      })
      await loadFavorites()
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }, [loadFavorites])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setSelectedSession(session)
    clearBadge(session.id)
  }, [setSelectedSession, clearBadge])

  useEffect(() => {
    registerBuiltinPlugins()

    const initialize = async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      setIsInitialized(true)
    }

    initialize()
  }, [])

  useEffect(() => {
    if (!isInitialized) return

    loadSessions()
    loadSettings()
    loadFavorites()
  }, [isInitialized, loadSessions, loadSettings, loadFavorites])

  useFileWatcher({
    enabled: true,
    debounceMs: 2000,
    onSessionsChanged: () => {
      loadSessions()
    },
  })

  const shortcuts = useMemo(() => ({
    'cmd+r': () => loadSessions(),
    'cmd+,': () => setShowSettings(true),
    'escape': () => {
      if (showSettings) {
        setShowSettings(false)
      } else if (showExportDialog) {
        setShowExportDialog(false)
      } else if (showRenameDialog) {
        setShowRenameDialog(false)
      } else if (selectedProject) {
        setSelectedProject(null)
      } else {
        setSelectedSession(null)
      }
    },
  }), [showSettings, showExportDialog, showRenameDialog, selectedProject, loadSessions, setSelectedSession])

  useKeyboardShortcuts(shortcuts)

  const commandContext = useMemo<SearchContext>(() => ({
    sessions,
    selectedProject,
    selectedSession,
    setSelectedSession,
    setSelectedProject,
    closeCommandMenu: () => {},
    searchCurrentProjectOnly: false,
    t
  }), [sessions, selectedProject, selectedSession, t, setSelectedSession])

  const onRenameSession = async (newName: string) => {
    if (!selectedSession) return
    await handleRenameSession(selectedSession, newName)
    setShowRenameDialog(false)
  }

  const onExportSession = async (format: 'html' | 'md' | 'json') => {
    if (!selectedSession) return
    await handleExportSession(selectedSession, format)
    setShowExportDialog(false)
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="w-80 border-r border-[#2c2d3b] flex flex-col">
        <div
          className="h-8 border-b border-[#2c2d3b] flex items-center px-3 select-none"
          data-tauri-drag-region
          style={{
            WebkitAppRegion: 'drag',
            userSelect: 'none'
          }}
        >
          <div className="flex items-center gap-0.5 ml-auto" style={{ WebkitAppRegion: 'no-drag' }}>
            <div className="flex items-center bg-[#252636] rounded-lg p-0.5 mr-1">
              <button
                onClick={() => { setViewMode('list'); setSelectedProject(null) }}
                className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-blue-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white'}`}
                title={t('app.viewMode.list')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode('project'); setSelectedProject(null) }}
                className={`p-1 rounded transition-colors ${viewMode === 'project' ? 'text-blue-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white'}`}
                title={t('app.viewMode.project')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              className={`p-1 rounded transition-colors ml-0.5 ${showFavorites ? 'text-yellow-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'}`}
              title={t('favorites.title')}
            >
              <Star className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 rounded transition-colors ml-0.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]"
              title={t('settings.title')}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" ref={listScrollRef}>
          {showFavorites ? (
            <FavoritesPanel
              sessions={sessions}
              favorites={favorites}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onRemoveFavorite={removeFavorite}
              getBadgeType={getBadgeType}
              loading={loadingFavorites}
            />
          ) : viewMode === 'project' && selectedProject ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-background/30 flex-shrink-0 sticky top-0 z-10">
                <button
                  onClick={() => setSelectedProject(null)}
                  className="p-1 hover:bg-accent rounded transition-colors flex-shrink-0"
                  title={t('project.list.back')}
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <FolderOpen className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {sessions.find(s => s.cwd === selectedProject)?.cwd.split('/').pop() || selectedProject.split('/').pop()}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    ({sessions.filter(s => s.cwd === selectedProject).length})
                  </span>
                </div>
              </div>
              <div>
                <ProjectList
                  sessions={sessions}
                  selectedSession={selectedSession}
                  selectedProject={selectedProject}
                  onSelectSession={handleSelectSession}
                  onSelectProject={setSelectedProject}
                  loading={loading}
                  terminal={terminal}
                  piPath={piPath}
                  customCommand={customCommand}
                  getBadgeType={getBadgeType}
                  scrollParentRef={listScrollRef}
                  showHeader={false}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>
          ) : viewMode === 'project' ? (
            <ProjectList
              sessions={sessions}
              selectedSession={selectedSession}
              selectedProject={selectedProject}
              onSelectSession={handleSelectSession}
              onSelectProject={setSelectedProject}
              loading={loading}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
              getBadgeType={getBadgeType}
              scrollParentRef={listScrollRef}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          ) : (
            <SessionList
              sessions={sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              loading={loading}
              getBadgeType={getBadgeType}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
              scrollParentRef={listScrollRef}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          className="h-8 flex-shrink-0 select-none"
          data-tauri-drag-region
          style={{
            WebkitAppRegion: 'drag',
            userSelect: 'none'
          }}
        />
        <div className="flex-1 overflow-hidden">
          {selectedSession ? (
            <SessionViewer
              session={selectedSession}
              onExport={() => setShowExportDialog(true)}
              onRename={() => setShowRenameDialog(true)}
              onBack={() => setSelectedSession(null)}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
            />
          ) : (
            <Dashboard
              sessions={selectedProject
                ? sessions.filter(s => s.cwd === selectedProject)
                : sessions
              }
              onSessionSelect={setSelectedSession}
              projectName={selectedProject || undefined}
            />
          )}
        </div>
      </div>

      {showExportDialog && selectedSession && (
        <ExportDialog
          session={selectedSession}
          onExport={onExportSession}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {showRenameDialog && selectedSession && (
        <RenameDialog
          session={selectedSession}
          onRename={onRenameSession}
          onClose={() => setShowRenameDialog(false)}
        />
      )}

      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <CommandPalette context={commandContext} />
    </div>
  )
}

export default App