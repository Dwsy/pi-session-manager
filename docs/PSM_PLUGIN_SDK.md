# PSM Plugin SDK

Related: [PSM Plugin SDK Capability Audit](./PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md)

PSM plugins are browser-compatible ESM modules activated by Pi Session Manager.
They are separate from Pi runtime plugins, but follow the same philosophy:
manifest first, convention-based discovery, host-owned permissions, and explicit
command/tool registration.

External plugins can be loaded from npm packages or explicit local `.js` / `.mjs`
entry paths. `builtin` is reserved for repo-local first-party plugins under
`extensions/`; it is not an external plugin source.

## Architecture

```text
+----------------------------- Pi Session Manager -----------------------------+
|                                                                              |
|  React App                                                                   |
|     |                                                                        |
|     v                                                                        |
|  runtime-host                                                                |
|     |                                                                        |
|     | discovers builtin plugins from extensions/psm-*                         |
|     | discovers npm plugins from ~/.pi/pi-session-manager/extensions/npm       |
|     | discovers path plugins from plugins.json customPaths                    |
|     v                                                                        |
|  PsmPluginHost                                                               |
|     |                                                                        |
|     | validates manifest                                                     |
|     | merges i18n resources                                                   |
|     | builds settings client                                                  |
|     | injects PsmPluginHostContext                                            |
|     v                                                                        |
|  Plugin activate(ctx)                                                        |
|     |                                                                        |
|     | registerCommand / registerTool                                          |
|     | ctx.ui.registerSessionToolbarItem / registerSessionPanel                |
|     | ctx.ui.registerToolRenderer                                             |
|     | ctx.psm.sessions / records / search / sidechat / models / kanban        |
|     v                                                                        |
|  @pi-session-manager/plugin-sdk                                              |
|     |                                                                        |
|     | createPluginCapabilityClient                                            |
|     | adds __psm permission context                                           |
|     v                                                                        |
|  appPsmTransport                                                             |
|     |                                                                        |
|     | Tauri GUI: plugin_dispatch_command                                      |
|     | Web/server: normal app transport                                        |
|     v                                                                        |
|  dispatch.rs                                                                 |
|     |                                                                        |
|     | checks command permission when __psm exists                             |
|     | routes to commands/domain/data                                          |
|     v                                                                        |
|  SQLite / Tantivy / session files / model providers / terminal adapters      |
|                                                                              |
+------------------------------------------------------------------------------+
```

Only the SDK layer is public to plugin authors. The runtime host, app transport,
Tauri commands, and desktop-private adapters remain owned by the PSM host.

