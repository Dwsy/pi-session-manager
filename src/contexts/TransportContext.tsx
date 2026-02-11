import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Transport, TauriTransport, WebSocketTransport } from '../transport'

interface TransportContextValue {
  transport: Transport
  isWebSocket: boolean
}

const TransportContext = createContext<TransportContextValue | null>(null)

function createTransportInstance(wsUrl: string, forceWebSocket: boolean): { transport: Transport; isWebSocket: boolean } {
  const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__
  const useWs = forceWebSocket || !isTauri

  return {
    transport: useWs ? new WebSocketTransport(wsUrl) : new TauriTransport(),
    isWebSocket: useWs,
  }
}

interface TransportProviderProps {
  children: ReactNode
  wsUrl?: string
  forceWebSocket?: boolean
}

export function TransportProvider({
  children,
  wsUrl = 'ws://localhost:52130',
  forceWebSocket = false,
}: TransportProviderProps) {
  const [value] = useState<TransportContextValue>(() => createTransportInstance(wsUrl, forceWebSocket))

  useEffect(() => {
    return () => {
      if (value.isWebSocket && 'disconnect' in value.transport) {
        (value.transport as WebSocketTransport).disconnect()
      }
    }
  }, [value])

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>
}

export function useTransport(): Transport {
  const context = useContext(TransportContext)
  if (!context) {
    throw new Error('useTransport must be used within a TransportProvider')
  }
  return context.transport
}

export function useTransportInfo(): TransportContextValue {
  const context = useContext(TransportContext)
  if (!context) {
    throw new Error('useTransportInfo must be used within a TransportProvider')
  }
  return context
}
