import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'
import { useIsMobile } from '../hooks/useIsMobile'

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
        <h3 className="text-lg font-semibold mb-4">{t('rename.title')}</h3>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('rename.placeholder')}
            className="w-full px-3 py-2 bg-secondary border border-border-hover rounded text-sm focus:outline-none focus:border-info mb-4"
            autoFocus
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="px-4 py-2 text-sm bg-info hover:bg-info/80 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              {t('rename.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}