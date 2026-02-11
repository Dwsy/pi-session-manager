import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke, isTauri } from '../transport'
import { Terminal, Loader2 } from 'lucide-react'
import type { SessionInfo } from '../types'

interface OpenInTerminalButtonProps {
  session: SessionInfo
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
  label?: string
  showLabel?: boolean
  onSuccess?: () => void
  onError?: (error: string) => void
  onWebResume?: () => void
  children?: React.ReactNode
}

export default function OpenInTerminalButton({
  session,
  terminal = 'iterm2',
  piPath,
  customCommand,
  size = 'sm',
  variant = 'ghost',
  className = '',
  label,
  showLabel = false,
  onSuccess,
  onError,
  onWebResume,
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
  }

  const handleOpenInTerminal = async (e?: React.MouseEvent) => {
    e?.stopPropagation()

    if (!isTauri()) {
      onWebResume?.()
      return
    }

    if (loading) return

    setLoading(true)
    try {
      await invoke('open_session_in_terminal', {
        path: session.path,
        cwd: session.cwd,
        terminal: terminal === 'custom' ? customCommand : terminal,
        pi_path: piPath || null,
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
        rounded-md transition-all duration-200 flex items-center gap-1.5
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      title={t('session.openInTerminal', '在终端中打开')}
    >
      {loading ? (
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
      ) : (
        <>
          <Terminal className={iconSizes[size]} />
          {(showLabel || label || children) && (
            <span className="text-xs">
              {children || label || t('session.resume', '恢复')}
            </span>
          )}
        </>
      )}
    </button>
  )
}
