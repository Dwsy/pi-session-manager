// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/components/messages/SystemPromptDialog', () => ({
  default: () => null,
}))

vi.mock('@/components/pi-live/PiLiveChatInput', () => ({
  default: () => <div data-testid="chat-input" />,
}))

vi.mock('@/components/session-viewer/SessionViewerMessages', () => ({
  default: () => <div data-testid="messages" />,
}))

vi.mock('@/components/session-viewer/SessionViewerSearchBar', () => ({
  default: () => <div data-testid="search-bar" />,
}))

vi.mock('@/components/session-viewer/SessionViewerSidebar', () => ({
  default: ({ placement, isMobile }: any) => (
    <aside
      data-testid="builtin-left-sidebar"
      data-placement={placement}
      data-mobile={String(isMobile)}
    />
  ),
}))

vi.mock('@/components/session-viewer/SessionViewerToolbar', () => ({
  default: () => <div data-testid="toolbar" />,
}))

import SessionViewerBody from './SessionViewerBody'

afterEach(() => {
  cleanup()
})

function createBodyProps(overrides: Partial<Parameters<typeof SessionViewerBody>[0]> = {}) {
  return {
    showToolExpandIndicator: true,
    previewMode: false,
    previewVariant: 'conversation' as const,
    isMobile: false,
    session: {
      id: 'session-1',
      path: '/tmp/session.jsonl',
      created: '2026-05-24T00:00:00Z',
      modified: '2026-05-24T00:00:00Z',
      message_count: 0,
      first_message: '',
      last_message: '',
      last_message_role: 'assistant' as const,
    },
    entries: [],
    toolbarProps: {} as any,
    forkedFromLabel: 'Forked from',
    isSearchOpen: false,
    searchBarProps: {} as any,
    sidebar: {
      showSidebar: true,
      sidebarWidth: 360,
      isResizing: false,
      activeEntryId: null,
      onCloseSidebar: vi.fn(),
      onNodeClick: vi.fn(),
      onResizeMouseDown: vi.fn(),
      treeRef: createRef(),
      sidebarRef: createRef(),
      resizeHandleRef: createRef(),
      outlineTitle: 'Outline',
      hideSidebarTitle: 'Hide sidebar',
      contentPaddingLeft: '360px',
    },
    messages: {
      messagesRef: createRef(),
      loading: false,
      showLoading: false,
      error: null,
      hasNewMessages: false,
      headerEntry: undefined,
      stats: {} as any,
      renderableEntries: [],
      searchQuery: '',
      currentSearchTarget: null,
      scrollTargetId: null,
      setScrollTargetId: vi.fn(),
      setHasNewMessages: vi.fn(),
      streamingId: null,
      pendingScrollToBottomRef: { current: false },
      expandedToolIds: new Set<string>(),
      sessionDataIsAtBottomRef: { current: false },
      onReachBottom: vi.fn(),
      toolResultByCallId: new Map(),
    },
    scrollMarkers: {
      showScrollMarkers: false,
      scrollMarkers: [],
      activeMarkerId: null,
      markersPanelRef: createRef(),
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onPointerLeave: vi.fn(),
      scrollMarkersEnabled: false,
    },
    panels: {
      showSystemPromptDialog: false,
      onCloseSystemPromptDialog: vi.fn(),
    },
    isLive: false,
    onChatSent: vi.fn(),
    ...overrides,
  }
}

function renderBody(overrides: Partial<Parameters<typeof SessionViewerBody>[0]> = {}) {
  return render(<SessionViewerBody {...createBodyProps(overrides)} />)
}

describe('SessionViewerBody', () => {
  it('renders the built-in desktop session tree as an embedded panel in the stable content stage', () => {
    renderBody({
      layoutSlots: {
        left: <div data-testid="external-left-slot" />,
      },
    })

    const builtinLeft = screen.getByTestId('builtin-left-sidebar')
    const externalLeft = screen.getByTestId('external-left-slot')

    expect(builtinLeft.parentElement).toBe(externalLeft.parentElement)
    expect(builtinLeft.getAttribute('data-placement')).toBe('embedded')
  })

  it('keeps the mobile session tree using overlay placement', () => {
    renderBody({
      isMobile: true,
      layoutSlots: {
        left: <div data-testid="external-left-slot" />,
      },
    })

    const builtinLeft = screen.getByTestId('builtin-left-sidebar')
    const externalLeft = screen.getByTestId('external-left-slot')

    expect(builtinLeft.getAttribute('data-placement')).toBe('overlay')
    expect(builtinLeft.parentElement).toBe(externalLeft.parentElement)
  })

  it('does not render the built-in session tree in plugin main view or preview modes', () => {
    const { rerender } = renderBody({
      mainViewSlot: <div data-testid="plugin-main-view" />,
    })

    expect(screen.queryByTestId('builtin-left-sidebar')).toBeNull()
    expect(screen.getByTestId('plugin-main-view')).not.toBeNull()

    rerender(<SessionViewerBody {...createBodyProps({ previewMode: true })} />)

    expect(screen.queryByTestId('builtin-left-sidebar')).toBeNull()
  })
})
