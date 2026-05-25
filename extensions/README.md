# Pi Session Manager Extensions

This directory contains Pi Agent extensions and PSM browser-plugin examples.

For plugin authoring workflow, see [`agent-docs/06-plugins.md`](../agent-docs/06-plugins.md).
For the public PSM plugin contract, see [`docs/PSM_PLUGIN_SDK.md`](../docs/PSM_PLUGIN_SDK.md).
For the current SDK capability audit and remaining gaps, see [`docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md`](../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md).

The Settings -> PSM Plugins page is a source-grouped list:

| Source | Shown as | Where it comes from |
| --- | --- | --- |
| `builtin` | Built-in | `extensions/psm-*` in this repo |
| `npm` | npm | managed workspace under `~/.pi/pi-session-manager/extensions/npm` |
| `path` | Local | explicit `.js` / `.mjs` entries in `plugins.json#customPaths` |

Built-in PSM plugins live under `extensions/psm-*`. They are discovered at startup and can be disabled through the Settings UI or `~/.pi/pi-session-manager/plugins.json`.

External PSM plugins are loaded in two ways:

- install an npm package into the managed npm workspace
- add an explicit local `.js` or `.mjs` entry path through Settings -> PSM Plugins

```bash
npm install --prefix ~/.pi/pi-session-manager/extensions/npm <package>
```

A plugin package declares browser-compatible ESM entries through `package.json#psm.extensions`.
A path plugin points directly to a built browser-compatible ESM file such as
`/absolute/path/to/my-psm-plugin/dist/index.mjs`.
If the plugin renders React UI, follow the host React pattern used by
`extensions/psm-cache-usage-path`: read `globalThis.__PSM_HOST_REACT__` through a
small `hostReact()` helper instead of importing a separate React runtime.

## SDK Capability Notes

The public SDK package is `@pi-session-manager/plugin-sdk`. It intentionally exposes only the stable browser-plugin contract:

- manifest and package validation helpers
- plugin host context and activation types
- command/tool registration
- app-view, app-sidebar, session toolbar, main-view, panel, tree-view, and tool-renderer UI contributions
- plugin settings and i18n clients
- the `ctx.psm` capability client for selected plugin-safe PSM operations

It does not export the runtime host, app transport, Tauri APIs, npm plugin installation internals, or desktop-private implementation.

Current `ctx.psm` namespaces:

| Namespace | Methods |
| --- | --- |
| `records` | `search`, `listForScope`, `upsert`, `refreshSessionIntelligence` |
| `sessions` | `scan`, `list`, `readEntries`, `readFileChunk`, `getLabels`, `open` |
| `search` | `fulltext`, `pluginRecords` |
| `sidechat` | `ask`, `askStream` |
| `models` | `listOptions` |
| `tags` | `listTags`, `createTag`, `assignTag`, `removeTag`, `listSessionTags` |
| `config` | `read`, `write` |

## PSM Plugins

| Plugin | Purpose | Permissions |
| --- | --- | --- |
| [psm-kanban-board](./psm-kanban-board/) | Provides an app-level board view plus a sidebar bound with `appViewId` through `ctx.ui.registerAppView(...)` / `ctx.ui.registerAppSidebarView(...)` | `sessions:read`, `tags:read`, `tags:write`, `config:read`, `config:write` |
| [psm-session-summary](./psm-session-summary/) | Generates session intelligence and writes `session.intelligence` plugin records | `sessions:read`, `records:read`, `records:write`, `model:invoke` |
| [psm-sidechat](./psm-sidechat/) | Session Q&A command/tool and toolbar panel example | `sessions:read`, `model:invoke`, `records:read`, `records:write` |
| [psm-trace](./psm-trace/) | Session trace analytics main view parsed in the plugin runtime | `sessions:read` |
| [psm-word-cloud](./psm-word-cloud/) | Demonstrates Cmd+K plugin commands plus global/project user-message word cloud app views from session-list preview fields | `config:read`, `config:write` |

## SDK Capability Notes

The public SDK is a browser-plugin contract, not the whole app.
A good plugin starts with the SDK docs and only uses host-owned surfaces through the permission-aware `ctx.psm` client.

The most important current capabilities to remember are:

- `records.upsert` accepts `indexValues`
- `sessions.readEntries(..., { limit })` is supported
- `sidechat` exposes both `ask` and `askStream`
- `ctx.ui.registerSessionTreeView(...)` exists for tree-style session views
- `ctx.events.subscribe(...)` is available for host-emitted events

The SDK is not intended to expose every backend dispatch command. Commands such as database reset, API key management, raw terminal I/O, app settings, devtools, and plugin installation remain host-internal or privileged.

## Built-In Plugins

`extensions/psm-sidechat` is a full logic + UI plugin. It registers:

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

The app shell renders these through runtime-host UI contributions; it no longer hard-codes sidechat or summary UI in `AppSessionViewerPane`.

`extensions/psm-kanban-board` registers both the app-level `/kanban` view and its matching app sidebar view. Workspace state is plugin-owned JSON config via `ctx.psm.config`, while the app shell only provides generic app-surface data to registered app UI contributions.

## Development

### Install Locally

```bash
# Symlink into the Pi extension directory
ln -sf $(pwd)/extensions/pi-session-bridge ~/.pi/agent/extensions/pi-session-bridge
ln -sf $(pwd)/extensions/resume-x ~/.pi/agent/extensions/resume-x
ln -sf $(pwd)/extensions/rename-nag ~/.pi/agent/extensions/rename-nag
```

### Temporary Testing

```bash
pi -e extensions/rename-nag/index.ts
```

### Dependencies

- **better-sqlite3** (`^12.9.0`): used by `pi-session-bridge` and `resume-x` for SQLite access, resolved from the project root `node_modules`
- **@mariozechner/pi-coding-agent**: older Pi extension API used by `pi-session-bridge`
- **@earendil-works/pi-coding-agent** / **@earendil-works/pi-tui**: newer Pi extension APIs used by `resume-x` and `rename-nag`; injected by the Pi runtime and not declared by these packages
