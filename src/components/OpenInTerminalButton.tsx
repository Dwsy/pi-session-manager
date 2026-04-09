import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isTauri } from '@/transport'
import { Terminal, Loader2 } from 'lucide-react'
import type { SessionInfo } from '@/types'
import type { TerminalType } from './settings/types'
import { openSessionInTerminalDirect } from '@/utils/sessionResume'

interface OpenInTerminalButtonProps {
  session: SessionInfo
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  resumeCommand?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  className?: string
  label?: string
  showLabel?: boolean
  showShortcut?: boolean
  onSuccess?: () => void
  onError?: (error: string) => void
  onWebResume?: () => void
  onResumeSession?: (session: SessionInfo) => Promise<void> | void
  allowDirectOpenFallback?: boolean
  children?: React.ReactNode
}

export default function OpenInTerminalButton({
  session,
  terminal: propTerminal,
  piPath: propPiPath,
  customCommand: propCustomCommand,
  resumeCommand: propResumeCommand,
  size = 'sm',
  variant = 'ghost',
  className = '',
  label,
  showLabel = false,
  showShortcut = false,
  onSuccess,
  onError,
  onWebResume,
  onResumeSession,
  allowDirectOpenFallback = false,
  children,
}: OpenInTerminalButtonProps) {
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
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  }

  const handleOpenInTerminal = async (e?: React.MouseEvent) => {
    e?.stopPropagation()

    if (onResumeSession) {
      if (loading) return
      setLoading(true)
      try {
        await onResumeSession(session)
        onSuccess?.()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error('Failed to resume session:', errorMessage)
        onError?.(errorMessage)
      } finally {
        setLoading(false)
      }
      return
    }

  if (!isTauri()) {
      onWebResume?.()
      return
    }

    if (!allowDirectOpenFallback) {
      const errorMessage =
        'Managed resume handler is missing. Refusing to fall back to legacy direct terminal open.'
      console.error(errorMessage, { path: session.path })
      onError?.(errorMessage)
      return
    }

    if (loading) return

    setLoading(true)
    try {
      await openSessionInTerminalDirect(session, {
        terminal: propTerminal,
        customCommand: propCustomCommand,
        piPath: propPiPath,
        resumeCommand: propResumeCommand,
      })
      onSuccess?.()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('Failed to open session in terminal:', errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleOpenInTerminal}
      disabled={loading}
      className={`
        rounded-md motion-surface motion-color motion-press focus-ring flex items-center gap-1.5
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      title={t('session.openInTerminal', 'Open in Terminal')}
    >
      {loading ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
      ) : (
        <>
          <Terminal className={iconSizes[size]} />
          {(showLabel || label || children) && (
            <span className="text-xs">
              {children || label || t('session.resume', 'Resume')}
            </span>
          )}
          {showShortcut && (
            <kbd className="ml-1 px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-[9px] font-mono">
              ⌘R
            </kbd>
          )}
        </>
      )}
    </button>
  )
}
