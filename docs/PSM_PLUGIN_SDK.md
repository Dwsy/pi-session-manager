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
import type { PsmPluginHostContext, PsmPluginManifest } from '@dwsy/plugin-sdk'

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
@dwsy/plugin-sdk
```

It re-exports the public surface from `packages/runtime-sdk/src/index.ts`:

- `types`
- `manifest`
- `client`

That means the SDK package is a small, stable facade. It is not the runtime host.

External plugin projects consume it as a devDependency (type-only imports are
erased at build time):

```bash
npm install --prefix <plugin-project> --save-dev @dwsy/plugin-sdk
```

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
| `projects:read` | Detect project kinds from the fixed marker-file catalog in auto-authorized project directories (known projects); no file content is exposed |
| `windows:open` | Open host-managed popup windows |
| `usage:read` | Read local AI agent login credentials and fetch read-only official subscription usage (opt-in, sensitive) |
| `terminal:read` | Read persisted PSM built-in terminal transcripts (opt-in, sensitive; no PTY control) |

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

### `agentUsage`

| Method | Notes |
| --- | --- |
| `getStatus(options?)` | Returns local agent subscription/quota snapshots. Requires `usage:read`. Optional `providerIds` filters the host collector. Tokens never appear in the response. |

### `terminalHistory`

| Method | Notes |
| --- | --- |
| `listSessions()` | Lists persisted PSM built-in terminal transcripts, including cwd, shell, timestamps, size, and whether the terminal is still active. Requires `terminal:read`. |
| `readTranscript(id, options?)` | Reads append-only transcript JSONL as parsed entries. `offset` + `maxBytes` provide bounded pagination. Requires `terminal:read`. |

`terminalHistory` is intentionally read-only. Raw PTY lifecycle and input commands (`terminal_create`, `terminal_write`, `terminal_resize`, `terminal_close`) remain host-internal.

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

### `projects`

| Method | Notes |
| --- | --- |
| `detect(paths?)` | Detects project kinds from marker files. Without `paths` every auto-authorized project root is scanned. Paths outside the whitelist (directories PSM has no sessions for) come back `authorized: false` and are never read. Requires `projects:read`. |

`projects.detect` is the backend scan boundary for project directories: the
backend checks only the existence of a fixed marker catalog at the directory top
level (plus the `src-tauri/` convention) and returns a normalized `kind` (`rust`,
`react`, `tauri`, ...). It never returns file contents and never recurses.

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
| `ctx.ui.registerSessionListColumn(...)` | Add a column to host session tables |
| `ctx.ui.registerSessionToolbarItem(...)` | Add a session toolbar item |
| `ctx.ui.registerSessionMainView(...)` | Add a main session view |
| `ctx.ui.registerSessionPanel(...)` | Add a right-side session panel |
| `ctx.ui.registerSessionTreeView(...)` | Add a tree-style session view |
| `ctx.ui.registerToolRenderer(...)` | Customize tool-call rendering |
| `ctx.ui.registerSelectionAction(...)` | Add a floating action next to transcript text selections |
| `ctx.ui.registerSessionHighlightProvider(...)` | Re-anchor and render plugin text highlights |

`registerSessionToolbarItem(...)` also supports the narrow `hostSlot` takeover contract for host-owned controls. Setting `hostSlot: 'system-prompt-tools'` replaces the built-in **System Prompt & Tools** control with the plugin's `render(...)` result while preserving the normal `panelId`/`togglePanel` render props. Only one active plugin may occupy a named host slot; later registrations are rejected with a diagnostic.

App views can be bound to sidebars with `appViewId`. Tool renderers can match by exact name, regular expression, or predicate.

### Session list columns

`ctx.ui.registerSessionListColumn(...)` adds a column to host session tables, such as the
main-view browser at `/explorer`. Use it to surface plugin state next to every session
instead of hiding it behind a hover action.

```ts
export interface PsmSessionListColumnRenderProps {
  session: PsmSessionReference
  onOpenSession: () => void
}

