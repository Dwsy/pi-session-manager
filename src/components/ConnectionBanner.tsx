import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff, Loader2 } from 'lucide-react'
import { useConnectionStatus } from '../hooks/useConnectionStatus'

/**
 * Shows a top banner when transport is disconnected or connecting.
 * Auto-hides after reconnection with a brief "connected" flash.
 */
export default function ConnectionBanner() {
  const { t } = useTranslation()
  const status = useConnectionStatus()
  const [visible, setVisible] = useState(false)
  const [wasDisconnected, setWasDisconnected] = useState(false)

  useEffect(() => {
    if (status === 'disconnected') {
      setVisible(true)
      setWasDisconnected(true)
    } else if (status === 'connecting') {
      // Only show connecting if we were previously disconnected
      // (skip the initial connecting state on first load)
      if (wasDisconnected) setVisible(true)
    } else if (status === 'connected') {
      if (wasDisconnected) {
        // Flash "reconnected" briefly then hide
        setVisible(true)
        const timer = setTimeout(() => {
          setVisible(false)
          setWasDisconnected(false)
        }, 2000)
        return () => clearTimeout(timer)
      } else {
        setVisible(false)
      }
    }
  }, [status, wasDisconnected])

  if (!visible) return null

  const isDisconnected = status === 'disconnected'
  const isConnecting = status === 'connecting'
  const isReconnected = status === 'connected' && wasDisconnected

  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
        isDisconnected
          ? 'bg-red-500/15 text-red-400 border-b border-red-500/20'
          : isConnecting
            ? 'bg-amber-500/15 text-amber-400 border-b border-amber-500/20'
            : 'bg-green-500/15 text-green-400 border-b border-green-500/20'
      }`}
    >
      {isDisconnected && (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          {t('connection.disconnected', '无法连接到服务，请检查应用是否运行')}
        </>
      )}
      {isConnecting && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('connection.connecting', '正在重新连接…')}
        </>
      )}
      {isReconnected && (
        <>
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t('connection.reconnected', '已重新连接')}
        </>
      )}
    </div>
  )
}
