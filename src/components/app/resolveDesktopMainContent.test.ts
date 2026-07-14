import { describe, expect, it, vi } from 'vitest'

import { resolveDesktopMainContent } from './resolveDesktopMainContent'

describe('resolveDesktopMainContent', () => {
  it('keeps session viewer when a session is selected', () => {
    const renderSessionViewer = vi.fn(() => 'session')
    const result = resolveDesktopMainContent({
      selectedSession: { path: '/tmp/a.jsonl' } as any,
      sidebarMode: 'app',
      standaloneDatasetRuntime: false,
      renderSessionViewer,
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('session')
    expect(renderSessionViewer).toHaveBeenCalled()
  })

  it('keeps dashboard when app view requests keep main content', () => {
    const result = resolveDesktopMainContent({
      selectedSession: null,
      sidebarMode: 'app',
      standaloneDatasetRuntime: false,
      keepMainContent: true,
      renderSessionViewer: () => 'session',
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('dashboard')
  })

  it('shows app view when main content should be replaced', () => {
    const result = resolveDesktopMainContent({
      selectedSession: null,
      sidebarMode: 'app',
      standaloneDatasetRuntime: false,
      keepMainContent: false,
      renderSessionViewer: () => 'session',
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('app')
  })
})