## Module Contract

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'npm.example.sidechat',
  name: 'Example Sidechat',
  version: '1.0.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3'
  },
  package: {
    name: '@example/psm-sidechat',
    export: './dist/index.js'
  },
  permissions: ['sidechat:ask']
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('sidechat.ask', async (args) => {
    return ctx.psm.sidechat.ask({
      sessionPath: String(args.sessionPath),
      question: String(args.question)
    })
  })
}
```

The package entry must be a browser-compatible ESM bundle. PSM does not load
TypeScript directly and does not support Node built-ins inside browser plugins.

## SDK Package

The public SDK package is:

```text
@pi-session-manager/plugin-sdk
```

It exports only `packages/runtime-sdk/src/index.ts`: manifest/types, validation helpers,
UI contribution types, and the capability client factory. It does not export app transport,
the runtime host, Tauri APIs, or desktop-private implementation.

## Source Policy

PSM recognizes three plugin sources:

- `builtin`: repo-local first-party plugins checked into this repository under `extensions/`.
- `npm`: external plugins installed into the managed npm workspace.
- `path`: explicit local `.js` or `.mjs` browser-compatible ESM entry files listed in `plugins.json`.

PSM does not load remote URLs, git checkouts, `file:` dependencies, or raw TypeScript files.
Path plugins are for local development and private plugins; published plugins should use npm.

## NPM Package Shape

Install packages into the PSM-managed npm workspace:

```bash
npm install --prefix ~/.pi/pi-session-manager/extensions/npm <package>
```

Declare PSM entries in `package.json`:

```json
{
  "name": "@example/psm-sidechat",
  "type": "module",
  "psm": {
    "extensions": ["./dist/index.js"]
  }
}
```

PSM scans `~/.pi/pi-session-manager/extensions/npm/node_modules/**/package.json`
for `psm.extensions`.

The package should declare normal npm metadata and keep host-provided libraries as peer
dependencies when they are used by UI contributions:

```json
{
  "peerDependencies": {
    "@pi-session-manager/plugin-sdk": "^0.1.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "lucide-react": "^0.468.0"
  }
}
```

Tailwind classes may be authored in TSX or plugin-owned `styles.ts` files. Published bundles
must not depend on PSM app aliases such as `@/components`, `@/types`, or `@/plugins`.

## Local Path Plugin Shape

Path plugins point directly to a built browser-compatible ESM file:

```text
/absolute/path/to/my-psm-plugin/dist/index.mjs
```

The entry file must be `.js` or `.mjs`, stay under the host module size limit, and export the
same `manifest` plus `activate` contract as npm plugins. Add or remove path plugins from
Settings -> PSM Plugins, or edit `customPaths` in `plugins.json`.

Path plugins are loaded from local disk only. They are not package-managed by PSM; rebuild the
file yourself, then use Reload in Settings -> PSM Plugins.

## Configuration

Plugin enablement is stored in:

```text
~/.pi/pi-session-manager/plugins.json
```

Example:

```json
{
  "version": 1,
  "customPaths": [
    "/absolute/path/to/my-psm-plugin/dist/index.mjs"
  ],
  "plugins": {
    "builtin.session-summary": {
      "enabled": true,
      "source": "builtin"
    },
    "npm.example.sidechat": {
      "enabled": false,
      "source": "npm",
      "packageName": "@example/psm-sidechat"
    },
    "path.example.local": {
      "enabled": true,
      "source": "path",
      "entryPath": "/absolute/path/to/my-psm-plugin/dist/index.mjs"
    }
  }
}
```

Repo-local built-ins under `extensions/psm-*` are discovered automatically and
can be disabled through the same config/UI.

## Capabilities

Logic contributions:

- `ctx.registerCommand(name, handler)`
- `ctx.registerTool(name, { description, run })`
- `ctx.psm.sessions`
- `ctx.psm.records`
- `ctx.psm.search`
- `ctx.psm.sidechat`
- `ctx.psm.models`
- `ctx.psm.kanban`

UI contributions:

- `ctx.ui.registerSessionToolbarItem({ id, title, panelId?, render })`
- `ctx.ui.registerSessionPanel({ id, title, side: 'right', render })`
- `ctx.ui.registerToolRenderer({ id, name, match, component, ... })`

Tool renderers customize how session tool calls are displayed. `match` may be an exact tool
name, a `RegExp`, or a predicate over the raw tool call. `component` receives resolved tool
data, search query, and the host-owned render context for expansion, clipboard, theme, mobile,
and i18n state.

```ts
export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer({
    id: 'acme-log-renderer',
    name: 'Acme Log Renderer',
    match: /^acme_/,
    priority: 120,
    component: ({ resolvedData, context }) => {
      return context.isExpanded ? resolvedData.output : `${resolvedData.name} ready`
    },
    getSearchSegments: (_toolCall, data) => [data.name, data.output],
  })
}
```

Renderer IDs are global inside the host. First registration wins. A later duplicate keeps the
plugin active but records a `warn` diagnostic. Registered renderers are removed when the host
reloads plugins or when activation fails.

Configuration contributions:

- `manifest.configuration`
- `ctx.settings.get(key, fallback)`
- `ctx.settings.all()`

I18n contributions:

- `manifest.i18n`
- `ctx.i18n.t(key, fallback, options?)`
- `ctx.i18n.language`

Toolbar and panel `render(...)` receive the active session plus panel state helpers.
First-party built-ins may return React nodes; npm bundles should stay browser-compatible ESM.
Tool renderer components may also return React-compatible nodes, but published bundles must
obtain React from their normal package/peer dependency boundary rather than importing PSM app internals.

Every SDK call carries the plugin permission context when the plugin declares
permissions. Backend permission checks are enforced through `plugin_dispatch_command`.

## Per-Plugin Configuration

Plugins declare VS Code-style independent settings in `manifest.configuration`. PSM renders
those fields inside that plugin's Settings -> PSM Plugins card, persists values under the
plugin's own `plugins.json` entry, reloads the host, and exposes merged defaults + saved
values through `ctx.settings`.

```ts
export const manifest = {
  manifestVersion: 1,
  id: 'acme.sidechat',
  name: 'Acme Sidechat',
  version: '1.0.0',
  configuration: {
    title: 'Sidechat Settings',
    properties: [
      { key: 'thinkingLevel', title: 'Thinking level', type: 'select', default: 'medium', options: [
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ] },
      { key: 'snippetLimit', title: 'Snippet limit', type: 'number', default: 8, min: 4, max: 12 },
      { key: 'showQuickPrompts', title: 'Show quick prompts', type: 'boolean', default: true },
    ],
  },
}
```

Supported field types are `string`, `number`, `boolean`, and `select`. Plugins should read
settings through `ctx.settings.get(...)` during activation and pass normalized values into
commands/UI components.

## Plugin I18n Resources

Plugins provide plain JSON translation resources through `manifest.i18n`; they should not create
private `i18next` instances or depend on the app's React hooks. The runtime host merges those
resources into the project i18n instance, then injects `ctx.i18n` into plugin activation context.
Plugin UI receives that injected client and calls `i18n.t(...)`.

```ts
// i18n.ts
export const sidechatI18n = {
  'en-US': { session: { sideChat: { title: 'Side chat' } } },
  'zh-CN': { session: { sideChat: { title: '会话侧聊' } } },
}

