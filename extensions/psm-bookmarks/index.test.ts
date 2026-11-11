import { describe, expect, it, vi } from 'vitest'

import type {
  PsmPluginHostContext,
  PsmSelectionActionRegistration,
  PsmSessionHighlightProviderRegistration,
  PluginRecordUpsertParams,
} from '@dwsy/plugin-sdk'

import activate, { manifest } from './index'

const selection = {
  sessionPath: '/tmp/session.jsonl',
  sessionId: 'session-1',
  entryId: 'm1',
  selectedText: 'beta',
  textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
}

function makeCtx() {
  const upserts: PluginRecordUpsertParams[] = []
  const records = {
    async listForScope() {
      return []
    },
    async search() {
      return []
    },
    async upsert(params: PluginRecordUpsertParams) {
      upserts.push(params)
    },
  }
  const captured = {
    toolbarItems: [] as Array<{ id: string; panelId?: string }>,
    panels: [] as Array<{ id: string }>,
    selectionActions: [] as PsmSelectionActionRegistration[],
    highlightProviders: [] as PsmSessionHighlightProviderRegistration[],
    appViews: [] as Array<{
      id: string
      render: (props: { viewId: string; active: boolean; data?: unknown }) => unknown
    }>,
    appSidebarViews: [] as Array<{ id: string; appViewId?: string }>,
    commands: new Map<string, (args: Record<string, unknown>, context?: unknown) => unknown>(),
  }
  const ctx = {
    manifest,
    psm: {
      records,
      agent: {
        createSession: vi.fn(async () => ({ sessionId: 'agent-1', model: 'host-default' })),
        run: vi.fn(async () => ({ text: 'Theme: greek letters' })),
        dispose: vi.fn(async () => undefined),
      },
    },
    i18n: {
      language: 'en-US',
      t: (_key: string, fallback: string) => fallback,
    },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    ui: {
      registerSessionToolbarItem: (item: { id: string; panelId?: string }) => {
        captured.toolbarItems.push(item)
      },
      registerSessionPanel: (panel: { id: string }) => {
        captured.panels.push(panel)
      },
      registerSelectionAction: (action: PsmSelectionActionRegistration) => {
        captured.selectionActions.push(action)
      },
      registerSessionHighlightProvider: (provider: PsmSessionHighlightProviderRegistration) => {
        captured.highlightProviders.push(provider)
      },
      registerAppView: (view: {
        id: string
        render: (props: { viewId: string; active: boolean; data?: unknown }) => unknown
      }) => {
        captured.appViews.push(view)
      },
      registerAppSidebarView: (view: { id: string; appViewId?: string }) => {
        captured.appSidebarViews.push(view)
      },
    },
    registerCommand: (
      command: string | { id: string; run: (args: Record<string, unknown>, context?: unknown) => unknown },
      handler?: (args: Record<string, unknown>, context?: unknown) => unknown,
    ) => {
      const id = typeof command === 'string' ? command : command.id
      const run = typeof command === 'string' ? handler! : command.run
      captured.commands.set(id, run)
    },
  } as unknown as PsmPluginHostContext
  return { ctx, captured, upserts, records }
}