export interface PsmSessionListColumnRegistration {
  id: string
  title: string
  width?: number
  align?: 'left' | 'center' | 'right'
  order?: number
  render(props: PsmSessionListColumnRenderProps): unknown
}
```

Rules:

- `order` sorts plugin columns against each other; it defaults to `100` and ties break by `id`.
- `width` is a fixed pixel width. The host adds it to the table's minimum width, so keep it small.
- Cells render once per visible row inside a virtualized table. Keep them cheap and side-effect free.
- A cell that cannot resolve its data must render `null` rather than throw.

### Session viewer controller

Session toolbar items, session panels, and session main views receive `PsmSessionUiRenderProps`.
That shared props object now includes an optional host-owned viewer controller:

```ts
export interface PsmSessionRevealOptions {
  align?: 'auto' | 'center' | 'start' | 'end'
  highlight?: boolean
}

export interface PsmSessionToolRevealOptions extends PsmSessionRevealOptions {
  expand?: boolean
}

export interface PsmSessionViewerController {
  revealEntry(entryId: string, options?: PsmSessionRevealOptions): void
  revealToolCall(toolCallId: string, options?: PsmSessionToolRevealOptions): void
  navigateBranch?(
    leafEntryId: string,
    targetEntryId: string,
    options?: PsmSessionRevealOptions,
  ): void
}

export interface PsmSessionUiRenderProps {
  session: PsmSessionReference
  activeEntryId?: string | null
  panelOpen?: boolean
  togglePanel?: () => void
  closePanel?: () => void
  mainViewOpen?: boolean
  toggleMainView?: () => void
  closeMainView?: () => void
  width?: number
  onWidthChange?: (width: number) => void
  viewer?: PsmSessionViewerController
}
```

Use this controller when a plugin needs to reveal content inside the current session viewer without depending on host-private DOM ids or React state.

Rules:

- `viewer` is optional. Guard every call with `props.viewer?.…`.
- `revealEntry(...)` is the generic path for message-level navigation.
- `revealToolCall(...)` is the preferred path for tool/widget reveal flows; pass the original tool call id from session content.
- `navigateBranch?(leafEntryId, targetEntryId, ...)` activates one terminal branch while revealing a possibly earlier entry on that branch. Guard it because older hosts may not provide it.
- The host owns active-branch state, scrolling, turn expansion, highlight timing, and tool-card expansion details.
- Tree views keep using `onNavigate(leafId, targetId)`; branch-aware main views use `viewer.navigateBranch?` rather than private DOM or state access.

Example:

```ts
ctx.ui.registerSessionPanel({
  id: 'acme.widgets.panel',
  title: 'Widgets',
  render: (props) => {
    return (
      <button
        type="button"
        onClick={() => props.viewer?.revealToolCall('call-widget-1', {
          expand: true,
          align: 'center',
        })}
      >
        Reveal widget
      </button>
    )
  },
})
```

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

## Text Selection and Highlights

Selection and highlight flows split along the same host/plugin line as the
rest of the SDK: the host owns the transcript DOM, plugins own the data and
the popovers.

### Selection contract

A selection is always contained in a single transcript entry. Cross-entry
selections are rejected by the host and never reach plugin code.

```ts
export interface PsmTextQuoteSelector {
  exact: string // selected text, whitespace-normalized
  prefix?: string // up to 32 chars before the match
  suffix?: string // up to 32 chars after the match
}

export interface PsmSessionSelection {
  sessionPath: string
  sessionId?: string
  entryId: string
  entryRole?: string
  selectedText: string
  textQuote: PsmTextQuoteSelector
}
```

### Selection actions

`ctx.ui.registerSelectionAction(...)` contributes one button to the floating
menu the host shows next to a text selection. The host renders the button and
handles keyboard navigation; the plugin provides the label and `run`.

```ts
export interface PsmSelectionActionRegistration {
  id: string
  title: string
  icon?: string // host-known icon name: bookmark, note, tag, star, sparkles, search, copy
  order?: number // default 100
  when?(selection: PsmSessionSelection): boolean
  run(props: PsmSelectionActionRenderProps): void | Promise<void>
}

