import type { ReactNode } from 'react'

export interface RPCBannerConfig {
  kind: 'error' | 'warning' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface RPCBannerProps {
  banner: RPCBannerConfig | null
  children?: ReactNode
}

export default function RPCBanner({ banner }: RPCBannerProps) {
  if (!banner) return null
  return (
    <div className={`rpc-banner ${banner.kind}`}>
      <span>{banner.message}</span>
      {banner.actionLabel && banner.onAction && (
        <button type="button" className="rpc-banner-button" onClick={banner.onAction}>
          {banner.actionLabel}
        </button>
      )}
    </div>
  )
}
