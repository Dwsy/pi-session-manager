import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import AuthGate from './components/AuthGate'
import { TransportProvider } from './contexts/TransportContext'
import { SettingsProvider } from './contexts/SettingsContext'
import './i18n'
import './index.css'
import { isTauri } from './transport'

// Set titlebar height for Tauri desktop (drag region)
if (isTauri()) {
  document.documentElement.style.setProperty('--titlebar-height', '32px')
}

// 全局复制代码函数
declare global {
  interface Window {
    copyCode: (button: HTMLButtonElement) => void
  }
}

window.copyCode = async (button: HTMLButtonElement) => {
  try {
    // 找到代码块
    const wrapper = button.closest('.code-block-wrapper')
    if (!wrapper) return
    
    const codeElement = wrapper.querySelector('code')
    if (!codeElement) return
    
    // 获取纯文本代码（不包含 HTML 标签）
    const code = codeElement.textContent || ''
    
    // 复制到剪贴板
    await navigator.clipboard.writeText(code)
    
    // 更新按钮状态
    const textSpan = button.querySelector('.code-copy-text')
    const svg = button.querySelector('svg')
    
    if (textSpan) {
      textSpan.textContent = 'Copied!'
    }
    
    if (svg) {
      svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />'
    }
    
    // 2秒后恢复
    setTimeout(() => {
      if (textSpan) {
        textSpan.textContent = 'Copy'
      }
      if (svg) {
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />'
      }
    }, 2000)
  } catch (err) {
    console.error('Failed to copy code:', err)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <TransportProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </TransportProvider>
    </AuthGate>
  </React.StrictMode>,
)