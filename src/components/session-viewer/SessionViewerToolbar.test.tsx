// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

vi.mock('@/transport', () => ({
  isTauri: () => false,
}))

vi.mock('@/components/ui/KbdTooltip', () => ({
  default: ({ children }: any) => children,
}))

vi.mock('./SessionViewerToolbarTitle', () => ({
  default: () => null,
}))

vi.mock('./SessionViewerOnlineStatusBar', () => ({
  default: () => null,
}))

vi.mock('./SessionViewerModelControls', () => ({
  default: () => null,
}))

import SessionViewerToolbar from './SessionViewerToolbar'

afterEach(cleanup)

function baseProps() {
  return {
    isMobile: false,
    title: 'Session',
    messageCount: 1,
    showSidebar: true,
    showThinking: false,
    toolsExpanded: false,
    showScrollMarkers: false,
    isMobileMenuOpen: false,
    isScrollMarkersFeatureEnabled: false,
    isSearchOpen: false,
    onToggleSidebar: vi.fn(),
    onToggleThinking: vi.fn(),
    onToggleToolsExpanded: vi.fn(),
    onOpenSearch: vi.fn(),
    onMobileMenuOpenChange: vi.fn(),
    onOpenSystemPromptDialog: vi.fn(),
    onScrollToTop: vi.fn(),
    onScrollToBottom: vi.fn(),
    onExport: vi.fn(),
  }
}

describe('SessionViewerToolbar system prompt host slot', () => {
  it('uses the built-in System Prompt & Tools control when no plugin takeover is present', () => {
    const props = baseProps()

    render(<SessionViewerToolbar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'System prompt & tools' }))

    expect(props.onOpenSystemPromptDialog).toHaveBeenCalledTimes(1)
  })

  it('replaces the built-in control with plugin-owned rendering', () => {
    const props = baseProps()
    const onPluginClick = vi.fn()

    render(
      <SessionViewerToolbar
        {...props}
        slots={{
          systemPromptTools: (
            <button type="button" onClick={onPluginClick}>
              History prompt
            </button>
          ),
        }}
      />,
    )

    expect(screen.queryByRole('button', { name: 'System prompt & tools' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'History prompt' }))

    expect(onPluginClick).toHaveBeenCalledTimes(1)
    expect(props.onOpenSystemPromptDialog).not.toHaveBeenCalled()
  })
})
