# PSM Plugin Capability Status And Decoupling Notes

Date: 2026-05-23

## Purpose

This note is a short architecture snapshot for the current PSM plugin capability line:

- generic `plugin_records`
- `@pi-session-manager/plugin-sdk`
- `session.intelligence`
- `sidechat`
- opt-in permission enforcement
- npm-installable plugins with logic + UI contributions

Use this document for review and for planning the next decoupling phase.

## What Is Working Now

### Backend substrate

Rust owns the authoritative kernel surface:

- session scanning and reading
- SQLite persistence
- FTS-backed search
- plugin record storage
- model invocation
- HTTP / WS / Tauri command routing

The current plugin-facing record substrate is:

- `plugin_records`
- `plugin_records_fts`
- `plugin_record_index_values`

### Runtime SDK

`packages/runtime-sdk/` now provides a stable TypeScript capability client and UI contribution contract for:

- `sessions`
- `records`
- `search`
- `kanban`
- `sidechat`
- `models`

Plugins can register logic (`commands`, `tools`) and session UI (`toolbar items`, `right panels`). The client can also attach an optional permission envelope:

```ts
createPluginCapabilityClient({
  transport: appPsmTransport,
  permissions: {
    pluginId: 'builtin.session-intelligence-toolbar',
    permissions: ['records:read', 'records:write', 'model:invoke'],
  },
})
```

That becomes:

```json
{
  "__psm": {
    "pluginId": "builtin.session-intelligence-toolbar",
    "permissions": ["records:read", "records:write", "model:invoke"]
  }
}
```

### Permission enforcement

`src-tauri/src/dispatch.rs` now enforces permissions for requests carrying `__psm`.

Important property:

- enforcement is opt-in
- legacy app-internal calls without `__psm` are still allowed

This is deliberate, so current application paths do not break while plugin-style callers become governable.

### Real runtime entry points already wired

These runtime entry points now pass explicit permission context or are registered through plugin UI contributions:

- `src/plugins/plugin-records/PluginRecordSearchPlugin.tsx`
- `extensions/psm-session-summary/index.ts`
- `extensions/psm-sidechat/index.ts`

## Current Boundary

Today there are two classes of caller, plus a host responsibility boundary for future npm-installed plugins:

### 1. Stable plugin SDK surface

This is the surface future npm-installable PSM plugins may import from a published SDK package.

Stable enough to design against now:

| Surface | Status | Notes |
|---|---|---|
| `PsmPluginManifest` | Stable V1 shape, with optional `manifestVersion`, `runtime`, and `package` metadata | Existing repo-local manifests without those optional fields remain valid. |
| `PsmPermission` names | Stable V1 permission vocabulary | Backend dispatch maps these names to command-level checks when `__psm` is present. |
| `PsmRecordDeclaration` | Stable V1 record declaration format | Uses JSON text payloads and Rust-owned projection/indexing. |
| `PsmTransport` | Stable interface | Plugins receive a host-provided transport; they should not import app-local transport modules. |
| `createPluginCapabilityClient(...)` | Stable V1 client factory | Adds `__psm` only when the host/plugin supplies permission context. |
| `PsmPluginHostContext` and activation types | First-pass host contract | Describes activation, command/tool registration, session UI registration, and disposal hooks for npm-installed plugins. |

Not part of the publishable SDK package:

- `appPsmTransport`, because it imports PSM frontend internals and is only the in-app host adapter.
- React components, app hooks, providers, stores, i18n setup, and UI layout internals.
- Rust command implementations and SQLite modules. Plugins access them only through governed capabilities.

### 2. App-internal direct callers

These still use direct `invoke(...)` or provider wrappers, for example:

- `src/runtime-data/providers/sessionProviders.ts`
- `src/runtime-data/providers/tagsProviders.ts`
- several UI components that directly call `invoke(...)`

These are not bugs.
They are internal application paths and should not be force-migrated blindly.

Preserved behavior:

- App-internal calls without `__psm` remain allowed.
- The SDK may be used by built-in features when it helps exercise the plugin boundary.
- Direct app calls do not need to declare plugin permissions unless the caller is intentionally acting as a PSM plugin.

### 3. Host responsibilities for npm-installable plugins

The host, not plugin code, is responsible for:

- discovering installed plugin packages
- resolving the exported plugin module
- validating `PsmPluginManifest`
- checking `manifestVersion`, SDK compatibility, and host compatibility before activation
- constructing `PsmCapabilityClient` with a permission context derived from the validated manifest
- registering plugin commands/tools/UI contributions
- isolating load and activation failures so one plugin cannot prevent the app from starting
- disposing or reloading a plugin by calling returned `dispose()` hooks and/or `deactivate()`

The plugin is responsible for:

- exporting a manifest
- using only the SDK capabilities it declared
- keeping plugin-owned state in `plugin_records` or later governed storage APIs
- avoiding direct imports from `src/`, Tauri APIs, SQLite code, or local provider internals

## What Is Still Coupled

The current implementation is good enough for built-in or repo-local plugin-style features, but not yet clean enough for npm-installable external plugins.

Key coupling points still present:

### 1. Host/runtime coupling

`appPsmTransport` assumes the plugin runs inside the PSM frontend runtime.

That means external npm plugins cannot yet be treated as independently packaged extensions with a loader contract.

### 2. No plugin loader lifecycle

There is no formal plugin lifecycle for:

