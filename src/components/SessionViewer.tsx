import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import MessageDock from './MessageDock'
import SessionMessagesPanelV2 from './SessionMessagesPanelV2'
import SessionToolbar from './SessionToolbar'
import SessionTree, { type SessionTreeRef } from './SessionTree'
import SystemPromptDialog from './SystemPromptDialog'

import { SessionViewProvider, useSessionView } from '../contexts/SessionViewContext'
import { useMessageStream } from '../hooks/useMessageStream'
import { usePiRPC } from '../hooks/usePiRPC'
import { useRpcAutoStart } from '../hooks/useRpcAutoStart'
import { useRpcModelState } from '../hooks/useRpcModelState'
import { useRpcExitNotice } from '../hooks/useRpcExitNotice'
import { useRpcSessionSwitch } from '../hooks/useRpcSessionSwitch'
import { useSessionHotkeys } from '../hooks/useSessionHotkeys'
import { useSidebarLayout } from '../hooks/useSidebarLayout'
import { useSessionLoader } from '../hooks/useSessionLoader'
import { useRpcSend } from '../hooks/useRpcSend'
import { invoke } from '../transport'
import { type RPCMessage } from '../utils/rpcMessageParser'
import { computeStats } from '../utils/session'

import type { RPCBannerConfig } from './RPCBanner'
import type { SessionInfo, SessionEntry } from '../types'
import '../styles/session.css'

interface SessionViewerProps {
  session: SessionInfo
  onExport: () => void
  onRename: () => void
  onNewSession?: () => Promise<void> | void
  onEnsureSession?: (draftSession: SessionInfo) => Promise<SessionInfo | null>
  onBack?: () => void
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
}

const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 600
const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_WIDTH_KEY = 'pi-session-manager-sidebar-width'

