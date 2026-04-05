import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import type { SessionInfo } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'

interface RenameDialogProps {
  session: SessionInfo
  onRename: (newName: string) => void
  onClose: () => void
}

export default function RenameDialog({ session, onRename, onClose }: RenameDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [newName, setNewName] = useState(session.name || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName.trim()) {
      onRename(newName.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`bg-background border border-border rounded-lg p-6 ${isMobile ? 'w-[95vw]' : 'w-96'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Pencil className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{t('session.rename.title')}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('session.rename.placeholder')}
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
              disabled={!newName.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              <Pencil className="h-4 w-4" />
              {t('session.rename.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
