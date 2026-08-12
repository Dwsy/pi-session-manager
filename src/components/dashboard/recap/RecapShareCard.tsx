import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageDown } from 'lucide-react'
import type { RecapStat, RecapStory, RecapText } from './recapTypes'

/**
 * Exports the recap as a PNG drawn with the Canvas 2D API.
 *
 * The image mirrors the story's closing summary card, painted from the live
 * theme tokens so a shared image looks like the app the user is actually
 * running. Nothing ever leaves the device: the bitmap goes to the clipboard,
 * or to a download when the clipboard is unavailable.
 */

type Translate = ReturnType<typeof useTranslation>['t']

type ShareStatus = 'idle' | 'copied' | 'downloaded' | 'failed'

interface RecapShareCardProps {
  story: RecapStory
  /** Localized period range, already formatted by the caller. */
  rangeLabel: string
  /** Localized product/period title for the card header. */
  title: string
}

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const DEVICE_SCALE = 2

const PAD = 88
const CONTENT_WIDTH = CARD_WIDTH - PAD * 2
const HEADLINE_COLUMNS = 4
const DETAIL_COLUMNS = 4
/** Two rows of four; anything past that has nowhere to go on a 1200x630 card. */
const MAX_DETAIL = DETAIL_COLUMNS * 2
const MAX_MOMENTS = 4
const STATUS_TIMEOUT_MS = 2600

const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans CJK SC', 'Helvetica Neue', Arial, sans-serif"

interface Palette {
  background: string
  card: string
  foreground: string
  muted: string
  border: string
}

const FALLBACK_PALETTE: Palette = {
  background: 'rgb(26, 27, 38)',
  card: 'rgb(36, 37, 54)',
  foreground: 'rgb(229, 229, 231)',
  muted: 'rgb(148, 152, 170)',
  border: 'rgb(63, 66, 90)',
}

