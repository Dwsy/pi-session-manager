# @pi-session-manager/plugin-sdk

Public TypeScript SDK for Pi Session Manager plugins.

This package exposes only the stable browser plugin contract:

- manifest and package validation helpers
- plugin host context and manifest types
- logic contribution APIs for commands/tools
- UI contribution APIs for app views, app sidebar views, session toolbar items, main views, right panels, and tool renderers
- event subscription APIs for host-emitted app signals
- capability client factory

It does not export the app transport, runtime host, Tauri APIs, or any desktop-private implementation.

Tool renderer plugins can customize how session tool calls appear in PSM:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  id: 'acme.tool-renderer',
  name: 'Acme Tool Renderer',
  version: '1.0.0',
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer({
    id: 'acme-log-renderer',
    name: 'Acme Log Renderer',
    match: 'acme_log',
    component: ({ resolvedData, context }) => {
      return context.isExpanded ? resolvedData.output : resolvedData.name
    },
  })
}
```

Renderer IDs are global. First registration wins; duplicate IDs become host diagnostics.

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'
```
