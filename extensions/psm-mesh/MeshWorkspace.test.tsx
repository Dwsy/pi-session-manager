// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PsmMeshPeer, PsmPluginHostContext } from '@dwsy/plugin-sdk'
import type { SessionInfo } from '@/types'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import MeshWorkspace from './MeshWorkspace'
import { createMeshStore } from './meshStore'

vi.mock('@/plugins/runtime-host/usePsmPluginSessionUi', () => ({
  usePsmPluginSessionUi: () => ({ sessionContextMenuActions: [], toolbarItems: [] }),
}))

const live = vi.hoisted(() => ({ prompt: vi.fn(), steer: vi.fn(), followUp: vi.fn(), abort: vi.fn(), getCommands: vi.fn() }))
vi.mock('@/hooks/usePiLive', () => ({
  usePiLive: () => ({ sessions: [], isEnabled: false, ...live }),
}))
vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({ t: (key: string, fallback?: string | { defaultValue?: string }) => typeof fallback === 'string' ? fallback : fallback?.defaultValue ?? key }),
}))
vi.mock('@/components/SessionViewer', () => ({
  default: ({ session, slots }: any) => (
    <div data-testid="mock-session-viewer">
      <span>Mock Session Viewer: {session.name || session.id}</span>
      <div data-testid="mock-preview-toolbar">{slots?.right}</div>
    </div>
  ),
}))

const sid = '11111111-1111-4111-8111-111111111111'
const path = '/Users/test/.pi/agent/sessions/2026/11/02/read.jsonl'
const historical: SessionInfo = {
  id: sid, path, cwd: '/repo', name: 'Read project session',
  created: '2026-11-02T01:00:00Z', modified: '2026-11-02T02:00:00Z',
  message_count: 6, first_message: 'Hello', last_message: 'Done', last_message_role: 'assistant',
}
const peer = (overrides: Partial<PsmMeshPeer> = {}): PsmMeshPeer => ({
  sessionId: sid, sessionFile: path, cwd: '/repo', pid: 1254,
  machineId: 'local-test', state: 'running', startedAt: '2026-11-02T01:00:00Z',
  lastHeartbeat: '2026-11-02T02:00:00Z', files: [], following: [],
  git: { repoRoot: '/repo', branch: 'feature', commonRoot: '/repo', worktree: 'linked' },
  ...overrides,
})
function makeContext(peers: PsmMeshPeer[], lookup: unknown | null = historical) {
  const listeners = new Map<string, (event: { payload: Record<string, unknown> }) => void>()
  const mesh = {
    peers: vi.fn().mockResolvedValue(peers),
    herdrAgents: vi.fn().mockResolvedValue([{ paneId: 'w1:p1', workspaceId: 'w1', sessionPath: path, status: 'working' }]),
    focus: vi.fn().mockResolvedValue({ ok: true }),
    send: vi.fn().mockResolvedValue({ ok: true, disposition: 'accepted' }),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    follow: vi.fn().mockResolvedValue({ ok: true }),
  }
  const ctx = {
    i18n: { t: (_key: string, fallback: string) => fallback },
    psm: {
      mesh,
      sessions: { lookupByPath: vi.fn().mockResolvedValue(lookup) },
      favorites: { list: vi.fn().mockResolvedValue([]), toggle: vi.fn() },
      terminal: { open: vi.fn() },
    },
    events: { subscribe: (name: string, handler: (event: { payload: Record<string, unknown> }) => void) => {
      listeners.set(name, handler)
      return () => { listeners.delete(name) }
    }},
  } as unknown as PsmPluginHostContext
  return { ctx, mesh, listeners }
}
function makeData(sessions: SessionInfo[]) {
  const onSelectSession = vi.fn()
  const onClearSelectedSession = vi.fn()
  const data = {
    sessions, selectedSession: null,
    tags: [], sessionTags: [], getTagsForSession: () => [],
    onMoveSession: vi.fn(), onClearSessionStatus: vi.fn(), onToggleTag: vi.fn(),
    onSelectSession, onClearSelectedSession, terminalAvailable: false,
  } as unknown as AppPluginSurfaceData
  return { data, onSelectSession, onClearSelectedSession }
}
const assertNoLiveCalls = () => {
  for (const mock of Object.values(live)) expect(mock).not.toHaveBeenCalled()
}