export interface PsmSelectionActionRenderProps {
  selection: PsmSessionSelection
  close(): void // dismiss the menu
  openPanel?(panelId: string): void // open a registered session panel
}
```

`selection`-scoped commands also receive the active selection as
`context.selection` (`PsmPluginCommandContext`).

### Highlight providers

`ctx.ui.registerSessionHighlightProvider(...)` lets a plugin rehydrate text
highlights into the rendered transcript. The host re-anchors quotes after DOM
rebuilds (virtual scrolling, streaming) and falls back silently when a quote
no longer matches.

```ts
export interface PsmSessionHighlight {
  id: string // stable inside the provider
  entryId: string
  textQuote: PsmTextQuoteSelector
  label?: string // hover tooltip
  hue?: number // 0-360 highlight hue
}

export interface PsmSessionHighlightProviderRegistration {
  id: string
  resolveHighlights(props: {
    session: PsmSessionReference
  }): PsmSessionHighlight[] | Promise<PsmSessionHighlight[]>
  renderPopover?(props: {
    session: PsmSessionReference
    highlight: PsmSessionHighlight
    anchor: HTMLElement
    close(): void
  }): unknown
  subscribe?(onChange: () => void): (() => void) | void
}
```

Rules:

- `resolveHighlights` runs per session open and on provider changes; keep it
  cheap and side-effect free beyond its own data reads.
- `renderPopover` is optional; without it, `label` is the only hover feedback.
- `anchor` is the host-owned `<mark>` element; do not mutate or retain it.
- Highlight marks disappear with their DOM; re-anchoring is the host's job.
- `subscribe` lets a provider push data changes (create/edit/delete) so the
  host re-resolves immediately instead of waiting for the next session load.

Reference implementation: `extensions/psm-bookmarks` (bookmark records,
selection actions, highlight provider, session panel, explorer view).

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

## Mesh collaboration (explicit opt-in)

PSM can read and control **existing Pi Mesh Hub peers** without installing or enabling
Pi Live/bridge. Mesh owns live state, following edges, accepted messages, steer,
follow-up, and stop; PSM supplies session history, navigation, search, and
rendering. This is not a substitute transport for `ctx.psm.agent` or Pi Live.

Request `mesh:read` to enumerate; `mesh:control` is an **opt-in privileged
permission** for sending, cancelling, and modifying the real Mesh following
graph. A disabled or old Hub/host rejects calls; callers must not fallback to
another message transport. Methods are:

```ts
const peers = await ctx.psm.mesh.peers()
const target = peers.find(peer => peer.sessionId === fullSessionUuid)
if (target && (target.state === 'running' || target.state === 'waiting')) {
  await ctx.psm.mesh.send({
    targetSessionId: target.sessionId,
    text: 'Please check the last change',
    mode: 'followUp', // or 'steer'
    // fromSessionId: an ONLINE Mesh peer UUID, if following is desired
  })
}
// Explicit user action only:
await ctx.psm.mesh.cancel(fullSessionUuid)
await ctx.psm.mesh.follow({ fromSessionId: senderUuid, targetSessionId: fullSessionUuid, following: true })
// Read Herdr hosts (mesh:read), joined by exact sessionFile/sessionPath:
const herdrAgents = await ctx.psm.mesh.herdrAgents()
// User-initiated focus of an existing online peer (mesh:control); never resume/launch:
await ctx.psm.mesh.focus(fullSessionUuid)
```

Every identity must be a **full exact UUID**. The backend refuses ambiguous
duplicate peers and offline targets; do not use partial IDs, machine-local
guesses, or PSM Live IDs as stand-ins. A successful Mesh send receipt means
the target extension acknowledged delivery, not that the model completed a
turn. On transport errors, unknown outcomes, or disconnection, retain drafts
and do not retry automatically.

For file-backed history missing from the current PSM list, use
`ctx.psm.sessions.lookupByPath(sessionFile)` (`sessions:read`) and independently
verify both `path` and full `id` before binding it to the Mesh peer.
A memory-only Mesh session has no PSM JSONL history. An unindexed file-backed
peer must **not** be mislabeled as memory-only.

`ctx.psm.terminal.open({cwd,label})` remains a project-terminal request,
not a Herdr pane attach. In the current host it is supported only for a local
Tauri renderer with an active terminal owner; its resolved `Promise<void>`
signals that the UI accepted the request, **not** that a PTY is ready.

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
