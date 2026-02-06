import { listen as tauriListen } from '@tauri-apps/api/event'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

/**
 * Transport interface - abstracts IPC and WebSocket channels
 */
export interface Transport {
  invoke<T>(command: string, payload?: unknown): Promise<T>
  onEvent<T>(event: string, callback: (payload: T) => void): Promise<() => void>
  isConnected(): boolean
}

/**
 * Tauri IPC Transport - used in desktop environment
 */
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

/**
 * WebSocket Transport - used in Web/separated frontend environment
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null
  private connected = false
  private messageId = 0
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>()
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>()
  private reconnectTimer: number | null = null
  private readonly url: string

  constructor(url = 'ws://localhost:52130') {
    this.url = url
    this.connect()
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.connected = true
        if (this.reconnectTimer) {
          window.clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.connected = false
        this.reconnectTimer = window.setTimeout(() => this.connect(), 3000)
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.connected = false
      }
    } catch (e) {
      console.error('Failed to connect WebSocket:', e)
      this.reconnectTimer = window.setTimeout(() => this.connect(), 3000)
    }
  }

  private handleMessage(data: { id?: string; event?: string; event_type?: string; payload?: unknown; success?: boolean; data?: unknown; error?: string }): void {
    // Handle command response
    if (data.id && this.pendingRequests.has(data.id)) {
      const request = this.pendingRequests.get(data.id)!
      this.pendingRequests.delete(data.id)

      if (data.success) {
        request.resolve(data.data)
      } else {
        request.reject(new Error(data.error || 'Command failed'))
      }
      return
    }

    // Handle event broadcast (from WsAdapter: event_type='event', event='pi-rpc-event')
    if (data.event_type === 'event' && data.event) {
      const listeners = this.eventListeners.get(data.event)
      if (listeners) {
        listeners.forEach((callback) => callback(data.payload))
      }
    }
  }

  async invoke<T>(command: string, payload?: unknown): Promise<T> {
    if (!this.connected || !this.ws) {
      throw new Error('WebSocket not connected')
    }

    const id = `ws-${++this.messageId}`

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })

      this.ws!.send(
        JSON.stringify({
          id,
          command,
          payload: payload ?? {},
        })
      )

      // Timeout handling
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Command ${command} timeout`))
        }
      }, 30000)
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
    return this.connected
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
    }
    this.ws?.close()
  }
}

/**
 * Transport factory - automatically selects appropriate transport
 */
export function createTransport(): Transport {
  // Check if running in Tauri environment
  if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) {
    console.log('Using Tauri IPC transport')
    return new TauriTransport()
  }

  console.log('Using WebSocket transport')
  return new WebSocketTransport()
}

// Singleton transport instance (lazy initialized)
let _transport: Transport | null = null

function getTransport(): Transport {
  if (!_transport) {
    _transport = createTransport()
  }
  return _transport
}

/**
 * Global invoke - drop-in replacement for @tauri-apps/api/core invoke
 * Automatically uses IPC in Tauri, WebSocket in browser
 */
export async function invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  return getTransport().invoke<T>(command, payload)
}

/**
 * Global listen - drop-in replacement for @tauri-apps/api/event listen
 * Automatically uses IPC in Tauri, WebSocket in browser
 */
export async function listen<T>(
  event: string,
  callback: (event: { payload: T }) => void
): Promise<() => void> {
  // Wrap callback to match Tauri's event shape
  return getTransport().onEvent<T>(event, (payload) => {
    callback({ payload })
  })
}

/**
 * Hook: useTransport (for React components that need direct transport access)
 */
export function useTransport(): Transport {
  return getTransport()
}

/**
 * Check if running in Tauri desktop environment
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__
}
