# PSM Plugin SDK

Related:
- [PSM Plugin SDK Capability Audit](./PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md)
- [Extensions README](../extensions/README.md)

PSM plugins are browser-compatible ESM modules activated by Pi Session Manager.
The SDK is the stable public contract for plugin authors. It intentionally hides the app transport, runtime host, Tauri APIs, npm plugin management, and other desktop-private implementation details.

## What the SDK gives you

- Manifest validation and typed manifest contracts
- Permission-aware capability access through `ctx.psm`
- Command and tool registration
- App-level and session-level UI contribution APIs
- Plugin settings and i18n clients
- Event subscription hooks

## Quick Start

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'acme.session-summary',
  name: 'Acme Session Summary',
  version: '1.0.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  package: {
    name: '@acme/psm-session-summary',
    export: './dist/index.js',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke', 'agent:invoke'],
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('session-summary.refresh', async (args) => {
    const sessionPath = String(args.sessionPath)
    const agent = await ctx.psm.agent.createSession({
      purpose: 'session-summary',
      model: 'host-default',
      thinkingLevel: 'medium',
      tools: [],
      storage: { scope: 'memory' },
    })

    try {
      const entries = await ctx.psm.sessions.readEntries(sessionPath, { limit: 80 })
      const result = await ctx.psm.agent.run({
        sessionId: agent.sessionId,
        prompt: `Summarize this session:\n${JSON.stringify(entries)}`,
      })

      await ctx.psm.records.upsert({
        pluginId: 'acme.session-summary',
        scopeType: 'session',
        scopeId: sessionPath,
        recordType: 'session.summary',
        schemaVersion: 1,
        payload: { text: result.text, model: agent.model },
        searchableText: result.text,
      })

      return result
    } finally {
      await ctx.psm.agent.dispose(agent.sessionId)
    }
  })

  ctx.ui.registerSessionToolbarItem({
    id: 'acme.session-summary.toolbar',
    title: 'Refresh Summary',
    render: ({ session }) => {
      return session.name ?? session.path
    },
  })
}
```

The package entry must be browser-compatible ESM. Do not import Node built-ins in published plugin code.

## Package Shape

The public package is:

```text
@pi-session-manager/plugin-sdk
```

It re-exports the public surface from `packages/runtime-sdk/src/index.ts`:

- `types`
- `manifest`
- `client`

That means the SDK package is a small, stable facade. It is not the runtime host.

## Plugin Sources

PSM recognizes four plugin sources:

| Source | Meaning |
| --- | --- |
| `builtin` | Repo-local first-party plugins under `extensions/psm-*` |
| `npm` | External plugins installed into the managed npm workspace |
| `path` | Explicit local `.js` / `.mjs` browser-compatible ESM files |
| `dev` | Local plugin project directories built by Dev Preview |

Use Dev Preview for active local development: add the plugin project directory in Settings -> PSM Plugins, and PSM runs `npm run build` before loading the bundle declared by `package.json#psm.extensions`. Path plugins are for already-built private bundles. Published plugins should use npm.

## Manifest Contract

### Top-level fields

| Field | Purpose |
| --- | --- |
| `manifestVersion` | Manifest schema version. Current supported value is `1` |
| `id` | Stable plugin identifier |
| `name` | Human-readable plugin name |
| `version` | Plugin package version |
| `runtime` | SDK and host compatibility requirements |
| `package` | Optional npm package metadata and entry file |
| `permissions` | Declared plugin permissions |
| `records` | Plugin record declarations |
| `configuration` | Settings UI schema |
| `i18n` | Translation resources |

### Record declarations

`manifest.records` lets plugins declare the kinds of records they write.
Each declaration may include searchable paths and index declarations.

```ts
records: [
  {
    type: 'session.intelligence',
    scope: 'session',
    schemaVersion: 1,
    searchable: ['$.summary', '$.status'],
    indexes: [
      { name: 'topic', path: '$.topics[0]', type: 'text' },
      { name: 'confidence', path: '$.confidence', type: 'number' },
    ],
  },
]
```

`index` paths must be JSON paths. Use `indexValues` in `records.upsert(...)` to populate these secondary indexes.

### Configuration schema

`manifest.configuration` renders plugin settings in the host settings UI.
Use `ctx.settings.get(...)` and `ctx.settings.all()` to read the persisted values after activation.

Supported field types:

- `string`
- `number`
- `boolean`
- `select`
- `model-provider`
- `model-id`

### I18n

`manifest.i18n` provides plain JSON translation resources. The host merges them into the app i18n instance and exposes `ctx.i18n` to the plugin.

