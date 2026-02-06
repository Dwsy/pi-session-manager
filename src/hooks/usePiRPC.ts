import { useState, useEffect, useRef, useCallback } from 'react'
import { listen, invoke } from '../transport'
import { sessionPathMatches } from '../utils/sessionPath'
import type { Event, UnlistenFn } from '@tauri-apps/api/event'
import { rpcDebug, rpcError, rpcWarn, summarizePayload } from '../utils/rpcDebug'
import type { Transport } from '../transport'

/**
 * RPC 连接阶段
 */
export type RPCPhase =
  | 'disconnected'
  | 'starting'
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'error'

/**
 * RPC 事件类型
 */
export interface RPCEvent {
  type: string
  command?: string
  success?: boolean
  error?: string
  data?: unknown
  message?: unknown
  messages?: unknown[]
  assistant_message_event?: AssistantMessageEvent
  tool_call_id?: string
  tool_name?: string
  args?: Record<string, unknown>
  result?: unknown
  partial_result?: unknown
  is_error?: boolean
  reason?: string
}

/**
 * 流式消息事件
 */
export interface AssistantMessageEvent {
  type:
    | 'start'
    | 'text_start'
    | 'text_delta'
    | 'text_end'
    | 'thinking_start'
    | 'thinking_delta'
    | 'thinking_end'
    | 'toolcall_start'
    | 'toolcall_delta'
    | 'toolcall_end'
    | 'done'
    | 'error'
  content_index?: number
  delta?: string
  content?: string
  thinking?: string
  reason?: string
  tool_call?: ToolCallData
  partial?: unknown
}

/**
 * 工具调用数据
 */
export interface ToolCallData {
  id: string
  name: string
  arguments?: Record<string, unknown>
}

/**
 * RPC 连接状态
 */
export interface RPCConnectionStatus {
  connected: boolean
  phase: RPCPhase
  session_file: string | null
  last_error: string | null
}

interface RPCStateSnapshot {
  is_streaming?: boolean
  isStreaming?: boolean
  session_file?: string | null
}

function isNoisyResponseEvent(payload: RPCEvent): boolean {
  return (
    payload.type === 'response' &&
    (payload.command === 'get_messages' || payload.command === 'get_state')
  )
}

function isAssistantMessagePayload(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false
  }
  const role = (message as Record<string, unknown>).role
  return typeof role === 'string' && role === 'assistant'
}

function extractPartialText(partial: unknown): { text?: string; thinking?: string } {
  if (!partial || typeof partial !== 'object') return {}
  const record = partial as Record<string, unknown>
  let content = record.content
  if (!Array.isArray(content) && record.message && typeof record.message === 'object') {
    const message = record.message as Record<string, unknown>
    if (Array.isArray(message.content)) {
      content = message.content
    }
  }

  let text: string | undefined
  let thinking: string | undefined

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const partType = typeof p.type === 'string' ? p.type : ''
      if (partType === 'text' && typeof p.text === 'string') {
        text = p.text
      }
      if (partType === 'thinking' && typeof p.thinking === 'string') {
        thinking = p.thinking
      }
    }
  } else {
    if (typeof record.text === 'string') {
      text = record.text
    }
    if (typeof record.thinking === 'string') {
      thinking = record.thinking
    }
  }

  return { text, thinking }
}

/**
 * usePiRPC hook 返回类型
 */
