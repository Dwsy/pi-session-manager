import { describe, expect, it, vi } from 'vitest'

import activate from './index'

function createPluginContext() {
  const appViews: any[] = []
  const appSidebarViews: any[] = []

  const ctx = {
    i18n: {
      language: 'en-US',
      t: (_key: string, fallback: string) => fallback,
    },
    settings: {
      all: () => ({}),
    },
    psm: {},
    ui: {
      registerAppView: (view: any) => appViews.push(view),
      registerAppSidebarView: (view: any) => appSidebarViews.push(view),
    },
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
  }

  activate(ctx as any)
  return { appViews, appSidebarViews }
}

describe('day insights plugin', () => {
  it('does not register full-screen app or sidebar views', () => {
    const { appViews, appSidebarViews } = createPluginContext()

    expect(appViews).toHaveLength(0)
    expect(appSidebarViews).toHaveLength(0)
  })
})
