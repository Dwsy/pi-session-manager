# PSM plugin restricted filesystem and popup SDK design

> Scope update 2026-05-26: `plugin_widgets_*` and `widgets:read` were dropped. Saved widget HTML is served through the restricted filesystem `widgets` root with `fs:read`; `ctx.psm.widgets` may remain a frontend convenience wrapper over `plugin_fs_read`, but there is no dedicated backend widget command surface.

## Background

The generative-ui renderer needs to preview saved widget HTML from `~/.pi/widgets` without copying host CSS into the plugin bundle. The immediate widget case exposes a broader SDK gap: external PSM plugins sometimes need host-mediated access to local files or popup windows, but they must not receive unrestricted Node.js, Tauri, or browser file permissions.

This design adds restricted, permission-gated SDK capabilities:

- `ctx.psm.fs`: constrained host file access through named roots and path validation
- `ctx.psm.widgets`: convenience wrapper over the `~/.pi/widgets` root and `index.json`
- `ctx.psm.windows`: optional popup/window capability, disabled by default

The goal is to make powerful local capabilities explicit, auditable, narrow, and revocable.

## Goals

| Goal | Design response |
| --- | --- |
| Preview generative-ui saved HTML faithfully | Read exact saved HTML through host-mediated widget API |
| Avoid CSS duplication in renderer plugins | Render saved HTML as `iframe srcDoc`; wrapper styles stay in saved file |
| Avoid generic Node/fs in browser plugins | SDK exposes only constrained commands, never Node APIs |
| Support future local asset plugins | Provide generic restricted filesystem roots |
| Keep popup behavior safe | Add popup permission, default disabled |
| Preserve plugin reviewability | Permissions and roots are visible in manifest/settings diagnostics |

## Non-goals

- No unrestricted filesystem access.
- No direct `file://` dependency as the primary API.
- No plugin import of Tauri APIs, Node built-ins, or host internals.
- No global popup ability for all plugins.
- No write access in the first implementation unless a later feature proves the need.

## Permission model

Add two permissions:

```ts
type PsmPermission =
  | ExistingPermission
  | 'fs:read'
  | 'widgets:read'
  | 'windows:open'
```

Meaning:

| Permission | Meaning | Default |
| --- | --- | --- |
| `fs:read` | Read files only through declared SDK roots | Denied |
| `widgets:read` | Read `~/.pi/widgets/index.json` and listed widget HTML files | Denied |
| `windows:open` | Open host-managed popup windows | Denied |

`widgets:read` does not imply general `fs:read`. It is a narrow first-party root with purpose-built APIs.

## Manifest shape

Plugins declare the capability and the allowed roots they need.

```ts
export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'local.generative-ui-renderer',
  name: 'Generative UI Renderer',
  version: '0.1.0',
  permissions: ['widgets:read'],
}
```

For generic filesystem access:

```ts
export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'acme.local-assets',
  name: 'Local Assets',
  version: '0.1.0',
  permissions: ['fs:read'],
  fileSystem: {
    roots: [
      { id: 'project-assets', path: '${project}/assets', read: true },
      { id: 'home-notes', path: '${home}/Notes', read: true },
    ],
  },
}
```

Root path tokens:

| Token | Resolves to |
| --- | --- |
| `${home}` | User home directory |
| `${project}` | Current project/workspace path, if available |
| `${config}` | PSM config directory |
| `${widgets}` | `~/.pi/widgets` |

Rules:

- Roots are read-only in MVP.
- Roots must be explicit; no implicit home access.
- Host canonicalizes every root before activation.
- Invalid roots become plugin diagnostics and are not mounted.

## SDK types

```ts
export interface PsmFsRootInfo {
  id: string
  path: string
  read: boolean
}

export interface PsmFsEntry {
  rootId: string
  path: string
  name: string
  kind: 'file' | 'directory'
  size?: number
  modifiedAt?: string
}

export interface PsmFsReadOptions {
  encoding?: 'utf-8' | 'base64'
  maxBytes?: number
}

export interface PsmFsReadResult {
  rootId: string
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
  bytes: number
  mimeType?: string
}

export interface PsmFsClient {
  roots(): Promise<PsmFsRootInfo[]>
  list(rootId: string, path?: string): Promise<PsmFsEntry[]>
  read(rootId: string, path: string, options?: PsmFsReadOptions): Promise<PsmFsReadResult>
  stat(rootId: string, path: string): Promise<PsmFsEntry | null>
}
```

Widget convenience API:

```ts
export interface PsmWidgetRecord {
  id: string
  title: string
  timestamp: string
  file: string
  width: number
  height: number
  isSVG: boolean
  cwd?: string
  interactionData?: unknown
  archivedAt?: string
}

export interface PsmWidgetHtml {
  record: PsmWidgetRecord
  html: string
  bytes: number
}

export interface PsmWidgetsClient {
  list(options?: {
    includeArchived?: boolean
    cwd?: string
    limit?: number
  }): Promise<PsmWidgetRecord[]>

  get(file: string): Promise<PsmWidgetRecord | null>

  readHtml(file: string, options?: {
    maxBytes?: number
  }): Promise<PsmWidgetHtml | null>
}
```

Window API:

```ts
export interface PsmWindowOpenParams {
  title: string
  html?: string
  url?: string
  width?: number
  height?: number
  floating?: boolean
}

export interface PsmWindowHandle {
  id: string
  close(): Promise<void>
}

export interface PsmWindowsClient {
  open(params: PsmWindowOpenParams): Promise<PsmWindowHandle>
}
```

Add to capability client:

