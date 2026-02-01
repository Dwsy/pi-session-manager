import { useEffect, useState, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
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

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_WIDTH_KEY = 'pi-session-manager-sidebar-width'

export default function SessionViewer({ session, onExport, onRename }: SessionViewerProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [showLoading, setShowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    loadSession()
  }, [session])

  useEffect(() => {
    if (activeEntryId && messagesContainerRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        const element = document.getElementById(`entry-${activeEntryId}`)
        if (element) {
          // 使用 'center' 而不是 'nearest' 以确保元素在视口中央
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          })
          
          // 添加高亮效果
          element.classList.add('highlight')
          setTimeout(() => {
            element.classList.remove('highlight')
          }, 2000)
        }
      })
    }
  }, [activeEntryId])

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX
      if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(newWidth)
        localStorage.setItem(SIDEBAR_WIDTH_KEY, newWidth.toString())
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const loadSession = async () => {
    try {
      setShowLoading(false)
      setError(null)

      // 300ms 后才显示加载动画，避免快速加载时的闪烁
      loadingTimerRef.current = setTimeout(() => {
        setShowLoading(true)
      }, 300)

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
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
      setShowLoading(false)
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

  const handleTreeNodeClick = useCallback((_leafId: string, targetId: string) => {
    setActiveEntryId(targetId)
  }, [])

  return (
    <div className="h-full flex relative">
      {showSidebar && (
        <>
          <aside 
            ref={sidebarRef}
            className="session-sidebar" 
            style={{ width: `${sidebarWidth}px` }}
          >
            <SessionTree
              entries={entries}
              activeLeafId={activeEntryId ?? undefined}
              onNodeClick={handleTreeNodeClick}
            />
          </aside>
          
          {/* 拖拽手柄 */}
          <div
            ref={resizeHandleRef}
            className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          >
            <div className="sidebar-resize-handle-inner" />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#2c2d3b]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded transition-colors flex-shrink-0"
              title={showSidebar ? t('session.hideSidebar') : t('session.showSidebar')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium truncate">{session.name || t('session.title')}</span>
            <span className="text-xs text-[#6a6f85] flex-shrink-0">
              {messageEntries.length} {t('session.messages')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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

        {showLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-[#6a6f85]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('session.loading')}</span>
            </div>
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
