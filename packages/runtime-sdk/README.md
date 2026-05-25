# @pi-session-manager/plugin-sdk

Public TypeScript SDK for Pi Session Manager plugins.

This package exposes the stable browser-plugin contract only:

- manifest and package validation helpers
- plugin host context and manifest types
- command and tool registration
- UI contribution APIs for app views, sidebar views, session toolbar items, session views, panels, and tool renderers
- event subscription APIs
- capability client factory

It does not export the app transport, runtime host, Tauri APIs, or desktop-private implementation.

## Start Here

Read these docs in order:

1. [PSM Plugin SDK](../../docs/PSM_PLUGIN_SDK.md)
2. [PSM Plugin SDK Capability Audit](../../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md)
3. [Extensions README](../../extensions/README.md)

## Minimal Plugin

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'acme.tool-renderer',
  name: 'Acme Tool Renderer',
  version: '1.0.0',
  permissions: ['sessions:read'],
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('acme.echo', async (args) => {
    return { ok: true, args }
  })

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

## Public Surface

The package re-exports the public surface from `packages/runtime-sdk/src/index.ts`:

```ts
export * from './types'
export * from './manifest'
export * from './client'
```

That means the SDK package is a small, stable facade. It is not the runtime host.

## Plugin Sources

PSM recognizes three plugin sources:

| Source | Meaning |
| --- | --- |
| `builtin` | Repo-local first-party plugins under `extensions/psm-*` |
| `npm` | External plugins installed into the managed npm workspace |
| `path` | Explicit local `.js` / `.mjs` browser-compatible ESM files |

Path plugins are for local development or private plugins. Published plugins should use npm.

## What Plugin Authors Can Rely On

- Manifest validation is public and stable.
- `ctx.psm` is permission aware.
- `records.upsert` supports `indexValues`.
- `sessions.readEntries(path, { limit })` is supported.
- `sidechat` exposes both `ask` and `askStream`.
- UI contributions are first-class and host-rendered.

## What Is Intentionally Not Public

- runtime host internals
- Tauri APIs
- plugin installation and management internals
- raw terminal I/O
- API key administration
- database maintenance commands
- desktop-private app transport details

## Example Capability Use

```ts
const response = await ctx.psm.sidechat.ask({
  sessionPath: session.path,
  question: 'What is the blocker?',
  thinkingLevel: 'medium',
})

const entries = await ctx.psm.sessions.readEntries(session.path, { limit: 20 })
```

## Link Back From Product Docs

If you landed here from the website docs, the product overview pages should point plugin authors back to this package and to `docs/PSM_PLUGIN_SDK.md`.
