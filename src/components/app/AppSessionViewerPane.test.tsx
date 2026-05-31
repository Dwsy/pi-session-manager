// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const panelRenderSpy = vi.fn()
const mainViewRenderSpy = vi.fn()
const mockViewerController = {
  revealEntry: vi.fn(),
  revealToolCall: vi.fn(),
}

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    getSessionSetting: () => true,
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
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
      {
        id: 'test.bottom.toolbar',
        pluginId: 'test.plugin',
        title: 'Test Bottom',
        panelId: 'test.bottom.panel',
        render: (props: any) => (
          <button type="button" onClick={props.togglePanel} data-testid="plugin-bottom-toggle">
            bottom
          </button>
        ),
      },
      {
        id: 'test.main.toolbar',
        pluginId: 'test.plugin',
        title: 'Test Main',
        mainViewId: 'test.main',
        render: (props: any) => (
          <button type="button" onClick={props.toggleMainView} data-testid="plugin-main-toggle">
            main
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
      {
        id: 'test.bottom.panel',
        pluginId: 'test.plugin',
        title: 'Test Bottom',
        side: 'bottom',
        render: (props: any) => <div data-testid="plugin-bottom-panel">{props.activeEntryId ?? 'none'}</div>,
      },
    ],
    treeViews: [],
    mainViews: [
      {
        id: 'test.main',
        pluginId: 'test.plugin',
        title: 'Main',
        render: (props: any) => {
          mainViewRenderSpy(props)
          return <div data-testid="plugin-main-view">{props.activeEntryId ?? 'none'}</div>
        },
      },
    ],
  }),
}))

vi.mock('@/components/SessionViewer', () => ({
  default: ({ slots, layoutSlots, mainViewSlot, onActiveEntryIdChange, onViewerControllerChange }: any) => {
    onActiveEntryIdChange?.('entry-42')
    onViewerControllerChange?.(mockViewerController)
    return (
      <div>
        {slots?.right}
        {mainViewSlot}
        {layoutSlots?.right}
        {layoutSlots?.bottom}
      </div>
    )
  },
}))

import AppSessionViewerPane from './AppSessionViewerPane'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

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

    fireEvent.click(await screen.findByRole('button', { name: 'Right panel buttons' }))
    fireEvent.click(await screen.findByRole('button', { name: /Test Toolbar/ }))

    expect((await screen.findByTestId('plugin-panel')).textContent).toBe('entry-42')
    expect(document.querySelector('.psm-session-right-feature-panel__grid')).toBeNull()
    expect(panelRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEntryId: 'entry-42',
        panelOpen: true,
        viewer: mockViewerController,
      }),
    )
  })

  it('renders feature toggles in the session toolbar by default', async () => {
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

    expect(await screen.findByRole('button', { name: 'Right panel buttons' })).not.toBeNull()
    expect(await screen.findByRole('button', { name: 'Test Bottom' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Test Toolbar/ })).toBeNull()
  })

  it('expands right panel actions as a feature grid', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Right panel buttons' }))

    expect((await screen.findByRole('button', { name: /Test Toolbar/ })).closest('.psm-session-right-feature-panel__grid')).not.toBeNull()
  })

  it('resizes the right feature panel with the resize handle', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Right panel buttons' }))
    const handle = await screen.findByRole('separator', { name: 'Resize right panel' })
    fireEvent.pointerDown(handle, { button: 0, clientX: 500 })
    fireEvent.pointerMove(window, { clientX: 400 })
    fireEvent.pointerUp(window)

    expect(document.querySelector<HTMLElement>('.psm-session-right-feature-panel')?.style.width).toBe('530px')
  })

  it('opens a bottom plugin panel from its separate toolbar item', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Test Bottom' }))

    expect((await screen.findByTestId('plugin-bottom-panel')).textContent).toBe('entry-42')
  })

  it('closes the bottom tray after selecting the terminal feature', async () => {
    const onToggleTerminalFeature = vi.fn()

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
        terminalFeatureEnabled
        onToggleTerminalFeature={onToggleTerminalFeature}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Session features' }))
    fireEvent.click(await screen.findByRole('button', { name: /Terminal/ }))

    expect(onToggleTerminalFeature).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.psm-session-bottom-features__grid')).toBeNull()
  })

  it('opens plugin session main view from toolbar item', async () => {
    mainViewRenderSpy.mockClear()

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

    fireEvent.click(await screen.findByTestId('plugin-main-toggle'))

    expect((await screen.findByTestId('plugin-main-view')).textContent).toBe('entry-42')
    expect(mainViewRenderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        activeEntryId: 'entry-42',
        mainViewOpen: true,
        viewer: mockViewerController,
      }),
    )
  })
})
