import { listen as tauriListen } from '@tauri-apps/api/event'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'
export type StatusListener = (status: ConnectionStatus) => void

export interface Transport {
  invoke<T>(command: string, payload?: unknown, useCompression?: boolean): Promise<T>
  onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void>
  isConnected(): boolean
  onStatusChange?(listener: StatusListener): () => void
}

export class TauriTransport implements Transport {
  private connected = true

  async invoke<T>(command: string, payload?: unknown, _useCompression?: boolean): Promise<T> {
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

type TransportPreference = 'auto' | 'ws' | 'http'

interface RemoteConfig {
  wsUrl: string
  httpBaseUrl: string
  token?: string
  transport: TransportPreference
}

function normalizeHttpBase(url: string): string {
  let out = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(out)) out = `http://${out}`
  if (out.endsWith('/api')) out = out.slice(0, -4)
  return out
}

function toWsUrl(input: string): string {
  const trimmed = input.trim()
  if (/^wss?:\/\//i.test(trimmed)) return trimmed
  const normalized = normalizeHttpBase(trimmed)
  const wsBase = normalized.startsWith('https://') ? `wss://${normalized.slice(8)}` :
    normalized.startsWith('http://') ? `ws://${normalized.slice(7)}` : `ws://${normalized}`
  return wsBase.endsWith('/ws') ? wsBase : `${wsBase}/ws`
}

function readRemoteConfig(): RemoteConfig {
  const host = typeof location !== 'undefined' ? location.hostname : 'localhost'
  const proto = typeof location !== 'undefined' ? location.protocol : 'http:'
  const port = typeof location !== 'undefined' ? location.port : ''
  const isSecure = proto === 'https:'
  const origin = port ? `${host}:${port}` : host
  const defaultHttp = `${proto}//${origin}`
  const defaultWs = `${isSecure ? 'wss' : 'ws'}://${origin}/ws`

  if (typeof window === 'undefined') {
    return {
      wsUrl: import.meta.env.VITE_WS_URL || defaultWs,
      httpBaseUrl: import.meta.env.VITE_HTTP_BASE_URL || defaultHttp,
      token: import.meta.env.VITE_API_TOKEN,
      transport: (import.meta.env.VITE_TRANSPORT as TransportPreference) || 'auto',
    }
  }

  const params = new URLSearchParams(window.location.search)
  const qServer = params.get('server')
  const qWs = params.get('ws')
  const qHttp = params.get('http')
  const qToken = params.get('token')
  const qTransport = params.get('transport') as TransportPreference | null

  if (qServer) {
    const httpBase = normalizeHttpBase(qServer)
    localStorage.setItem('psm.httpBaseUrl', httpBase)
    localStorage.setItem('psm.wsUrl', toWsUrl(httpBase))
  }
  if (qHttp) {
    const httpBase = normalizeHttpBase(qHttp)
    localStorage.setItem('psm.httpBaseUrl', httpBase)
    localStorage.setItem('psm.wsUrl', toWsUrl(httpBase))
  }
  if (qWs) localStorage.setItem('psm.wsUrl', toWsUrl(qWs))
  if (qToken) localStorage.setItem('psm.apiToken', qToken)
  if (qTransport && ['auto', 'ws', 'http'].includes(qTransport)) {
    localStorage.setItem('psm.transport', qTransport)
  }

  return {
    wsUrl: toWsUrl(localStorage.getItem('psm.wsUrl') || import.meta.env.VITE_WS_URL || defaultWs),
    httpBaseUrl: normalizeHttpBase(localStorage.getItem('psm.httpBaseUrl') || import.meta.env.VITE_HTTP_BASE_URL || defaultHttp),
    token: localStorage.getItem('psm.apiToken') || import.meta.env.VITE_API_TOKEN || undefined,
    transport: (localStorage.getItem('psm.transport') as TransportPreference | null)
      || (import.meta.env.VITE_TRANSPORT as TransportPreference | undefined)
      || 'auto',
  }
}

// Gzip 压缩相关工具函数
async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  const source = new Uint8Array(data.byteLength)
  source.set(data)
  await writer.write(source)
  await writer.close()
  const chunks: Uint8Array[] = []
  const reader = cs.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  const source = new Uint8Array(data.byteLength)
  source.set(data)
  await writer.write(source)
  await writer.close()
  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function base64Encode(data: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0
  while (i < data.length) {
    const a = data[i++]
    const b = i < data.length ? data[i++] : 0
    const c = i < data.length ? data[i++] : 0
    const bitmap = (a << 16) | (b << 8) | c
    result += chars.charAt((bitmap >> 18) & 63)
    result += chars.charAt((bitmap >> 12) & 63)
    result += i - 2 < data.length ? chars.charAt((bitmap >> 6) & 63) : '='
    result += i - 1 < data.length ? chars.charAt(bitmap & 63) : '='
  }
  return result
}

function base64Decode(str: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup: Record<string, number> = {}
  for (let i = 0; i < chars.length; i++) {
    lookup[chars[i]] = i
  }
  const len = str.length
  const padding = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((len * 3 / 4) - padding)
  let j = 0
  for (let i = 0; i < len; i += 4) {
    const a = lookup[str[i]]
    const b = lookup[str[i + 1]]
    const c = lookup[str[i + 2]] || 0
    const d = lookup[str[i + 3]] || 0
    bytes[j++] = (a << 2) | (b >> 4)
    if (j < bytes.length) bytes[j++] = ((b & 15) << 4) | (c >> 2)
    if (j < bytes.length) bytes[j++] = ((c & 3) << 6) | d
  }
  return bytes
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
  private readonly token?: string
  private disposed = false
  private connectWaiters: { resolve: () => void; reject: (e: Error) => void }[] = []
  private statusListeners = new Set<StatusListener>()
  private enableCompression: boolean

  constructor(url = readRemoteConfig().wsUrl, token = readRemoteConfig().token, enableCompression = false) {
    this.url = url
    this.token = token
    this.enableCompression = enableCompression
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
        if (this.token) {
          ws.send(JSON.stringify({ auth: this.token }))
        }
        for (const w of this.connectWaiters) w.resolve()
        this.connectWaiters = []
        this.emitStatus('connected')
        console.log('[WS] connected')
      }

      ws.onmessage = async (event) => {
        if (ws !== this.ws) return
        try {
          const data = JSON.parse(event.data)
          if (data.pong) return
          await this.handleMessage(data)
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

  private async handleMessage(data: { id?: string; event?: string; event_type?: string; payload?: unknown; success?: boolean; data?: unknown; error?: string; compressed?: boolean }): Promise<void> {
    if (data.id && this.pendingRequests.has(data.id)) {
      const request = this.pendingRequests.get(data.id)!
      clearTimeout(request.timer)
      this.pendingRequests.delete(data.id)

      let responseData = data.data
      // 处理压缩的响应数据
      if (data.compressed && typeof data.data === 'string') {
        try {
          const compressed = base64Decode(data.data)
          const decompressed = await gzipDecompress(compressed)
          responseData = JSON.parse(new TextDecoder().decode(decompressed))
        } catch (e) {
          console.error('[WS] Failed to decompress response:', e)
        }
      }

      if (data.success) {
        request.resolve(responseData)
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

  async invoke<T>(command: string, payload?: unknown, useCompression = false): Promise<T> {
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

      const sendRequest = async () => {
        const acceptGzip = this.enableCompression

        if (useCompression && payload) {
          try {
            const payloadStr = JSON.stringify(payload)
            const compressed = await gzipCompress(new TextEncoder().encode(payloadStr))
            const compressedB64 = base64Encode(compressed)
            this.ws!.send(
              JSON.stringify({ id, command, payload: compressedB64, compressed: true, accept_gzip: acceptGzip })
            )
          } catch (e) {
            console.warn('[WS] Compression failed, sending uncompressed:', e)
            this.ws!.send(
              JSON.stringify({ id, command, payload: payload ?? {}, accept_gzip: acceptGzip })
            )
          }
        } else {
          this.ws!.send(
            JSON.stringify({ id, command, payload: payload ?? {}, accept_gzip: acceptGzip })
          )
        }
      }

      sendRequest()
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
  private readonly wsUrl: string
  private readonly authToken: string | null
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>()
  private ws: WebSocket | null = null
  private wsConnected = false
  private statusListeners = new Set<StatusListener>()
  private httpOk = false
  private retryCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    baseUrl = readRemoteConfig().httpBaseUrl,
    wsUrl = readRemoteConfig().wsUrl,
    authToken: string | null = readRemoteConfig().token ?? null,
  ) {
    this.baseUrl = baseUrl
    this.wsUrl = wsUrl
    this.authToken = authToken
    this.connectEventWs()
  }

  private emitStatus(status: ConnectionStatus): void {
    for (const fn of this.statusListeners) fn(status)
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.wsConnected ? 'connected' : 'connecting')
    return () => { this.statusListeners.delete(listener) }
  }

  private connectEventWs(): void {
    if (this.disposed || this.ws) return
    this.emitStatus('connecting')

    try {
      const ws = new WebSocket(this.wsUrl)
      this.ws = ws

      ws.onopen = () => {
        if (ws !== this.ws) return
        if (this.authToken) {
          ws.send(JSON.stringify({ auth: this.authToken }))
        } else {
          this.onWsReady()
        }
      }

      ws.onmessage = (event) => {
        if (ws !== this.ws) return
        try {
          const data = JSON.parse(event.data)
          if (!this.wsConnected) {
            if (data.auth === 'ok') {
              this.onWsReady()
            } else if (data.error) {
              console.error('[HTTP-WS] auth failed:', data.error)
              this.cleanupWs()
              this.scheduleReconnect()
            }
            return
          }
          if (data.event_type === 'event' && data.event) {
            const listeners = this.eventListeners.get(data.event)
            if (listeners) listeners.forEach((cb) => cb(data.payload))
          }
        } catch (e) {
          console.error('[HTTP-WS] parse error:', e)
        }
      }

      ws.onclose = () => {
        if (ws !== this.ws) return
        this.wsConnected = false
        this.ws = null
        if (!this.httpOk) this.emitStatus('disconnected')
        if (!this.disposed) this.scheduleReconnect()
      }

      ws.onerror = () => { /* onclose fires after onerror */ }
    } catch {
      this.scheduleReconnect()
    }
  }

  private onWsReady(): void {
    this.wsConnected = true
    this.retryCount = 0
    this.emitStatus('connected')
    console.log('[HTTP-WS] event channel connected')
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) return
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000)
    this.retryCount++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectEventWs()
    }, delay)
  }

  private cleanupWs(): void {
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
    this.wsConnected = false
  }

  async invoke<T>(command: string, payload?: unknown, acceptGzip = true): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    if (acceptGzip) headers['Accept-Encoding'] = 'gzip'

    try {
      const resp = await fetch(`${this.baseUrl}/api`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command, payload: payload ?? {} }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      // 浏览器会自动处理 gzip 解码
      const data = await resp.json() as { success: boolean; data?: T; error?: string }
      if (!data.success) throw new Error(data.error || 'Command failed')
      if (!this.httpOk) {
        this.httpOk = true
        if (this.wsConnected) this.emitStatus('connected')
      }
      return data.data as T
    } catch (e) {
      this.httpOk = false
      if (!this.wsConnected) this.emitStatus('disconnected')
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
    return this.wsConnected
  }

  disconnect(): void {
    this.disposed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanupWs()
    this.eventListeners.clear()
  }
}

function detectMobileWeb(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
}

export function createTransport(enableCompression = false): Transport {
  if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) {
    console.log('Using Tauri IPC transport')
    return new TauriTransport()
  }

  const cfg = readRemoteConfig()
  const forceHttp = cfg.transport === 'http'
  const forceWs = cfg.transport === 'ws'

  if (forceHttp || (!forceWs && detectMobileWeb())) {
    console.log('Using HTTP transport', cfg.httpBaseUrl)
    return new HttpTransport(cfg.httpBaseUrl, cfg.wsUrl, cfg.token ?? null)
  }

  console.log('Using WebSocket transport', cfg.wsUrl, enableCompression ? 'with compression' : '')
  return new WebSocketTransport(cfg.wsUrl, cfg.token, enableCompression)
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
