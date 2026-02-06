import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Send, StopCircle } from 'lucide-react'

interface MessageInputProps {
  sessionKey?: string
  disabled?: boolean
  isStreaming?: boolean
  disabledReason?: string | null
  placeholder?: string
  onSend: (message: string) => Promise<void>
  onFollowUp?: (message: string) => Promise<void>
  onSteer?: (message: string) => Promise<void>
  onAbort?: () => Promise<void>
  commands?: string[]
  onFileQuery?: (query: string) => Promise<string[]>
  contextControls?: ReactNode
  contextLabel?: string
  contextHint?: string
}

export default function MessageInput({
  sessionKey,
  disabled = false,
  isStreaming = false,
  disabledReason = null,
  placeholder = '输入消息...',
  onSend,
  onFollowUp,
  onSteer,
  onAbort,
  commands = [],
  onFileQuery,
  contextControls,
  contextLabel = '上下文',
  contextHint = '上下文窗口数据未就绪',
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const draftBySessionRef = useRef<Map<string, string>>(new Map())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commandListRef = useRef<HTMLDivElement>(null)
  const fileListRef = useRef<HTMLDivElement>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [fileCompletions, setFileCompletions] = useState<string[]>([])
  const [showFiles, setShowFiles] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)

  useEffect(() => {
    if (!sessionKey) return
    const draft = draftBySessionRef.current.get(sessionKey) ?? ''
    setValue(draft)
    setShowCommands(false)
    setShowFiles(false)
    setSelectedCommandIndex(0)
    setSelectedFileIndex(0)
  }, [sessionKey])

  useEffect(() => {
    if (!sessionKey) return
    const next = value.trim()
    if (!next) {
      draftBySessionRef.current.delete(sessionKey)
      return
    }
    draftBySessionRef.current.set(sessionKey, value)
  }, [sessionKey, value])

  const filteredCommands = useMemo(() => {
    if (!value.startsWith('/')) return []
    const keyword = value.slice(1).toLowerCase()
    return commands.filter(cmd => cmd.toLowerCase().includes(keyword))
  }, [commands, value])

  const highlightCommand = (command: string) => {
    if (!value.startsWith('/')) return command
    const keyword = value.slice(1).toLowerCase()
    if (!keyword) return command
    const index = command.toLowerCase().indexOf(keyword)
    if (index === -1) return command
    const before = command.slice(0, index)
    const match = command.slice(index, index + keyword.length)
    const after = command.slice(index + keyword.length)
    return (
      <>
        {before}
        <span className="command-highlight">{match}</span>
        {after}
      </>
    )
  }

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [value])

  useEffect(() => {
    setShowCommands(value.startsWith('/') && filteredCommands.length > 0)
    if (!value.startsWith('/')) {
      setSelectedCommandIndex(0)
    }
  }, [value, filteredCommands])

  useEffect(() => {
    if (!showCommands) return
    const activeItem = commandListRef.current?.querySelector<HTMLButtonElement>(
      '.message-input-command-item.active'
    )
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [showCommands, selectedCommandIndex])

  useEffect(() => {
    if (!onFileQuery) return
    const atIndex = value.lastIndexOf('@')
    const shouldShow = atIndex >= 0 && (atIndex === 0 || /\s/.test(value[atIndex - 1]))
    if (!shouldShow) {
      setShowFiles(false)
      setFileCompletions([])
      return
    }
    const after = value.slice(atIndex + 1)
    if (after.length === 0 || /\s/.test(after)) {
      setShowFiles(false)
      setFileCompletions([])
      return
    }

    const handle = setTimeout(async () => {
      try {
        const results = await onFileQuery(after)
        setFileCompletions(results)
        setShowFiles(results.length > 0)
        setSelectedFileIndex(0)
      } catch {
        setShowFiles(false)
      }
    }, 150)

    return () => clearTimeout(handle)
  }, [value, onFileQuery])

  useEffect(() => {
    if (!showFiles) return
    const activeItem = fileListRef.current?.querySelector<HTMLButtonElement>(
      '.message-input-file-item.active'
    )
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [showFiles, selectedFileIndex])

  const applyFileCompletion = (filePath: string) => {
    const atIndex = value.lastIndexOf('@')
    if (atIndex < 0) return
    const prefix = value.slice(0, atIndex + 1)
    const suffix = value.slice(atIndex + 1)
    const remainder = suffix.replace(/^\S*/, filePath)
    setValue(prefix + remainder + ' ')
  }

  const trimmed = useMemo(() => value.trim(), [value])
  const contextMentionCount = useMemo(() => {
    const matches = value.match(/(^|\s)@\S+/g)
    return matches ? matches.length : 0
  }, [value])
  const contextTooltip = useMemo(() => {
    if (contextMentionCount > 0) {
      return `${contextHint} · 已附加 ${contextMentionCount} 个 @上下文`
    }
    return contextHint
  }, [contextHint, contextMentionCount])
  const canSend = trimmed.length > 0 && !disabled && !isStreaming && !isSending
  const canAbort = Boolean(isStreaming && onAbort)

  const statusText = useMemo(() => {
    if (disabled && disabledReason) return disabledReason
    if (isSending) return '消息发送中...'
    if (isStreaming) return '正在响应，可中断'
    return ''
  }, [disabled, disabledReason, isSending, isStreaming])

  const statusTone = useMemo(() => {
    if (disabled && disabledReason) return 'warning'
    if (isSending || isStreaming) return 'active'
    return ''
  }, [disabled, disabledReason, isSending, isStreaming])
  const handleSend = async (sendMode: 'prompt' | 'follow_up' | 'steer' = 'prompt') => {
    if (!canSend) return
    setIsSending(true)
    try {
      if (sendMode === 'follow_up' && onFollowUp) {
        await onFollowUp(trimmed)
      } else if (sendMode === 'steer' && onSteer) {
        await onSteer(trimmed)
      } else {
        await onSend(trimmed)
      }
      setValue('')
    } catch (error) {
      console.error('[MessageInput] send failed:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showFiles && fileCompletions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedFileIndex((prev) => (prev + 1) % fileCompletions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedFileIndex((prev) =>
          prev === 0 ? fileCompletions.length - 1 : prev - 1
        )
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        const selected = fileCompletions[selectedFileIndex]
        if (selected) {
          applyFileCompletion(selected)
        }
        return
      }
    }
    if (showCommands && filteredCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedCommandIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedCommandIndex((prev) =>
          prev === 0 ? filteredCommands.length - 1 : prev - 1
        )
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        const selected = filteredCommands[selectedCommandIndex]
        if (selected) {
          setValue(`/${selected} `)
        }
        return
      }
    }
    if (event.key === 'Tab' && showCommands && filteredCommands.length > 0) {
      event.preventDefault()
      const selected = filteredCommands[selectedCommandIndex] || filteredCommands[0]
      setValue(`/${selected} `)
      return
    }
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      void handleSend('follow_up')
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void handleSend('steer')
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend('prompt')
    }
  }

  return (
    <div className="message-input">
      {showCommands && (
        <div className="message-input-command-list" ref={commandListRef}>
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd}
              type="button"
              className={`message-input-command-item ${index === selectedCommandIndex ? 'active' : ''}`}
              onClick={() => {
                setSelectedCommandIndex(index)
                setValue(`/${cmd} `)
              }}
            >
              /{highlightCommand(cmd)}
            </button>
          ))}
        </div>
      )}
      {showFiles && fileCompletions.length > 0 && (
        <div className="message-input-file-list" ref={fileListRef}>
          {fileCompletions.map((path, index) => (
            <button
              key={path}
              type="button"
              className={`message-input-file-item ${index === selectedFileIndex ? 'active' : ''}`}
              onClick={() => applyFileCompletion(path)}
            >
              @{path}
            </button>
          ))}
        </div>
      )}
      <div className={`message-input-panel ${disabled ? 'disabled' : ''}`}>
        <div className="message-input-main">
          <div className="message-input-editor">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              title={disabled && disabledReason ? disabledReason : undefined}
              rows={1}
              className="message-input-field"
            />
          </div>
          <div className="message-input-actions">
            {canAbort ? (
              <button
                type="button"
                className="message-input-button abort"
                onClick={() => onAbort?.()}
                title="中止"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="message-input-button"
                onClick={() => void handleSend('prompt')}
                disabled={!canSend}
                title="发送"
              >
                {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            )}
          </div>
        </div>
        <div className="message-input-meta">
          {(contextControls || contextMentionCount >= 0) && (
            <div className="message-input-inline-controls">
              <span
                className={`message-context-indicator ${contextMentionCount > 0 ? 'active' : ''}`}
                title={contextTooltip}
              >
                {contextLabel}
              </span>
              {contextControls}
            </div>
          )}
          {statusText && (
            <div className={`message-input-status ${statusTone}`}>
              <span className="status-dot" />
              <span>{statusText}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
