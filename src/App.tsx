import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import { BarChart3, FolderOpen, Settings } from 'lucide-react'
import SessionList from './components/SessionList'
import SessionListByDirectory from './components/SessionListByDirectory'
import ProjectList from './components/ProjectList'
import SessionViewer from './components/SessionViewer'
import SearchPanel from './components/SearchPanel'
import ExportDialog from './components/ExportDialog'
import RenameDialog from './components/RenameDialog'
import Dashboard from './components/Dashboard'
import LanguageSwitcher from './components/LanguageSwitcher'
import SettingsPanel from './components/settings/SettingsPanel'
import { CommandPalette } from './components/command'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useSessionBadges } from './hooks/useSessionBadges'
import { registerBuiltinPlugins } from './plugins'
import type { SessionInfo, SearchResult } from './types'
import type { SearchContext } from './plugins/types'

function App() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'directory' | 'project'>('project')
  const [terminal, setTerminal] = useState<'iterm2' | 'terminal' | 'vscode' | 'custom'>('iterm2')
  const [piPath, setPiPath] = useState<string>('pi')
  const [customCommand, setCustomCommand] = useState<string>('')

  // 注册内置插件
  useEffect(() => {
    registerBuiltinPlugins()
  }, [])

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    console.log('[App] loadSessions called')
    try {
      setLoading(true)
      console.log('[App] Invoking scan_sessions...')
      const result = await invoke<SessionInfo[]>('scan_sessions')
      console.log('[App] scan_sessions returned', result.length, 'sessions')
      setSessions(result)
      console.log('[App] Sessions state updated')
    } catch (error) {
      console.error('[App] Failed to load sessions:', error)
      alert(`${t('app.errors.loadSessions')}: ${error}`)
    } finally {
      console.log('[App] loadSessions completed, setLoading(false)')
      setLoading(false)
    }
  }, [t])

  // 加载终端设置
  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke('load_app_settings') as any
      if (settings?.terminal) {
        setTerminal(settings.terminal.default_terminal || 'iterm2')
        setPiPath(settings.terminal.pi_command_path || 'pi')
        setCustomCommand(settings.terminal.custom_terminal_command || '')
      }
    } catch (error) {
      console.error('[App] Failed to load settings:', error)
    }
  }, [])

  // Keyboard shortcuts
  const shortcuts = useCallback(() => ({
    'cmd+r': () => loadSessions(),
    'cmd+f': () => document.querySelector<HTMLInputElement>('input[type="text"]')?.focus(),
    'cmd+,': () => setShowSettings(true),
    'escape': () => {
      console.log('[Shortcuts] Escape pressed', { showExportDialog, showRenameDialog, showSettings, selectedProject })

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
        setSearchResults([])
      }
    },
  }), [selectedProject, showSettings, showExportDialog, showRenameDialog, loadSessions])

  useKeyboardShortcuts(shortcuts())

  // 创建 SearchContext
  const commandContext = useMemo<SearchContext>(() => ({
    sessions,
    selectedProject,
    selectedSession,
    setSelectedSession,
    setSelectedProject,
    closeCommandMenu: () => {}, // 由 CommandPalette 内部处理
    searchCurrentProjectOnly: false, // 默认值，会被 CommandPalette 覆盖
    t
  }), [sessions, selectedProject, selectedSession, t])

  // 初始加载
  useEffect(() => {
    loadSessions()
    loadSettings()
  }, [loadSessions, loadSettings])

  // 文件监听：自动刷新会话列表（暂时禁用，性能问题）
  // useFileWatcher({
  //   enabled: true,
  //   onSessionsChanged: loadSessions,
  // })

  // Badge 状态管理
  const { getBadgeType, clearBadge } = useSessionBadges(sessions)

  // 选择会话时清除 badge
  const handleSelectSession = useCallback((session: SessionInfo) => {
    setSelectedSession(session)
    setSearchResults([])
    clearBadge(session.id)
  }, [clearBadge])

  const handleSearch = useCallback(async (query: string) => {
    console.log('[Search] handleSearch called with query:', query)
    console.log('[Search] sessions count:', sessions.length)

    if (!query.trim()) {
      console.log('[Search] Empty query, clearing results')
      setSearchResults([])
      setSelectedSession(null)
      return
    }

    try {
      setIsSearching(true)
      console.log('[Search] Set isSearching = true, invoking search_sessions...')

      const results = await invoke<SearchResult[]>('search_sessions', {
        sessions,
        query,
        searchMode: 'content',
        roleFilter: 'all',
        includeTools: false,
      })

      console.log('[Search] Search completed, results:', results)
      console.log('[Search] Results count:', results.length)
      setSearchResults(results)
      console.log('[Search] Set searchResults')
    } catch (error) {
      console.error('[Search] Search failed:', error)
      console.error('[Search] Error details:', JSON.stringify(error))
    } finally {
      console.log('[Search] Finally block, setting isSearching = false')
      setIsSearching(false)
      console.log('[Search] isSearching set to false')
    }
  }, [sessions])

  const handleDeleteSession = async (session: SessionInfo) => {
    if (!confirm(t('app.confirm.deleteSession', { name: session.name || t('common.untitled') }))) {
      return
    }

    try {
      await invoke('delete_session', { path: session.path })
      setSessions(sessions.filter(s => s.id !== session.id))
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert(t('app.errors.deleteSession'))
    }
  }

  const handleRenameSession = async (newName: string) => {
    if (!selectedSession) return

    try {
      await invoke('rename_session', {
        path: selectedSession.path,
        newName
      })
      // Update local state
      const updatedSessions = sessions.map(s =>
        s.id === selectedSession.id ? { ...s, name: newName } : s
      )
      setSessions(updatedSessions)
      setSelectedSession({ ...selectedSession, name: newName })
      setShowRenameDialog(false)
    } catch (error) {
      console.error('Failed to rename session:', error)
      alert(t('app.errors.renameSession'))
    }
  }

  const handleExportSession = async (format: 'html' | 'md' | 'json') => {
    if (!selectedSession) {
      console.error('[Export] No session selected')
      return
    }

    console.log('[Export] Starting export:', { format, sessionPath: selectedSession.path, sessionName: selectedSession.name })

    const extension = format === 'md' ? 'md' : format
    const defaultPath = `${selectedSession.name || 'session'}.${extension}`

    console.log('[Export] Opening save dialog:', { defaultPath })

    const filePath = await save({
      filters: [{
        name: format.toUpperCase(),
        extensions: [extension]
      }],
      defaultPath
    })

    if (!filePath) {
      console.log('[Export] User cancelled save dialog')
      return
    }

    console.log('[Export] File path selected:', filePath)

    try {
      console.log('[Export] Invoking export_session command:', {
        path: selectedSession.path,
        format,
        outputPath: filePath
      })

      await invoke('export_session', {
        path: selectedSession.path,
        format,
        outputPath: filePath
      })

      console.log('[Export] Export successful')
      alert(t('app.errors.exportSuccess'))
      setShowExportDialog(false)
    } catch (error) {
      console.error('[Export] Export failed:', error)
      alert(`${t('app.errors.exportFailed')}: ${error}`)
    }
  }

  console.log('[App] Render - isSearching:', isSearching, 'searchResults:', searchResults.length, 'sessions:', sessions.length)

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left Sidebar */}
      <div className="w-80 border-r border-[#2c2d3b] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2c2d3b]">
          <div className="flex items-center gap-2 min-w-0">
            {selectedProject && (
              <button
                onClick={() => setSelectedProject(null)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 flex-shrink-0"
              >
                ← {t('common.back')}
              </button>
            )}
            <h1 className="font-semibold text-sm truncate">{selectedProject || t('app.projects')}</h1>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* View Mode Group */}
            <div className="flex items-center bg-[#252636] rounded-lg p-0.5 mr-1">
              {/* List View */}
              <button
                onClick={() => {
                  setViewMode('list')
                  setSelectedProject(null)
                }}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'text-blue-400 bg-[#2c2d3b]'
                    : 'text-[#6a6f85] hover:text-white'
                }`}
                title={t('app.viewMode.list')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              {/* Directory View */}
              <button
                onClick={() => {
                  setViewMode('directory')
                  setSelectedProject(null)
                }}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'directory'
                    ? 'text-blue-400 bg-[#2c2d3b]'
                    : 'text-[#6a6f85] hover:text-white'
                }`}
                title={t('app.viewMode.directory')}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
              {/* Project View */}
              <button
                onClick={() => {
                  setViewMode('project')
                  setSelectedProject(null)
                }}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'project'
                    ? 'text-blue-400 bg-[#2c2d3b]'
                    : 'text-[#6a6f85] hover:text-white'
                }`}
                title={t('app.viewMode.project')}
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </div>
            {/* Language Switcher */}
            <LanguageSwitcher />
            {/* Dashboard Button */}
            <button
              onClick={() => setSelectedSession(null)}
              className={`p-1 rounded transition-colors ml-0.5 ${
                !selectedSession
                  ? 'text-[#569cd6] bg-[#569cd6]/10'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title={t('dashboard.title')}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 rounded transition-colors ml-0.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]"
              title={t('settings.title')}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <SearchPanel
          onSearch={handleSearch}
          resultCount={searchResults.length}
          isSearching={isSearching}
        />
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'project' ? (
            <ProjectList
              sessions={isSearching ? mapSearchResults(searchResults, sessions) : sessions}
              selectedSession={selectedSession}
              selectedProject={selectedProject}
              onSelectSession={handleSelectSession}
              onSelectProject={setSelectedProject}
              loading={loading}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
              getBadgeType={getBadgeType}
            />
          ) : viewMode === 'directory' ? (
            <SessionListByDirectory
              sessions={isSearching ? mapSearchResults(searchResults, sessions) : sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              loading={loading}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
              getBadgeType={getBadgeType}
            />
          ) : (
            <SessionList
              sessions={isSearching ? mapSearchResults(searchResults, sessions) : sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              loading={loading}
              getBadgeType={getBadgeType}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
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

      {/* Export Dialog */}
      {showExportDialog && selectedSession && (
        <ExportDialog
          session={selectedSession}
          onExport={handleExportSession}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {/* Rename Dialog */}
      {showRenameDialog && selectedSession && (
        <RenameDialog
          session={selectedSession}
          onRename={handleRenameSession}
          onClose={() => setShowRenameDialog(false)}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Command Palette */}
      <CommandPalette context={commandContext} />
    </div>
  )
}

function mapSearchResults(results: SearchResult[], allSessions: SessionInfo[]): SessionInfo[] {
  console.log('[mapSearchResults] Mapping', results.length, 'search results')
  console.log('[mapSearchResults] allSessions count:', allSessions.length)

  return results.map((r) => {
    // Find the original session to preserve cwd and other metadata
    const originalSession = allSessions.find(s => s.id === r.session_id)

    const mapped = {
      path: r.session_path,
      id: r.session_id,
      cwd: originalSession?.cwd || '',
      name: r.session_name || originalSession?.name,
      created: originalSession?.created || new Date().toISOString(),
      modified: originalSession?.modified || new Date().toISOString(),
      message_count: r.matches.length,
      first_message: r.first_message,
      all_messages_text: '',
      last_message: originalSession?.last_message || '',
      last_message_role: originalSession?.last_message_role || 'user',
    }

    console.log('[mapSearchResults] Mapped result:', {
      id: r.session_id,
      name: mapped.name,
      cwd: mapped.cwd,
      originalSessionFound: !!originalSession
    })

    return mapped
  })
}

export default App