describe('PSM Mesh workspace main view and dialog integration (Pi Live disabled)', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })
  afterEach(() => cleanup())

  it('renders peer grid card, opens native SessionPreviewModal on click, and allows expand to full', async () => {
    const { ctx } = makeContext([peer()])
    const { data, onSelectSession } = makeData([historical])
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    
    // Find peer in grid
    await screen.findByText('Read project session')
    const card = screen.getByRole('button', { name: /^Read project session$/ })
    fireEvent.click(card)

    // Opens native SessionPreviewModal
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(screen.getByTestId('mock-session-viewer')).toBeTruthy()

    // Native preview controls: Maximize
    const expandBtn = screen.getByRole('button', { name: /maximize/i })
    fireEvent.click(expandBtn)
    expect(onSelectSession).toHaveBeenCalledWith(historical)

    assertNoLiveCalls()
  })

  it('opens conversation dialog for unindexed file-backed peer and resolves via PSM lookup', async () => {
    const { ctx } = makeContext([peer()])
    const { data, onSelectSession } = makeData([])
    render(<MeshWorkspace ctx={ctx} data={data} active />)

    const row = await screen.findByRole('button', { name: /^repo$/ })
    await act(async () => {
      fireEvent.click(row)
    })

    await waitFor(() => expect(ctx.psm.sessions.lookupByPath).toHaveBeenCalledWith(path))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    // Once resolved, expanding passes the resolved session
    const expandBtn = await screen.findByRole('button', { name: /maximize/i })
    fireEvent.click(expandBtn)
    expect(onSelectSession).toHaveBeenCalledWith(historical)

    assertNoLiveCalls()
  })

  it('closes dialog on Escape key or close button', async () => {
    const { ctx } = makeContext([peer()])
    const { data } = makeData([historical])
    render(<MeshWorkspace ctx={ctx} data={data} active />)

    await screen.findByText('Read project session')
    fireEvent.click(screen.getByRole('button', { name: /^Read project session$/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('reuses the Kanban rename action without opening the conversation', async () => {
    const { ctx } = makeContext([peer()])
    const { data, onSelectSession } = makeData([historical])
    data.onOpenPreviewRenameDialog = vi.fn()
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    const card = await screen.findByRole('button', { name: historical.name })
    await act(async () => { fireEvent.contextMenu(card, { clientX: 90, clientY: 120 }) })
    fireEvent.click(await screen.findByRole('button', { name: /^(common\.rename|tags\.contextMenu\.rename|重命名|Rename)$/ }))
    expect(data.onOpenPreviewRenameDialog).toHaveBeenCalledWith(historical)
    expect(onSelectSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('focuses the exact Herdr session and sends Enter through Mesh without Pi Live', async () => {
    const { ctx, mesh } = makeContext([peer()])
    const { data } = makeData([historical])
    data.onResumeSession = vi.fn()
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    const focus = await screen.findByRole('button', { name: `在 Herdr 中聚焦 · ${historical.name}` })
    await waitFor(() => expect(focus.hasAttribute('disabled')).toBe(false))
    fireEvent.click(focus)
    await waitFor(() => expect(mesh.focus).toHaveBeenCalledWith(sid))
    expect(data.onResumeSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `发送消息 · ${historical.name}` }))
    const input = await screen.findByRole('textbox', { name: '' })
    fireEvent.change(input, { target: { value: 'Continue the implementation' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mesh.send).toHaveBeenCalledWith({ targetSessionId: sid, text: 'Continue the implementation', mode: 'followUp' }))
    assertNoLiveCalls()
  })

  it('keeps online work visible even when older indexed history fills the first page', async () => {
    const { ctx } = makeContext([peer()])
    const store = createMeshStore(ctx)
    store.setFilter('all')
    const history = Array.from({ length: 45 }, (_, i) => ({ ...historical, id: `old-${i}`, path: `${path}-old-${i}`, name: `History ${i}` }))
    const { data } = makeData([...history, historical])
    render(<MeshWorkspace ctx={ctx} data={data} active meshStore={store} />)
    await waitFor(() => expect(store.getSnapshot().meshAvailable).toBe(true))
    expect(screen.getByRole('button', { name: historical.name })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^(History \d+|Read project session)$/ })).toHaveLength(41)
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }))
    expect(screen.getAllByRole('button', { name: /^(History \d+|Read project session)$/ })).toHaveLength(46)
    store.dispose()
  })

  it('returns keyboard focus to the send action when the composer closes', async () => {
    const { ctx } = makeContext([peer()])
    const { data } = makeData([historical])
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    const button = await screen.findByRole('button', { name: `发送消息 · ${historical.name}` })
    button.focus()
    fireEvent.click(button)
    await screen.findByRole('dialog')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(button)
  })

  it('does not launch a second native process for ambiguous Mesh registrations', async () => {
    const { ctx } = makeContext([peer(), peer({ pid: 999 })])
    const store = createMeshStore(ctx)
    store.setFilter('all')
    const { data } = makeData([historical])
    data.onResumeSession = vi.fn()
    render(<MeshWorkspace ctx={ctx} data={data} active meshStore={store} />)
    await waitFor(() => expect(store.getSnapshot().meshAvailable).toBe(true))
    const card = screen.getByRole('button', { name: historical.name })
    await act(async () => { fireEvent.contextMenu(card, { clientX: 90, clientY: 120 }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Resume (⌘R)' }))
    expect(data.onResumeSession).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeTruthy()
    store.dispose()
  })

  it('loads the remaining offline cards instead of silently dropping them after 30/40', async () => {
    const { ctx } = makeContext([])
    const store = createMeshStore(ctx)
    store.setFilter('all')
    const { data } = makeData(Array.from({ length: 45 }, (_, i) => ({ ...historical, id: `session-${i}`, path: `${path}-${i}`, name: `History ${i}` })))
    render(<MeshWorkspace ctx={ctx} data={data} active meshStore={store} />)
    expect(screen.getAllByRole('button', { name: /^History \d+$/ })).toHaveLength(40)
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }))
    expect(screen.getAllByRole('button', { name: /^History \d+$/ })).toHaveLength(45)
    store.dispose()
  })

  it('reconnect creates a fresh request even while the pre-disconnect snapshot hangs; late old reply cannot replace it', async () => {
    const { ctx, mesh, listeners } = makeContext([])
    let resolveOld!: (items: PsmMeshPeer[]) => void
    const oldSnapshot = new Promise<PsmMeshPeer[]>((resolve) => { resolveOld = resolve })
    mesh.peers.mockImplementationOnce(() => oldSnapshot).mockResolvedValue([peer()])
    const { data } = makeData([])
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    await waitFor(() => expect(mesh.peers).toHaveBeenCalledTimes(1))
    act(() => listeners.get('psm-mesh:availability')?.({ payload: { available: false } }))
    expect(screen.getByText(/Mesh Hub 离线/)).toBeTruthy()
    act(() => listeners.get('psm-mesh:availability')?.({ payload: { available: true } }))
    await waitFor(() => expect(mesh.peers).toHaveBeenCalledTimes(2))
    await screen.findByRole('button', { name: /^repo$/ })
    await act(async () => { resolveOld([]); await oldSnapshot })
    expect(screen.getByRole('button', { name: /^repo$/ })).toBeTruthy()
    assertNoLiveCalls()
  })

  it('coalesces a burst of Mesh change events into one corrective snapshot and does not poll PSM favorites', async () => {
    const { ctx, mesh, listeners } = makeContext([])
    let resolveFirst!: (items: PsmMeshPeer[]) => void
    const firstSnapshot = new Promise<PsmMeshPeer[]>((resolve) => { resolveFirst = resolve })
    mesh.peers.mockImplementationOnce(() => firstSnapshot).mockResolvedValue([peer()])
    const { data } = makeData([])
    render(<MeshWorkspace ctx={ctx} data={data} active />)
    await waitFor(() => expect(mesh.peers).toHaveBeenCalledTimes(1))
    act(() => {
      for (let i = 0; i < 6; i++) listeners.get('psm-mesh:changed')?.({ payload: {} })
    })
    expect(mesh.peers).toHaveBeenCalledTimes(1)
    await act(async () => { resolveFirst([]); await firstSnapshot })
    await waitFor(() => expect(mesh.peers).toHaveBeenCalledTimes(2))
    await screen.findByRole('button', { name: /^repo$/ })
    expect(ctx.psm.favorites.list).toHaveBeenCalledTimes(1)
    assertNoLiveCalls()
  })
})