// manifest.ts
export const manifest = {
  id: 'acme.sidechat',
  i18n: sidechatI18n,
}
```

First-party plugins should keep `manifest.ts`, `settings.ts`, `i18n.ts`, TSX components, and
`styles.ts` separate so external plugin authors can copy a clean package structure.

## Runtime Diagnostics

Plugin status diagnostics are structured as `{ level, message }`:

- `info`: host metadata or non-actionable lifecycle notes.
- `warn`: recoverable issues. Command/tool name conflicts are warnings; the plugin still stays `active`.
- `error`: module load, manifest validation, or activation failures. These mark the plugin as `error`.

The host also records `loadTimeMs` for loaded plugins. NPM plugins may include
`moduleModifiedMs` and `sourceHash` from the discovered bundle, which helps detect
whether a plugin source changed before reload.

## Command And Tool Conflicts

Command, tool, tool renderer, toolbar item, and panel IDs are global inside the PSM plugin host.
First registration wins. If a later plugin registers the same ID, the host keeps the
original registration, adds a `warn` diagnostic to the later plugin, and keeps that
later plugin `active` unless activation itself throws.

## NPM Bundle Constraints

NPM plugin bundles are loaded only from the PSM-managed directory:

```text
~/.pi/pi-session-manager/extensions/npm
```

The module source reader rejects:

- paths outside the managed npm directory
- files that are not `.js` or `.mjs`
- bundles larger than 2 MiB

The package entry must still be a browser-compatible ESM bundle declared through
`package.json#psm.extensions`.

NPM bundles must not:

- import `@/components`, `@/types`, `@/plugins`, or other PSM app aliases
- import runtime-host internals or `appPsmTransport`
- import Tauri APIs directly
- use Node built-ins in browser plugin code
- execute install-time scripts for runtime behavior
- load additional code from remote URLs at activation time

## Built-In Plugins

`extensions/psm-sidechat` is now a full logic + UI plugin. It registers:

- command `sidechat.ask`
- tool `sidechat_ask`
- session toolbar button
- right-side session panel
- configuration for provider/model, thinking level, snippet limit, panel width, option expansion, and quick prompts

`extensions/psm-session-summary` is also a full logic + UI plugin. It registers:

- command `session-summary.refresh`
- tool `session_summary_refresh`
- session intelligence toolbar popover
- configuration for provider/model, language, auto-open behavior, metadata, topics, next steps, and unresolved sections

The app shell renders these through runtime-host UI contributions; it no longer hard-codes
sidechat or summary UI in `AppSessionViewerPane`.

## Local Debugging

```bash
npm run build
npm install --prefix ~/.pi/pi-session-manager/extensions/npm .
```

Then open Settings -> PSM Plugins and use Reload. If loading fails, inspect the plugin
status diagnostics. For source changes, rebuild the package and reload; the host will
surface updated mtime/hash metadata for npm entries.
