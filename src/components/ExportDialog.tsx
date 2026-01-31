import type { SessionInfo } from '../types'
import { FileText, FileCode, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ExportDialogProps {
  session: SessionInfo
  onExport: (format: 'html' | 'md' | 'json') => void
  onClose: () => void
}

export default function ExportDialog({ session, onExport, onClose }: ExportDialogProps) {
  const { t } = useTranslation('export')

  console.log('[ExportDialog] Rendered', { sessionName: session.name })

  const handleExport = (format: 'html' | 'md' | 'json') => {
    console.log('[ExportDialog] Export clicked:', format)
    onExport(format)
  }

  const handleClose = () => {
    console.log('[ExportDialog] Close clicked')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-semibold mb-2">
          {t('title')}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {session.name || t('untitledSession')}
        </p>

        <div className="space-y-2">
          <button
            onClick={() => handleExport('html')}
            className="w-full px-4 py-3 text-left bg-secondary hover:bg-accent rounded transition-colors flex items-start gap-3 cursor-pointer active:scale-95"
          >
            <FileText className="h-5 w-5 text-[#569cd6] mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">{t('formats.html.name')}</div>
              <div className="text-xs text-muted-foreground">{t('formats.html.description')}</div>
            </div>
          </button>

          <button
            onClick={() => handleExport('md')}
            className="w-full px-4 py-3 text-left bg-secondary hover:bg-accent rounded transition-colors flex items-start gap-3 cursor-pointer active:scale-95"
          >
            <FileCode className="h-5 w-5 text-[#7ee787] mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">{t('formats.md.name')}</div>
              <div className="text-xs text-muted-foreground">{t('formats.md.description')}</div>
            </div>
          </button>

          <button
            onClick={() => handleExport('json')}
            className="w-full px-4 py-3 text-left bg-secondary hover:bg-accent rounded transition-colors flex items-start gap-3 cursor-pointer active:scale-95"
          >
            <Database className="h-5 w-5 text-[#ffa657] mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">{t('formats.json.name')}</div>
              <div className="text-xs text-muted-foreground">{t('formats.json.description')}</div>
            </div>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}