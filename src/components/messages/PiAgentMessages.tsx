/**
 * Pi Agent Messages View — renders real-time live session messages.
 */

import React, { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, User, Sparkles } from 'lucide-react'

export interface LiveMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'toolResult'
  content: string
  timestamp: number
  isStreaming?: boolean
}

interface PiAgentMessagesProps {
  messages: LiveMessage[]
  className?: string
  onClear?: () => void
}

export const PiAgentMessages: React.FC<PiAgentMessagesProps> = ({
  messages,
  className = '',
  onClear,
}) => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-muted-foreground ${className}`}>
        <Bot className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">{t('piAgent.noMessages', 'Waiting for messages...')}</p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-sm">
            {t('piAgent.liveSession', 'Live Session')}
          </span>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('piAgent.clear', 'Clear')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user'
          const isLast = index === messages.length - 1
          return (
            <div key={msg.id || index} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isUser ? 'bg-primary/10' : 'bg-amber-500/10'
              }`}>
                {isUser
                  ? <User className="w-4 h-4 text-primary" />
                  : <Bot className="w-4 h-4 text-amber-500" />
                }
              </div>

              {/* Content */}
              <div className={`flex-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`rounded-lg px-4 py-2.5 ${
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  <div className="text-sm whitespace-pre-wrap">
                    {msg.content}
                    {msg.isStreaming && isLast && !isUser && (
                      <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
