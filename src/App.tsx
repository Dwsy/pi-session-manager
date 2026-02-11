import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Star, Settings, ArrowLeft, LayoutDashboard, Search, Terminal } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

const startDragging = () => {
  if (isTauri()) {
    getCurrentWindow().startDragging()
  }
}
import SessionList from './components/SessionList'
import ProjectList from './components/ProjectList'
import SessionViewer from './components/SessionViewer'
import ExportDialog from './components/ExportDialog'
import RenameDialog from './components/RenameDialog'
import Dashboard from './components/Dashboard'
import FavoritesPanel from './components/FavoritesPanel'
import SettingsPanel from './components/settings/SettingsPanel'
import Onboarding from './components/Onboarding'
import { CommandPalette } from './components/command'
import TerminalPanel from './components/TerminalPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useSessionBadges } from './hooks/useSessionBadges'
import { useSessions } from './hooks/useSessions'
import { useAppSettings } from './hooks/useAppSettings'
import { useSessionActions } from './hooks/useSessionActions'
import { useAppearance } from './hooks/useAppearance'
import { registerBuiltinPlugins } from './plugins'
import type { SessionInfo, FavoriteItem } from './types'
import type { SearchContext } from './plugins/types'
import { invoke, isTauri } from './transport'
import { getCachedSettings } from './utils/settingsApi'

