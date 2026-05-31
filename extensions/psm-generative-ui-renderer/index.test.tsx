// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { activate, manifest } from './index'

afterEach(() => {
  cleanup()
})

describe('psm-generative-ui-renderer plugin', () => {
  it('registers Widgets toolbar/panel and supports reveal plus popup open', async () => {
    const registerSessionToolbarItem = vi.fn()
    const registerSessionPanel = vi.fn()
    const registerToolRenderer = vi.fn()
    const readEntries = vi.fn().mockResolvedValue([
      {
        type: 'message',
        id: 'assistant-1',
        timestamp: '2026-05-27T10:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: 'call-widget',
              name: 'show_widget',
              arguments: {
                title: 'Dashboard Widget',
                widget_code: '<div>hello widget</div>',
                width: 880,
                height: 420,
              },
            },
          ],
        },
      },
    ])
    const openWindow = vi.fn().mockResolvedValue({ id: 'window-1', close: vi.fn() })
    const viewer = {
      revealEntry: vi.fn(),
      revealToolCall: vi.fn(),
    }

    activate({
      manifest,
      psm: {
        sessions: { readEntries },
        widgets: { list: vi.fn(), get: vi.fn(), readHtml: vi.fn() },
        windows: { open: openWindow },
      },
      permissions: { pluginId: manifest.id, permissions: manifest.permissions },
      events: { subscribe: vi.fn() },
      settings: { get: vi.fn((_key, fallback) => fallback), all: vi.fn(() => ({})) },
      i18n: { language: 'zh-CN', t: vi.fn((_key, fallback) => fallback ?? _key) },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
      ui: {
        registerAppView: vi.fn(),
        registerAppSidebarView: vi.fn(),
        registerSessionToolbarItem,
        registerSessionPanel,
        registerSessionTreeView: vi.fn(),
        registerSessionMainView: vi.fn(),
        registerToolRenderer,
      },
    } as never)

    expect(manifest.permissions).toEqual(['sessions:read', 'fs:read', 'windows:open'])
    expect(registerToolRenderer).toHaveBeenCalledTimes(1)
    expect(registerSessionToolbarItem).toHaveBeenCalledWith(expect.objectContaining({
      id: 'builtin.generative-ui-renderer.toolbar',
      panelId: 'builtin.generative-ui-renderer.panel',
    }))
    expect(registerSessionPanel).toHaveBeenCalledWith(expect.objectContaining({
      id: 'builtin.generative-ui-renderer.panel',
      side: 'right',
    }))

    const panel = registerSessionPanel.mock.calls[0][0]
    render(panel.render({
      session: { path: '/tmp/session.jsonl', id: 'session-1', name: 'Test Session' },
      panelOpen: true,
      closePanel: vi.fn(),
      viewer,
      activeEntryId: null,
    }))

    await screen.findByText('Dashboard Widget')
    expect(readEntries).toHaveBeenCalledWith('/tmp/session.jsonl')

    fireEvent.click(screen.getByRole('button', { name: /Dashboard Widget/i }))
    expect(viewer.revealToolCall).toHaveBeenCalledWith('call-widget', { expand: true, align: 'center' })

    fireEvent.click(screen.getByRole('button', { name: '在新窗口打开' }))
    await waitFor(() => {
      expect(openWindow).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Dashboard Widget',
        html: '<div>hello widget</div>',
        width: 880,
        height: 420,
        floating: true,
      }))
    })
  })
})
