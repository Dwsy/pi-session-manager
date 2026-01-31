import { useEffect, useState, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionEntry } from '../types'
import { parseSessionEntries, computeStats } from '../utils/session'
import { extractTextFromHTML, containsSearchQuery } from '../utils/search'
import { parseMarkdown } from '../utils/markdown'
import SessionHeader from './SessionHeader'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ModelChange from './ModelChange'
import Compaction from './Compaction'
import BranchSummary from './BranchSummary'
import CustomMessage from './CustomMessage'
import SessionTree from './SessionTree'
import SearchBar from './SearchBar'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // 搜索状态
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(0)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadSession()
  }, [session])

  // 快捷键监听：cmd+f / ctrl+f 打开搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 执行搜索
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentResultIndex(0)
      return
    }

    const results: string[] = []
    
    entries.forEach(entry => {
      if (entry.type === 'message' && entry.message) {
        const content = entry.message.content
        
        // 提取文本内容
        const textItems = content.filter(c => c.type === 'text' && c.text)
        const text = textItems.map(c => c.text).join('\n')
        
        if (text) {
          // 解析 Markdown 为 HTML
          const html = parseMarkdown(text)
          // 提取纯文本
          const plainText = extractTextFromHTML(html)
          
          // 检查是否包含搜索关键词
          if (containsSearchQuery(plainText, searchQuery)) {
            results.push(entry.id)
          }
        }
      }
    })

    setSearchResults(results)
    setCurrentResultIndex(0)
  }, [searchQuery, entries])

  // 滚动到当前搜索结果
  useEffect(() => {
    if (searchResults.length > 0 && messagesContainerRef.current) {
      const currentEntryId = searchResults[currentResultIndex]
      setActiveEntryId(currentEntryId)
    }
  }, [currentResultIndex, searchResults])

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
    startXRef.current = e.clientX
    startWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current
      const newWidth = startWidthRef.current + deltaX
      
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
              searchQuery={searchQuery}
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
              searchQuery={searchQuery}
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

  // 搜索导航
  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentResultIndex((prev) => (prev + 1) % searchResults.length)
  }, [searchResults])

  const handleSearchPrevious = useCallback(() => {
    if (searchResults.length === 0) return
    setCurrentResultIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length)
  }, [searchResults])

  const handleSearchClose = useCallback(() => {
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setCurrentResultIndex(0)
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  return (
    <div className="h-full flex relative">
      {showSearch && (
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClose={handleSearchClose}
          onNext={handleSearchNext}
          onPrevious={handleSearchPrevious}
          currentIndex={currentResultIndex}
          totalResults={searchResults.length}
        />
      )}

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
