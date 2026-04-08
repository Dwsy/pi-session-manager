/**
 * Pi Live Chat Input - Send steer messages to live Pi session
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Loader2, Zap } from 'lucide-react'
import { usePiLive } from '@/hooks/usePiLive'

interface PiLiveChatInputProps {
  sessionId: string
  isLive?: boolean
  onSent?: () => void
}

export default function PiLiveChatInput({ sessionId, isLive: isLiveProp, onSent }: PiLiveChatInputProps) {
  const { sessions, prompt, steer, followUp, isEnabled } = usePiLive()
  const isActive = isEnabled && (isLiveProp ?? true)
  const [input, setInput] = useState('')
  const [steering, setSteering] = useState(false)
  const [mode, setMode] = useState<'steer' | 'follow_up'>('steer')
  const inputRef = useRef<HTMLInputElement>(null)
  const liveSession = sessions.find((session) =>
    session.sessionId === sessionId
    || session.sessionId.includes(sessionId)
    || sessionId.includes(session.sessionId),
  )
  const isStreaming = liveSession?.isStreaming ?? false

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    if (!isStreaming) {
      setMode('steer')
    }
  }, [isStreaming])

  const handleSend = useCallback(async () => {
    if (!input.trim() || steering) return
    try {
      setSteering(true)
      if (!isStreaming) {
        await prompt(sessionId, input.trim())
      } else if (mode === 'follow_up') {
        await followUp(sessionId, input.trim())
      } else {
        await steer(sessionId, input.trim())
      }
      setInput('')
      onSent?.()
    } catch (e) {
      console.error('[PiLiveChatInput] send failed:', e)
    } finally {
      setSteering(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [followUp, input, isStreaming, mode, onSent, prompt, sessionId, steer, steering])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!isActive) return null

  return (
    <div className="border-t border-border/50 bg-surface/60 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-green-500 animate-pulse flex-shrink-0" />
        {isStreaming && (
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setMode('steer')}
              className={`px-2 py-1 text-[11px] rounded-md transition-colors ${mode === 'steer' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Steer
            </button>
            <button
              type="button"
              onClick={() => setMode('follow_up')}
              className={`px-2 py-1 text-[11px] rounded-md transition-colors ${mode === 'follow_up' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Follow-up
            </button>
          </div>
        )}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? (mode === 'follow_up' ? 'Queue a follow-up…' : 'Send a steer message…') : 'Send a prompt…'}
            className="w-full bg-muted/40 border border-border/60 rounded-lg pl-3 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || steering}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors disabled:opacity-30 text-primary hover:text-primary/80"
          >
            {steering
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
