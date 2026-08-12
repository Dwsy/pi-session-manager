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

  it('shows the explorer instead of the dashboard when it is the active main view', () => {
    const result = resolveDesktopMainContent({
      selectedSession: null,
      sidebarMode: 'list',
      standaloneDatasetRuntime: false,
      mainView: 'explorer',
      renderSessionViewer: () => 'session',
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderExplorer: () => 'explorer',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('explorer')
  })

  it('falls back to the dashboard when no explorer renderer is provided', () => {
    const result = resolveDesktopMainContent({
      selectedSession: null,
      sidebarMode: 'list',
      standaloneDatasetRuntime: false,
      mainView: 'explorer',
      renderSessionViewer: () => 'session',
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('dashboard')
  })

  it('keeps the plugin app view ahead of the explorer', () => {
    const result = resolveDesktopMainContent({
      selectedSession: null,
      sidebarMode: 'app',
      standaloneDatasetRuntime: false,
      mainView: 'explorer',
      renderSessionViewer: () => 'session',
      renderAppView: () => 'app',
      renderStandaloneDatasetOverview: () => 'dataset',
      renderExplorer: () => 'explorer',
      renderDashboard: () => 'dashboard',
    })
    expect(result).toBe('app')
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
