import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Transport } from '../transport'
import { getTransport, HttpTransport } from '../transport'

type TransportType = 'ws' | 'http' | 'tauri'

interface TransportContextValue {
  transport: Transport
  type: TransportType
}

const TransportContext = createContext<TransportContextValue | null>(null)

function resolveType(t: Transport): TransportType {
  if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) return 'tauri'
  return t instanceof HttpTransport ? 'http' : 'ws'
}

interface TransportProviderProps {
  children: ReactNode
}

export function TransportProvider({ children }: TransportProviderProps) {
  const value = useMemo<TransportContextValue>(() => {
    const transport = getTransport()
    return { transport, type: resolveType(transport) }
  }, [])

  return <TransportContext.Provider value={value}>{children}</TransportContext.Provider>
}

export function useTransport(): Transport {
  const ctx = useContext(TransportContext)
  if (!ctx) throw new Error('useTransport must be used within TransportProvider')
  return ctx.transport
}

export function useTransportInfo(): TransportContextValue {
  const ctx = useContext(TransportContext)
  if (!ctx) throw new Error('useTransportInfo must be used within TransportProvider')
  return ctx
}