function readRgbToken(styles: CSSStyleDeclaration, token: string, fallback: string): string {
  const channels = styles.getPropertyValue(token).trim().split(/[\s,]+/).slice(0, 3).map(Number)
  if (channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) return fallback
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`
}

function readPalette(): Palette {
  if (typeof document === 'undefined') return { ...FALLBACK_PALETTE }
  const styles = getComputedStyle(document.documentElement)
  return {
    background: readRgbToken(styles, '--color-background', FALLBACK_PALETTE.background),
    card: readRgbToken(styles, '--color-card', FALLBACK_PALETTE.card),
    foreground: readRgbToken(styles, '--color-foreground', FALLBACK_PALETTE.foreground),
    muted: readRgbToken(styles, '--color-muted-foreground', FALLBACK_PALETTE.muted),
    border: readRgbToken(styles, '--color-border', FALLBACK_PALETTE.border),
  }
}

function accentColor(hue: number): string {
  const safeHue = Number.isFinite(hue) ? ((Math.round(hue) % 360) + 360) % 360 : 0
  return `hsl(${safeHue}, 62%, 62%)`
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

function translate(t: Translate, text: RecapText): string {
  return t(text.key, text.fallback, text.values)
}

function statValue(stat: RecapStat): string {
  if (stat.display) return stat.display
  return typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value
}

function tracePanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius)
    return
  }
  ctx.rect(x, y, width, height)
}

interface DrawOptions {
  story: RecapStory
  title: string
  rangeLabel: string
  t: Translate
}

function drawRecapCard(canvas: HTMLCanvasElement, options: DrawOptions): boolean {
  const { story, title, rangeLabel, t } = options
  // Back the 1200x630 layout with a 2x bitmap, then scale once so every
  // coordinate below stays in card units instead of device pixels.
  canvas.width = CARD_WIDTH * DEVICE_SCALE
  canvas.height = CARD_HEIGHT * DEVICE_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.scale(DEVICE_SCALE, DEVICE_SCALE)

  const palette = readPalette()
  const accent = accentColor(story.accentHue)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  tracePanel(ctx, 40, 40, CARD_WIDTH - 80, CARD_HEIGHT - 80, 24)
  ctx.fillStyle = palette.card
  ctx.fill()
  ctx.strokeStyle = palette.border
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.font = `600 20px ${FONT_SANS}`
  ctx.fillStyle = palette.muted
  ctx.fillText(
    truncateToWidth(ctx, t('dashboard.recap.share.wordmark', 'Pi Session Manager'), CONTENT_WIDTH),
    PAD,
    98,
  )

  ctx.fillStyle = accent
  ctx.fillRect(PAD, 112, 72, 5)

  ctx.font = `700 44px ${FONT_SANS}`
  ctx.fillStyle = palette.foreground
  ctx.fillText(truncateToWidth(ctx, title, CONTENT_WIDTH), PAD, 172)

  ctx.font = `400 20px ${FONT_SANS}`
  ctx.fillStyle = palette.muted
  ctx.fillText(truncateToWidth(ctx, rangeLabel, CONTENT_WIDTH), PAD, 202)

  const { headline, detail } = story.summary
  const headlineWidth = CONTENT_WIDTH / HEADLINE_COLUMNS
  headline.slice(0, HEADLINE_COLUMNS).forEach((stat, index) => {
    const x = PAD + index * headlineWidth
    ctx.font = `700 40px ${FONT_SANS}`
    ctx.fillStyle = palette.foreground
    ctx.fillText(truncateToWidth(ctx, statValue(stat), headlineWidth - 20), x, 268)
    ctx.font = `400 16px ${FONT_SANS}`
    ctx.fillStyle = palette.muted
    ctx.fillText(truncateToWidth(ctx, translate(t, stat.label), headlineWidth - 20), x, 293)
  })

  ctx.fillStyle = palette.border
  ctx.fillRect(PAD, 322, CONTENT_WIDTH, 1)

  const detailWidth = CONTENT_WIDTH / DETAIL_COLUMNS
  detail.slice(0, MAX_DETAIL).forEach((stat, index) => {
    const x = PAD + (index % DETAIL_COLUMNS) * detailWidth
    const rowTop = 366 + Math.floor(index / DETAIL_COLUMNS) * 86
    const width = detailWidth - 20

    ctx.font = `400 15px ${FONT_SANS}`
    ctx.fillStyle = palette.muted
    ctx.fillText(truncateToWidth(ctx, translate(t, stat.label), width), x, rowTop)

    ctx.font = `600 24px ${FONT_SANS}`
    ctx.fillStyle = palette.foreground
    ctx.fillText(truncateToWidth(ctx, statValue(stat), width), x, rowTop + 30)

    if (stat.hint) {
      ctx.font = `400 14px ${FONT_SANS}`
      ctx.fillStyle = palette.muted
      ctx.fillText(truncateToWidth(ctx, translate(t, stat.hint), width), x, rowTop + 52)
    }
  })

  const shownMoments = story.moments.slice(0, MAX_MOMENTS)
  if (shownMoments.length > 0) {
    const momentWidth = CONTENT_WIDTH / MAX_MOMENTS
    shownMoments.forEach((moment, index) => {
      const x = PAD + index * momentWidth
      ctx.beginPath()
      ctx.arc(x + 5, 528, 5, 0, Math.PI * 2)
      ctx.fillStyle = accent
      ctx.fill()
      ctx.font = `500 18px ${FONT_SANS}`
      ctx.fillStyle = palette.foreground
      ctx.fillText(truncateToWidth(ctx, translate(t, moment.title), momentWidth - 40), x + 20, 534)
    })

    const remaining = story.moments.length - shownMoments.length
    if (remaining > 0) {
      ctx.font = `400 15px ${FONT_SANS}`
      ctx.fillStyle = palette.muted
      ctx.textAlign = 'right'
      ctx.fillText(
        t('dashboard.recap.share.moreMoments', '+{{count}} more', { count: remaining }),
        PAD + CONTENT_WIDTH,
        534,
      )
      ctx.textAlign = 'left'
    }
  }

  ctx.font = `400 16px ${FONT_SANS}`
  ctx.fillStyle = palette.muted
  ctx.fillText(
    truncateToWidth(
      ctx,
      t('dashboard.recap.share.footer', 'Built from local session data. Nothing left this device.'),
      CONTENT_WIDTH,
    ),
    PAD,
    570,
  )

  return true
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

async function copyToClipboard(blob: Blob): Promise<boolean> {
  // Image clipboard writes need a secure context plus ClipboardItem; both are
  // routinely missing, so treat any failure as "fall back to a download".
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    return true
  } catch {
    return false
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoking synchronously can cancel the download that was just started.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function RecapShareCard({ story, rangeLabel, title }: RecapShareCardProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ShareStatus>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const timer = setTimeout(() => setStatus('idle'), STATUS_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status])

  const handleExport = useCallback(async () => {
    setBusy(true)
    setStatus('idle')
    try {
      const canvas = document.createElement('canvas')
      if (!drawRecapCard(canvas, { story, title, rangeLabel, t })) {
        setStatus('failed')
        return
      }
      const blob = await toPngBlob(canvas)
      if (!blob) {
        setStatus('failed')
        return
      }
      if (await copyToClipboard(blob)) {
        setStatus('copied')
        return
      }
      downloadBlob(blob, `recap-${story.period.cycleKey.replace(/[^\w.-]+/g, '-')}.png`)
      setStatus('downloaded')
    } catch {
      setStatus('failed')
    } finally {
      setBusy(false)
    }
  }, [rangeLabel, story, t, title])

  const statusMessage =
    status === 'copied'
      ? t('dashboard.recap.share.copied', 'Copied to clipboard')
      : status === 'downloaded'
        ? t('dashboard.recap.share.downloaded', 'Saved as an image')
        : status === 'failed'
          ? t('dashboard.recap.share.failed', 'Could not create the image')
          : ''

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="focus-ring motion-press inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-xs text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ImageDown className="h-3.5 w-3.5" aria-hidden="true" />
        {busy
          ? t('dashboard.recap.share.pending', 'Rendering...')
          : t('dashboard.recap.share.action', 'Share as image')}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={`text-[11px] motion-color ${status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {statusMessage}
      </span>
    </div>
  )
}
