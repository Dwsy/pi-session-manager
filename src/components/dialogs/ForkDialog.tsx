import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import type { SessionInfo } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useEscapeToClose } from './useEscapeToClose'

interface ForkDialogProps {
  session: SessionInfo
  onFork: (targetName?: string) => void
  onClose: () => void
}

export default function ForkDialog({ session, onFork, onClose }: ForkDialogProps) {
  useEscapeToClose(onClose)
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [targetName, setTargetName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFork(targetName.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="fork-dialog-title" className={`rounded-lg border border-border bg-background p-6 ${isMobile ? 'w-[95vw]' : 'w-96'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Copy className="h-5 w-5 text-primary" />
          <h3 id="fork-dialog-title" className="text-lg font-semibold">{t('session.fork.title')}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t('session.fork.placeholder')}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder={session.name || t('session.list.untitled')}
            className="w-full px-3 py-2 bg-secondary border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
            autoFocus
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors"
            >
              <Copy className="h-4 w-4" />
              {t('session.fork.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
