import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { ExternalLink, Loader2 } from 'lucide-react'
import type { SessionInfo } from '../types'

interface OpenInBrowserButtonProps {
  session: SessionInfo
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  onSuccess?: () => void
  onError?: (error: string) => void
}

export default function OpenInBrowserButton({
  session,
  size = 'sm',
  variant = 'ghost',
  className = '',
  onSuccess,
  onError,
}: OpenInBrowserButtonProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  }

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'text-muted-foreground hover:text-primary hover:bg-primary/10',
  }

  const handleOpenInBrowser = async (e?: React.MouseEvent) => {
    e?.stopPropagation()

    if (loading) return

    setLoading(true)
    try {
      await invoke('open_session_in_browser', {
        path: session.path,
      })
      onSuccess?.()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('Failed to open session in browser:', errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleOpenInBrowser}
      disabled={loading}
      className={`
        rounded-md transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      title={t('session.openInBrowser', '在浏览器中打开')}
    >
      {loading ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
      ) : (
        <ExternalLink className={iconSizes[size]} />
      )}
    </button>
  )
}
