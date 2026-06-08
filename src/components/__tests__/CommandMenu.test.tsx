// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import i18n from '../../i18n'
import CommandMenu from '../command/CommandMenu'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import type {
  MessageSearchPageResult,
  MessageSearchPluginOptions,
} from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'
import { useSearchPlugins } from '@/hooks/useSearchPlugins'
import type { CommandPaletteMode } from '../command/commandActions'
import type { TabType } from '../command/utils'

const mockSearch = vi.fn()
const mockPluginSearch = vi.fn()
const mockPluginSearchPage = vi.fn()
const mockPluginOnSelect = vi.fn()
const mockSetFTSOptions = vi.fn()
const mockPluginIsEnabled = vi.fn()
const mockIntersectionObservers: Array<{
  active: boolean
  callback: IntersectionObserverCallback
}> = []

vi.mock('@/hooks/useSearchPlugins', () => ({
  useSearchPlugins: vi.fn(),
}))

vi.mock('../command/SessionPreviewPanel', () => ({
  default: () => <div data-testid="session-preview-panel" />,
}))

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
    t: i18n.t.bind(i18n),
  }
}

function createMessageResult(overrides: Partial<SearchPluginResult> = {}): SearchPluginResult {
  return {
    id: 'session-1-entry-1',
    pluginId: 'message-search',
    title: 'Alpha',
    subtitle: 'Project Alpha · s1 · /tmp/session.jsonl',
    description: 'User · today',
    icon: <Search className="w-4 h-4" />,
    score: 42,
    metadata: {
      role: 'user',
      timestamp: '2026-04-09T10:00:00Z',
      snippetLines: ['Important label hit'],
      matchReason: 'label',
    },
    ...overrides,
  }
}

function createPageResult(
  results: SearchPluginResult[],
  totalHits = results.length,
  hasMore = false,
): MessageSearchPageResult {
  return {
    results,
    pagination: {
      totalHits,
      hasMore,
    },
  }
}

function createRegistry(messagePluginOverrides: Record<string, unknown> | null = {}) {
  if (messagePluginOverrides === null) return new Map()

  const messagePlugin = {
    id: 'message-search',
    name: 'Message Search',
    description: 'Search messages',
    icon: Search,
    keywords: ['message'],
    priority: 80,
    search: mockPluginSearch,
    onSelect: mockPluginOnSelect,
    setFTSOptions: mockSetFTSOptions,
    searchPage: mockPluginSearchPage,
    isEnabled: mockPluginIsEnabled,
    renderItem: (result: SearchPluginResult) => (
      <div>
        <div>{result.title}</div>
        {(result.metadata as any)?.snippetLines?.map((line: string, i: number) => (
          <p key={i}>{line}</p>
        ))}
        {(result.metadata as any)?.matchReason === 'label' && (
          <span>label</span>
        )}
      </div>
    ),
    ...messagePluginOverrides,
  }

  return new Map([
    ['message-search', messagePlugin],
  ])
}

