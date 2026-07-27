import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Eye, FileOutput, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useIsMobile } from '@/hooks/useIsMobile'
import type {
  SessionConvertTarget,
  SessionInfo,
  SessionProviderInfo,
} from '@/types'
import { getSessionSourceTag } from '@/utils/session'
import { getSessionListDisplayName } from '@/utils/sessionDisplay'
import { listSupportedSessionProviders } from '@/utils/sessionProvidersApi'

interface ConvertSessionDialogProps {
  session: SessionInfo
  onConvert: (
    target: SessionConvertTarget,
    options: { dryRun: boolean; force: boolean }
  ) => Promise<void> | void
  onClose: () => void
}

const FALLBACK_TARGETS: SessionProviderInfo[] = [
  {
    slug: 'pi',
    display_name: 'Pi',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'claude-code',
    display_name: 'Claude Code',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'codex',
    display_name: 'Codex',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'opencode',
    display_name: 'OpenCode',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'gemini',
    display_name: 'Gemini CLI',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'factory',
    display_name: 'Factory',
    capabilities: { canScan: true, canConvertTarget: true },
  },
  {
    slug: 'clawdbot',
    display_name: 'ClawdBot',
    capabilities: { canScan: true, canConvertTarget: true },
  },
]

export default function ConvertSessionDialog({
  session,
  onConvert,
  onClose,
}: ConvertSessionDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const sourceLabel = useMemo(
    () => getSessionSourceTag(session.path) || t('session.convert.unknown'),
    [session.path, t]
  )
  const [providers, setProviders] = useState<SessionProviderInfo[]>(FALLBACK_TARGETS)
  const [target, setTarget] = useState<SessionConvertTarget>('claude-code')
  const [dryRun, setDryRun] = useState(false)
  const [force, setForce] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    listSupportedSessionProviders().then(items => {
      if (cancelled) return
      setProviders(items)
      const availableTargets = items.filter(item => item.capabilities.canConvertTarget)
      if (!availableTargets.some(item => item.slug === target) && availableTargets[0]) {
        setTarget(availableTargets[0].slug)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const convertTargets = useMemo(
    () => providers.filter(provider => provider.capabilities.canConvertTarget),
    [providers]
  )

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await onConvert(target, { dryRun, force })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-session-title"
        className={`rounded-md border border-border bg-background p-5 shadow-xl ${
          isMobile ? 'w-[95vw] max-w-md' : 'w-[32rem]'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h3 id="convert-session-title" className="text-lg font-semibold">
              {t('session.convert.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="focus-ring rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <div className="font-medium truncate">
            {getSessionListDisplayName(session, t('session.list.untitled'))}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('session.convert.source')}: {sourceLabel}
          </div>
        </div>

        <div className="space-y-2">
          {convertTargets.map(option => (
            <button
              key={option.slug}
              type="button"
              onClick={() => setTarget(option.slug)}
              className={`focus-ring w-full rounded-md border px-3 py-2.5 text-left ${
                target === option.slug
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border bg-muted/30 hover:bg-muted/50'
              }`}
            >
              <div className="font-medium">{t(`session.convert.targets.${option.slug}`)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t(`session.convert.targetDescriptions.${option.slug}`)}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {t('session.convert.dryRun')}
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              {t('session.convert.force')}
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-3 py-2 text-sm rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/15 text-foreground inline-flex items-center gap-2 disabled:opacity-60"
          >
            <FileOutput className="h-4 w-4" />
            {submitting
              ? t('common.loading')
              : dryRun
                ? t('session.convert.previewAction')
                : t('session.convert.convertAction')}
          </button>
        </div>
      </div>
    </div>
  )
}
