import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import AuthGate from './components/AuthGate'
import { TransportProvider } from './contexts/TransportContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import ClipboardBridge from './components/ClipboardBridge'
import {
  bootstrapStandaloneDatasetSettings,
  isStandaloneDatasetRuntime,
} from './browser-dataset'
import './i18n'
import './styles/index.less'
import { isTauri } from './transport'
import { detectPlatform, isMacPlatform } from './utils/platform'

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

function shouldBootstrapStandaloneDatasetSettings(): boolean {
  return isStandaloneDatasetRuntime()
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

if (shouldBootstrapStandaloneDatasetSettings()) {
  bootstrapStandaloneDatasetSettings()
  clearDemoServiceWorkerAndCaches()
}

// Set titlebar height for Tauri desktop (drag region) and clear macOS native title overlay
if (isTauri()) {
  document.documentElement.style.setProperty('--titlebar-height', '32px')
  document.documentElement.dataset.os = detectPlatform()
  if (isMacPlatform()) {
    document.title = ''
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <AuthGate>
          <TransportProvider>
            <SettingsProvider>
              <ClipboardBridge />
              <App />
            </SettingsProvider>
          </TransportProvider>
        </AuthGate>
      </ErrorBoundary>
    </HashRouter>
  </React.StrictMode>,
)
