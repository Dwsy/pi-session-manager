// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'

const mockUseCommandMenu = vi.fn()
const capturedProps: Array<any> = []

vi.mock('@/hooks/useCommandMenu', () => ({
  useCommandMenu: () => mockUseCommandMenu(),
}))

vi.mock('../command/CommandMenu', () => ({
  default: (props: any) => {
    capturedProps.push(props)
    return <div data-testid="command-menu-proxy" />
  },
}))

import CommandPalette from '../command/CommandPalette'

function createContext(): SearchContext {
  return {
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    searchCurrentProjectOnly: false,
    setSelectedSession: vi.fn(),
    setSelectedProject: vi.fn(),
    closeCommandMenu: vi.fn(),
    setPendingScrollEntryId: vi.fn(),
  }
}

function createResult(id: string): SearchPluginResult {
  return {
    id,
    pluginId: 'message-search',
    title: id,
    score: 1,
    metadata: {},
  }
}

function createMenuState(results: SearchPluginResult[]) {
  return {
    isOpen: true,
    open: vi.fn(),
    close: vi.fn(),
    query: '',
    setQuery: vi.fn(),
    results,
    setResults: vi.fn(),
    isSearching: false,
    setIsSearching: vi.fn(),
  }
}

describe('CommandPalette page size defaults', () => {
  beforeEach(() => {
    capturedProps.length = 0
    mockUseCommandMenu.mockReturnValue(createMenuState([]))
  })

  it('uses a 20-result default page size for Cmd+K search', () => {
    render(<CommandPalette context={createContext()} />)

    expect(screen.getByTestId('command-menu-proxy')).not.toBeNull()
    expect(capturedProps.at(-1)?.ftsOptions?.pageSize).toBe(20)
  })

  it('keeps the selected preview result when paginated results are appended', async () => {
    const first = createResult('first')
    const second = createResult('second')
    const third = createResult('third')
    let menuState = createMenuState([first, second])
    mockUseCommandMenu.mockImplementation(() => menuState)

    const { rerender } = render(<CommandPalette context={createContext()} />)

    await waitFor(() => {
      expect(capturedProps.at(-1)?.selectedResult?.id).toBe('first')
    })

    act(() => {
      capturedProps.at(-1)?.setSelectedResult(second)
    })

    await waitFor(() => {
      expect(capturedProps.at(-1)?.selectedResult?.id).toBe('second')
    })

    menuState = createMenuState([first, second, third])
    rerender(<CommandPalette context={createContext()} />)

    await waitFor(() => {
      expect(capturedProps.at(-1)?.selectedResult?.id).toBe('second')
    })
  })
})
