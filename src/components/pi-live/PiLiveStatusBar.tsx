/**
 * Pi Live Status Bar - 显示连接状态
 */

import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import type { PiLiveConnectionState } from '@/types/pi-live'

interface PiLiveStatusBarProps {
  connectionState: PiLiveConnectionState
  sessionCount: number
  onRefresh?: () => void
}

export default function PiLiveStatusBar({ connectionState, sessionCount, onRefresh }: PiLiveStatusBarProps) {
  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="w-3 h-3 text-green-500" />
      case 'reconnecting':
        return <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />
      case 'disconnected':
      default:
        return <WifiOff className="w-3 h-3 text-muted-foreground" />
    }
  }

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected'
      case 'reconnecting':
        return 'Reconnecting...'
      case 'disconnected':
      default:
        return 'Disconnected'
    }
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
      {getStatusIcon()}
      <span>{getStatusText()}</span>
      {sessionCount > 0 && (
        <>
          <span>·</span>
          <span>{sessionCount} sessions</span>
        </>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-auto p-1 hover:bg-secondary rounded"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
