import type { PsmPluginHostContext, PsmPluginManifest } from '../../../packages/runtime-sdk/src'

import { hostReact } from './host-react'

const { createElement } = hostReact()

import { collectCacheUsageStats } from './cache-usage'
import { cacheUsageI18n } from './i18n'
import { cacheUsageConfiguration } from './settings'
import { CacheUsagePanel, CacheUsageToolbarButton } from './ui'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'path.example.cache-usage',
  name: 'Example Cache Usage Path Plugin',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read'],
  configuration: cacheUsageConfiguration,
  i18n: cacheUsageI18n,
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export default function activate(ctx: PsmPluginHostContext) {
  const recentTurns = Math.max(3, Math.min(20, ctx.settings.get('recentTurns', 8)))

  async function inspect(args: Record<string, unknown>) {
    const sessionPath = optionalString(args.sessionPath ?? args.path)
    if (!sessionPath) throw new Error('sessionPath is required')

    const activeEntryId = optionalString(args.activeEntryId ?? args.entryId)
    const entries = await ctx.psm.sessions.readEntries(sessionPath)
    return collectCacheUsageStats(entries as any[], { activeEntryId })
  }

  ctx.registerCommand('cache-usage.inspect', inspect)
  ctx.registerTool('session_cache_usage', {
    description: 'Inspect assistant cache hit usage for a PSM session and return aggregate plus per-turn cache statistics.',
    run: inspect,
  })

  ctx.ui.registerSessionToolbarItem({
    id: 'path.cache-usage.toolbar',
    title: 'Cache',
    panelId: 'path.cache-usage.panel',
    render: (props) => createElement(CacheUsageToolbarButton, {
      i18n: ctx.i18n,
      open: Boolean(props.panelOpen),
      onToggle: props.togglePanel ?? (() => {}),
    }),
  })

  ctx.ui.registerSessionPanel({
    id: 'path.cache-usage.panel',
    title: 'Cache',
    side: 'right',
    render: (props) => createElement(CacheUsagePanel, {
      client: ctx.psm.sessions,
      i18n: ctx.i18n,
      session: props.session,
      activeEntryId: props.activeEntryId,
      open: Boolean(props.panelOpen),
      width: props.width ?? optionalNumber(ctx.settings.get('panelWidth', 360)) ?? 360,
      onWidthChange: props.onWidthChange,
      recentTurns,
      onClose: props.closePanel ?? (() => {}),
    }),
  })
}
