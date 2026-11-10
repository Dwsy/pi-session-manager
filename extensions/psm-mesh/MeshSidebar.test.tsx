// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PsmMeshPeer, PsmPluginHostContext } from '@dwsy/plugin-sdk'
import type { SessionInfo } from '@/types'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import MeshSidebar from './MeshSidebar'
import { createMeshStore } from './meshStore'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

const sid = '22222222-2222-4222-8222-222222222222'
const path = '/Users/test/.pi/agent/sessions/2026/11/02/sidebar.jsonl'
const historical: SessionInfo = {
  id: sid, path, cwd: '/work/my-app', name: 'App debugging',
  created: '2026-11-02T01:00:00Z', modified: '2026-11-02T02:00:00Z',
  message_count: 3, first_message: 'Hi', last_message: 'Fix done', last_message_role: 'assistant',
}
const peer = (overrides: Partial<PsmMeshPeer> = {}): PsmMeshPeer => ({
  sessionId: sid, sessionFile: path, cwd: '/work/my-app', pid: 4567,
  machineId: 'local-host', state: 'running', startedAt: '2026-11-02T01:00:00Z',
  lastHeartbeat: '2026-11-02T02:00:00Z', files: [{ op: 'write', path: '/work/my-app/src/index.ts', ts: '2026-11-02T02:00:00Z' }],
  following: [], git: { repoRoot: '/work/my-app', branch: 'main', commonRoot: '/work/my-app', worktree: 'main' },
  ...overrides,
})

function makeContext(peers: PsmMeshPeer[]) {
  const listeners = new Map<string, (event: { payload: Record<string, unknown> }) => void>()
  const mesh = {
    peers: vi.fn().mockResolvedValue(peers),
    herdrAgents: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue({ ok: true }),
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    follow: vi.fn().mockResolvedValue({ ok: true }),
  }
  const ctx = {
    i18n: { t: (_key: string, fallback: string) => fallback },
    psm: {
      mesh,
      sessions: { lookupByPath: vi.fn() },
      favorites: { list: vi.fn().mockResolvedValue([]), toggle: vi.fn() },
      terminal: { open: vi.fn() },
    },
    events: { subscribe: (name: string, handler: (event: { payload: Record<string, unknown> }) => void) => {
      listeners.set(name, handler)
      return () => { listeners.delete(name) }
    }},
  } as unknown as PsmPluginHostContext
  return { ctx, mesh }
}

describe('MeshSidebar compact sidebar behavior', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })
  afterEach(() => cleanup())

  it('renders compact header, filter pills, and live active peer list', async () => {
    const { ctx } = makeContext([peer()])
    const store = createMeshStore(ctx)
    await store.refresh()

    const data = { sessions: [historical] } as unknown as AppPluginSurfaceData
    render(<MeshSidebar ctx={ctx} data={data} active meshStore={store} />)

    // Check title and online count
    expect(screen.getByText('Mesh')).toBeTruthy()
    expect(screen.getAllByText(/1 在线/).length).toBeGreaterThanOrEqual(1)

    // Filter pills with counts
    expect(screen.getByText('全部')).toBeTruthy()
    expect(screen.getByText('在线')).toBeTruthy()

    // Workspace repositories list
    await screen.findByText('my-app')
    expect(screen.getByText('工作区与代码仓库')).toBeTruthy()

    // Clicking repo filters in store
    const repoBtn = screen.getByRole('button', { name: /my-app/ })
    fireEvent.click(repoBtn)
    expect(store.getSnapshot().selectedRepo).toBe('/work/my-app')

    // Filter selection
    const offlineBtn = screen.getByRole('button', { name: /离线/ })
    fireEvent.click(offlineBtn)
    expect(store.getSnapshot().filter).toBe('offline')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索代码仓库' }), { target: { value: 'not-here' } })
    expect(screen.getByText('没有匹配的代码仓库')).toBeTruthy()
    expect(screen.getByText('实时文件变动').closest('footer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除仓库搜索' }))
    expect(screen.getByRole('button', { name: /my-app.*在线/ })).toBeTruthy()

    // No giant chat input in sidebar
    expect(screen.queryByPlaceholderText('Type a steer message…')).toBeNull()

    store.dispose()
  })
})
