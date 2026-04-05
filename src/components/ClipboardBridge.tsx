import { useEffect } from 'react'
import { useClipboard } from '@/hooks/useClipboard'

export default function ClipboardBridge() {
  const { copyText } = useClipboard()

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const button = target.closest('button[data-code-copy="true"]') as HTMLButtonElement | null
      if (!button) {
        return
      }

      const wrapper = button.closest('.code-block-wrapper')
      if (!wrapper) {
        return
      }

      const codeElement = wrapper.querySelector('code')
      if (!codeElement) {
        return
      }

      const code = codeElement.textContent || ''
      void copyText(code)
        .then(() => {
          const textSpan = button.querySelector('.code-copy-text')
          const svg = button.querySelector('svg')

          if (textSpan) {
            textSpan.textContent = 'Copied!'
          }

          if (svg) {
            svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />'
          }

          setTimeout(() => {
            if (textSpan) {
              textSpan.textContent = 'Copy'
            }
            if (svg) {
              svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />'
            }
          }, 2000)
        })
        .catch((err) => {
          console.error('Failed to copy code:', err)
        })
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [copyText])

  return null
}
