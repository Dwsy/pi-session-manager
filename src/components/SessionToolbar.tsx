import { useTranslation } from 'react-i18next'
import { ArrowUp, ArrowDown, Bot, Zap, ZapOff, Plus } from 'lucide-react'
import OpenInTerminalButton from './OpenInTerminalButton'
import type { SessionInfo } from '../types'

interface SessionToolbarProps {
  session: SessionInfo
  messageCount: number
  showSidebar: boolean
  useRPCMode: boolean
  rpcConnected: boolean
  rpcAvailable: boolean
  onToggleSidebar: () => void
  onToggleRPC: () => void
  onNewSession?: () => void
  onShowSystemPrompt: () => void
  onScrollTop: () => void
  onScrollBottom: () => void
  onRename: () => void
  onExport: () => void
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
}

export default function SessionToolbar({
  session,
  messageCount,
  showSidebar,
  useRPCMode,
  rpcConnected,
  rpcAvailable,
  onToggleSidebar,
  onToggleRPC,
  onNewSession,
  onShowSystemPrompt,
  onScrollTop,
  onScrollBottom,
  onRename,
  onExport,
  terminal = 'iterm2',
  piPath,
  customCommand,
}: SessionToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="session-toolbar px-4 py-2 border-b border-[#2c2d3b]">
      <div className="session-toolbar-left">
        <button
          onClick={onToggleSidebar}
          className="session-action-button icon text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] self-center"
          title={showSidebar ? t('session.hideSidebar') : t('session.showSidebar')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-medium truncate">{session.name || t('session.title')}</span>
        <span className="text-xs text-[#6a6f85] flex-shrink-0">
          {messageCount} {t('session.messages')}
        </span>
        {useRPCMode ? (
          <span className={`rpc-mode-indicator ${rpcConnected ? 'active' : 'inactive'}`}>
            RPC
          </span>
        ) : (
          <span className="rpc-mode-indicator inactive">文件</span>
        )}
      </div>
      <div className="session-toolbar-actions">
        <div className="session-action-group">
          {rpcAvailable && (
            <button
              onClick={onToggleRPC}
              className={`session-action-button icon ${
                useRPCMode && rpcConnected
                  ? 'text-green-400 bg-[#2c2d3b]'
                  : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
              }`}
              title={useRPCMode && rpcConnected ? 'RPC 实时模式已连接' : '点击启用 RPC 实时模式'}
            >
              {useRPCMode && rpcConnected ? (
                <Zap className="h-3.5 w-3.5" />
              ) : (
                <ZapOff className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        <div className="session-action-group">
          <button
            onClick={() => onNewSession?.()}
            className="session-action-button icon"
            title={t('session.newSession', '新会话')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onShowSystemPrompt}
            className="session-action-button icon"
            title={t('session.systemPromptAndTools', '系统提示词和工具')}
          >
            <Bot className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="session-action-group">
          <button
            onClick={onScrollTop}
            className="session-action-button icon"
            title={t('session.scrollToTop', '滚动到顶部')}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onScrollBottom}
            className="session-action-button icon"
            title={t('session.scrollToBottom', '滚动到底部')}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="session-action-group">
          <button onClick={onRename} className="session-action-button text">
            {t('common.rename')}
          </button>
          <button onClick={onExport} className="session-action-button text">
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
            className="session-action-button text"
            onError={(error) => console.error('[SessionViewer] Failed to open in terminal:', error)}
          />
        </div>
      </div>
    </div>
  )
}
