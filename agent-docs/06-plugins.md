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
- Built-in `extensions/psm-*` plugins are app-internal code only when they are
  loaded by `src/plugins/runtime-host/builtins.ts`. In that mode they may import
  repo TSX components, hooks, types, and `@/...` aliases when those dependencies
  are intentionally shared with the main app.
- External `npm`, `path`, and `dev` plugins must not import app TSX components
  directly. This includes repo-local plugins loaded through Dev Preview: once a
  plugin is loaded from `dist/index.mjs`, it is a browser ESM bundle, not part of
  the app source graph. If a project component should be usable by external
  plugins, expose it through the SDK, host contribution props, or another explicit
  host-owned API.
- Do not fix bundle-boundary failures by polyfilling Node globals such as
  `process`. A polyfill may hide the first crash while leaving React, i18n,
  virtualizer, or app hooks bundled into the plugin. Remove the host import or
  move the reusable surface behind an explicit SDK/host API.
- Every component, prop object, callback, return value, setting schema, and
  contribution payload exposed to external plugins must have a public TypeScript
  definition exported from the SDK or the explicit host-owned API. If there is
  no `.d.ts` contract for it, it is not part of the external plugin API.
- External plugins must be browser-compatible ESM. No Node built-ins, raw TS/TSX,
  remote URLs, git checkouts, or `file:` package dependencies.
- Path plugins that render React UI should follow the host React pattern used by
  `extensions/psm-cache-usage-path`: read `globalThis.__PSM_HOST_REACT__` through a
  small `hostReact()` helper instead of importing a separate React runtime.
- Heavy or experimental dependencies belong inside the plugin package, not the main app.
- Use least permissions. Declare only the `ctx.psm` capabilities the plugin actually calls.

## Source Types

The Settings -> PSM Plugins page presents these sources as a grouped list: built-in, npm, local path, and dev preview.

| Source | Use For | Entry |
|--------|---------|-------|
| `builtin` | First-party plugins checked into this repo | `extensions/psm-*` auto-discovery, unless excluded in `src/plugins/runtime-host/builtins.ts` |
| `npm` | Published or managed external plugins | package `package.json#psm.extensions`, installed under `~/.pi/pi-session-manager/extensions/npm` |
| `path` | Local/private development plugins | absolute built `.js` / `.mjs` file in `plugins.json#customPaths` |
| `dev` | External plugin project development | external project directory in `plugins.json#devProjects`; Settings runs `npm run build` and loads `package.json#psm.extensions` |

Built-in plugins do not need Dev Preview. First-party `extensions/psm-*` plugins
are imported directly through `src/plugins/runtime-host/builtins.ts` and are
handled by the main app's Vite/Tauri development pipeline.

Path plugins point at built output, for example:

```text
/absolute/path/to/my-psm-plugin/dist/index.mjs
```

Never point a path plugin at `index.ts`, `index.tsx`, or source directories.
Use Dev Preview for external plugin source directories instead.

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

## Type Contracts

Built-in plugins get TypeScript coverage from the repo source graph. When a
built-in plugin imports an app TSX component, its props, hooks, and helper types
come from the original source files and are checked with the main app build.

External plugins only get types from public package or host exports. Before
documenting any app component or helper as usable by `npm`, `path`, or `dev`
plugins, export a stable TypeScript contract for all of it:

- component props and slots
- command arguments and results
- contribution descriptors and dispose handles
- settings schemas and stored values
- `ctx.psm`, `ctx.ui`, `ctx.settings`, and `ctx.i18n` additions

Do not expose a runtime value to external plugins without the matching type
export. Prefer reusing existing SDK types, and add new SDK types before adding
new host behavior.

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

For active development of an external plugin, add the plugin project directory
through Dev Preview in Settings -> PSM Plugins. The project must have a `build`
script and `package.json#psm.extensions`; click Rebuild after source edits.
For built-in plugins, edit the repo-local `extensions/psm-*` source directly and
let the main app dev server reload it.

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

When a path/dev plugin reports `Invalid PSM plugin manifest: manifest must be an object` while
`module exports` includes `manifest`, treat it as a bundle/runtime-boundary failure first. Check the
built file for leaked host dependencies before editing the manifest:

```bash
rg "@/components|@/hooks|react-i18next|@tanstack/react-virtual|process\.env\.NODE_ENV|react\.development" extensions/<plugin>/dist/index.mjs
```

A healthy external bundle should not contain app component names such as `ProjectList`, host hooks,
or browser-unsafe Node globals. Rebuild after removing those imports, then reload plugins.