- discovery
- loading
- version compatibility checks
- capability negotiation
- failure isolation
- unload / reload behavior

### 3. Boundary is architectural, not packaged

The plugin API exists as source-level contracts inside the app repo, but not yet as a clean published package boundary.

### 4. Mixed command paths

Some plugin-style calls go through dispatch-backed routing.
Much of the app still uses direct Tauri command invocation.

That is acceptable now, but it means the extension model is not yet the dominant access path.

## First-pass npm-installable Plugin Design

The V1 design is intentionally local and reviewable. It does not introduce remote code execution, sandboxing, or a plugin marketplace.

### Package boundary

Publishable package shape:

- `@pi-session-manager/plugin-sdk`
- exports: manifest types, permission types, record declaration types, `PsmTransport`, `createPluginCapabilityClient`, and plugin activation/host context types
- excludes: `appPsmTransport`, app stores, React components, Rust command modules, and local service providers

Plugin package shape:

```json
{
  "name": "@example/psm-session-summary",
  "version": "1.0.0",
  "type": "module",
  "peerDependencies": {
    "@pi-session-manager/plugin-sdk": "^0.1.0"
  },
  "exports": {
    ".": "./dist/index.js"
  }
}
```

Plugin module shape:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'npm.example.session-summary',
  name: 'Example Session Summary',
  version: '1.0.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  package: {
    name: '@example/psm-session-summary',
    export: '.',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke'],
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('session-summary.refresh', async (args) => {
    return ctx.psm.records.refreshSessionIntelligence({
      path: String(args.path),
    })
  })
}
```

### Manifest and version compatibility

The host accepts:

- missing `manifestVersion` only for existing repo-local/built-in plugins
- `manifestVersion: 1` for npm-installable plugins
- `runtime.sdk` compatible with the installed SDK package
- `runtime.host` compatible with the app version, when present
- only permissions known to the current host
- record scopes and index types known to the current host

The host rejects or disables:

- unsupported `manifestVersion`
- missing or incompatible `runtime.sdk` for npm plugins
- permissions that the host cannot enforce
- malformed record declarations
- package metadata that does not match the installed package identity

The current code validates the manifest shape and known permissions. Full semver comparison and installed-package identity checks are deferred to the loader implementation.

### Loader lifecycle

Proposed host lifecycle:

1. Discover installed package entries from a PSM-managed plugin directory or lockfile.
2. Resolve the package export to an ESM module.
3. Read `module.manifest`.
4. Validate manifest schema and compatibility.
5. Create a permission context from `manifest.id` and `manifest.permissions`.
6. Create a host transport and `PsmCapabilityClient`.
7. Build `PsmPluginHostContext`.
8. Call `module.activate(ctx)` or `module.default(ctx)`.
9. Store command/tool registrations and the returned `dispose()` handle.
10. On reload/uninstall, unregister contributions, call `dispose()`, then call `deactivate()` if present.

### Failure and isolation behavior

V1 failure policy:

- Discovery failure marks only that plugin as unavailable.
- Manifest validation failure prevents activation and records a visible diagnostic.
- Compatibility failure prevents activation and records a visible diagnostic.
- Activation exceptions are caught; already registered contributions from that activation are removed.
- Command/tool handler exceptions are returned to the caller as plugin command errors.
- Permission failures are enforced by dispatch for calls carrying `__psm`.
- A plugin requesting unsupported permissions is rejected during manifest validation.
- A plugin that omits permission context is treated like an app-internal caller only when loaded as a built-in direct app feature; npm-installed plugins must receive host-derived permission context.

This is failure containment, not a security sandbox. Sandboxing and remote execution hardening are intentionally deferred.

### Distribution and install model

First-pass install model:

- Users install plugins through npm-compatible package resolution outside the runtime hot path.
- PSM copies or snapshots installed plugin artifacts into a PSM-managed local plugin directory.
- PSM records the exact package name, version, export path, manifest id, and integrity metadata in a local registry/lockfile.
- Runtime loading reads only from that managed directory/lockfile.
- The app does not fetch arbitrary package code during normal startup.

Deferred:

- marketplace discovery
- remote updates
- cryptographic signing policy
- iframe/worker sandboxing
- broad UI contribution system

## Recommended Decoupling Order

### Phase 1: Freeze current boundary

Document what is considered stable now:

- permission names
- record schema declaration format
- capability method names
- transport payload conventions

### Phase 2: Extract SDK package boundary

Split reusable SDK pieces from app-local helpers.
Goal: make plugin authoring possible without importing app internals.

### Phase 3: Define loader lifecycle

Add explicit host loader behavior for plugin modules.
This is the real prerequisite for npm-installable plugins.

### Phase 4: Decide which app-internal paths should converge

Do not migrate all direct `invoke(...)` callers.
Instead, explicitly choose which ones should become plugin-style host features.

## Non-goals For Next Step

The next decoupling pass should avoid:

- converting every app-internal `invoke(...)` to SDK use
- building a full sandbox before package boundary is stable
- inventing broad abstraction layers for one or two plugins
- changing unrelated UI architecture

## Suggested Review Questions

1. Which current capability methods are stable enough to publish as SDK surface?
2. Which current permissions are truly host-governed API, versus temporary internal wiring?
3. Should external npm plugins run in the same frontend runtime, or via a separate loader boundary?
4. Which UI contribution points are actually needed in V1?
5. What is the minimal compatibility/versioning contract for first external plugin support?