```ts
export interface PsmCapabilityClient {
  records: PsmRecordsClient
  sessions: PsmSessionsClient
  search: PsmSearchClient
  agent: PsmAgentClient
  models: PsmModelsClient
  tags: PsmTagsClient
  config: PsmJsonConfigClient
  fs: PsmFsClient
  widgets: PsmWidgetsClient
  windows: PsmWindowsClient
}
```

## Host enforcement

### Filesystem path rules

Every filesystem command must enforce:

1. Permission exists in `__psm.permissions`.
2. Plugin manifest declares the requested root.
3. Requested path is relative to that root.
4. Path contains no drive escape, `..`, NUL, or absolute segment.
5. Host canonicalizes root and target.
6. Canonical target must start with canonical root.
7. File size must be under `maxBytes` and host maximum.
8. Only supported encodings are returned.

Suggested defaults:

| Setting | Value |
| --- | --- |
| `maxBytes` default | `2 MiB` |
| `maxBytes` hard cap | `10 MiB` |
| text encoding | UTF-8 |
| binary encoding | base64 |
| directory list cap | 500 entries |

### Widget rules

`ctx.psm.widgets` is a narrow wrapper over the same enforcement model:

- Root is fixed to `${widgets}`.
- `list()` reads only `index.json`.
- `readHtml(file)` accepts only `file` from an index record or a safe filename.
- `file` must not contain `/`, `\`, `..`, or NUL.
- Returned `html` is the saved wrapper HTML, preserving generative-ui styles.
- Returned metadata comes from `index.json`; renderer should use `record.height`.

### Popup rules

`ctx.psm.windows.open()` requires `windows:open`.

Default behavior:

- Disabled for all plugins unless permission is declared.
- Settings UI should show a clear capability label: `Can open popup windows`.
- Host may add a per-plugin toggle later, default off for external plugins.
- Window content accepts either `html` or `url`, not both.
- External URLs still pass through link confirmation rules where applicable.
- Host owns lifecycle and closes plugin windows on plugin unload.

## Transport commands

Suggested host commands:

```ts
plugin_fs_roots({ __psm })
plugin_fs_list({ rootId, path, __psm })
plugin_fs_read({ rootId, path, encoding, maxBytes, __psm })
plugin_fs_stat({ rootId, path, __psm })

plugin_widgets_list({ includeArchived, cwd, limit, __psm })
plugin_widgets_get({ file, __psm })
plugin_widgets_read_html({ file, maxBytes, __psm })

plugin_window_open({ title, html, url, width, height, floating, __psm })
plugin_window_close({ id, __psm })
```

Command handlers should live at the commands edge and delegate to a small domain module:

```text
src-tauri/src/commands/plugin_fs.rs
src-tauri/src/domain/plugin_fs.rs
src-tauri/src/commands/plugin_widgets.rs
src-tauri/src/domain/plugin_widgets.rs
```

## Generative-ui renderer flow

```text
show_widget result
  -> details.savedFile / details.fullPath / details.height
  -> renderer asks ctx.psm.widgets.readHtml(savedFile)
  -> host validates widgets:read + filename + root
  -> host returns saved wrapper HTML + index metadata
  -> renderer iframe srcDoc = html
  -> iframe height = record.height
```

Fallback order:

1. `widgets.readHtml(details.savedFile)` if available.
2. `widgets.readHtml(filename inferred from fullPath)` if safe.
3. `browse_widgets html` tool output if present.
4. `args.widget_code` fallback for old sessions with no saved file.
5. Metadata-only card if no HTML source exists.

## Security notes

- This is not a general browser file picker.
- This is not Node.js inside plugins.
- `file://` may be used only as an internal fallback or debug path, not the main SDK contract.
- Plugin code receives bytes only through permission-checked host calls.
- Host diagnostics should record denied filesystem calls with plugin id, root id, and reason, not file content.

## Tests

### SDK client tests

- `ctx.psm.fs.read()` sends `plugin_fs_read` with `__psm` permission context.
- `ctx.psm.widgets.readHtml()` sends `plugin_widgets_read_html`.
- `ctx.psm.windows.open()` sends `plugin_window_open`.
- Unsupported permissions fail manifest validation until added to `SUPPORTED_PERMISSIONS`.

### Backend/domain tests

- Reject absolute path as fs relative path.
- Reject `..` traversal.
- Reject files outside canonical root after symlink resolution.
- Reject oversized files.
- Read valid widget HTML from `~/.pi/widgets` fixture.
- Ignore malformed `index.json` gracefully with diagnostic error.

### Renderer tests

- Prefer `widgets.readHtml(savedFile)` over `args.widget_code`.
- Use `record.height` for iframe height.
- Fall back to metadata-only card when widget read fails.
- Do not embed generative-ui CSS in renderer bundle.

## Rollout plan

1. Add SDK types and permission validation.
2. Add transport client methods.
3. Add backend/domain commands for widgets only.
4. Update generative-ui renderer to use `ctx.psm.widgets`.
5. Add generic `ctx.psm.fs` after widget path is validated in practice.
6. Add `ctx.psm.windows` last, default disabled, with settings diagnostics.

## Open questions

| Question | Recommended answer |
| --- | --- |
| Should `widgets:read` imply `fs:read`? | No. Keep widget access narrow. |
| Should plugins get write access? | Not in MVP. Add `fs:write` only after a concrete use case. |
| Should popup windows be enabled by default? | No. Require `windows:open` and show capability in settings. |
| Should renderer use `file://`? | No as primary path. Use host read + `srcDoc`. |
| Should widget HTML be cached in plugin memory? | Yes, per renderer instance/session, but host remains source of truth. |
