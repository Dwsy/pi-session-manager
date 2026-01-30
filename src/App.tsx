import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Home } from 'lucide-react'
import SessionList from './components/SessionList'
import SessionListByDirectory from './components/SessionListByDirectory'
import ProjectList from './components/ProjectList'
import SessionViewer from './components/SessionViewer'
import SearchPanel from './components/SearchPanel'
import ExportDialog from './components/ExportDialog'
import RenameDialog from './components/RenameDialog'
import Dashboard from './components/Dashboard'
import LanguageSwitcher from './components/LanguageSwitcher'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { SessionInfo, SearchResult } from './types'

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
  const [viewMode, setViewMode] = useState<'list' | 'directory' | 'project'>('project')

  // Keyboard shortcuts
  const shortcuts = useCallback(() => ({
    'cmd+r': () => loadSessions(),
    'cmd+f': () => document.querySelector<HTMLInputElement>('input[type="text"]')?.focus(),
    'escape': () => {
      if (selectedProject) {
        setSelectedProject(null)
      } else {
        setSelectedSession(null)
        setSearchResults([])
        setShowRenameDialog(false)
        setShowExportDialog(false)
      }
    },
  }), [selectedProject])

  useKeyboardShortcuts(shortcuts())

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      setLoading(true)
      const result = await invoke<SessionInfo[]>('scan_sessions')
      setSessions(result)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      alert(`Failed to load sessions: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSelectedSession(null)
      return
    }

    try {
      setIsSearching(true)
      const results = await invoke<SearchResult[]>('search_sessions', {
        sessions,
        query,
        searchMode: 'content',
        roleFilter: 'all',
        includeTools: false,
      })
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [sessions])

  const handleSelectSession = (session: SessionInfo) => {
    setSelectedSession(session)
    setSearchResults([])
  }

  const handleDeleteSession = async (session: SessionInfo) => {
    if (!confirm(`Delete session "${session.name || 'Untitled'}"?`)) {
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
      alert('Failed to delete session')
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
      alert('Failed to rename session')
    }
  }

  const handleExportSession = async (format: 'html' | 'md' | 'json') => {
    if (!selectedSession) return

    const extension = format === 'md' ? 'md' : format
    const filePath = await save({
      filters: [{
        name: format.toUpperCase(),
        extensions: [extension]
      }],
      defaultPath: `${selectedSession.name || 'session'}.${extension}`
    })

    if (!filePath) return

    try {
      await invoke('export_session', {
        path: selectedSession.path,
        format,
        outputPath: filePath
      })
      alert('Export successful!')
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed')
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Left Sidebar */}
      <div className="w-96 border-r border-[#2c2d3b] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2c2d3b]">
          <div className="flex items-center gap-2">
            {selectedProject && (
              <button
                onClick={() => setSelectedProject(null)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
              >
                ← {t('common.back')}
              </button>
            )}
            <h1 className="font-semibold">{selectedProject || t('app.projects')}</h1>
          </div>
          <div className="flex items-center gap-1">
            {/* List View */}
            <button
              onClick={() => {
                setViewMode('list')
                setSelectedProject(null)
              }}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'list'
                  ? 'text-blue-400 bg-blue-400/10'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title={t('app.viewMode.list')}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            {/* Directory View */}
            <button
              onClick={() => {
                setViewMode('directory')
                setSelectedProject(null)
              }}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'directory'
                  ? 'text-blue-400 bg-blue-400/10'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title={t('app.viewMode.directory')}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            {/* Project View */}
            <button
              onClick={() => {
                setViewMode('project')
                setSelectedProject(null)
              }}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'project'
                  ? 'text-blue-400 bg-blue-400/10'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title={t('app.viewMode.project')}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            {/* Language Switcher */}
            <LanguageSwitcher />
            {/* Dashboard Button */}
            <button
              onClick={() => setSelectedSession(null)}
              className={`p-1.5 rounded transition-colors ${
                !selectedSession
                  ? 'text-[#569cd6] bg-[#569cd6]/10'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title="Dashboard"
            >
              <BarChart3 className="h-4 w-4" />
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
            selectedProject ? (
              <SessionList
                sessions={sessions.filter(s => s.cwd === selectedProject)}
                selectedSession={selectedSession}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
                loading={loading}
              />
            ) : (
              <ProjectList
                sessions={isSearching ? mapSearchResults(searchResults) : sessions}
                selectedSession={selectedSession}
                onSelectSession={handleSelectSession}
                loading={loading}
              />
            )
          ) : viewMode === 'directory' ? (
            <SessionListByDirectory
              sessions={isSearching ? mapSearchResults(searchResults) : sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              loading={loading}
            />
          ) : (
            <SessionList
              sessions={isSearching ? mapSearchResults(searchResults) : sessions}
              selectedSession={selectedSession}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedSession && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#2c2d3b] bg-[#1e1f2e]">
            <button
              onClick={() => setSelectedSession(null)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
            >
              <Home className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {selectedSession ? (
            <SessionViewer
              session={selectedSession}
              onExport={() => setShowExportDialog(true)}
              onRename={() => setShowRenameDialog(true)}
              onBack={() => setSelectedSession(null)}
            />
          ) : (
            <Dashboard sessions={sessions} />
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
    </div>
  )
}

function mapSearchResults(results: SearchResult[]): SessionInfo[] {
  return results.map((r) => ({
    path: r.session_path,
    id: r.session_id,
    cwd: '',
    name: r.session_name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    message_count: r.matches.length,
    first_message: r.first_message,
    all_messages_text: '',
  }))
}

export default App