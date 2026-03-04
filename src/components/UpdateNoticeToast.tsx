import { useState } from 'react'
import { Download, ExternalLink, FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AvailableUpdateInfo } from '../utils/updateChecker'
import MarkdownContent from './MarkdownContent'

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
        <div className="rounded-xl border border-info/40 bg-surface-dark/95 backdrop-blur shadow-xl p-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-info">
              <Download className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t('settings.update.toast.title', '发现新版本')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'settings.update.toast.version',
                  '当前 v{{current}}，最新 v{{latest}}',
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
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-foreground bg-surface hover:bg-surface-hover motion-color motion-press focus-ring"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('settings.update.toast.viewNotes', '查看更新说明')}
                </button>
                <button
                  onClick={onOpenRelease}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-info hover:bg-info/90 motion-color motion-press focus-ring"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('settings.update.toast.download', '去下载')}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface motion-color motion-press focus-ring"
                >
                  {t('settings.update.toast.later', '稍后')}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md motion-color motion-press focus-ring"
              aria-label={t('settings.update.toast.close', '关闭更新提示')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showNotesModal && (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-[min(760px,calc(100vw-24px))] max-h-[85vh] rounded-xl border border-border bg-surface-dark shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-border/80 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {t('settings.update.toast.notesTitle', '更新说明')}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {update.releaseName}
                </p>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface rounded-lg motion-color motion-press focus-ring"
                aria-label={t('common.close', '关闭')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {update.releaseNotesMarkdown ? (
                <MarkdownContent content={update.releaseNotesMarkdown} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('settings.update.toast.noNotes', '该版本未提供更新说明。')}
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border/80 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNotesModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-surface motion-color motion-press focus-ring"
              >
                {t('common.close', '关闭')}
              </button>
              <button
                onClick={onOpenRelease}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-info hover:bg-info/90 motion-color motion-press focus-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.update.toast.download', '去下载')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
