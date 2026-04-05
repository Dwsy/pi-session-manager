import type { SessionInfo } from '@/types'
import { FileText, FileCode, Database, Download, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getCachedSettings } from '@/utils/settingsApi'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ExportDialogProps {
  session: SessionInfo
  onExport: (format: 'html' | 'md' | 'json') => void
  onClose: () => void
}

export default function ExportDialog({ session, onExport, onClose }: ExportDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const defaultFormat = getCachedSettings().export?.defaultFormat || 'html'

  const handleExport = (format: 'html' | 'md' | 'json') => {
    onExport(format)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className={`bg-background border border-border rounded-xl p-6 shadow-2xl ${isMobile ? 'w-[95vw] max-w-md' : 'w-[28rem]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">
              {t('export.dialog.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Session Name */}
        <p className="text-sm text-muted-foreground mb-4 px-0.5">
          {session.name || t('export.dialog.untitledSession')}
        </p>

        {/* Export Options */}
        <div className="space-y-2">
          <button
            onClick={() => handleExport('html')}
            className={`w-full px-4 py-3 text-left rounded-lg transition-all flex items-start gap-3 group ${
              defaultFormat === 'html'
                ? 'bg-primary/10 ring-1 ring-primary/30'
                : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <FileText className={`h-5 w-5 mt-0.5 flex-shrink-0 ${defaultFormat === 'html' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t('export.dialog.formats.html.name')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t('export.dialog.formats.html.description')}</div>
            </div>
          </button>

          <button
            onClick={() => handleExport('md')}
            className={`w-full px-4 py-3 text-left rounded-lg transition-all flex items-start gap-3 group ${
              defaultFormat === 'md'
                ? 'bg-primary/10 ring-1 ring-primary/30'
                : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <FileCode className={`h-5 w-5 mt-0.5 flex-shrink-0 ${defaultFormat === 'md' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t('export.dialog.formats.md.name')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t('export.dialog.formats.md.description')}</div>
            </div>
          </button>

          <button
            onClick={() => handleExport('json')}
            className={`w-full px-4 py-3 text-left rounded-lg transition-all flex items-start gap-3 group ${
              defaultFormat === 'json'
                ? 'bg-primary/10 ring-1 ring-primary/30'
                : 'bg-secondary hover:bg-secondary/80'
            }`}
          >
            <Database className={`h-5 w-5 mt-0.5 flex-shrink-0 ${defaultFormat === 'json' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t('export.dialog.formats.json.name')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t('export.dialog.formats.json.description')}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
