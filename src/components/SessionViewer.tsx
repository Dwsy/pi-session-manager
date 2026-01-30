import { useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionEntry } from '../types'
import { parseSessionEntries, computeStats } from '../utils/session'
import SessionHeader from './SessionHeader'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ModelChange from './ModelChange'
import Compaction from './Compaction'
import BranchSummary from './BranchSummary'
import CustomMessage from './CustomMessage'
import SessionTree from './SessionTree'
import '../styles/session.css'

interface SessionViewerProps {
  session: SessionInfo
  onExport: () => void
  onRename: () => void
  onBack?: () => void
}

export default function SessionViewer({ session, onExport, onRename, onBack }: SessionViewerProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadSession()
  }, [session])

  useEffect(() => {
    if (activeEntryId && messagesContainerRef.current) {
      const element = document.getElementById(`entry-${activeEntryId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [activeEntryId])

  const loadSession = async () => {
    try {
      setLoading(true)
      setError(null)

      const jsonlContent = await invoke<string>('read_session_file', { path: session.path })

      const parsedEntries = parseSessionEntries(jsonlContent)
      setEntries(parsedEntries)

      const lastMessage = parsedEntries.filter(e => e.type === 'message').pop()
      if (lastMessage) {
        setActiveEntryId(lastMessage.id)
      }
    } catch (err) {
      console.error('Failed to load session:', err)
      setError(err instanceof Error ? err.message : t('session.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const stats = computeStats(entries)
  const headerEntry = entries.find(e => e.type === 'session')

  const renderEntry = (entry: SessionEntry) => {
    switch (entry.type) {
      case 'message':
        if (!entry.message) return null
        const role = entry.message.role

        if (role === 'user') {
          return (
            <UserMessage
              key={entry.id}
              content={entry.message.content}
              timestamp={entry.timestamp}
              id={entry.id}
            />
          )
        } else if (role === 'assistant') {
          return (
            <AssistantMessage
              key={entry.id}
              content={entry.message.content}
              timestamp={entry.timestamp}
              entryId={entry.id}
              entries={entries}
            />
          )
        }
        return null

      case 'model_change':
        return (
          <ModelChange
            key={entry.id}
            provider={entry.provider}
            modelId={entry.modelId}
            timestamp={entry.timestamp}
          />
        )

      case 'compaction':
        return (
          <Compaction
            key={entry.id}
            tokensBefore={entry.tokensBefore}
            summary={entry.summary}
          />
        )

      case 'branch_summary':
        return (
          <BranchSummary
            key={entry.id}
            summary={entry.summary}
            timestamp={entry.timestamp}
          />
        )

      case 'custom_message':
        return (
          <CustomMessage
            key={entry.id}
            customType={entry.customType}
            content={entry.content}
            timestamp={entry.timestamp}
          />
        )

      default:
        return null
    }
  }

  const messageEntries = entries.filter(e => e.type === 'message')

  const handleTreeNodeClick = (_leafId: string, targetId: string) => {
    setActiveEntryId(targetId)
    setTimeout(() => {
      const element = document.getElementById(`entry-${targetId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 100)
  }

  return (
    <div className="h-full flex">
      {showSidebar && (
        <aside className="session-sidebar">
          <SessionTree
            entries={entries}
            activeLeafId={activeEntryId ?? undefined}
            targetId={activeEntryId ?? undefined}
            onNodeClick={handleTreeNodeClick}
          />
        </aside>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#2c2d3b]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded transition-colors"
              title={showSidebar ? t('session.hideSidebar') : t('session.showSidebar')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium">{session.name || t('session.title')}</span>
            <span className="text-xs text-[#6a6f85]">
              {messageEntries.length} {t('session.messages')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRename}
              className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors"
            >
              {t('common.rename')}
            </button>
            <button
              onClick={onExport}
              className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors"
            >
              {t('common.export')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin text-[#6a6f85]">{t('session.loading')}</div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-400">
            <div className="text-center">
              <p className="mb-2">{t('session.error')}</p>
              <p className="text-sm text-[#6a6f85]">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto session-viewer" ref={messagesContainerRef}>
            <SessionHeader
              sessionId={headerEntry?.id || session.id}
              timestamp={headerEntry?.timestamp}
              stats={stats}
            />
            <div className="messages">
              {entries.length > 0 ? (
                entries.map(renderEntry)
              ) : (
                <div className="empty-state">{t('session.noMessages')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}