// Define sqlite_cache types for Tauri responses
namespace sqlite_cache {
  export interface FavoriteItem {
    id: string
    type: string
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
  useAppearance()

  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'project'>(() => {
    const saved = getCachedSettings().session?.defaultViewMode
    return saved === 'list' ? 'list' : 'project'
  })
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding-completed')
  })
  const [showTerminal, setShowTerminal] = useState(false)
  const [terminalConfig, setTerminalConfig] = useState({ enabled: true, defaultShell: '/bin/zsh', fontSize: 13 })
  const hasInitializedRef = useRef(false)

  const reloadTerminalConfig = useCallback(() => {
    try {
      const s = getCachedSettings()
      setTerminalConfig({
        enabled: s.terminal?.builtinTerminalEnabled !== false,
        defaultShell: s.terminal?.defaultShell || '/bin/zsh',
        fontSize: s.terminal?.terminalFontSize || 13,
      })
      if (s.terminal?.builtinTerminalEnabled === false) {
        setShowTerminal(false)
      }
    } catch {}
  }, [])

  const loadFavorites = useCallback(async () => {
    setLoadingFavorites(true)
    try {
      const result = await invoke<sqlite_cache.FavoriteItem[]>('get_all_favorites')
      const formattedFavorites: FavoriteItem[] = result.map(f => ({
        id: f.id,
        type: f.type as 'session' | 'project',
        name: f.name,
        path: f.path,
        addedAt: f.added_at,
      }))
      setFavorites(formattedFavorites)
    } catch (error) {
      console.error('[Favorites] Failed to load favorites:', error)
      setFavorites([])
    } finally {
      setLoadingFavorites(false)
    }
  }, [])

  const removeFavorite = useCallback(async (item: FavoriteItem) => {
    try {
      await invoke('remove_favorite', { id: item.id })
      await loadFavorites()
    } catch (error) {
      console.error('Failed to remove favorite:', error)
    }
  }, [loadFavorites])

  const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'addedAt'>) => {
    try {
      const params = {
        id: item.id,
        favoriteType: item.type,
        name: item.name,
        path: item.path,
      }
      await invoke('toggle_favorite', params)
      await loadFavorites()
    } catch (error) {
      console.error('[Favorites] Failed to toggle favorite:', error)
    }
  }, [loadFavorites])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setSelectedSession(session)
    clearBadge(session.id)
  }, [setSelectedSession, clearBadge])

  useEffect(() => {
    registerBuiltinPlugins()
    reloadTerminalConfig()

    // Apply appearance settings from cache
    const s = getCachedSettings()
    const root = document.documentElement
    if (s.appearance) {
      const { theme, sidebarWidth, fontSize, messageSpacing, codeBlockTheme } = s.appearance
      root.classList.remove('theme-dark', 'theme-light')
      if (theme === 'dark') root.classList.add('theme-dark')
      else if (theme === 'light') root.classList.add('theme-light')
      if (sidebarWidth) root.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
      const fontMap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' }
      if (fontSize) root.style.setProperty('--font-size-base', fontMap[fontSize] || '16px')
      const spacingMap: Record<string, string> = { compact: '8px', comfortable: '16px', spacious: '24px' }
      if (messageSpacing) root.style.setProperty('--spacing-base', spacingMap[messageSpacing] || '16px')
      if (codeBlockTheme) root.setAttribute('data-code-theme', codeBlockTheme)
    }

    const initialize = async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      setIsInitialized(true)
    }

    initialize()
  }, [])

  // F12 to toggle devtools in production builds
  useEffect(() => {
    if (!isTauri()) return
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault()
        try {
          await invoke('toggle_devtools')
        } catch (error) {
          console.warn('Failed to toggle devtools:', error)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isInitialized || hasInitializedRef.current) return

    hasInitializedRef.current = true
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

  const handleResumeSession = useCallback(async () => {
    if (!selectedSession) return
    if (!isTauri()) {
      setShowTerminal(true)
      return
    }
    try {
      await invoke('open_session_in_terminal', {
        path: selectedSession.path,
        cwd: selectedSession.cwd,
        terminal: terminal === 'custom' ? customCommand : terminal,
        pi_path: piPath || null,
      })
    } catch (err) {
      console.error('Failed to resume session:', err)
    }
  }, [selectedSession, terminal, customCommand, piPath])

  const handleExportAndOpen = useCallback(async () => {
    if (!selectedSession || !isTauri()) return
    try {
      await invoke('open_session_in_browser', { path: selectedSession.path })
    } catch (err) {
      console.error('Failed to export and open session:', err)
    }
  }, [selectedSession])

  const shortcuts = useMemo(() => ({
    'cmd+r': handleResumeSession,
    'cmd+e': handleExportAndOpen,
    'cmd+p': () => { setViewMode('project'); setSelectedProject(null); setShowFavorites(false) },
    'cmd+,': () => setShowSettings(true),
    'cmd+`': () => { if (terminalConfig.enabled) setShowTerminal(v => !v) },
    'escape': () => {
      if (showSettings) {
        setShowSettings(false)
      } else if (showExportDialog) {
        setShowExportDialog(false)
      } else if (showRenameDialog) {
        setShowRenameDialog(false)
      } else if (showTerminal) {
        setShowTerminal(false)
      } else if (selectedProject) {
        setSelectedProject(null)
      } else {
        setSelectedSession(null)
      }
    },
  }), [showSettings, showExportDialog, showRenameDialog, showTerminal, selectedProject, setSelectedSession, handleResumeSession, handleExportAndOpen, terminalConfig.enabled])

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
      <div className="w-80 border-r border-border flex flex-col">
        <div
          className="h-8 border-b border-border flex items-center px-3 select-none"
          data-tauri-drag-region
          onMouseDown={startDragging}
        >
          <div className="flex items-center gap-0.5 ml-auto no-drag">
            <button
              onClick={() => setSelectedSession(null)}
              className="p-1 rounded transition-colors mr-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={t('dashboard.title')}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center bg-surface rounded-lg p-0.5 mr-1">
              <button
                onClick={() => { setViewMode('list'); setSelectedProject(null); setShowFavorites(false) }}
                className={`p-1 rounded transition-colors ${viewMode === 'list' && !showFavorites ? 'text-blue-400 bg-secondary' : 'text-muted-foreground hover:text-foreground'}`}
                title={t('app.viewMode.list')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode('project'); setSelectedProject(null); setShowFavorites(false) }}
                className={`p-1 rounded transition-colors ${viewMode === 'project' && !showFavorites ? 'text-blue-400 bg-secondary' : 'text-muted-foreground hover:text-foreground'}`}
                title={t('app.viewMode.project')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => {
                if (showFavorites) {
                  // 如果已经在收藏视图，返回到会话列表
                  setShowFavorites(false)
                } else {
                  // 打开收藏视图
                  setShowFavorites(true)
                }
              }}
              className={`p-1 rounded transition-colors ml-0.5 ${showFavorites ? 'text-yellow-400 bg-secondary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
              title={showFavorites ? t('favorites.back') : t('favorites.title')}
            >
              <Star className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
              }}
              className="p-1 rounded transition-colors ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary group relative"
              title={t('app.shortcuts.searchAll', '搜索所有会话') + ' (Cmd+K)'}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            {terminalConfig.enabled && (
            <button
              onClick={() => setShowTerminal(!showTerminal)}
              className={`p-1 rounded transition-colors ml-0.5 ${
                showTerminal
                  ? 'text-green-400 bg-secondary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title={showTerminal ? 'Close terminal (Ctrl+`)' : 'Open terminal (Ctrl+`)'}
            >
              <Terminal className="h-3.5 w-3.5" />
            </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 rounded transition-colors ml-0.5 text-muted-foreground hover:text-foreground hover:bg-secondary"
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
              onSelectProject={(path) => {
                setSelectedProject(path)
                setViewMode('project')
                setShowFavorites(false)
              }}
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
                <SessionList
                  sessions={sessions.filter(s => s.cwd === selectedProject)}
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
                  showDirectory={false}
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
              onDeleteSession={handleDeleteSession}
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
          onMouseDown={startDragging}
        />
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            {selectedSession ? (
              <SessionViewer
                session={selectedSession}
                onExport={() => setShowExportDialog(true)}
                onRename={() => setShowRenameDialog(true)}
                onBack={() => setSelectedSession(null)}
                onWebResume={() => setShowTerminal(true)}
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
                onProjectSelect={(path) => {
                  setSelectedProject(path)
                  setViewMode('project')
                  setShowFavorites(false)
                }}
                projectName={selectedProject || undefined}
                loading={loading}
              />
            )}
          </div>
          {terminalConfig.enabled && (
          <TerminalPanel
            isOpen={showTerminal}
            onClose={() => setShowTerminal(false)}
            cwd={selectedSession?.cwd || selectedProject || sessions[0]?.cwd || '/'}
            height={280}
            defaultShell={terminalConfig.defaultShell}
            fontSize={terminalConfig.fontSize}
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
        onClose={() => { setShowSettings(false); reloadTerminalConfig() }}
      />

      <CommandPalette context={commandContext} />

      {showOnboarding && (
        <Onboarding
          onComplete={() => {
            localStorage.setItem('onboarding-completed', 'true')
            setShowOnboarding(false)
          }}
        />
      )}
    </div>
  )
}

export default App