import { createElement } from 'react'
import type {
  PsmAppViewRenderProps,
  PsmPluginCommandContext,
  PsmPluginHostContext,
  PsmSessionHighlight,
  PsmSessionSelection,
  PsmSessionUiRenderProps,
} from '@dwsy/plugin-sdk'

import {
  BookmarkStore,
  bookmarkFromSelection,
  type Bookmark,
} from './bookmark'
import { manifest } from './manifest'
import {
  BookmarkHighlightPopover,
  BookmarksAppView,
  BookmarksPanel,
  BookmarksToolbarButton,
  type BookmarkQuotable,
} from './ui'

export { manifest }

const PANEL_ID = 'builtin.bookmarks.panel'
const APP_VIEW_ID = 'builtin.bookmarks.view'
const HIGHLIGHT_PROVIDER_ID = 'builtin.bookmarks.highlights'
const HIGHLIGHT_HUE = 42

interface AppSurfaceData {
  sessions?: Array<{ path: string }>
  onSelectSession?: (session: { path: string }) => void
}

export default function activate(ctx: PsmPluginHostContext) {
  const store = new BookmarkStore(ctx.psm.records, ctx.manifest.id)

  const notifySaveFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    ctx.log.error(ctx.i18n.t('plugins.bookmarks.saveFailed', 'Bookmark failed: {{message}}', { message }))
  }

  async function saveSelection(
    selection: PsmSessionSelection,
    options: { withNote?: boolean } = {},
  ): Promise<Bookmark> {
    const bookmark = bookmarkFromSelection(selection, { colorHue: HIGHLIGHT_HUE })
    return store.save(bookmark, options)
  }

  async function aiTidy(bookmarks: BookmarkQuotable[]): Promise<string> {
    const agent = await ctx.psm.agent.createSession({
      purpose: 'bookmarks-tidy',
      model: 'host-default',
      thinkingLevel: 'medium',
      tools: [],
      storage: { scope: 'memory' },
    })
    try {
      const corpus = bookmarks
        .map((item, index) => {
          const note = item.note ? `\n   note: ${item.note}` : ''
          return `${index + 1}. (${item.sessionPath}) ${item.quote}${note}`
        })
        .join('\n')
      const result = await ctx.psm.agent.run({
        sessionId: agent.sessionId,
        prompt: [
          'You organize text bookmarks saved from coding-agent sessions.',
          'Group the bookmarks below into 3-6 themes. For each theme give a short title',
          'and one line describing what the bookmarks capture. Reply in the same',
          'language as the bookmark text. Be concrete, no filler.',
          '',
          corpus,
        ].join('\n'),
      })
      return result.text
    } finally {
      await ctx.psm.agent.dispose(agent.sessionId)
    }
  }

  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.bookmarks.toolbar',
    title: ctx.i18n.t('plugins.bookmarks.toolbarTitle', 'Bookmarks'),
    panelId: PANEL_ID,
    render: (props: PsmSessionUiRenderProps) =>
      createElement(BookmarksToolbarButton, {
        i18n: ctx.i18n,
        open: Boolean(props.panelOpen),
        onToggle: props.togglePanel ?? (() => {}),
      }),
  })

  ctx.ui.registerSessionPanel({
    id: PANEL_ID,
    title: ctx.i18n.t('plugins.bookmarks.panelTitle', 'Session Bookmarks'),
    side: 'right',
    render: (props: PsmSessionUiRenderProps) => {
      return createElement(BookmarksPanel, {
        store,
        i18n: ctx.i18n,
        session: props.session,
        onJump: (entryId: string) => props.viewer?.revealEntry(entryId, { highlight: true, align: 'center' }),
        onClose: props.closePanel ?? (() => {}),
      })
    },
  })

  ctx.ui.registerSelectionAction({
    id: 'builtin.bookmarks.save',
    title: ctx.i18n.t('plugins.bookmarks.saveAction', 'Bookmark'),
    icon: 'bookmark',
    order: 10,
    run: async ({ selection }) => {
      try {
        await saveSelection(selection)
      } catch (error) {
        notifySaveFailure(error)
      }
    },
  })

  ctx.ui.registerSelectionAction({
    id: 'builtin.bookmarks.save-note',
    title: ctx.i18n.t('plugins.bookmarks.saveNoteAction', 'Bookmark with note'),
    icon: 'note',
    order: 20,
    run: async ({ selection, openPanel }) => {
      try {
        await saveSelection(selection, { withNote: true })
        openPanel?.(PANEL_ID)
      } catch (error) {
        notifySaveFailure(error)
      }
    },
  })

  ctx.ui.registerSessionHighlightProvider({
    id: HIGHLIGHT_PROVIDER_ID,
    async resolveHighlights({ session }) {
      const bookmarks = await store.listForSession(session.path)
      const highlights: PsmSessionHighlight[] = bookmarks.map((bookmark) => {
        return {
          id: bookmark.id,
          entryId: bookmark.anchor.entryId,
          textQuote: bookmark.anchor.textQuote,
          label: bookmark.note ?? bookmark.quote.slice(0, 120),
          hue: bookmark.colorHue ?? HIGHLIGHT_HUE,
        }
      })
      return highlights
    },
    renderPopover({ session, highlight, close }) {
      return createElement(BookmarkHighlightPopover, {
        store,
        i18n: ctx.i18n,
        bookmarkId: highlight.id,
        sessionPath: session.path,
        onClose: close,
      })
    },
    subscribe(onChange) {
      return store.subscribe(onChange)
    },
  })

  ctx.ui.registerAppView({
    id: APP_VIEW_ID,
    title: ctx.i18n.t('plugins.bookmarks.appTitle', 'Bookmark Explorer'),
    route: '/bookmarks',
    icon: 'bookmark',
    render: (props: PsmAppViewRenderProps) => {
      const surface = props.data as AppSurfaceData | undefined
      return createElement(BookmarksAppView, {
        store,
        i18n: ctx.i18n,
        active: Boolean(props.active),
        aiTidy,
        onSelectSession: (sessionPath: string) => {
          const target = surface?.sessions?.find((item) => item.path === sessionPath)
          if (target) surface?.onSelectSession?.(target)
        },
      })
    },
  })

  ctx.registerCommand({
    id: 'builtin.bookmarks.open',
    title: ctx.i18n.t('plugins.bookmarks.appTitle', 'Bookmark Explorer'),
    description: 'Search and organize transcript text bookmarks',
    category: 'Bookmarks',
    icon: 'bookmark',
    keywords: ['bookmark', '书签', 'highlight', 'annotation', 'signet'],
    scope: 'global',
    run: (_args, context?: PsmPluginCommandContext) => {
      context?.navigate?.openAppView?.(APP_VIEW_ID)
      return { ok: true }
    },
  })

  ctx.registerCommand({
    id: 'builtin.bookmarks.save',
    title: ctx.i18n.t('plugins.bookmarks.saveAction', 'Bookmark'),
    description: 'Bookmark the active transcript text selection',
    category: 'Bookmarks',
    icon: 'bookmark',
    keywords: ['bookmark', 'save', '收藏', 'save selection'],
    scope: 'selection',
    run: async (_args, context?: PsmPluginCommandContext) => {
      const selection = context?.selection
      if (!selection) throw new Error('no active text selection')
      return saveSelection(selection)
    },
  })
}
