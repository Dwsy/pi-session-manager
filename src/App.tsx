import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Star, Settings, ArrowLeft, LayoutDashboard, Plus } from 'lucide-react'
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
import { useExternalLinks } from './hooks/useExternalLinks'
import { useSessions } from './hooks/useSessions'
import { useAppSettings } from './hooks/useAppSettings'
import { useSessionActions } from './hooks/useSessionActions'
import { useUrlState } from './hooks/useUrlState'
import { registerBuiltinPlugins } from './plugins'
import type { SessionInfo, FavoriteItem } from './types'
import type { SearchContext } from './plugins/types'
import { invoke } from './transport'
import { isTauriReady } from './utils/session'
import { sessionPathMatches } from './utils/sessionPath'

// Window dragging helper - only works in Tauri
const startDragging = async () => {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch {
    // Ignore in browser environment
  }
}

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
  const creatingSessionRef = useRef(false)
  const isDesktopMode = useMemo(() => isTauriReady(), [])

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
  const { projectFromUrl, sessionFromUrl, updateUrlState, clearUrlState } = useUrlState(true)

  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'project'>('project')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteItem[]>([])
  const [loadingFavorites, setLoadingFavorites] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [draftSession, setDraftSession] = useState<SessionInfo | null>(null)

  const loadFavorites = useCallback(async () => {
    console.log('[Favorites] Loading favorites...')
    setLoadingFavorites(true)
    try {
      const result = await invoke<sqlite_cache.FavoriteItem[]>('get_all_favorites')
      console.log('[Favorites] Raw result from backend:', result)
      const formattedFavorites: FavoriteItem[] = result.map(f => ({
        id: f.id,
        type: f.type as 'session' | 'project',
        name: f.name,
        path: f.path,
        addedAt: f.added_at,
      }))
      console.log('[Favorites] Formatted favorites:', formattedFavorites)
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
    console.log('[Favorites] Toggle favorite called with:', item)
    try {
      const params = {
        id: item.id,
        favoriteType: item.type,
        name: item.name,
        path: item.path,
      }
      console.log('[Favorites] Invoking toggle_favorite with params:', params)
      const result = await invoke('toggle_favorite', params)
      console.log('[Favorites] Toggle result:', result)
      await loadFavorites()
    } catch (error) {
      console.error('[Favorites] Failed to toggle favorite:', error)
    }
  }, [loadFavorites])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setSelectedSession(session)
    clearBadge(session.id)
  }, [setSelectedSession, clearBadge])

  const sessionsWithDraft = useMemo(() => {
    if (!draftSession) return sessions
    const duplicated = sessions.some(item => item.id === draftSession.id || item.path === draftSession.path)
    if (duplicated) return sessions
    return [draftSession, ...sessions]
  }, [sessions, draftSession])

  useEffect(() => {
    registerBuiltinPlugins()

    const initialize = async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      setIsInitialized(true)
    }

    initialize()
  }, [])

  // F12 to toggle devtools in production builds
  useEffect(() => {
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

  // 处理 URL 参数：根据 URL 中的 session 或 project 恢复选择状态
  const urlRestorationDoneRef = useRef(false)
  
  const handleUrlStateRestoration = useCallback(() => {
    if (urlRestorationDoneRef.current) return
    
    console.log('[URL Restore] Attempting restoration:', { sessionFromUrl, projectFromUrl, sessionsCount: sessions.length })
    
    // 优先恢复会话选择
    if (sessionFromUrl && sessions.length > 0) {
      const session = sessions.find(s => s.id === sessionFromUrl || s.path === sessionFromUrl)
      console.log('[URL Restore] Looking for session:', sessionFromUrl, 'Found:', session?.id)
      if (session) {
        setSelectedSession(session)
        urlRestorationDoneRef.current = true
        console.log('[URL Restore] Session restored successfully')
        return
      }
    }
    // 其次恢复项目选择
    if (projectFromUrl && sessions.length > 0) {
      const hasProject = sessions.some(s => s.cwd === projectFromUrl)
      if (hasProject) {
        setViewMode('project')
        setSelectedProject(projectFromUrl)
        urlRestorationDoneRef.current = true
        console.log('[URL Restore] Project restored successfully')
      }
    }
  }, [sessionFromUrl, projectFromUrl, sessions, setSelectedSession])

  // 当 URL 参数或会话列表变化时，恢复选择状态
  useEffect(() => {
    if (!isInitialized) return
    if (sessions.length === 0) return
    if (!sessionFromUrl && !projectFromUrl) return
    handleUrlStateRestoration()
  }, [isInitialized, sessions, sessionFromUrl, projectFromUrl, handleUrlStateRestoration])

  // 当选择变化时，更新 URL
  useEffect(() => {
    if (!isInitialized) return
    if (selectedSession) {
      updateUrlState({ session: selectedSession.id, project: null })
    } else if (selectedProject) {
      updateUrlState({ project: selectedProject, session: null })
    } else {
      clearUrlState()
    }
  }, [selectedSession, selectedProject, isInitialized, updateUrlState, clearUrlState])

  const loadSessionsRef = useRef(loadSessions)
  const loadSettingsRef = useRef(loadSettings)
  const loadFavoritesRef = useRef(loadFavorites)

  useEffect(() => {
    loadSessionsRef.current = loadSessions
    loadSettingsRef.current = loadSettings
    loadFavoritesRef.current = loadFavorites
  }, [loadSessions, loadSettings, loadFavorites])

  useEffect(() => {
    if (!isInitialized) return

    loadSessionsRef.current()
    loadSettingsRef.current()
    loadFavoritesRef.current()
  }, [isInitialized])

  useFileWatcher({
    enabled: true,
    debounceMs: 2000,
    onSessionsChanged: () => {
      loadSessions()
    },
  })

  const handleResumeSession = useCallback(async () => {
    if (!selectedSession) return
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
    if (!selectedSession) return
    try {
      await invoke('open_session_in_browser', { path: selectedSession.path })
    } catch (err) {
      console.error('Failed to export and open session:', err)
    }
  }, [selectedSession])

  const handleCreateDraftSession = useCallback(() => {
    const now = new Date().toISOString()
    const baseCwd = selectedProject || selectedSession?.cwd || sessions[0]?.cwd || ''
    const seed = Date.now().toString(36)
    const draft: SessionInfo = {
      id: `draft-${seed}`,
      path: `draft://${seed}`,
      cwd: baseCwd,
      name: t('session.newSession', '新会话'),
      isDraft: true,
      created: now,
      modified: now,
      message_count: 0,
      first_message: '',
      all_messages_text: '',
      last_message: '',
      last_message_role: 'user',
    }
    setDraftSession(draft)
    setSelectedSession(draft)
  }, [selectedProject, selectedSession?.cwd, sessions, setSelectedSession, t])

  const handleEnsureRealSession = useCallback(async (draft: SessionInfo): Promise<SessionInfo | null> => {
    if (!draft.isDraft) {
      return draft
    }
    if (creatingSessionRef.current) {
      return null
    }
    creatingSessionRef.current = true
    try {
      const sessionPathFromRpc = await invoke<string | null>('new_rpc_session', { parentSession: null })
      let newSessionPath: string | null = null
      if (sessionPathFromRpc && !sessionPathFromRpc.startsWith('draft://')) {
        newSessionPath = sessionPathFromRpc
      } else {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const state = await invoke<{ session_file?: string | null; sessionFile?: string | null }>('get_rpc_state')
          newSessionPath = state.session_file || state.sessionFile || null
          if (newSessionPath && !newSessionPath.startsWith('draft://')) {
            break
          }
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      if (!newSessionPath || newSessionPath.startsWith('draft://')) {
        return null
      }

      let matched: SessionInfo | null = null
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const latest = await invoke<SessionInfo[]>('scan_sessions')
        matched = latest.find((item) => sessionPathMatches(newSessionPath, item.path)) || null
        if (matched) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 250))
      }

      const resolvedSession = matched || (() => {
        const now = new Date().toISOString()
        const fallbackName = draft.name || t('session.newSession', '新会话')
        return {
          ...draft,
          id: `session-${Date.now().toString(36)}`,
          path: newSessionPath,
          isDraft: false,
          name: fallbackName,
          modified: now,
        }
      })()

      setDraftSession(null)
      setSelectedSession(resolvedSession)
      setTimeout(() => {
        void loadSessions()
      }, 300)
      return resolvedSession
    } catch (error) {
      console.error('[App] Failed to ensure real RPC session:', error)
      alert(`${t('session.newSessionFailed', '创建新会话失败')}: ${error}`)
      return null
    } finally {
      creatingSessionRef.current = false
    }
  }, [loadSessions, setSelectedSession, t])

  const shortcuts = useMemo(() => ({
    'cmd+r': handleResumeSession,
    'cmd+e': handleExportAndOpen,
    'cmd+p': () => { setViewMode('project'); setSelectedProject(null); setShowFavorites(false) },
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
  }), [showSettings, showExportDialog, showRenameDialog, selectedProject, setSelectedSession, handleResumeSession, handleExportAndOpen])

  useKeyboardShortcuts(shortcuts)
  useExternalLinks() // 拦截外部链接点击，使用系统浏览器打开

  const commandContext = useMemo<SearchContext>(() => ({
    sessions: sessionsWithDraft,
    selectedProject,
    selectedSession,
    setSelectedSession,
    setSelectedProject,
    closeCommandMenu: () => {},
    searchCurrentProjectOnly: false,
    t
  }), [sessionsWithDraft, selectedProject, selectedSession, t, setSelectedSession])

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
          className="h-12 border-b border-[#2c2d3b] flex items-center px-3 select-none"
          data-tauri-drag-region={isDesktopMode ? '' : undefined}
          onMouseDown={isDesktopMode ? () => startDragging() : undefined}
        >
          <div className="flex items-center gap-0.5 ml-auto no-drag">
            <button
              onClick={() => setSelectedSession(null)}
              className="p-1 rounded transition-colors mr-1 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]"
              title={t('dashboard.title')}
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
            <div className="flex items-center bg-[#252636] rounded-lg p-0.5 mr-1">
              <button
                onClick={() => { setViewMode('list'); setSelectedProject(null); setShowFavorites(false) }}
                className={`p-1 rounded transition-colors ${viewMode === 'list' && !showFavorites ? 'text-blue-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white'}`}
                title={t('app.viewMode.list')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode('project'); setSelectedProject(null); setShowFavorites(false) }}
                className={`p-1 rounded transition-colors ${viewMode === 'project' && !showFavorites ? 'text-blue-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white'}`}
                title={t('app.viewMode.project')}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleCreateDraftSession}
              className="p-1 rounded transition-colors mr-1 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]"
              title={t('session.newSession', '新会话')}
            >
              <Plus className="h-4 w-4" />
            </button>
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
              className={`p-1 rounded transition-colors ml-0.5 ${showFavorites ? 'text-yellow-400 bg-[#2c2d3b]' : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'}`}
              title={showFavorites ? t('favorites.back') : t('favorites.title')}
            >
              <Star className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 rounded transition-colors ml-0.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]"
              title={t('settings.title')}
            >
              <Settings className="h-4 w-4" />
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
              onSelectProject={(projectPath) => {
                setShowFavorites(false)
                setViewMode('project')
                setSelectedProject(projectPath)
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
                  <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {sessionsWithDraft.find(s => s.cwd === selectedProject)?.cwd.split('/').pop() || selectedProject.split('/').pop()}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    ({sessionsWithDraft.filter(s => s.cwd === selectedProject).length})
                  </span>
                </div>
                <button
                  onClick={handleCreateDraftSession}
                  className="p-1 hover:bg-accent rounded transition-colors flex-shrink-0"
                  title={t('session.newSession', '新会话')}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div>
                <SessionList
                  sessions={sessionsWithDraft.filter(s => s.cwd === selectedProject)}
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
              sessions={sessionsWithDraft}
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
              sessions={sessionsWithDraft}
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
        {isDesktopMode && (
          <div
            className="h-8 flex-shrink-0 select-none"
            data-tauri-drag-region
            onMouseDown={() => startDragging()}
          />
        )}
        <div className="flex-1 overflow-hidden">
          {selectedSession ? (
            <SessionViewer
              session={selectedSession}
              onExport={() => setShowExportDialog(true)}
              onRename={() => setShowRenameDialog(true)}
              onNewSession={handleCreateDraftSession}
              onEnsureSession={handleEnsureRealSession}
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
              loading={loading}
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
