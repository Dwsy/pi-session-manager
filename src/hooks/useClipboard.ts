import { useCallback } from 'react'
import i18n from '@/i18n'

/** Lightweight DOM toast — no deps needed */
function showToast(message: string, success: boolean = true): void {
  if (typeof document === 'undefined') return

  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 10000;
    padding: 10px 18px; border-radius: 10px; color: #fff;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    background: ${success ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)'};
    backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    pointer-events: none; user-select: none;
    opacity: 0; transform: translateY(8px) scale(0.96);
    transition: opacity 0.25s ease, transform 0.25s ease;
  `
  document.body.appendChild(el)
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0) scale(1)'
  })
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(8px) scale(0.96)'
    setTimeout(() => el.remove(), 250)
  }, 2000)
}

function fallbackCopyText(text: string): void {
  if (typeof document === 'undefined') {
    throw new Error('Clipboard API is unavailable in this environment')
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.top = '-9999px'
  textArea.style.opacity = '0'

  document.body.appendChild(textArea)

  try {
    textArea.focus()
    textArea.select()
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('Fallback copy command failed')
    }
  } finally {
    document.body.removeChild(textArea)
  }
}

export function useClipboard() {
  const copyText = useCallback(async (text: string): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        fallbackCopyText(text)
      }
      showToast(i18n.t('common.copied', 'Copied to clipboard'), true)
    } catch (err) {
      showToast(i18n.t('common.copyFailed', 'Copy failed') + ': ' + (err instanceof Error ? err.message : String(err)), false)
      throw err
    }
  }, [])

  const readText = useCallback(async (): Promise<string> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      return navigator.clipboard.readText()
    }

    throw new Error('Clipboard read is unavailable in this environment')
  }, [])

  return {
    copyText,
    readText,
  }
}
