import { useCallback } from 'react'

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
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    fallbackCopyText(text)
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
