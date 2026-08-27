import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

import { transformGrokPiEntries } from './protocol'
import { grokPiToolRenderer } from './renderer'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.grok-pi-tui',
  name: 'Grok Pi TUI',
  version: '1.0.0',
  defaultEnabled: false,
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(grokPiToolRenderer)
  ctx.registerSessionEntryTransformer({
    id: 'builtin-grok-pi-tui-entries',
    name: 'Grok Pi durable entry renderer',
    priority: 180,
    transform: transformGrokPiEntries,
  })
}
