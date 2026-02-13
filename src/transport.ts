import { listen as tauriListen } from '@tauri-apps/api/event'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
export type StatusListener = (status: ConnectionStatus) => void

export interface Transport {
  invoke<T>(command: string, payload?: unknown): Promise<T>
  onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void>
  isConnected(): boolean
  onStatusChange?(listener: StatusListener): () => void
}

export class TauriTransport implements Transport {
  private connected = true

  async invoke<T>(command: string, payload?: unknown): Promise<T> {
    return tauriInvoke<T>(command, payload as Record<string, unknown>)
  }

  async onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void> {
    const unlisten = await tauriListen<T>(event, (e) => callback(e.payload))
    return unlisten
  }

  isConnected(): boolean {
    return this.connected
  }
}

const enum WsState {
  Disconnected,
  Connecting,
  Connected,
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null
  private state = WsState.Disconnected
  private messageId = 0
  private retryCount = 0
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private readonly url: string
  private disposed = false
  private connectWaiters: { resolve: () => void; reject: (e: Error) => void }[] = []
  private statusListeners = new Set<StatusListener>()

  constructor(url = `ws://${typeof location !== 'undefined' ? location.hostname : 'localhost'}:52130`) {
    this.url = url
    this.emitStatus('connecting')
    this.connect()
  }

  private emitStatus(status: ConnectionStatus): void {
    for (const fn of this.statusListeners) fn(status)
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    // Immediately notify current state
    listener(this.state === WsState.Connected ? 'connected' : this.state === WsState.Connecting ? 'connecting' : 'disconnected')
    return () => { this.statusListeners.delete(listener) }
  }

  private connect(): void {
    if (this.disposed || this.state === WsState.Connecting) return
    this.state = WsState.Connecting
    this.emitStatus('connecting')

    this.cleanupSocket()

    try {
      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onopen = () => {
        if (ws !== this.ws) return
        this.state = WsState.Connected
        this.retryCount = 0
        this.startPing()
        for (const w of this.connectWaiters) w.resolve()
        this.connectWaiters = []
        this.emitStatus('connected')
        console.log('[WS] connected')
      }

      ws.onmessage = (event) => {
        if (ws !== this.ws) return
        try {
          const data = JSON.parse(event.data)
          if (data.pong) return
          this.handleMessage(data)
        } catch (e) {
          console.error('[WS] parse error:', e)
        }
      }

      ws.onclose = () => {
        if (ws !== this.ws) return
        this.handleDisconnect()
      }

      ws.onerror = () => {
        // onclose will always fire after onerror, do nothing here
      }
    } catch {
      this.state = WsState.Disconnected
      this.scheduleReconnect()
    }
  }

  private handleDisconnect(): void {
    this.state = WsState.Disconnected
    this.stopPing()
    this.rejectAllPending('WebSocket disconnected')
    for (const w of this.connectWaiters) w.reject(new Error('WebSocket disconnected'))
    this.connectWaiters = []
    this.emitStatus('disconnected')
    if (!this.disposed) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) return
    const delay = Math.min(1000 * Math.pow(1.5, this.retryCount), 10000)
    this.retryCount++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('{"ping":true}')
      }
    }, 25000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private cleanupSocket(): void {
    if (this.ws) {
      const old = this.ws
      old.onopen = null
      old.onmessage = null
      old.onclose = null
      old.onerror = null
      if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
        old.close()
      }
      this.ws = null
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer)
      req.reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }

  private handleMessage(data: { id?: string; event?: string; event_type?: string; payload?: unknown; success?: boolean; data?: unknown; error?: string }): void {
    if (data.id && this.pendingRequests.has(data.id)) {
      const request = this.pendingRequests.get(data.id)!
      clearTimeout(request.timer)
      this.pendingRequests.delete(data.id)

      if (data.success) {
        request.resolve(data.data)
      } else {
        request.reject(new Error(data.error || 'Command failed'))
      }
      return
    }

    if (data.event_type === 'event' && data.event) {
      const listeners = this.eventListeners.get(data.event)
      if (listeners) {
        listeners.forEach((callback) => callback(data.payload))
      }
    }
  }

  private waitForConnection(timeoutMs = 10000): Promise<void> {
    if (this.state === WsState.Connected) return Promise.resolve()
    if (this.disposed) return Promise.reject(new Error('Transport disposed'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.connectWaiters.findIndex(w => w.resolve === resolve)
        if (idx >= 0) this.connectWaiters.splice(idx, 1)
        reject(new Error('WebSocket connection timeout'))
      }, timeoutMs)
      this.connectWaiters.push({
        resolve: () => { clearTimeout(timer); resolve() },
        reject: (e) => { clearTimeout(timer); reject(e) },
      })
    })
  }

  async invoke<T>(command: string, payload?: unknown): Promise<T> {
    if (this.state !== WsState.Connected) {
      await this.waitForConnection()
    }

    const id = `ws-${++this.messageId}`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Command ${command} timeout`))
      }, 30000)

      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })

      this.ws!.send(
        JSON.stringify({ id, command, payload: payload ?? {} })
      )
    })
  }

  async onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void> {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }

    const wrappedCallback = (payload: unknown) => callback(payload as T)
    this.eventListeners.get(event)!.add(wrappedCallback)

    return () => {
      this.eventListeners.get(event)?.delete(wrappedCallback)
    }
  }

  isConnected(): boolean {
    return this.state === WsState.Connected
  }

  disconnect(): void {
    this.disposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopPing()
    this.rejectAllPending('Transport disposed')
    for (const w of this.connectWaiters) w.reject(new Error('Transport disposed'))
    this.connectWaiters = []
    this.cleanupSocket()
  }
}

export class HttpTransport implements Transport {
  private readonly baseUrl: string
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>()
  private eventSource: EventSource | null = null
  private sseConnected = false
  private statusListeners = new Set<StatusListener>()
  private httpOk = false

  constructor(baseUrl = `http://${location.hostname}:52131`) {
    this.baseUrl = baseUrl
    this.connectSSE()
  }

  private emitStatus(status: ConnectionStatus): void {
    for (const fn of this.statusListeners) fn(status)
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.httpOk || this.sseConnected ? 'connected' : 'connecting')
    return () => { this.statusListeners.delete(listener) }
  }

  private connectSSE(): void {
    if (this.eventSource) return

    const es = new EventSource(`${this.baseUrl}/api/events`)
    this.eventSource = es

    es.onopen = () => {
      this.sseConnected = true
      this.emitStatus('connected')
      console.log('[SSE] connected')
    }

    es.addEventListener('sessions-changed', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data)
        this.eventListeners.get('sessions-changed')?.forEach(cb => cb(payload))
      } catch (err) {
        console.error('[SSE] parse error:', err)
      }
    })

    es.onerror = () => {
      this.sseConnected = false
      if (!this.httpOk) this.emitStatus('disconnected')
      console.warn('[SSE] connection error, will auto-reconnect')
    }
  }

  async invoke<T>(command: string, payload?: unknown): Promise<T> {
    try {
      const resp = await fetch(`${this.baseUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload: payload ?? {} }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json() as { success: boolean; data?: T; error?: string }
      if (!data.success) throw new Error(data.error || 'Command failed')
      if (!this.httpOk) {
        this.httpOk = true
        this.emitStatus('connected')
      }
      return data.data as T
    } catch (e) {
      this.httpOk = false
      if (!this.sseConnected) this.emitStatus('disconnected')
      throw e
    }
  }

  async onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void> {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    const wrapped = (p: unknown) => callback(p as T)
    this.eventListeners.get(event)!.add(wrapped)

    return () => {
      this.eventListeners.get(event)?.delete(wrapped)
    }
  }

  isConnected(): boolean {
    return this.sseConnected
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.sseConnected = false
    this.eventListeners.clear()
  }
}

function detectMobileWeb(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
}

export function createTransport(): Transport {
  if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) {
    console.log('Using Tauri IPC transport')
    return new TauriTransport()
  }

  if (detectMobileWeb()) {
    console.log('Using HTTP transport (mobile)')
    return new HttpTransport()
  }

  console.log('Using WebSocket transport')
  return new WebSocketTransport()
}

let _transport: Transport | null = null

export function getTransport(): Transport {
  if (!_transport) {
    _transport = createTransport()
  }
  return _transport
}

export async function invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  return getTransport().invoke<T>(command, payload)
}

export async function listen<T>(
  event: string,
  callback: (event: { payload: T }) => void
): Promise<() => void> {
  return getTransport().onEvent<T>(event, (payload) => {
    callback({ payload })
  })
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__
}