function SessionViewerContent({
  session,
  onExport,
  onRename,
  onNewSession,
  onEnsureSession,
  terminal = 'iterm2',
  piPath,
  customCommand,
}: SessionViewerProps) {
  const { t } = useTranslation()
  const { toggleThinking, toggleToolsExpanded } = useSessionView()
  const [loading, setLoading] = useState(true)
  const [showLoading, setShowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const {
    showSidebar,
    setShowSidebar,
    sidebarWidth,
    isResizing,
    sidebarRef,
    resizeHandleRef,
    handleResizeStart,
  } = useSidebarLayout({
    minWidth: SIDEBAR_MIN_WIDTH,
    maxWidth: SIDEBAR_MAX_WIDTH,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    storageKey: SIDEBAR_WIDTH_KEY,
  })

  // RPC 模式状态
  const [useRPCMode, setUseRPCMode] = useState(false)
  const [rpcAvailable, setRpcAvailable] = useState(false)
  const {
    isConnected: rpcConnected,
    sessionFile: rpcActiveSessionFile,
    eventTick,
    drainEvents,
    isStreaming,
    streamingText,
    streamingThinking,
    startRPC,
    restartRPC,
    sendPrompt,
    sendFollowUp,
    sendSteer,
    sendAbort,
    switchSession,
    detectSupport,
  } = usePiRPC()

  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false)
  const [rpcExitHint, setRpcExitHint] = useState<string | null>(null)
  const [rpcSendError, setRpcSendError] = useState<string | null>(null)
  const [rpcSessionReady, setRpcSessionReady] = useState(false)
  const [inputWrapperHeight, setInputWrapperHeight] = useState(0)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const messageInputWrapperRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<SessionTreeRef>(null)

  const prevRpcDigestRef = useRef('')
  const lastUnreadIdRef = useRef<string | null>(null)
  const optimisticCounterRef = useRef(0)
  const treeJumpPendingRef = useRef(false)
  const { entries, setEntries, streamingEntryId } = useMessageStream({
    enabled: useRPCMode,
    rpcConnected,
    rpcSessionReady,
    isStreaming,
    streamingText,
    streamingThinking,
    sessionPath: session.path,
    sessionIsDraft: session.isDraft ?? false,
    rpcActiveSessionFile,
    drainEvents,
    eventTick,
    invokeGetMessages: (expectedSessionPath) =>
      invoke<RPCMessage[]>('get_rpc_messages', { expectedSessionPath }),
    logPrefix: 'SessionViewer',
  })

  // ── Simple scroll state (V2 handles actual scroll behavior) ──────
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const autoFollowRef = useRef(true)
  const isAtBottomRef = useRef(true)
  const pendingScrollToBottomRef = useRef(false)

  const clearUnreadState = useCallback(() => {
    setHasNewMessages(false)
    setNewMessageCount(0)
  }, [])

  const markUnreadMessage = useCallback(() => {
    setHasNewMessages(true)
    setNewMessageCount((prev) => Math.min(prev + 1, 99))
  }, [])

  const scrollToTop = useCallback(() => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    autoFollowRef.current = true
    el.scrollTop = el.scrollHeight - el.clientHeight
  }, [])

  const forceFollowToBottom = useCallback(() => {
    autoFollowRef.current = true
    isAtBottomRef.current = true
    setIsAtBottom(true)
    pendingScrollToBottomRef.current = true
  }, [])

  const resetMeasurements = useCallback(() => { /* noop for V2 */ }, [])

  // ── Simple renderableEntries / digest for RPC tracking ──────────
  const renderableEntries = useMemo(
    () => entries.filter(e => e.type === 'message' || e.type === 'model_change' || e.type === 'compaction' || e.type === 'branch_summary' || e.type === 'custom_message'),
    [entries]
  )

  const renderableDigest = useMemo(() => {
    const last3 = renderableEntries.slice(-3)
    return `${renderableEntries.length}:${last3.map(e => e.id).join(',')}`
  }, [renderableEntries])

  const appendOptimisticMessage = useCallback(
    (message: string) => {
      if (!message.trim()) return
      const id = `local-user-${Date.now()}-${optimisticCounterRef.current++}`
      const entry: SessionEntry = {
        type: 'message',
        id,
        timestamp: new Date().toISOString(),
        message: {
          role: 'user',
          content: [{ type: 'text', text: message }],
        },
      }
      setEntries(prev => [...prev, entry])
      setActiveEntryId(id)
      pendingScrollToBottomRef.current = true
      clearUnreadState()
    },
    [setEntries, setActiveEntryId, pendingScrollToBottomRef, clearUnreadState]
  )

  useSessionLoader({
    session,
    useRPCMode,
    rpcConnected,
    loading,
    setLoading,
    setShowLoading,
    setError,
    messagesContainerRef,
    setEntries,
    setActiveEntryId,
    clearUnreadState,
    markUnreadMessage,
    pendingScrollToBottomRef,
    autoFollowRef,
    isAtBottomRef,
    lastUnreadIdRef,
    resetMeasurements,
    loadErrorText: t('session.loadError'),
    logPrefix: 'SessionViewer',
  })

  const {
    models: rpcModels,
    currentModel: rpcCurrentModel,
    thinkingLevel: rpcThinkingLevel,
    commands: rpcCommands,
    contextLabel: rpcContextLabel,
    contextHint: rpcContextHint,
    loading: rpcModelLoading,
    error: rpcModelError,
    refresh: refreshRpcModelState,
    selectModel: handleSelectModel,
    selectThinkingLevel: handleSelectThinkingLevel,
    clearError: clearRpcModelError,
  } = useRpcModelState({
    enabled: useRPCMode,
    rpcConnected,
    rpcSessionReady,
    restartRPC,
    piPath,
  })

  useRpcAutoStart({
    piPath,
    startRPC,
    detectSupport,
    setRpcAvailable,
    setUseRPCMode,
  })

  useRpcSessionSwitch({
    enabled: useRPCMode,
    rpcConnected,
    sessionPath: session.path,
    sessionIsDraft: session.isDraft ?? false,
    rpcSessionReady,
    rpcActiveSessionFile,
    switchSession,
    restartRPC,
    piPath,
    setRpcSessionReady,
    onSwitchSuccess: () => setRpcSendError(null),
  })

  useEffect(() => {
    prevRpcDigestRef.current = ''
    setRpcSendError(null)
  }, [session.path, useRPCMode])

  useEffect(() => {
    const node = messageInputWrapperRef.current
    if (!node || !(useRPCMode && rpcConnected)) {
      setInputWrapperHeight(0)
      return
    }

    const updateHeight = () => {
      setInputWrapperHeight(node.offsetHeight)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [useRPCMode, rpcConnected])

  useRpcExitNotice(useRPCMode, setRpcExitHint)

  useSessionHotkeys({
    onToggleThinking: toggleThinking,
    onToggleTools: toggleToolsExpanded,
    onFocusSearch: () => {
      setShowSidebar(true)
      setTimeout(() => {
        treeRef.current?.focusSearch()
      }, 100)
    },
  })

  useEffect(() => {
    if (activeEntryId && messagesContainerRef.current) {
      if (useRPCMode && !treeJumpPendingRef.current) {
        return
      }
      treeJumpPendingRef.current = false

      const tryHighlight = () => {
        const element = document.getElementById(`entry-${activeEntryId}`)
        if (!element) return false
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
  }, [activeEntryId, useRPCMode])

  // RPC 模式：根据消息变化更新焦点与未读状态
  useEffect(() => {
    if (!(useRPCMode && rpcConnected) || session.isDraft) {
      prevRpcDigestRef.current = renderableDigest
      return
    }
    if (renderableDigest === prevRpcDigestRef.current) return
    prevRpcDigestRef.current = renderableDigest

    const lastMessage = [...renderableEntries]
      .reverse()
      .find(entry => entry.type === 'message' && (entry.message?.role === 'user' || entry.message?.role === 'assistant'))

    if (lastMessage?.id) {
      setActiveEntryId(lastMessage.id)
    }

    if (autoFollowRef.current || isAtBottomRef.current) {
      pendingScrollToBottomRef.current = true
      clearUnreadState()
    } else if (lastMessage?.id && lastMessage.id !== lastUnreadIdRef.current) {
      lastUnreadIdRef.current = lastMessage.id
      markUnreadMessage()
    }
  }, [
    renderableDigest,
    renderableEntries,
    useRPCMode,
    rpcConnected,
    session.isDraft,
    clearUnreadState,
    markUnreadMessage,
  ])

  // sidebar resize handled by useSidebarLayout

  const { sendPromptMessage, sendFollowUpMessage, sendSteerMessage } = useRpcSend({
    session,
    onEnsureSession,
    rpcSessionReady,
    rpcActiveSessionFile,
    switchSession,
    setRpcSessionReady,
    sendPrompt,
    sendFollowUp,
    sendSteer,
    forceFollowToBottom,
    scrollToBottom,
    appendOptimisticMessage,
  })

  const handleSendPrompt = useCallback(async (message: string) => {
    try {
      setRpcSendError(null)
      await sendPromptMessage(message)
    } catch (err) {
      setRpcSendError(err instanceof Error ? err.message : 'Failed to send message')
      throw err
    }
  }, [sendPromptMessage])

  const handleSendFollowUp = useCallback(async (message: string) => {
    try {
      setRpcSendError(null)
      await sendFollowUpMessage(message)
    } catch (err) {
      setRpcSendError(err instanceof Error ? err.message : 'Failed to send message')
      throw err
    }
  }, [sendFollowUpMessage])

  const handleSendSteer = useCallback(async (message: string) => {
    try {
      setRpcSendError(null)
      await sendSteerMessage(message)
    } catch (err) {
      setRpcSendError(err instanceof Error ? err.message : 'Failed to send message')
      throw err
    }
  }, [sendSteerMessage])

  const handleFileQuery = useCallback(async (query: string) => {
    if (!session?.cwd) return []
    try {
      const results = await invoke<string[]>('get_file_completions', {
        cwd: session.cwd,
        query,
        limit: 8,
      })
      return results
    } catch (err) {
      console.error('[SessionViewer] Failed to load file completions:', err)
      return []
    }
  }, [session?.cwd])

  const rpcInputDisabledReason = useMemo(() => {
    if (!useRPCMode) return null
    if (!rpcConnected) return 'RPC 未连接，暂时无法发送消息'
    if (!rpcSessionReady) return 'RPC 正在切换到当前会话，请稍候'
    return null
  }, [useRPCMode, rpcConnected, rpcSessionReady])

  const rpcBanner = useMemo<RPCBannerConfig | null>(() => {
    if (!useRPCMode) return null

    if (!rpcConnected || rpcExitHint) {
      return {
        kind: 'error',
        message: rpcExitHint || 'RPC 未连接',
        actionLabel: '重新连接',
        onAction: () => {
          setRpcExitHint(null)
          void restartRPC(piPath)
        },
      }
    }

    if (!rpcSessionReady) {
      return {
        kind: 'warning',
        message: 'RPC 正在切换到当前会话，请稍候…',
      }
    }

    if (rpcSendError || rpcModelError) {
      return {
        kind: 'warning',
        message: rpcSendError || rpcModelError || 'RPC 状态异常',
        actionLabel: '关闭',
        onAction: () => {
          setRpcSendError(null)
          clearRpcModelError()
        },
      }
    }

    if (rpcCommands.length === 0) {
      return {
        kind: 'info',
        message: 'RPC 已连接，但命令列表尚未加载',
        actionLabel: '重新加载',
        onAction: () => {
          void refreshRpcModelState()
        },
      }
    }

    return null
  }, [
    useRPCMode,
    rpcConnected,
    rpcExitHint,
    rpcSessionReady,
    rpcSendError,
    rpcModelError,
    rpcCommands.length,
    restartRPC,
    piPath,
    refreshRpcModelState,
    clearRpcModelError,
  ])

  const newMessagesButtonBottom = useMemo(() => {
    if (!(useRPCMode && rpcConnected)) {
      return 16
    }
    const minOffset = 96
    return Math.max(minOffset, inputWrapperHeight + 12)
  }, [useRPCMode, rpcConnected, inputWrapperHeight])


  const stats = useMemo(() => computeStats(entries), [entries])
  const headerEntry = useMemo(() => entries.find(e => e.type === 'session'), [entries])

  const messageEntries = useMemo(() => entries.filter(e => e.type === 'message'), [entries])

  const handleTreeNodeClick = useCallback((_leafId: string, targetId: string) => {
    treeJumpPendingRef.current = true
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
              ref={treeRef}
              entries={entries}
              activeLeafId={activeEntryId ?? undefined}
              onNodeClick={handleTreeNodeClick}
            />
          </aside>
          
          {/* 拖拽手柄 */}
          <div
            ref={resizeHandleRef}
            className={`sidebar-resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleResizeStart}
          >
            <div className="sidebar-resize-handle-inner" />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <SessionToolbar
          session={session}
          messageCount={messageEntries.length}
          showSidebar={showSidebar}
          useRPCMode={useRPCMode}
          rpcConnected={rpcConnected}
          rpcAvailable={rpcAvailable}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onToggleRPC={() => setUseRPCMode(!useRPCMode)}
          onNewSession={() => void onNewSession?.()}
          onShowSystemPrompt={() => setShowSystemPromptDialog(true)}
          onScrollTop={scrollToTop}
          onScrollBottom={() => scrollToBottom()}
          onRename={onRename}
          onExport={onExport}
          terminal={terminal}
          piPath={piPath}
          customCommand={customCommand}
        />

        <SessionMessagesPanelV2
          showLoading={showLoading}
          error={error}
          rpcBanner={rpcBanner}
          headerEntry={headerEntry}
          sessionId={session.id}
          stats={stats}
          entries={entries}
          messagesContainerRef={messagesContainerRef}
          bottomSentinelRef={bottomSentinelRef}
          isStreaming={isStreaming}
          streamingEntryId={streamingEntryId}
          isAtBottom={isAtBottom}
          hasNewMessages={hasNewMessages}
          newMessageCount={newMessageCount}
          newMessagesButtonBottom={newMessagesButtonBottom}
          onUnreadClick={() => {
            autoFollowRef.current = true
            scrollToBottom()
            clearUnreadState()
          }}
          emptyState={
            <div className="empty-state">
              <p>{t('session.noMessages', '暂无消息')}</p>
              <p className="empty-state-hint">
                {useRPCMode && rpcConnected
                  ? t('session.emptyHintRpc', '在底部输入框发送第一条消息，开始实时会话。')
                  : t('session.emptyHintFile', '当前会话还没有可显示的对话内容。')}
              </p>
            </div>
          }
          loadingLabel={t('session.loading')}
          errorLabel={t('session.error')}
          newMessagesLabel={t('session.newMessages', '有新消息')}
          autoFollowRef={autoFollowRef}
          isAtBottomRef={isAtBottomRef}
          pendingScrollToBottomRef={pendingScrollToBottomRef}
          setIsAtBottom={setIsAtBottom}
          clearUnreadState={clearUnreadState}
        />
        {useRPCMode && rpcConnected && (
          <MessageDock
            ref={messageInputWrapperRef}
            sessionKey={session.path}
            enabled={rpcConnected && rpcSessionReady}
            isStreaming={isStreaming}
            disabledReason={rpcInputDisabledReason}
            commands={rpcCommands}
            models={rpcModels}
            currentModel={rpcCurrentModel}
            modelLoading={rpcModelLoading}
            modelError={rpcModelError}
            thinkingLevel={rpcThinkingLevel}
            onSelectModel={handleSelectModel}
            onSelectThinkingLevel={handleSelectThinkingLevel}
            onSendPrompt={handleSendPrompt}
            onSendFollowUp={handleSendFollowUp}
            onSendSteer={handleSendSteer}
            onAbort={sendAbort}
            onFileQuery={handleFileQuery}
            contextLabel={rpcContextLabel}
            contextHint={rpcContextHint}
          />
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