describe('bookmarks plugin activation', () => {
  it('registers every contribution surface', () => {
    const { captured, ctx } = makeCtx()
    activate(ctx)

    expect(captured.toolbarItems.map((item) => item.id)).toEqual(['builtin.bookmarks.toolbar'])
    expect(captured.panels.map((panel) => panel.id)).toEqual(['builtin.bookmarks.panel'])
    expect(captured.selectionActions.map((action) => action.id)).toEqual([
      'builtin.bookmarks.save',
      'builtin.bookmarks.save-note',
    ])
    expect(captured.highlightProviders.map((provider) => provider.id)).toEqual([
      'builtin.bookmarks.highlights',
    ])
    expect(captured.appViews.map((view) => view.id)).toEqual(['builtin.bookmarks.view'])
    expect(captured.appSidebarViews.map((view) => view.id)).toEqual(['builtin.bookmarks.sidebar'])
    expect([...captured.commands.keys()]).toEqual([
      'builtin.bookmarks.open',
      'builtin.bookmarks.save',
    ])
  })

  it('saves a bookmark record from a selection action', async () => {
    const { ctx, captured, upserts } = makeCtx()
    activate(ctx)

    const save = captured.selectionActions.find((action) => action.id === 'builtin.bookmarks.save')!
    await save.run({ selection, close: () => undefined })

    const bookmarkRecord = upserts.find((item) => item.recordType === 'bookmark.text-quote')
    expect(bookmarkRecord).toMatchObject({
      pluginId: 'builtin.bookmarks',
      scopeType: 'session',
      scopeId: '/tmp/session.jsonl',
      schemaVersion: 1,
    })
    expect(bookmarkRecord?.payload).toMatchObject({
      quote: 'beta',
      anchor: { entryId: 'm1', textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' } },
    })
  })

  it('save-with-note requests the bookmarks panel open', async () => {
    const { ctx, captured, upserts } = makeCtx()
    activate(ctx)

    const saveNote = captured.selectionActions.find((action) => action.id === 'builtin.bookmarks.save-note')!
    const openPanel = vi.fn()
    await saveNote.run({ selection, close: () => undefined, openPanel })

    expect(openPanel).toHaveBeenCalledWith('builtin.bookmarks.panel')
    expect(upserts.some((item) => item.recordType === 'bookmark.text-quote')).toBe(true)
  })

  it('resolves highlights with text quotes and renders the popover', async () => {
    const { ctx, captured, upserts, records } = makeCtx()
    activate(ctx)

    // Seed one bookmark record for the session.
    const save = captured.selectionActions.find((action) => action.id === 'builtin.bookmarks.save')!
    await save.run({ selection, close: () => undefined })
    const saved = upserts.find((item) => item.recordType === 'bookmark.text-quote')!
    vi.spyOn(records, 'listForScope').mockResolvedValueOnce([
      {
        id: saved.id!,
        plugin_id: 'builtin.bookmarks',
        scope_type: 'session',
        scope_id: '/tmp/session.jsonl',
        record_type: 'bookmark.text-quote',
        schema_version: 1,
        payload_json: '',
        payload: saved.payload,
        updated_at: '2026-11-11T10:00:01.000Z',
      },
    ])

    const provider = captured.highlightProviders[0]!
    const highlights = await provider.resolveHighlights({
      session: { path: '/tmp/session.jsonl' },
    })
    expect(highlights).toEqual([
      expect.objectContaining({
        entryId: 'm1',
        textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
      }),
    ])

    const popover = provider.renderPopover!({
      session: { path: '/tmp/session.jsonl' },
      highlight: highlights[0]!,
      anchor: {} as HTMLElement,
      close: () => undefined,
    })
    expect(popover).not.toBeNull()
  })

  it('exposes a selection-scoped command that requires a selection', async () => {
    const { ctx, captured, upserts } = makeCtx()
    activate(ctx)

    const run = captured.commands.get('builtin.bookmarks.save')!
    await expect(run({}, { selection: null })).rejects.toThrow(/selection/)
    await run({}, { selection })
    expect(upserts.some((item) => item.recordType === 'bookmark.text-quote')).toBe(true)
  })

  it('runs AI organization through host-managed agent sessions', async () => {
    const { ctx, captured } = makeCtx()
    activate(ctx)

    const view = captured.appViews[0]!
    const element = view.render({ viewId: view.id, active: true }) as {
      props: { aiTidy: (bookmarks: unknown[]) => Promise<string> }
    }
    const result = await element.props.aiTidy([
      { id: 'bm-1', sessionPath: '/tmp/session.jsonl', entryId: 'm1', quote: 'beta' },
    ])

    expect(result).toBe('Theme: greek letters')
    expect(ctx.psm.agent.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'bookmarks-tidy' }),
    )
    expect(ctx.psm.agent.dispose).toHaveBeenCalledWith('agent-1')
  })
})
