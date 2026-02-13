import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { invoke, listen } from '../transport'
import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, Loader2, Bot, Search } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo, SessionEntry, SessionsDiff } from '../types'
import { parseSessionEntries, computeStats } from '../utils/session'
import SessionHeader from './SessionHeader'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import ModelChange from './ModelChange'
import Compaction from './Compaction'
import BranchSummary from './BranchSummary'
import CustomMessage from './CustomMessage'
import SessionTree, { type SessionTreeRef } from './SessionTree'
import OpenInTerminalButton from './OpenInTerminalButton'
import SystemPromptDialog from './SystemPromptDialog'
import type { TerminalType } from './settings/types'
import { getPlatformDefaults } from './settings/types'
import { SessionViewProvider, useSessionView } from '../contexts/SessionViewContext'
import { useIsMobile } from '../hooks/useIsMobile'
import '../styles/session.css'

// Session content cache — avoids re-reading file when switching back
const SESSION_CONTENT_CACHE = new Map<string, {
  modified: string
  entries: SessionEntry[]
  lineCount: number
}>()
const MAX_CACHE_SIZE = 5

function cacheSessionContent(path: string, modified: string, entries: SessionEntry[], lineCount: number) {
  if (SESSION_CONTENT_CACHE.size >= MAX_CACHE_SIZE) {
    // Evict oldest
    const firstKey = SESSION_CONTENT_CACHE.keys().next().value
    if (firstKey) SESSION_CONTENT_CACHE.delete(firstKey)
  }
  SESSION_CONTENT_CACHE.set(path, { modified, entries, lineCount })
}

interface SessionViewerProps {
  session: SessionInfo
  onExport: () => void
  onRename: () => void
  onBack?: () => void
  onWebResume?: () => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
}

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_WIDTH_KEY = 'pi-session-manager-sidebar-width'
const MESSAGE_ITEM_GAP = 16