## Permissions

Plugins declare requested permissions in `manifest.permissions`. The Settings -> Plugins area shows those declarations and lets the user revoke individual permissions per plugin. The host injects only currently granted permissions into every SDK call; revoked permissions make the matching host capability fail permission checks.

Plugin-safe permissions currently include:

| Permission | Scope |
| --- | --- |
| `sessions:read` | Scan, list, and read session data |
| `records:read` | Read and search plugin records |
| `records:write` | Upsert plugin records |
| `search:read` | Full-text search |
| `tags:read` | Read tags and session-tag assignments |
| `tags:write` | Create, assign, and remove tags |
| `config:read` | Read plugin-owned JSON config |
| `config:write` | Write plugin-owned JSON config |
| `events:read` | Subscribe to host-emitted events |
| `model:invoke` | Read model options and invoke model-backed plugin features |
| `agent:invoke` | Create and run host-managed Pi Agent sessions through `ctx.psm.agent` |
| `fs:read` | Read files through declared restricted filesystem roots, including saved widget HTML under the `widgets` root |
| `windows:open` | Open host-managed popup windows |

## AI Plugin Guidance

New AI plugins should use the host-managed Pi Agent bridge:

```ts
const agent = await ctx.psm.agent.createSession({
  purpose: 'my-plugin',
  model: 'host-default',
  tools: [
    { name: 'psm.search.fulltext', permission: 'search:read' },
    { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
  ],
  storage: { scope: 'plugin', key: 'my-plugin' },
})

const result = await ctx.psm.agent.run({
  sessionId: agent.sessionId,
  prompt: 'Find the most relevant sessions for auth failures',
})
```

Declare `agent:invoke` plus the permissions for any PSM tools the agent may call.
The host owns model credentials, model resolution, Pi Agent session lifecycle, and plugin-scoped persistence.

Older helpers such as `ctx.psm.ai`, `ctx.psm.sidechat`, and
`ctx.psm.records.refreshSessionIntelligence(...)` are compatibility surfaces or
legacy backend bridges. They are not the recommended path for new plugin AI
features.

## Capability Client

`ctx.psm` is the permission-aware client for plugin-safe PSM operations.

### `records`

| Method | Notes |
| --- | --- |
| `search(params)` | Search plugin records |
| `listForScope(params)` | List records for a scope |
| `upsert(params)` | Stores `payload`, `searchableText`, and optional `indexValues` |

### `sessions`

| Method | Notes |
| --- | --- |
| `scan()` | Returns session entries from the host |
| `list(params)` | Returns paginated sessions |
| `readEntries(sessionPath, options?)` | Supports `limit` for slicing returned entries |
| `readFileChunk(sessionPath, options?)` | Reads a chunk of the JSONL file |
| `getLabels(sessionPath)` | Returns session labels |
| `open(sessionPath, options?)` | Opens in browser or terminal based on `target` |

### `search`

| Method | Notes |
| --- | --- |
| `fulltext(params)` | Full-text search over sessions |
| `pluginRecords(params)` | Convenience wrapper for plugin records search |

### `agent`

| Method | Notes |
| --- | --- |
| `createSession(params)` | Creates a host-managed Pi Agent session for the plugin |
| `run(params)` | Runs a prompt through an existing agent session |
| `runStream(params, handlers?)` | Runs a prompt and forwards streamed text deltas when the host bridge supports them |
| `abort(sessionId)` | Aborts a running agent session |
| `dispose(sessionId)` | Releases a plugin agent session |

### `models`

| Method | Notes |
| --- | --- |
| `listOptions()` | Lists available model/provider combinations |

### `tags`

| Method | Notes |
| --- | --- |
| `listTags()` | Returns all tags |
| `createTag(params)` | Creates a tag |
| `assignTag(sessionId, tagId)` | Assigns a tag to a session |
| `removeTag(sessionId, tagId)` | Removes a tag from a session |
| `listSessionTags(sessionId?)` | Lists tags for a session or all session tags |

### `config`

| Method | Notes |
| --- | --- |
| `read(key, options?)` | Reads plugin-owned JSON config |
| `write(key, value)` | Writes plugin-owned JSON config |

## Logic Contributions

Use command and tool registrations for plugin behavior that should appear in the host command palette or tool layer.

- `ctx.registerCommand(name, handler)`
- `ctx.registerCommand({ ... }, handler?)`
- `ctx.registerTool(name, { description, run })`

## UI Contributions

