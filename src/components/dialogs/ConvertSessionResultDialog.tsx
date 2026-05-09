import { Check, Copy, ExternalLink, Eye, FileOutput, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useClipboard } from '@/hooks/useClipboard'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { SessionConvertResult } from '@/types'

interface ConvertSessionResultDialogProps {
  result: SessionConvertResult
  onClose: () => void
  onOpenTargetPath: (path: string) => Promise<void> | void
  onRunResumeCommand: (command: string) => Promise<void> | void
  onConvertAgain: () => void
}

export default function ConvertSessionResultDialog({
  result,
  onClose,
  onOpenTargetPath,
  onRunResumeCommand,
  onConvertAgain,
}: ConvertSessionResultDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { copyText } = useClipboard()
  const [copied, setCopied] = useState(false)

  const writtenPath = result.written_paths[0] || ''

  const providerTone = (provider: string) => {
    const normalized = provider.toLowerCase()
    if (normalized.includes('claude')) {
      return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-200'
    }
    if (normalized.includes('codex')) {
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
    }
    if (normalized.includes('pi')) {
      return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200'
    }
    return 'border-border/60 bg-secondary/30 text-foreground'
  }

  const handleCopy = async () => {
    await copyText(result.resume_command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`bg-background border border-border rounded-xl p-6 shadow-2xl ${
          isMobile ? 'w-[95vw] max-w-md' : 'w-[34rem]'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {result.dry_run ? (
              <Eye className="h-5 w-5 text-primary" />
            ) : (
              <FileOutput className="h-5 w-5 text-primary" />
            )}
            <h3 className="text-lg font-semibold">
              {result.dry_run
                ? t('session.convert.previewTitle')
                : t('session.convert.successTitle')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${providerTone(result.source_provider)}`}>
            {result.source_provider}
          </span>
          <span className="text-muted-foreground text-xs">→</span>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${providerTone(result.target_provider)}`}>
            {result.target_provider}
          </span>
          <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground">
            {result.dry_run
              ? t('session.convert.previewBadge')
              : t('session.convert.writtenBadge')}
          </span>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm">
            <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2">
              <span className="text-muted-foreground">{t('session.convert.source')}</span>
              <span>{result.source_provider}</span>
              <span className="text-muted-foreground">{t('session.convert.target')}</span>
              <span>{result.target_provider}</span>
              <span className="text-muted-foreground">{t('session.convert.sessionId')}</span>
              <span className="font-mono text-xs break-all">{result.target_session_id}</span>
              <span className="text-muted-foreground">{t('session.convert.path')}</span>
              <span className="font-mono text-xs break-all">{writtenPath || '-'}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 text-sm font-medium">
              {t('session.convert.resumeCommand')}
            </div>
            <pre className="whitespace-pre-wrap break-all rounded-md bg-secondary/40 px-3 py-2 text-xs text-foreground">
              {result.resume_command}
            </pre>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="font-medium mb-1">{t('common.warning')}</div>
              <ul className="space-y-1 text-xs">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {!result.dry_run && writtenPath && (
            <button
              type="button"
              onClick={() => onOpenTargetPath(writtenPath)}
              className="px-3 py-2 text-sm rounded-lg border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors inline-flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {t('session.convert.openTarget')}
            </button>
          )}
          {!result.dry_run && (
            <button
              type="button"
              onClick={() => onRunResumeCommand(result.resume_command)}
              className="px-3 py-2 text-sm rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15 transition-colors inline-flex items-center gap-2"
            >
              <FileOutput className="h-4 w-4" />
              {t('session.convert.runResume')}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 text-sm rounded-lg border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors inline-flex items-center gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied
              ? t('common.copied')
              : t('session.convert.copyResume')}
          </button>
          <button
            type="button"
            onClick={onConvertAgain}
            className="px-3 py-2 text-sm rounded-lg border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors"
          >
            {t('session.convert.convertAgain')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors"
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