function CommandMenuHarness({
  initialQuery = '',
  initialResults = [],
  initialSourceFilter = 'all',
}: {
  initialQuery?: string
  initialResults?: SearchPluginResult[]
  initialSourceFilter?: FullTextSearchSourceFilter
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchPluginResult[]>(initialResults)
  const [isSearching, setIsSearching] = useState(false)
  const context = useMemo(() => createContext(), [])
  const onClose = useMemo(() => vi.fn(), [])
  const setSearchCurrentProjectOnly = useMemo(() => vi.fn(), [])
  const [ftsOptions, setFtsOptions] = useState<MessageSearchPluginOptions>({
    ftsMode: true,
    roleFilter: 'all',
    sourceFilter: initialSourceFilter,
    globPattern: undefined,
    sortMode: 'newest',
    page: 0,
    pageSize: 20,
  })
  const [selectedResult, setSelectedResult] = useState<SearchPluginResult | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [mode, setMode] = useState<CommandPaletteMode>('search')
  const registryRef = useRef<any>(null)

  return (
    <I18nextProvider i18n={i18n}>
      <CommandMenu
        query={query}
        setQuery={setQuery}
        results={results}
        setResults={setResults}
        isSearching={isSearching}
        setIsSearching={setIsSearching}
        context={context}
        onClose={onClose}
        searchCurrentProjectOnly={false}
        setSearchCurrentProjectOnly={setSearchCurrentProjectOnly}
        ftsOptions={ftsOptions}
        setFtsOptions={setFtsOptions}
        selectedResult={selectedResult}
        setSelectedResult={setSelectedResult}
        registryRef={registryRef}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={mode}
        setMode={setMode}
      />
    </I18nextProvider>
  )
}

async function flushSearchDebounce() {
  await vi.advanceTimersByTimeAsync(250)
  await Promise.resolve()
}

describe('CommandMenu source filter wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockIntersectionObservers.length = 0
    vi.stubGlobal('IntersectionObserver', vi.fn(function IntersectionObserverMock(
      callback: IntersectionObserverCallback,
    ) {
      const observer = {
        active: true,
        callback,
      }
      mockIntersectionObservers.push(observer)

      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(() => {
          observer.active = false
        }),
        takeRecords: vi.fn(() => []),
      }
    }))
    mockSearch.mockResolvedValue([])
    mockPluginSearch.mockResolvedValue([])
    mockPluginSearchPage.mockResolvedValue(createPageResult([]))
    mockPluginIsEnabled.mockReturnValue(true)
    vi.mocked(useSearchPlugins).mockReturnValue({
      registry: createRegistry() as any,
      search: mockSearch,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('runs labels-only browse mode with an empty query and shows the labels empty state', async () => {
    render(<CommandMenuHarness initialSourceFilter="labels_only" />)

    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'labels_only',
        page: 0,
      }),
    )
    expect(mockSearch).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Browse all labels...')).not.toBeNull()
    expect(screen.queryByText('Search tips')).toBeNull()
  })

  it('normalizes a leading #labels token, routes directly to the message plugin, and shows label badges', async () => {
    mockPluginSearchPage.mockResolvedValue(createPageResult([createMessageResult()]))

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenCalledWith(
      'important',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'labels_only',
        page: 0,
      }),
    )
    expect(mockSearch).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha')).not.toBeNull()
    expect(screen.getAllByText('label').length).toBeGreaterThan(0)
  })

  it('keeps source-filter All on registry search without load-more UI', async () => {
    mockSearch.mockResolvedValue([createMessageResult()])

    render(<CommandMenuHarness initialQuery="important" />)

    await flushSearchDebounce()

    expect(mockSearch).toHaveBeenCalledWith(
      'important',
      expect.objectContaining({
        cacheKeyParts: expect.arrayContaining(['all']),
      }),
    )
    expect(mockPluginSearchPage).not.toHaveBeenCalled()
    expect(screen.getByText('Alpha')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
  })

  it('routes source-filtered content searches directly to the message plugin', async () => {
    mockPluginSearchPage.mockResolvedValue(createPageResult([
      createMessageResult({
        id: 'content-result-1',
        title: 'Content hit',
        metadata: {
          role: 'assistant',
          timestamp: '2026-04-09T10:00:00Z',
          snippetLines: ['Important content hit'],
          matchReason: 'content',
        },
      }),
    ]))

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#content important' },
    })

    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenCalledWith(
      'important',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'content_only',
        page: 0,
      }),
    )
    expect(mockSearch).not.toHaveBeenCalled()
    expect(screen.getByText('Content hit')).not.toBeNull()
    expect(screen.getByText('Important content hit')).not.toBeNull()
  })

  it('shows an explicit error when source-filtered message search is unavailable', async () => {
    vi.mocked(useSearchPlugins).mockReturnValue({
      registry: createRegistry(null) as any,
      search: mockSearch,
    })

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(mockPluginSearchPage).not.toHaveBeenCalled()
    expect(screen.getByText('Message search plugin does not support paginated source-filtered search')).not.toBeNull()
  })

  it('respects disabled message search for source-filtered pagination', async () => {
    mockPluginIsEnabled.mockReturnValue(false)

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(mockPluginSearchPage).not.toHaveBeenCalled()
    expect(screen.getByText('Message search is unavailable in the current context')).not.toBeNull()
  })

  it('loads the next source-filtered labels page and appends results', async () => {
    let requestIndex = 0
    mockPluginSearchPage.mockImplementation(async () => {
      requestIndex += 1
      if (requestIndex === 1) {
        return createPageResult([
          createMessageResult({ id: 'label-result-1', title: 'Label hit 1' }),
          createMessageResult({ id: 'label-result-2', title: 'Label hit 2' }),
        ], 5, true)
      }

      return createPageResult([
        createMessageResult({ id: 'label-result-3', title: 'Label hit 3' }),
        createMessageResult({ id: 'label-result-4', title: 'Label hit 4' }),
      ], 5, false)
    })

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(screen.getByText('Showing 2 of 5')).not.toBeNull()
    expect(screen.getByText('Load more (3 remaining)')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenLastCalledWith(
      'important',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'labels_only',
        page: 1,
      }),
    )
    expect(screen.getByText('Showing 4 of 5')).not.toBeNull()
    expect(screen.getByText('Label hit 1')).not.toBeNull()
    expect(screen.getByText('Label hit 4')).not.toBeNull()
  })

  it('loads more when the intersection sentinel is reached', async () => {
    let requestIndex = 0
    mockPluginSearchPage.mockImplementation(async () => {
      requestIndex += 1
      if (requestIndex === 1) {
        return createPageResult([
          createMessageResult({ id: 'label-result-1', title: 'Label hit 1' }),
          createMessageResult({ id: 'label-result-2', title: 'Label hit 2' }),
        ], 4, true)
      }

      return createPageResult([
        createMessageResult({ id: 'label-result-3', title: 'Label hit 3' }),
        createMessageResult({ id: 'label-result-4', title: 'Label hit 4' }),
      ], 4, false)
    })

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    for (const observer of mockIntersectionObservers.filter((observer) => observer.active)) {
      observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenLastCalledWith(
      'important',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'labels_only',
        page: 1,
      }),
    )
    expect(screen.getByText('Showing 4 of 4')).not.toBeNull()
  })

  it('does not auto-retry load more failures from the intersection sentinel', async () => {
    let requestIndex = 0
    mockPluginSearchPage.mockImplementation(async () => {
      requestIndex += 1
      if (requestIndex === 1) {
        return createPageResult([
          createMessageResult({ id: 'label-result-1', title: 'Label hit 1' }),
        ], 3, true)
      }
      if (requestIndex === 2) {
        throw new Error('Backend unavailable')
      }

      return createPageResult([
        createMessageResult({ id: 'label-result-2', title: 'Label hit 2' }),
      ], 3, false)
    })

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(screen.getByText('Load more (2 remaining)')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await flushSearchDebounce()

    expect(screen.getByText('Backend unavailable')).not.toBeNull()
    const callsAfterFailure = mockPluginSearchPage.mock.calls.length

    for (const observer of mockIntersectionObservers.filter((observer) => observer.active)) {
      observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
    await Promise.resolve()

    expect(mockPluginSearchPage).toHaveBeenCalledTimes(callsAfterFailure)

    fireEvent.click(screen.getByRole('button', { name: 'Retry load more' }))
    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenCalledTimes(callsAfterFailure + 1)
    expect(screen.getByText('Label hit 2')).not.toBeNull()
  })

  it('preserves loaded labels results and retries when load more fails', async () => {
    let requestIndex = 0
    mockPluginSearchPage.mockImplementation(async () => {
      requestIndex += 1
      if (requestIndex === 1) {
        return createPageResult([
          createMessageResult({ id: 'label-result-1', title: 'Label hit 1' }),
        ], 3, true)
      }
      if (requestIndex === 2) {
        throw new Error('Backend unavailable')
      }

      return createPageResult([
        createMessageResult({ id: 'label-result-2', title: 'Label hit 2' }),
      ], 3, false)
    })

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(screen.getByText('Load more (2 remaining)')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await flushSearchDebounce()

    expect(screen.getByText('Label hit 1')).not.toBeNull()
    expect(screen.getByText('Backend unavailable')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry load more' }))
    await flushSearchDebounce()

    expect(mockPluginSearchPage).toHaveBeenLastCalledWith(
      'important',
      expect.objectContaining({
        searchCurrentProjectOnly: false,
      }),
      expect.objectContaining({
        sourceFilter: 'labels_only',
        page: 1,
      }),
    )
    expect(screen.getByText('Showing 2 of 3')).not.toBeNull()
    expect(screen.getByText('Label hit 2')).not.toBeNull()
    expect(screen.queryByText('Backend unavailable')).toBeNull()
  })

  it('does not treat source tokens as message filter syntax on non-message tabs', async () => {
    render(<CommandMenuHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }))
    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(mockSearch).toHaveBeenCalledWith(
      '#labels important',
      expect.objectContaining({
        cacheKeyParts: expect.arrayContaining(['session']),
      }),
    )
    expect(screen.queryByRole('button', { name: /#labels/i })).toBeNull()
    expect(mockSetFTSOptions).toHaveBeenCalledWith(expect.objectContaining({
      sourceFilter: 'all',
    }))
  })

  it('shows # autocomplete suggestions and applies the chosen source token', async () => {
    render(<CommandMenuHarness />)

    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement
    fireEvent.change(input, { target: { value: '#la' } })
    fireEvent.click(screen.getByRole('button', { name: /#labels/i }))

    await Promise.resolve()
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('#labels ')
    expect(screen.queryByRole('button', { name: /#labels/i })).toBeNull()
  })

  it('does not inject # tokens when changing the source filter from the selector', () => {
    render(<CommandMenuHarness initialQuery="important" />)

    fireEvent.click(screen.getByRole('button', { name: 'Labels' }))

    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('important')
  })

  it('does not restore a persisted collapsed preview state', () => {
    localStorage.setItem('command-preview-collapsed', 'true')

    render(<CommandMenuHarness />)

    expect(screen.getByTestId('session-preview-panel')).not.toBeNull()
    localStorage.removeItem('command-preview-collapsed')
  })

  it('renders Chinese search results correctly', async () => {
    mockSearch.mockResolvedValue([
      createMessageResult({
        id: 'zh-result-1',
        title: '中文测试会话',
        metadata: {
          role: 'assistant',
          timestamp: '2026-04-09T10:00:00Z',
          snippetLines: ['这是一个内置默认的测试句子'],
          matchReason: 'content',
        },
      }),
    ])

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '内置默认' },
    })

    await flushSearchDebounce()

    expect(mockSearch).toHaveBeenCalledWith(
      '内置默认',
      expect.objectContaining({
        cacheKeyParts: expect.arrayContaining(['all']),
      }),
    )
    expect(screen.getByText('中文测试会话')).not.toBeNull()
    expect(screen.getByText('这是一个内置默认的测试句子')).not.toBeNull()
  })
})
