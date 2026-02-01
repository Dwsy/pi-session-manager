import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo, SessionEntry } from '../types'
import { parseSessionEntries, computeStats, isTauriReady } from '../utils/session'
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
import OpenInTerminalButton from './OpenInTerminalButton'
import { SessionViewProvider, useSessionView } from '../contexts/SessionViewContext'
import '../styles/session.css'

interface SessionViewerProps {
  session: SessionInfo
  onExport: () => void
  onRename: () => void
  onBack?: () => void
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
}

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_WIDTH_KEY = 'pi-session-manager-sidebar-width'
const MESSAGE_ITEM_GAP = 16

function SessionViewerContent({ session, onExport, onRename, terminal = 'iterm2', piPath, customCommand }: SessionViewerProps) {
  const { t } = useTranslation()
  const { toggleThinking, toggleToolsExpanded } = useSessionView()
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoading, setShowLoading] = useState(false)
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
  const sidebarWidthRef = useRef(sidebarWidth)

  // 增量更新状态
  const [lineCount, setLineCount] = useState(0)
  const lastModifiedTimeRef = useRef(0)

  // 搜索状态
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)

  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    lastModifiedTimeRef.current = 0
    setLineCount(0)
    setEntries([])
    setActiveEntryId(null)
    setHasNewMessages(false)
    loadSession()
  }, [session.path])

  useEffect(() => {
    if (!session.path || loading) return

    const container = messagesContainerRef.current
    if (!container) return

    let checkInterval: NodeJS.Timeout

    const handleScroll = () => {
      isScrollingRef.current = true
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
      }, 150)
    }

    const checkFileChanges = async () => {
      if (isScrollingRef.current) return
      if (!isTauriReady()) return
      try {
        await loadIncremental()
      } catch (err) {
        console.error('Failed to check file changes:', err)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    checkInterval = setInterval(checkFileChanges, 1000)

    return () => {
      clearInterval(checkInterval)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      container.removeEventListener('scroll', handleScroll)
    }
  }, [session.path, lineCount, loading])

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

  // 快捷键监听：ctrl+t 切换思考显示，ctrl+o 切换工具调用展开
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        e.stopPropagation()
        toggleThinking()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        e.stopPropagation()
        toggleToolsExpanded()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleThinking, toggleToolsExpanded])

  const searchableMessages = useMemo(() => {
    if (!searchQuery.trim()) return []
    const results: { id: string; plainText: string }[] = []
    entries.forEach(entry => {
      if (entry.type !== 'message' || !entry.message) return
      const content = entry.message.content
      const textItems = content.filter(c => c.type === 'text' && c.text)
      const text = textItems.map(c => c.text).join('\n')
      if (!text) return
      const html = parseMarkdown(text)
      const plainText = extractTextFromHTML(html)
      if (plainText) {
        results.push({ id: entry.id, plainText })
      }
    })
    return results
  }, [entries, searchQuery])

  // 执行搜索
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setCurrentResultIndex(0)
      return
    }

    const results: string[] = []
    
    searchableMessages.forEach(({ id, plainText }) => {
      if (containsSearchQuery(plainText, searchQuery)) {
        results.push(id)
      }
    })

    setSearchResults(results)
    setCurrentResultIndex(0)
  }, [searchQuery, searchableMessages])

  // 滚动到当前搜索结果
  useEffect(() => {
    if (searchResults.length > 0 && messagesContainerRef.current) {
      const currentEntryId = searchResults[currentResultIndex]
      setActiveEntryId(currentEntryId)
    }
  }, [currentResultIndex, searchResults])

  const renderableEntries = useMemo(() => {
    return entries.filter(entry => {
      if (entry.type === 'message') {
        const role = entry.message?.role
        return role === 'user' || role === 'assistant'
      }
      return (
        entry.type === 'model_change' ||
        entry.type === 'compaction' ||
        entry.type === 'branch_summary' ||
        entry.type === 'custom_message'
      )
    })
  }, [entries])

  const entryIndexById = useMemo(() => {
    const map = new Map<string, number>()
    renderableEntries.forEach((entry, index) => {
      map.set(entry.id, index)
    })
    return map
  }, [renderableEntries])

  const estimateEntrySize = useCallback((index: number) => {
    const cachedHeight = measuredHeightsRef.current.get(index)
    if (cachedHeight) return cachedHeight

    const entry = renderableEntries[index]
    if (!entry) return 140

    switch (entry.type) {
      case 'message': {
        const content = entry.message?.content || []
        const textLength = content
          .filter(c => c.type === 'text')
          .reduce((sum, c) => sum + (c.text?.length || 0), 0)
        const baseHeight = 100
        const contentHeight = Math.ceil(textLength / 100) * 40
        return Math.min(baseHeight + contentHeight, 800)
      }
      case 'model_change':
        return 64
      case 'compaction':
        return 180
      case 'branch_summary':
        return 160
      case 'custom_message':
        return 120
      default:
        return 120
    }
  }, [renderableEntries])

  const rowVirtualizer = useVirtualizer({
    count: renderableEntries.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: estimateEntrySize,
    overscan: 15,
    measureElement: (el) => {
      const index = Number(el.getAttribute('data-index'))
      const height = el.getBoundingClientRect().height
      measuredHeightsRef.current.set(index, height)
      return height
    }
  })

  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    if (!messagesContainerRef.current) return
    if (renderableEntries.length === 0) return
    rowVirtualizer.scrollToIndex(0, { align: 'start' })
  }, [renderableEntries.length, rowVirtualizer])

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (!messagesContainerRef.current) return
    if (renderableEntries.length === 0) return
    rowVirtualizer.scrollToIndex(renderableEntries.length - 1, { align: 'end' })
  }, [renderableEntries.length, rowVirtualizer])

  useEffect(() => {
    if (activeEntryId && messagesContainerRef.current) {
      const targetIndex = entryIndexById.get(activeEntryId)
      if (targetIndex === undefined) return

      rowVirtualizer.scrollToIndex(targetIndex, { align: 'center' })

      const tryHighlight = () => {
        const element = document.getElementById(`entry-${activeEntryId}`)
        if (!element) return false
        element.classList.add('highlight')
        setTimeout(() => {
          element.classList.remove('highlight')
        }, 2000)
        return true
      }

      requestAnimationFrame(() => {
        if (!tryHighlight()) {
          setTimeout(() => {
            tryHighlight()
          }, 50)
        }
      })
    }
  }, [activeEntryId, entryIndexById, rowVirtualizer])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const atBottom = distanceToBottom <= 8
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
      if (atBottom) {
        setHasNewMessages(false)
      }
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [loading, error])

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
        sidebarWidthRef.current = newWidth
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidthRef.current.toString())
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
      setShowLoading(false)
      setError(null)
      measuredHeightsRef.current.clear()

      // 300ms 后才显示加载动画，避免快速加载时的闪烁
      loadingTimerRef.current = setTimeout(() => {
        setShowLoading(true)
      }, 300)

      const jsonlContent = await invoke<string>('read_session_file', { path: session.path })

      // 计算行数
      const lineCount = jsonlContent.split('\n').filter(line => line.trim()).length
      setLineCount(lineCount)

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
      setLoading(false)
      setShowLoading(false)
    }
  }

  // 增量加载新内容
  const loadIncremental = async () => {
    try {
      const result = await invoke<[number, string]>('read_session_file_incremental', {
        path: session.path,
        fromLine: lineCount
      })

      const [newLineCount, newContent] = result

      if (newContent.trim()) {
        // 解析新增的 entries
        const newEntries = parseSessionEntries(newContent)

        if (newEntries.length > 0) {
          // 追加到现有列表
          setEntries(prev => [...prev, ...newEntries])

          // 更新行数
          setLineCount(newLineCount)

          // 更新活动条目
          const lastMessage = newEntries.filter(e => e.type === 'message').pop()
          if (lastMessage) {
            setActiveEntryId(lastMessage.id)
          }

          // 自动滚动到底部
          if (isAtBottomRef.current && messagesContainerRef.current) {
            requestAnimationFrame(() => {
              scrollToBottom()
            })
          } else {
            setHasNewMessages(true)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load incremental session:', err)
    }
  }

  const stats = useMemo(() => computeStats(entries), [entries])
  const headerEntry = useMemo(() => entries.find(e => e.type === 'session'), [entries])

  const renderEntry = useCallback((entry: SessionEntry) => {
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
  }, [entries, searchQuery])

  const messageEntries = useMemo(() => entries.filter(e => e.type === 'message'), [entries])

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

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
              onClick={scrollToTop}
              className="px-2 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors cursor-pointer"
              title={t('session.scrollToTop', '滚动到顶部')}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={scrollToBottom}
              className="px-2 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors cursor-pointer"
              title={t('session.scrollToBottom', '滚动到底部')}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRename}
              className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors cursor-pointer"
            >
              {t('common.rename')}
            </button>
            <button
              onClick={onExport}
              className="px-3 py-1 text-xs bg-[#2c2d3b] hover:bg-[#3c3d4b] rounded transition-colors cursor-pointer"
            >
              {t('common.export')}
            </button>
            <OpenInTerminalButton
              session={session}
              terminal={terminal}
              piPath={piPath}
              customCommand={customCommand}
              size="sm"
              variant="default"
              label={t('session.resume', '恢复')}
              showLabel={true}
              className="px-3 py-1"
              onError={(error) => console.error('[SessionViewer] Failed to open in terminal:', error)}
            />
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
          <div className="flex-1 relative min-h-0 overflow-hidden">
            {!isAtBottom && hasNewMessages && (
              <button
                onClick={() => {
                  scrollToBottom()
                  setHasNewMessages(false)
                }}
                className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-[#2c2d3b] hover:bg-[#3c3d4b] text-xs text-white px-3 py-2 shadow-lg transition-colors"
                title={t('session.scrollToBottom', '滚动到底部')}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                {t('session.newMessages', '有新消息')}
              </button>
            )}
            <div className="h-full overflow-y-auto session-viewer" ref={messagesContainerRef}>
              <SessionHeader
                sessionId={headerEntry?.id || session.id}
                timestamp={headerEntry?.timestamp}
                stats={stats}
              />
            <div className="messages">
              {renderableEntries.length > 0 ? (
                <div
                  className="relative w-full"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = renderableEntries[virtualRow.index]
                    if (!entry) return null
                    return (
                      <div
                        key={entry.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="absolute left-0 top-0 w-full"
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: virtualRow.index === renderableEntries.length - 1 ? 0 : MESSAGE_ITEM_GAP
                        }}
                      >
                        {renderEntry(entry)}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-state">{t('session.noMessages')}</div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

export default function SessionViewer(props: SessionViewerProps) {
  return (
    <SessionViewProvider>
      <SessionViewerContent {...props} />
    </SessionViewProvider>
  )
}
