import type { PsmPluginHostContext, PsmPluginManifest } from '@dwsy/plugin-sdk'

import { subagentToolRenderer } from './SubagentToolRenderer'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.subagent-renderer',
  name: 'Subagent Renderer',
  version: '1.0.0',
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(subagentToolRenderer)
}
