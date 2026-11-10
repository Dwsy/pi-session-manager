import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PsmPluginHostContext, PsmMeshPeer } from '@dwsy/plugin-sdk'
import { createMeshStore, type MeshStore } from './meshStore'

const stores: MeshStore[] = []
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
function context() {
  const listeners = new Map<string, (event: { payload: Record<string, unknown> }) => void>()
  const mesh = { peers: vi.fn().mockResolvedValue([]), herdrAgents: vi.fn().mockResolvedValue([]) }
  const ctx = {
    psm: { mesh, favorites: { list: vi.fn().mockResolvedValue([]) } },
    events: { subscribe: (name: string, handler: (event: { payload: Record<string, unknown> }) => void) => {
      listeners.set(name, handler); return () => { listeners.delete(name) }
    } },
  } as unknown as PsmPluginHostContext
  const store = createMeshStore(ctx)
  stores.push(store)
  return { mesh, store, listeners }
}
afterEach(() => { stores.splice(0).forEach((s) => s.dispose()); vi.useRealTimers() })
describe('Mesh refresh feedback', () => {
  it('keeps scheduled/event refresh quiet and only spins for a user request', async () => {
    vi.useFakeTimers()
    const { mesh, store, listeners } = context()
    await flush()
    let resolve!: (peers: PsmMeshPeer[]) => void
    mesh.peers.mockImplementationOnce(() => new Promise<PsmMeshPeer[]>((r) => { resolve = r }))
    vi.advanceTimersByTime(5000)
    expect(store.getSnapshot().refreshing).toBe(false)
    expect(store.getSnapshot().loading).toBe(false)
    listeners.get('psm-mesh:changed')?.({ payload: {} })
    expect(store.getSnapshot().refreshing).toBe(false)
    const manual = store.refresh()
    expect(store.getSnapshot().refreshing).toBe(true)
    resolve([])
    await manual
    await flush()
    expect(store.getSnapshot().refreshing).toBe(false)
  })
  it('isolates a failed Herdr lookup from the readable Mesh snapshot', async () => {
    const { mesh, store } = context()
    await flush()
    mesh.herdrAgents.mockRejectedValueOnce(new Error('Herdr unavailable'))
    await store.refresh(true)
    expect(store.getSnapshot().meshAvailable).toBe(true)
    expect(store.getSnapshot().herdrAgents).toEqual([])
    expect(store.getSnapshot().error).toBeNull()
  })
})