function SessionViewerContent({ session, onExport, onRename, onBack, onWebResume, terminal = getPlatformDefaults().defaultTerminal, piPath, customCommand }: SessionViewerProps) {
  const { t } = useTranslation()
  const { toggleThinking, toggleToolsExpanded } = useSessionView()
  const isMobile = useIsMobile()
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoading, setShowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null)
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

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const treeRef = useRef<SessionTreeRef>(null)

  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingScrollToBottomRef = useRef(false)
  const prevEntriesLengthRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    // 清除之前的 loading timer
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }

    lastModifiedTimeRef.current = 0
    setLineCount(0)
    setEntries([])
    setActiveEntryId(null)
    setScrollTargetId(null)
    setHasNewMessages(false)
    prevEntriesLengthRef.current = 0
    pendingScrollToBottomRef.current = false

    const doLoad = async () => {
      console.log('[SessionViewer] loadSession called, path:', session.path)
      try {
        setLoading(true)
        setShowLoading(false)
        setError(null)
        measuredHeightsRef.current.clear()

        // Check cache first — skip file read if session hasn't changed
        const cached = SESSION_CONTENT_CACHE.get(session.path)
        if (cached && cached.modified === session.modified) {
          console.log('[SessionViewer] Using cached content, entries:', cached.entries.length)
          setEntries(cached.entries)
          setLineCount(cached.lineCount)
          const lastMessage = cached.entries.filter(e => e.type === 'message').pop()
          if (lastMessage) setActiveEntryId(lastMessage.id)
          pendingScrollToBottomRef.current = true
          return
        }

        loadingTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            console.log('[SessionViewer] Setting showLoading to true after 300ms')
            setShowLoading(true)
          }
        }, 300)

        const jsonlContent = await invoke<string>('read_session_file', { path: session.path })

        const lines = jsonlContent.split('\n').filter(line => line.trim()).length
        const parsedEntries = parseSessionEntries(jsonlContent)

        // Always cache, even if cancelled — so StrictMode's second mount hits cache
        cacheSessionContent(session.path, session.modified, parsedEntries, lines)

        if (cancelled) return

        setLineCount(lines)
        setEntries(parsedEntries)

        const lastMessage = parsedEntries.filter(e => e.type === 'message').pop()
        if (lastMessage) {
          setActiveEntryId(lastMessage.id)
        }

        // 首次加载后滚动到底部
        pendingScrollToBottomRef.current = true
      } catch (err) {
        if (!cancelled) {
          console.error('[SessionViewer] Failed to load session:', err)
          setError(err instanceof Error ? err.message : t('session.loadError'))
        }
      } finally {
        if (!cancelled) {
          console.log('[SessionViewer] loadSession finally block, clearing loading states')
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current)
            loadingTimerRef.current = null
          }
          setLoading(false)
          setShowLoading(false)
        }
      }
    }

    doLoad()

    return () => {
      cancelled = true
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
    }
  }, [session.path, session.modified, t])

  // Incremental update: listen for diff events, load new lines if this session was updated
  useEffect(() => {
    if (!session.path || loading) return

    let unlisten: (() => void) | null = null

    const setup = async () => {
      unlisten = await listen<SessionsDiff>('sessions-changed', (event) => {
        const diff = event.payload
        if (!diff?.updated?.length) return
        const hit = diff.updated.some(s => s.path === session.path)
        if (hit) {
          loadIncremental()
        }
      })
    }

    setup()

    return () => {
      if (unlisten) unlisten()
    }
  }, [session.path, loading])

  

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
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setShowSidebar(prev => {
          const newState = !prev
          if (newState) {
            setTimeout(() => {
              treeRef.current?.focusSearch()
            }, 100)
          }
          return newState
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleThinking, toggleToolsExpanded, setShowSidebar])

  // Compute the path from root to activeEntryId (conversation branch)
  const pathEntryIds = useMemo(() => {
    if (!activeEntryId || entries.length === 0) return null

    const byId = new Map<string, SessionEntry>()
    for (const entry of entries) {
      byId.set(entry.id, entry)
    }

    const ids = new Set<string>()
    let current = byId.get(activeEntryId)
    while (current) {
      ids.add(current.id)
      if (!current.parentId || current.parentId === current.id) break
      current = byId.get(current.parentId)
    }
    return ids
  }, [entries, activeEntryId])

  const renderableEntries = useMemo(() => {
    return entries.filter(entry => {
      // If we have a path, only show entries on that path
      if (pathEntryIds && !pathEntryIds.has(entry.id)) return false

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
  }, [entries, pathEntryIds])

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
  const scrollToBottom = useCallback((smooth = false) => {
    const container = messagesContainerRef.current
    if (!container) return
    // 直接滚动到容器最大滚动位置，比 scrollToIndex 更可靠
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant'
    })
  }, [])

  useEffect(() => {
    if (scrollTargetId && messagesContainerRef.current) {
      const targetIndex = entryIndexById.get(scrollTargetId)
      if (targetIndex === undefined) return

      rowVirtualizer.scrollToIndex(targetIndex, { align: 'center' })

      const tryHighlight = () => {
        const element = document.getElementById(`entry-${scrollTargetId}`)
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

      // Clear scrollTargetId after handling
      setScrollTargetId(null)
    }
  }, [scrollTargetId, entryIndexById, rowVirtualizer])

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

  // 监听新消息，延迟执行自动滚动
  useEffect(() => {
    if (loading || showLoading || error) return

    const currentLength = renderableEntries.length
    if (currentLength > prevEntriesLengthRef.current && pendingScrollToBottomRef.current) {
      // 延迟滚动，确保虚拟滚动已测量新元素
      const timeoutId = setTimeout(() => {
        scrollToBottom()
        pendingScrollToBottomRef.current = false
      }, 50)
      return () => clearTimeout(timeoutId)
    }
    prevEntriesLengthRef.current = currentLength
  }, [renderableEntries.length, scrollToBottom, loading, showLoading, error])

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

  // 增量加载新内容
  const lineCountRef = useRef(lineCount)
  lineCountRef.current = lineCount

  const loadIncremental = useCallback(async () => {
    try {
      const result = await invoke<[number, string]>('read_session_file_incremental', {
        path: session.path,
        fromLine: lineCountRef.current
      })

      const [newLineCount, newContent] = result

      if (newContent.trim()) {
        // 解析新增的 entries
        const newEntries = parseSessionEntries(newContent)

        if (newEntries.length > 0) {
          // 追加到现有列表
          setEntries(prev => {
            const merged = [...prev, ...newEntries]
            // Update cache with merged entries
            cacheSessionContent(session.path, session.modified, merged, newLineCount)
            return merged
          })

          // 更新行数
          setLineCount(newLineCount)

          // 更新活动条目
          const lastMessage = newEntries.filter(e => e.type === 'message').pop()
          if (lastMessage) {
            setActiveEntryId(lastMessage.id)
          }

          // 自动滚动到底部
          if (isAtBottomRef.current && messagesContainerRef.current) {
            pendingScrollToBottomRef.current = true
          } else {
            setHasNewMessages(true)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load incremental session:', err)
    }
  }, [session.path, session.modified])

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
  }, [entries])

  const messageEntries = useMemo(() => entries.filter(e => e.type === 'message'), [entries])

  const handleTreeNodeClick = useCallback((leafId: string, targetId: string) => {
    setActiveEntryId(leafId)
    setScrollTargetId(targetId)
  }, [])

  return (
    <div className="h-full flex relative">
      {showSidebar && (
        <>
          <aside 
            ref={sidebarRef}
            className="session-sidebar absolute left-0 top-0 bottom-0 z-20 shadow-xl" 
            style={{ width: isMobile ? '100vw' : `${sidebarWidth}px` }}
          >
            {isMobile && (
              <button
                onClick={() => setShowSidebar(false)}
                className="absolute top-2 right-2 z-30 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
                title={t('session.hideSidebar')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <SessionTree
              ref={treeRef}
              entries={entries}
              activeLeafId={activeEntryId ?? undefined}
              onNodeClick={handleTreeNodeClick}
            />
          </aside>
          
          {/* 拖拽手柄 - 跟随侧边栏, 移动端禁用 */}
          {!isMobile && (
            <div
              ref={resizeHandleRef}
              className={`sidebar-resize-handle absolute z-30 ${isResizing ? 'resizing' : ''}`}
              style={{ left: `${sidebarWidth}px` }}
              onMouseDown={handleMouseDown}
            >
              <div className="sidebar-resize-handle-inner" />
            </div>
          )}
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 transition-all duration-200" style={{ paddingLeft: showSidebar && !isMobile ? `${sidebarWidth}px` : 0 }}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
          <div className="flex items-center gap-1.5 min-w-0">
            {isMobile && onBack && (
              <button
                onClick={onBack}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {!isMobile && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors flex-shrink-0"
                title={showSidebar ? t('session.hideSidebar') : t('session.showSidebar')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <span className="text-sm font-medium truncate">{session.name || t('session.title')}</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {messageEntries.length} {t('session.messages')}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isMobile && (
              <button
                onClick={() => {
                  setShowSidebar(!showSidebar)
                  if (!showSidebar) {
                    setTimeout(() => treeRef.current?.focusSearch(), 100)
                  }
                }}
                className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                title={t('session.showSidebar')}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowSystemPromptDialog(true)}
              className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
              title={t('session.systemPromptAndTools', '系统提示词和工具')}
            >
              <Bot className="h-3.5 w-3.5" />
            </button>
            {isMobile && (
              <>
                <button
                  onClick={() => scrollToBottom()}
                  className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                  title={t('session.scrollToBottom', '滚动到底部')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onRename}
                  className="px-2 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                >
                  {t('common.rename')}
                </button>
                <button
                  onClick={onExport}
                  className="px-2 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                >
                  {t('common.export')}
                </button>
              </>
            )}
            {!isMobile && (
              <>
                <button
                  onClick={scrollToTop}
                  className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                  title={t('session.scrollToTop', '滚动到顶部')}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => scrollToBottom()}
                  className="p-1.5 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                  title={t('session.scrollToBottom', '滚动到底部')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onRename}
                  className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                >
                  {t('common.rename')}
                </button>
                <button
                  onClick={onExport}
                  className="px-2.5 py-1 text-xs bg-secondary hover:bg-secondary-hover rounded transition-colors"
                >
                  {t('common.export')}
                </button>
                <OpenInTerminalButton
                  session={session}
                  terminal={terminal}
                  piPath={piPath}
                  customCommand={customCommand}
                  size="sm"
                  variant="ghost"
                  label={t('session.resume', '恢复')}
                  showLabel={true}
                  className="px-3 py-1"
                  onWebResume={onWebResume}
                  onError={(error) => console.error('[SessionViewer] Failed to open in terminal:', error)}
                />
              </>
            )}
          </div>
        </div>

        {showLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('session.loading')}</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-400">
            <div className="text-center">
              <p className="mb-2">{t('session.error')}</p>
              <p className="text-sm text-muted-foreground">{error}</p>
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
                className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-secondary hover:bg-secondary-hover text-xs text-foreground px-3 py-2 shadow-lg transition-colors"
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
      <SystemPromptDialog
        isOpen={showSystemPromptDialog}
        onClose={() => setShowSystemPromptDialog(false)}
        entries={entries}
      />
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
