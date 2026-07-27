import { useState } from 'react'
import { Download, ExternalLink, FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AvailableUpdateInfo } from '@/utils/updateChecker'
import MarkdownContent from './ui/MarkdownContent'

interface UpdateNoticeToastProps {
  update: AvailableUpdateInfo | null
  onClose: () => void
  onOpenRelease: () => void
}

export default function UpdateNoticeToast({
  update,
  onClose,
  onOpenRelease,
}: UpdateNoticeToastProps) {
  const { t } = useTranslation()
  const [showNotesModal, setShowNotesModal] = useState(false)

  if (!update) return null

  return (
    <>
      <div className="fixed right-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[80] w-[min(360px,calc(100vw-24px))]">
        <div className="rounded-md border border-border bg-popover p-3.5 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-info">
              <Download className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t('settings.update.toast.title', 'New version available')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'settings.update.toast.version',
                  'Current v{{current}}, latest v{{latest}}',
                  {
                    current: update.currentVersion,
                    latest: update.latestVersion,
                  },
                )}
              </p>
              {update.releaseNotes && (
                <p className="mt-1.5 text-xs text-muted-foreground max-h-10 overflow-hidden">
                  {update.releaseNotes}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowNotesModal(true)}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('settings.update.toast.viewNotes', 'View release notes')}
                </button>
                <button
                  onClick={onOpenRelease}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('settings.update.toast.download', 'Download')}
                </button>
                <button
                  onClick={onClose}
                  className="focus-ring rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t('settings.update.toast.ignoreTooltip', 'Will not remind again until a newer version is released')}
                >
                  {t('settings.update.toast.ignoreVersion', 'Ignore this version')}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="focus-ring rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('settings.update.toast.close', 'Close update notice')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showNotesModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3">
          <div role="dialog" aria-modal="true" aria-label={t('settings.update.toast.notesTitle', 'Release Notes')} className="flex max-h-[85vh] w-[min(760px,calc(100vw-24px))] flex-col rounded-lg border border-border bg-background shadow-xl">
            <div className="px-4 py-3 border-b border-border/80 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {t('settings.update.toast.notesTitle', 'Release Notes')}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {update.releaseName}
                </p>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('common.close', 'Close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {update.releaseNotesMarkdown ? (
                <MarkdownContent content={update.releaseNotesMarkdown} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('settings.update.toast.noNotes', 'No release notes available for this version.')}
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border/80 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNotesModal(false)}
                className="focus-ring rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t('common.close', 'Close')}
              </button>
              <button
                onClick={onOpenRelease}
                className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.update.toast.download', 'Download')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
