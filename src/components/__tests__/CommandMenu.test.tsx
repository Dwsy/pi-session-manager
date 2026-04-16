import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import i18n from '../../i18n'
import CommandMenu from '../command/CommandMenu'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'
import { useSearchPlugins } from '@/hooks/useSearchPlugins'

const mockSearch = vi.fn()
const mockPluginSearch = vi.fn()
const mockPluginOnSelect = vi.fn()
const mockSetFTSOptions = vi.fn()

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

function createRegistry() {
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
    mockSearch.mockResolvedValue([])
    mockPluginSearch.mockResolvedValue([])
    vi.mocked(useSearchPlugins).mockReturnValue({
      registry: createRegistry() as any,
      search: mockSearch,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('runs labels-only browse mode with an empty query and shows the labels empty state', async () => {
    render(<CommandMenuHarness initialSourceFilter="labels_only" />)

    await flushSearchDebounce()

    expect(mockPluginSearch).toHaveBeenCalledWith('', expect.objectContaining({
      searchCurrentProjectOnly: false,
    }))
    expect(mockSearch).not.toHaveBeenCalled()
    expect(mockSetFTSOptions).toHaveBeenCalledWith(expect.objectContaining({
      sourceFilter: 'labels_only',
    }))
    expect(screen.getByPlaceholderText('Browse all labels...')).not.toBeNull()
    expect(screen.queryByText('Search tips')).toBeNull()
  })

  it('normalizes a leading # token, scopes all-tab non-all searches to messages, and shows label badges', async () => {
    mockSearch.mockResolvedValue([createMessageResult()])

    render(<CommandMenuHarness />)

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: '#labels important' },
    })

    await flushSearchDebounce()

    expect(mockSearch).toHaveBeenCalledWith(
      'important',
      expect.objectContaining({
        pluginIds: ['message-search'],
        cacheKeyParts: expect.arrayContaining(['all', 'labels_only']),
      }),
    )
    expect(mockSetFTSOptions).toHaveBeenCalledWith(expect.objectContaining({
      sourceFilter: 'labels_only',
    }))
    expect(screen.getByText('Alpha')).not.toBeNull()
    expect(screen.getAllByText('label').length).toBeGreaterThan(0)
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

  it('shows # autocomplete suggestions and applies the chosen source token', () => {
    render(<CommandMenuHarness />)

    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement
    fireEvent.change(input, { target: { value: '#la' } })
    fireEvent.click(screen.getByRole('button', { name: /#labels/i }))

    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('#labels ')
    expect(screen.queryByRole('button', { name: /#labels/i })).toBeNull()
  })

  it('does not inject # tokens when changing the source filter from the selector', () => {
    render(<CommandMenuHarness initialQuery="important" />)

    fireEvent.click(screen.getByRole('button', { name: 'Labels' }))

    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('important')
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
