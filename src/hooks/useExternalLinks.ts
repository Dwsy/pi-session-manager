import { useEffect } from 'react'
import { invoke, isTauri } from '../transport'

/**
 * 拦截页面中所有外部链接点击，使用系统浏览器打开
 * 防止在 Tauri Webview 中跳转外部网站
 *
 * 桌面模式: 调用 Tauri 命令使用系统浏览器打开
 * 浏览器模式: 直接使用 window.open 在新标签页打开
 */
export function useExternalLinks() {
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      if (!anchor?.href) return

      const href = anchor.href

      // 只处理外部链接 (http:// 或 https://)
      if (href.startsWith('http://') || href.startsWith('https://')) {
        e.preventDefault()

        if (isTauri()) {
          // 桌面模式：调用 Tauri 使用系统浏览器打开
          invoke('open_external_url', { url: href }).catch((err) => {
            console.error('Failed to open external URL:', err)
          })
        } else {
          // 浏览器模式：直接在新标签页打开
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    }

    // 使用捕获阶段，确保先拦截
    document.addEventListener('click', handleLinkClick, true)

    return () => {
      document.removeEventListener('click', handleLinkClick, true)
    }
  }, [])
}