export interface UsePiRPCReturn {
  /** 是否已连接 */
  isConnected: boolean
  /** 当前阶段 */
  phase: RPCPhase
  /** 当前会话文件 */
  sessionFile: string | null
  /** 最后错误信息 */
  lastError: string | null
  /** 流式文本内容 */
  streamingText: string
  /** 流式思考内容 */
  streamingThinking: string
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 当前工具执行 */
  currentTool: ToolExecution | null
  /** 最近一次 RPC 事件 */
  lastEvent: RPCEvent | null
  /** 事件节拍，用于触发批量处理 */
  eventTick: number
  /** 取出并清空事件队列 */
  drainEvents: () => RPCEvent[]
  /** 启动 RPC 连接 */
  startRPC: (piPath?: string) => Promise<void>
  /** 重启 RPC 连接 */
  restartRPC: (piPath?: string) => Promise<void>
  /** 停止 RPC 连接 */
  stopRPC: () => Promise<void>
  /** 发送 prompt */
  sendPrompt: (message: string) => Promise<void>
  /** 发送 steer（干预） */
  sendSteer: (message: string) => Promise<void>
  /** 发送 abort */
  sendAbort: () => Promise<void>
  /** 发送 follow-up */
  sendFollowUp: (message: string) => Promise<void>
  /** 切换会话 */
  switchSession: (sessionPath: string) => Promise<void>
  /** 检测 RPC 支持 */
  detectSupport: (piPath?: string) => Promise<boolean>
  /** 清空流式内容 */
  clearStreaming: () => void
}

/**
 * 工具执行状态
 */
export interface ToolExecution {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  partialOutput?: string
  result?: string
}

/**
 * Pi RPC Hook
 *
 * 提供与 Pi CLI RPC 模式的连接和通信能力
 *
 * @example
 * ```typescript
 * const {
 *   isConnected,
 *   phase,
 *   streamingText,
 *   sendPrompt,
 *   switchSession
 * } = usePiRPC()
 *
 * // 启动连接
 * await startRPC()
 *
 * // 切换会话
 * await switchSession('/path/to/session.jsonl')
 *
 * // 发送消息
 * await sendPrompt('Hello!')
 * ```
 */

interface UsePiRPCOptions {
  transport?: Transport
}

