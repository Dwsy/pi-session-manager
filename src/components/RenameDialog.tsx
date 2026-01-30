import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'

interface RenameDialogProps {
  session: SessionInfo
  onRename: (newName: string) => void
  onClose: () => void
}

export default function RenameDialog({ session, onRename, onClose }: RenameDialogProps) {
  const { t } = useTranslation()
  const [newName, setNewName] = useState(session.name || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName.trim()) {
      onRename(newName.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1b26] border border-[#2c2d3b] rounded-lg p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">{t('rename.title')}</h3>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('rename.placeholder')}
            className="w-full px-3 py-2 bg-[#2c2d3b] border border-[#3c3d4b] rounded text-sm focus:outline-none focus:border-[#569cd6] mb-4"
            autoFocus
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#6a6f85] hover:text-white transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!newName.trim()}
              className="px-4 py-2 text-sm bg-[#569cd6] hover:bg-[#4a8bc2] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              {t('rename.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}