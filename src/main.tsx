import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import AuthGate from './components/AuthGate'
import { TransportProvider } from './contexts/TransportContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
import './index.css'
import { isTauri } from './transport'

const SETTINGS_CACHE_KEY = 'pi-session-manager-settings'
const LANGUAGE_KEY = 'app-language'
const ONBOARDING_COMPLETED_KEY = 'onboarding-completed'

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function parseCachedSettings(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return asRecord(parsed)
  } catch {
    return {}
  }
}

function shouldBootstrapDemoSettings(): boolean {
  if (import.meta.env.MODE === 'demo') {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  return window.location.pathname.endsWith('/demo.html')
}

function bootstrapDemoSettings(): void {
  try {
    const existing = parseCachedSettings(localStorage.getItem(SETTINGS_CACHE_KEY))
    const next = {
      ...existing,
      language: {
        ...asRecord(existing.language),
        locale: 'en-US',
      },
      advanced: {
        ...asRecord(existing.advanced),
        demoMode: true,
      },
    }
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(next))
    localStorage.setItem(LANGUAGE_KEY, 'en-US')
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
  } catch {
    // Ignore storage failures and continue with runtime defaults.
  }
}

function clearDemoServiceWorkerAndCaches(): void {
  if (typeof window === 'undefined') {
    return
  }

  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister()
        }
      })
      .catch(() => {})
  }

  if ('caches' in window) {
    void caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {})
  }
}

if (shouldBootstrapDemoSettings()) {
  bootstrapDemoSettings()
  clearDemoServiceWorkerAndCaches()
}

// Set titlebar height for Tauri desktop (drag region)
if (isTauri()) {
  document.documentElement.style.setProperty('--titlebar-height', '32px')
}

// Global copy code function
declare global {
  interface Window {
    copyCode: (button: HTMLButtonElement) => void
  }
}

window.copyCode = async (button: HTMLButtonElement) => {
  try {
    // Find code block
    const wrapper = button.closest('.code-block-wrapper')
    if (!wrapper) return
    
    const codeElement = wrapper.querySelector('code')
    if (!codeElement) return
    
    // Get plain text code (without HTML tags)
    const code = codeElement.textContent || ''
    
    // Copy to clipboard
    await navigator.clipboard.writeText(code)
    
    // Update button state
    const textSpan = button.querySelector('.code-copy-text')
    const svg = button.querySelector('svg')
    
    if (textSpan) {
      textSpan.textContent = 'Copied!'
    }
    
    if (svg) {
      svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />'
    }
    
    // Restore after 2 seconds
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
    <ErrorBoundary>
      <AuthGate>
        <TransportProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </TransportProvider>
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>,
)
