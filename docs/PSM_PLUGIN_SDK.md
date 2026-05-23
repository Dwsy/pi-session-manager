# PSM Plugin SDK

PSM plugins are browser-compatible ESM modules activated by Pi Session Manager.
They are separate from Pi runtime plugins, but follow the same philosophy:
manifest first, convention-based discovery, host-owned permissions, and explicit
command/tool registration.

External plugins are distributed and loaded from npm packages only. `builtin` is reserved
for repo-local first-party plugins under `extensions/`; it is not an external plugin source.

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

PSM recognizes two plugin sources:

- `builtin`: repo-local first-party plugins checked into this repository under `extensions/`.
- `npm`: external plugins installed into the managed npm workspace.

External plugin authors must publish npm packages. PSM does not load external plugins from
arbitrary local paths, URLs, git checkouts, `file:` dependencies, or raw TypeScript files.

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

## Configuration

Plugin enablement is stored in:

```text
~/.pi/pi-session-manager/plugins.json
```

Example:

```json
{
  "version": 1,
  "plugins": {
    "builtin.session-summary": {
      "enabled": true,
      "source": "builtin"
    },
    "npm.example.sidechat": {
      "enabled": false,
      "source": "npm",
      "packageName": "@example/psm-sidechat"
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

Command, tool, toolbar item, and panel IDs are global inside the PSM plugin host.
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
