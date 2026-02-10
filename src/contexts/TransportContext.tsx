import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react'
import { Transport, TauriTransport, WebSocketTransport } from '../transport'

interface TransportContextValue {
  transport: Transport
  isWebSocket: boolean
}

const TransportContext = createContext<TransportContextValue | null>(null)

function detectEnvironment(): 'tauri' | 'web' {
  if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) {
    return 'tauri'
  }
  return 'web'
}

interface TransportProviderProps {
  children: React.ReactNode
  wsUrl?: string
  forceWebSocket?: boolean
}

export function TransportProvider({
  children,
  wsUrl = 'ws://localhost:52130',
  forceWebSocket = false,
}: TransportProviderProps) {
  const transportRef = useRef<Transport | null>(null)

  const value = useMemo<TransportContextValue>(() => {
    const env = detectEnvironment()
    const useWebSocket = forceWebSocket || env === 'web'

    if (!transportRef.current) {
      if (useWebSocket) {
        transportRef.current = new WebSocketTransport(wsUrl)
      } else {
        transportRef.current = new TauriTransport()
      }
    }

    return {
      transport: transportRef.current,
      isWebSocket: useWebSocket,
    }
  }, [wsUrl, forceWebSocket])

  useEffect(() => {
    return () => {
      if (transportRef.current && 'disconnect' in transportRef.current) {
        ;(transportRef.current as WebSocketTransport).disconnect()
      }
    }
  }, [])

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
