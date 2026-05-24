# Plugin Authoring

This page is the quick operating guide for writing PSM browser plugins. Full
contracts live in [PSM Plugin SDK](../docs/PSM_PLUGIN_SDK.md), current exposure
gaps live in [Capability Audit](../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md), and
examples live in [Extensions Overview](../extensions/README.md).

## First Read

| Need | Read |
|------|------|
| Public manifest, activation, permissions, install shape | [PSM Plugin SDK](../docs/PSM_PLUGIN_SDK.md) |
| Which `ctx.psm` capabilities are exposed | [Capability Audit](../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) |
| Built-in and external examples | [Extensions Overview](../extensions/README.md) |
| UI styling rules | [Design System](../DESIGN.md) |
| Frontend host files | [Frontend](02-frontend.md) -> Plugins |

## Boundaries

- Plugin authors use only `@pi-session-manager/plugin-sdk` as the public API.
- Do not import runtime host internals, app transport, Tauri APIs, desktop-only code,
  or app aliases such as `@/components`, `@/types`, and `@/plugins` in published bundles.
- External plugins must be browser-compatible ESM. No Node built-ins, raw TS/TSX,
  remote URLs, git checkouts, or `file:` package dependencies.
- Path plugins that render React UI should follow the host React pattern used by
  `extensions/psm-cache-usage-path`: read `globalThis.__PSM_HOST_REACT__` through a
  small `hostReact()` helper instead of importing a separate React runtime.
- Heavy or experimental dependencies belong inside the plugin package, not the main app.
- Use least permissions. Declare only the `ctx.psm` capabilities the plugin actually calls.

## Source Types

The Settings -> PSM Plugins page presents these sources as a grouped list: built-in, npm, and local path.

| Source | Use For | Entry |
|--------|---------|-------|
| `builtin` | First-party plugins checked into this repo | `extensions/psm-*` auto-discovery, unless excluded in `src/plugins/runtime-host/builtins.ts` |
| `npm` | Published or managed external plugins | package `package.json#psm.extensions`, installed under `~/.pi/pi-session-manager/extensions/npm` |
| `path` | Local/private development plugins | absolute built `.js` / `.mjs` file in `plugins.json#customPaths` |

Path plugins point at built output, for example:

```text
/absolute/path/to/my-psm-plugin/dist/index.mjs
```

Never point a path plugin at `index.ts`, `index.tsx`, or source directories.

## Authoring Shape

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'acme.example',
  name: 'Example Plugin',
  version: '0.1.0',
  permissions: ['sessions:read'],
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('acme.example.ping', async () => ({ ok: true }))
}
```

UI plugins register contributions through `ctx.ui`:

- `registerAppView(...)`
- `registerAppSidebarView(...)`
- `registerSessionToolbarItem(...)`
- `registerSessionMainView(...)`
- `registerSessionPanel(...)`
- `registerToolRenderer(...)`

Use `ctx.settings` for plugin-owned settings and `ctx.i18n` for translated copy. Do not
create private i18n providers or depend on app React hooks from outside the plugin boundary.

## Data Rules

- Prefer high-level capability APIs from `ctx.psm` over file parsing.
- Do not read JSONL/session files directly unless the feature explicitly requires raw entries
  and declares the matching permission.
- Prefer session-list preview fields when a feature only needs lightweight summaries.
- Store plugin-owned computed data as plugin records instead of adding feature-specific tables,
  unless there is a clear host-level data requirement.

## External Build

A path or npm plugin should build to a single browser ESM entry where practical:

```json
{
  "type": "module",
  "scripts": { "build": "vite build" },
  "psm": { "extensions": ["./dist/index.mjs"] }
}
```

Use a Vite library build with an ESM output. Validate the output before installing:

```bash
pnpm exec vite build --config extensions/<plugin>/vite.config.ts
node --input-type=module -e "import('./extensions/<plugin>/dist/index.mjs').then(m=>console.log(m.manifest?.id, typeof (m.activate ?? m.default)))"
```

Install local path plugins through Settings -> PSM Plugins, or by adding the built file to:

```text
~/.pi/pi-session-manager/plugins.json
```

Then reload plugins from Settings, or restart the GUI if an old diagnostic remains visible.

## Verification

For plugin changes, run the narrowest relevant checks first, then broaden:

```bash
pnpm exec vitest run extensions/<plugin>/__tests__/*.test.tsx
pnpm exec vitest run src/plugins/runtime-host/__tests__/host.test.ts
pnpm exec tsc --noEmit
```

If the plugin contributes Cmd+K commands, include `src/components/__tests__/CommandMenu.test.tsx`.
If it produces a path bundle, also verify the built `.mjs` exports `manifest` and `activate` or
`default` as shown above.