| API | Purpose |
| --- | --- |
| `ctx.ui.registerAppView(...)` | Add a first-class app view |
| `ctx.ui.registerAppSidebarView(...)` | Add a sidebar companion for an app view |
| `ctx.ui.registerSessionToolbarItem(...)` | Add a session toolbar item |
| `ctx.ui.registerSessionMainView(...)` | Add a main session view |
| `ctx.ui.registerSessionPanel(...)` | Add a right-side session panel |
| `ctx.ui.registerSessionTreeView(...)` | Add a tree-style session view |
| `ctx.ui.registerToolRenderer(...)` | Customize tool-call rendering |

App views can be bound to sidebars with `appViewId`. Tool renderers can match by exact name, regular expression, or predicate.

```ts
ctx.ui.registerToolRenderer({
  id: 'acme-log-renderer',
  name: 'Acme Log Renderer',
  match: /^acme_/,
  component: ({ resolvedData, context }) => {
    return context.isExpanded ? resolvedData.output : `${resolvedData.name} ready`
  },
})
```

## Events

`ctx.events.subscribe(name, handler)` listens to host-emitted app events.
This is useful for plugin-side state sync and long-lived UI surfaces.

## Runtime Notes

- First registration wins for global command, tool, view, and renderer IDs.
- Duplicate IDs are kept as host diagnostics rather than crashing the plugin.
- NPM plugins must live inside the managed npm workspace.
- Path plugins must be `.js` or `.mjs` and must point to a built browser-compatible module.
- Dev plugins must be local project directories with `package.json#psm.extensions` and an `npm run build` script.
- Do not depend on PSM app aliases such as `@/components`, `@/types`, or `@/plugins` in published plugins.
- Keep React, Lucide, and other host-provided UI dependencies as peer dependencies where appropriate.

## Recommended Entry Docs

If you are writing or debugging a plugin, read these in order:

1. `docs/PSM_PLUGIN_SDK.md`
2. `docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md`
3. `extensions/README.md`
4. `agent-docs/06-plugins.md`

## Examples

### Plugin record with indexes

```ts
ctx.psm.records.upsert({
  pluginId: 'acme.session-summary',
  scopeType: 'session',
  scopeId: session.path,
  recordType: 'session.intelligence',
  schemaVersion: 1,
  payload: {
    summary: 'Needs follow-up',
    status: 'blocked',
    topics: ['sdk', 'docs'],
  },
  searchableText: 'needs follow-up sdk docs',
  indexValues: [
    {
      recordId: `acme.session-summary:session:${session.path}:session.intelligence`,
      pluginId: 'acme.session-summary',
      recordType: 'session.intelligence',
      indexName: 'topic',
      valueText: 'sdk',
    },
  ],
})
```

### Session read with limit

```ts
const entries = await ctx.psm.sessions.readEntries(session.path, { limit: 20 })
```

### Host-managed agent run

```ts
const agent = await ctx.psm.agent.createSession({
  purpose: 'session-question',
  model: 'host-default',
  thinkingLevel: 'medium',
  tools: [{ name: 'psm.sessions.readEntries', permission: 'sessions:read' }],
  storage: { scope: 'memory' },
})

try {
  const response = await ctx.psm.agent.runStream(
    {
      sessionId: agent.sessionId,
      prompt: 'What is the blocker in this session?',
    },
    {
      onDelta(delta) {
        console.log(delta)
      },
      onDone(finalResponse) {
        console.log(finalResponse.text)
      },
    },
  )
  console.log(response.text)
} finally {
  await ctx.psm.agent.dispose(agent.sessionId)
}
```

## Legacy Compatibility

Some older host builds and backend routes still expose AI convenience calls:

- `ctx.psm.sidechat.ask(...)` / `ctx.psm.sidechat.askStream(...)`
- `ctx.psm.ai.generateText(...)` / `ctx.psm.ai.streamText(...)`
- `ctx.psm.records.refreshSessionIntelligence(...)`
- backend command `refresh_session_intelligence_record`
- HTTP endpoint `POST /v1/plugin-records/session-intelligence/refresh`

Keep these only for compatibility with existing plugins or external test
harnesses. New plugin code should use `ctx.psm.agent.createSession(...)`,
`ctx.psm.agent.run(...)` or `ctx.psm.agent.runStream(...)`, and persist plugin
output through `ctx.psm.records.upsert(...)`.

If you must call the compatibility backend route directly, treat it as a
host-owned command rather than a stable plugin SDK path.

## What is intentionally not public

The SDK does not expose:

- runtime host internals
- Tauri APIs
- plugin installation and management internals
- raw terminal I/O
- API key administration
- database maintenance commands
- desktop-private app transport details

Those remain host-owned surfaces.