export function usePiRPC(options?: UsePiRPCOptions): UsePiRPCReturn {
  const transport = options?.transport

  // Transport-aware helpers
  const invokeCmd = useCallback(
    <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
      if (transport) return transport.invoke<T>(command, payload)
      return invoke<T>(command, payload)
    },
    [transport]
  )
  const listenEvent = useCallback(
    <T>(event: string, callback: (payload: T) => void): Promise<() => void> => {
      if (transport) return transport.onEvent<T>(event, callback)
      return listen<T>(event, (e) => callback(e.payload)).then((unlisten) => unlisten)
    },
    [transport]
  )

  // 连接状态
  const [isConnected, setIsConnected] = useState(false)
  const [phase, setPhase] = useState<RPCPhase>('disconnected')
  const [sessionFile, setSessionFile] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // 流式内容
  const [streamingText, setStreamingText] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentTool, setCurrentTool] = useState<ToolExecution | null>(null)
  const [lastEvent, setLastEvent] = useState<RPCEvent | null>(null)
  const [eventTick, setEventTick] = useState(0)

  // 引用
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const isConnectingRef = useRef(false)
  const isConnectedRef = useRef(false)
  const eventQueueRef = useRef<RPCEvent[]>([])

  // 使用 ref 存储可变状态，避免 effect 依赖循环
  const phaseRef = useRef<RPCPhase>(phase)
  const isStreamingRef = useRef(isStreaming)
  const sessionFileRef = useRef(sessionFile)

  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    sessionFileRef.current = sessionFile
  }, [sessionFile])

  // 当流式事件缺失时，使用后端状态兜底复位 isStreaming（避免输入长期卡死）
  // 注意：使用 ref 避免依赖循环，只在 isConnected 变化时重新设置
  useEffect(() => {
    if (!isConnected) return
    let cancelled = false

    const timer = setInterval(() => {
      void (async () => {
        try {
          const state = await invokeCmd<RPCStateSnapshot>('get_rpc_state')
          if (cancelled) return

          const streaming =
            typeof state?.is_streaming === 'boolean'
              ? state.is_streaming
              : typeof state?.isStreaming === 'boolean'
                ? state.isStreaming
                : undefined

          // 只在状态实际变化时才更新，避免不必要的渲染
          if (typeof streaming === 'boolean' && streaming !== isStreamingRef.current) {
            setIsStreaming(streaming)
            if (!streaming) {
              const currentPhase = phaseRef.current
              if (currentPhase === 'thinking' || currentPhase === 'executing') {
                setPhase('idle')
              }
              setCurrentTool(prev => (prev?.status === 'running' ? { ...prev, status: 'success' } : prev))
              if (streamingText) setStreamingText('')
              if (streamingThinking) setStreamingThinking('')
            }
          }

          // 只在 session_file 变化时才更新
          if (state?.session_file && state.session_file !== sessionFileRef.current) {
            setSessionFile(state.session_file)
          }
        } catch {
          // 忽略轮询异常，避免打断主流程
        }
      })()
    }, 1200)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // 只依赖 isConnected，使用 ref 获取其他状态避免循环
  }, [isConnected, invokeCmd])

  /**
   * 处理 RPC 事件
   * 使用 ref 检查当前状态，避免不必要的 setState 调用
   */
  const handleRPCEvent = useCallback((event: Event<RPCEvent>) => {
    const payload = event.payload
    const noisyResponse = isNoisyResponseEvent(payload)

    eventQueueRef.current.push(payload)
    setEventTick(prev => prev + 1)

    if (payload.assistant_message_event && payload.type !== 'message_update') {
      setLastEvent({ ...payload, type: 'message_update' })
      handleAssistantMessageEvent(payload.assistant_message_event)
    }

    if (!noisyResponse) {
      rpcDebug('usePiRPC', `event:${payload.type}`, summarizePayload(payload))
    }

    switch (payload.type) {
      case 'agent_start':
        setLastEvent(payload)
        // 只在状态需要变化时才更新
        if (phaseRef.current !== 'thinking') {
          setPhase('thinking')
        }
        if (!isStreamingRef.current) {
          setIsStreaming(true)
        }
        break

      case 'agent_end':
        setLastEvent(payload)
        if (phaseRef.current !== 'idle') {
          setPhase('idle')
        }
        if (isStreamingRef.current) {
          setIsStreaming(false)
        }
        setCurrentTool(null)
        setStreamingText('')
        setStreamingThinking('')
        break

      case 'message_update':
        setLastEvent(payload)
        if (payload.assistant_message_event) {
          if (!isStreamingRef.current) {
            setIsStreaming(true)
          }
          // 使用 ref 检查当前 phase，避免不必要的更新
          if (phaseRef.current !== 'executing' && phaseRef.current !== 'thinking') {
            setPhase('thinking')
          }
          handleAssistantMessageEvent(payload.assistant_message_event)
        }
        break

      case 'message_start':
        if (isAssistantMessagePayload(payload.message)) {
          setLastEvent(payload)
          if (!isStreamingRef.current) {
            setIsStreaming(true)
          }
          if (phaseRef.current !== 'thinking') {
            setPhase('thinking')
          }
        }
        break

      case 'message_end':
      case 'turn_end':
        if (isAssistantMessagePayload(payload.message)) {
          setLastEvent(payload)
          if (isStreamingRef.current) {
            setIsStreaming(false)
          }
          if (phaseRef.current !== 'idle') {
            setPhase('idle')
          }
          setCurrentTool(null)
          setStreamingText('')
          setStreamingThinking('')
        }
        break

      case 'tool_execution_start':
        setLastEvent(payload)
        if (phaseRef.current !== 'executing') {
          setPhase('executing')
        }
        if (payload.tool_call_id && payload.tool_name) {
          setCurrentTool({
            id: payload.tool_call_id,
            name: payload.tool_name,
            args: payload.args || {},
            status: 'running',
          })
        }
        break

      case 'tool_execution_update':
        setLastEvent(payload)
        if (payload.tool_call_id && payload.partial_result) {
          setCurrentTool(prev => {
            if (prev && prev.id === payload.tool_call_id) {
              const updated: ToolExecution = {
                id: prev.id,
                name: prev.name,
                args: prev.args,
                status: prev.status,
                partialOutput: String(payload.partial_result),
              }
              return updated
            }
            return prev
          })
        }
        break

      case 'tool_execution_end':
        setLastEvent(payload)
        if (phaseRef.current !== 'idle') {
          setPhase('idle')
        }
        if (payload.tool_call_id) {
          setCurrentTool(prev => {
            if (prev && prev.id === payload.tool_call_id) {
              const updated: ToolExecution = {
                id: prev.id,
                name: prev.name,
                args: prev.args,
                status: payload.is_error ? 'error' : 'success',
                partialOutput: prev.partialOutput,
                result: payload.result ? String(payload.result) : undefined,
              }
              return updated
            }
            return prev
          })
        }
        break

      case 'error':
        setLastEvent(payload)
        if (phaseRef.current !== 'error') {
          setPhase('error')
        }
        setLastError(payload.error || payload.reason || 'Unknown error')
        if (isStreamingRef.current) {
          setIsStreaming(false)
        }
        break

      case 'response':
        // 命令响应
        if (payload.success === false) {
          setLastEvent(payload)
          rpcError('usePiRPC', 'command response failed', payload)
          setLastError(payload.error || 'RPC command failed')
        } else if (!noisyResponse) {
          setLastEvent(payload)
        }
        break
    }
    // 空依赖数组，函数只使用 ref 和 setState，保持稳定
  }, [])

  const drainEvents = useCallback(() => {
    if (eventQueueRef.current.length === 0) return []
    const events = [...eventQueueRef.current]
    eventQueueRef.current = []
    return events
  }, [])

  /**
   * 处理流式消息事件
   * 使用 ref 避免依赖循环，确保事件处理函数稳定
   */
  const handleAssistantMessageEvent = useCallback(
    (event: AssistantMessageEvent) => {
      const partial = extractPartialText(event.partial)

      switch (event.type) {
        case 'text_delta':
          if (event.delta) {
            setStreamingText(prev => prev + event.delta)
          } else if (partial.text) {
            setStreamingText(partial.text)
          }
          break

        case 'text_start':
          setStreamingText('')
          if (partial.text) {
            setStreamingText(partial.text)
          }
          break

        case 'text_end':
          if (event.content) {
            setStreamingText(event.content)
          } else if (partial.text) {
            setStreamingText(partial.text)
          }
          break

        case 'thinking_delta':
          if (event.delta || event.thinking) {
            setStreamingThinking(prev => prev + (event.delta || event.thinking || ''))
          } else if (partial.thinking) {
            setStreamingThinking(partial.thinking)
          }
          break

        case 'thinking_start':
          setStreamingThinking('')
          if (partial.thinking) {
            setStreamingThinking(partial.thinking)
          }
          break
        case 'thinking_end':
          if (partial.thinking) {
            setStreamingThinking(partial.thinking)
          }
          break
        case 'start':
          if (partial.thinking) {
            setStreamingThinking(partial.thinking)
          }
          if (partial.text) {
            setStreamingText(partial.text)
          }
          break

        case 'toolcall_start':
          // 使用 ref 检查当前 phase，避免不必要的更新
          if (phaseRef.current !== 'executing') {
            setPhase('executing')
          }
          if (event.tool_call) {
            setCurrentTool({
              id: event.tool_call.id,
              name: event.tool_call.name,
              args: event.tool_call.arguments || {},
              status: 'running',
            })
          }
          break

        case 'done':
          if (isStreamingRef.current) {
            setIsStreaming(false)
          }
          if (phaseRef.current !== 'idle') {
            setPhase('idle')
          }
          setStreamingText('')
          setStreamingThinking('')
          break

        case 'error':
          if (phaseRef.current !== 'error') {
            setPhase('error')
          }
          setLastError(event.reason || 'Stream error')
          if (isStreamingRef.current) {
            setIsStreaming(false)
          }
          setStreamingText('')
          setStreamingThinking('')
          break
      }
    },
    // 空依赖数组，因为函数只使用 setState 和 ref，不会随 render 变化
    []
  )

  /**
   * 启动 RPC 连接
   */
  const startRPC = useCallback(async (piPath?: string) => {
    if (isConnectingRef.current || isConnectedRef.current) {
      rpcDebug('usePiRPC', 'start skipped: already connected/connecting')
      return
    }

    isConnectingRef.current = true
    rpcDebug('usePiRPC', 'starting rpc connection', { piPath: piPath || null })

    try {
      // 设置事件监听
      if (unlistenRef.current) {
        unlistenRef.current()
      }
      unlistenRef.current = await listenEvent<RPCEvent>('pi-rpc-event', (payload) => {
        handleRPCEvent({ payload } as Event<RPCEvent>)
      })

      // 启动 RPC
      const status = await invokeCmd<RPCConnectionStatus>('start_pi_rpc', {
        piPath: piPath || null,
      })

      setIsConnected(status.connected)
      isConnectedRef.current = status.connected
      setPhase(status.phase as RPCPhase)
      setSessionFile(status.session_file)
      setLastError(status.last_error)

      rpcDebug('usePiRPC', 'connection started', status)
    } catch (error) {
      rpcError('usePiRPC', 'failed to start', error)
      setLastError(error instanceof Error ? error.message : String(error))
      setPhase('error')
    } finally {
      isConnectingRef.current = false
    }
  }, [handleRPCEvent])

  /**
   * 重启 RPC 连接
   */
  const restartRPC = useCallback(async (piPath?: string) => {
    rpcDebug('usePiRPC', 'restarting rpc connection', { piPath: piPath || null })
    try {
      const status = await invokeCmd<RPCConnectionStatus>('restart_pi_rpc', {
        piPath: piPath || null,
      })
      setIsConnected(status.connected)
      isConnectedRef.current = status.connected
      setPhase(status.phase as RPCPhase)
      setSessionFile(status.session_file)
      setLastError(status.last_error)
      rpcDebug('usePiRPC', 'connection restarted', status)
    } catch (error) {
      rpcError('usePiRPC', 'failed to restart', error)
      setLastError(error instanceof Error ? error.message : String(error))
      setPhase('error')
    }
  }, [])

  /**
   * 停止 RPC 连接
   */
  const stopRPC = useCallback(async () => {
    rpcDebug('usePiRPC', 'stopping rpc connection')

    try {
      await invokeCmd('stop_pi_rpc')

      // 清理事件监听
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      setIsConnected(false)
      isConnectedRef.current = false
      setPhase('disconnected')
      setSessionFile(null)
      setStreamingText('')
      setStreamingThinking('')
      setIsStreaming(false)
      setCurrentTool(null)

      rpcDebug('usePiRPC', 'connection stopped')
    } catch (error) {
      rpcError('usePiRPC', 'failed to stop', error)
    }
  }, [])

  /**
   * 发送 prompt
   */
  const sendPrompt = useCallback(async (message: string) => {
    if (!isConnected) {
      rpcWarn('usePiRPC', 'not connected, send_prompt skipped')
      return
    }

    rpcDebug('usePiRPC', 'sending prompt', { length: message.length })

    try {
      // 清空之前的流式内容
      setStreamingText('')
      setStreamingThinking('')
      setIsStreaming(true)

      await invokeCmd('send_prompt', { message })
    } catch (error) {
      rpcError('usePiRPC', 'failed to send prompt', error)
      setIsStreaming(false)
      throw error
    }
  }, [isConnected])

  /**
   * 发送 steer（干预）
   */
  const sendSteer = useCallback(async (message: string) => {
    if (!isConnected) {
      rpcWarn('usePiRPC', 'not connected, send_steer skipped')
      return
    }

    rpcDebug('usePiRPC', 'sending steer', { length: message.length })

    try {
      await invokeCmd('send_steer', { message })
    } catch (error) {
      rpcError('usePiRPC', 'failed to send steer', error)
      throw error
    }
  }, [isConnected])

  /**
   * 发送 abort
   */
  const sendAbort = useCallback(async () => {
    if (!isConnected) {
      rpcWarn('usePiRPC', 'not connected, send_abort skipped')
      return
    }

    rpcDebug('usePiRPC', 'sending abort')

    try {
      await invokeCmd('send_abort')
      setIsStreaming(false)
    } catch (error) {
      rpcError('usePiRPC', 'failed to send abort', error)
      throw error
    }
  }, [isConnected])

  /**
   * 发送 follow-up
   */
  const sendFollowUp = useCallback(async (message: string) => {
    if (!isConnected) {
      rpcWarn('usePiRPC', 'not connected, send_follow_up skipped')
      return
    }

    rpcDebug('usePiRPC', 'sending follow_up', { length: message.length })

    try {
      await invokeCmd('send_follow_up', { message })
    } catch (error) {
      rpcError('usePiRPC', 'failed to send follow_up', error)
      throw error
    }
  }, [isConnected])

  /**
   * 切换会话
   */
  const switchSession = useCallback(
    async (sessionPath: string) => {
      if (!isConnected) {
        const err = new Error('RPC client not connected')
        rpcWarn('usePiRPC', 'not connected, switch_session skipped', { sessionPath })
        throw err
      }

      rpcDebug('usePiRPC', 'switching session', { sessionPath })

      try {
        // 清空流式内容和事件队列，防止旧会话事件泄漏
        setStreamingText('')
        setStreamingThinking('')
        setIsStreaming(false)
        setCurrentTool(null)
        eventQueueRef.current = []

        await invokeCmd('switch_session_rpc', { sessionPath })
        // 二次清空：丢弃切换期间到达的旧会话事件
        eventQueueRef.current = []
        const state = await invokeCmd<RPCStateSnapshot>('get_rpc_state')
        const piSessionFile = typeof state?.session_file === 'string' ? state.session_file : null
        if (piSessionFile && !sessionPathMatches(sessionPath, piSessionFile)) {
          rpcWarn('usePiRPC', 'session file mismatch after switch (using requested path)', {
            expected: sessionPath,
            actual: piSessionFile,
          })
        }
        // Always set sessionFile to the requested path so useRpcSessionSwitch
        // sees activeMatches=true and stops retrying.
        setSessionFile(sessionPath)
        setPhase('idle')
      } catch (error) {
        rpcError('usePiRPC', 'failed to switch session', error)
        throw error
      }
    },
    [isConnected]
  )

  /**
   * 检测 RPC 支持
   */
  const detectSupport = useCallback(async (piPath?: string): Promise<boolean> => {
    rpcDebug('usePiRPC', 'detecting rpc support', { piPath: piPath || null })

    try {
      const supported = await invokeCmd<boolean>('detect_pi_rpc_support', {
        piPath: piPath || null,
      })

      rpcDebug('usePiRPC', 'rpc support result', { supported })
      return supported
    } catch (error) {
      rpcError('usePiRPC', 'detect rpc support failed', error)
      return false
    }
  }, [])

  /**
   * 清空流式内容
   */
  const clearStreaming = useCallback(() => {
    setStreamingText('')
    setStreamingThinking('')
    setCurrentTool(null)
  }, [])

  /**
   * 清理
   */
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
      }
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isConnectedRef.current) {
        invoke('stop_pi_rpc').catch(() => {
          // 页面卸载时忽略停止异常
        })
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return {
    isConnected,
    phase,
    sessionFile,
    lastError,
    streamingText,
    streamingThinking,
    isStreaming,
    currentTool,
    lastEvent,
    eventTick,
    drainEvents,
    startRPC,
    restartRPC,
    stopRPC,
    sendPrompt,
    sendFollowUp,
    sendSteer,
    sendAbort,
    switchSession,
    detectSupport,
    clearStreaming,
  }
}
