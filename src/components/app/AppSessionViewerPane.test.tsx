// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const panelRenderSpy = vi.fn()

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    getSessionSetting: () => true,
  }),
}))

vi.mock('@/plugins/runtime-host', () => ({
  PluginContributionBoundary: ({ children }: any) => children,
  PluginContributionSlot: ({ render }: any) => render(),
  usePsmPluginSessionUi: () => ({
    toolbarItems: [
      {
        id: 'test.toolbar',
        pluginId: 'test.plugin',
        title: 'Test Toolbar',
        panelId: 'test.panel',
        render: (props: any) => (
          <button type="button" onClick={props.togglePanel} data-testid="plugin-toggle">
            open
          </button>
        ),
      },
    ],
    panels: [
      {
        id: 'test.panel',
        pluginId: 'test.plugin',
        title: 'Test',
        side: 'right',
        render: (props: any) => {
          panelRenderSpy(props)
          return <div data-testid="plugin-panel">{props.activeEntryId ?? 'none'}</div>
        },
      },
    ],
  }),
}))

vi.mock('@/components/SessionViewer', () => ({
  default: ({ slots, layoutSlots, onActiveEntryIdChange }: any) => {
    onActiveEntryIdChange?.('entry-42')
    return (
      <div>
        {slots?.right}
        {layoutSlots?.right}
      </div>
    )
  },
}))

import AppSessionViewerPane from './AppSessionViewerPane'

describe('AppSessionViewerPane', () => {
  it('passes activeEntryId into plugin session panel render props', async () => {
    panelRenderSpy.mockClear()

    render(
      <AppSessionViewerPane
        session={{
          id: 'session-1',
          path: '/tmp/session.jsonl',
          cwd: '/tmp',
          created: '2026-05-23T00:00:00Z',
          modified: '2026-05-23T00:00:00Z',
          message_count: 0,
          first_message: '',
          last_message: '',
          last_message_role: 'assistant',
          model: 'claude-4',
        }}
        onExport={() => {}}
        slots={{}}
      />,
    )

    fireEvent.click(await screen.findByTestId('plugin-toggle'))

    expect((await screen.findByTestId('plugin-panel')).textContent).toBe('entry-42')
    expect(panelRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEntryId: 'entry-42',
        panelOpen: true,
      }),
    )
  })
})
