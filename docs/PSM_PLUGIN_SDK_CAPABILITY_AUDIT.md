# PSM Plugin SDK Capability Audit

> Date: 2026-05-23
> Scope: `@pi-session-manager/plugin-sdk`, runtime host injection, backend dispatch permissions, and shared contract reuse.

## Summary

The current PSM plugin SDK is a useful first public browser-plugin contract, but it is not yet a complete capability surface for PSM plugins. It exposes a narrow facade over selected backend commands and keeps desktop-private implementation out of the package. That boundary is good. The remaining work is to make the public capability surface complete, typed, and generated or reused from one source of truth.

The SDK should not expose every backend dispatch command. The backend currently routes far more commands than a plugin should receive by default, including dangerous or host-private operations such as database reset, API key management, raw terminal I/O, app settings, devtools, and plugin installation. The right target is complete exposure of plugin-safe capabilities, not complete exposure of the whole app control plane.

## Current Public SDK Surface

The package entry point is intentionally small:

```ts
export * from './types'
export * from './manifest'
export * from './client'
```

It exposes these public groups:

| Group | Exposed API |
| --- | --- |
| Manifest contract | `PsmPluginManifest`, `PsmPackageManifest`, runtime/package/permission/record/config/i18n declarations |
| Validation | `validatePsmPluginManifest`, `assertPsmPluginManifest`, `validatePsmPackageManifest`, `assertPsmPackageManifest` |
| Host context | `manifest`, `psm`, `permissions`, `settings`, `i18n`, `ui`, `registerCommand`, `registerTool` |
| Capability client | `createPluginCapabilityClient(options)` |
| UI contributions | session toolbar item, session main view, session right panel |
| Settings | `manifest.configuration`, `ctx.settings.get(...)`, `ctx.settings.all()` |
| I18n | `manifest.i18n`, `ctx.i18n.t(...)`, `ctx.i18n.language` |

The injected `ctx.psm` client currently has these namespaces:

| Namespace | Methods |
| --- | --- |
| `records` | `search`, `listForScope`, `upsert`, `refreshSessionIntelligence` |
| `sessions` | `scan`, `list`, `readEntries`, `readFileChunk`, `getLabels`, `open` |
| `search` | `fulltext`, `pluginRecords` |
| `sidechat` | `ask` |
| `models` | `listOptions` |
| `kanban` | `listTags`, `createTag`, `assignTag`, `removeTag`, `listSessionTags` |

The SDK does not export the app transport, runtime host, Tauri APIs, npm plugin management, or desktop-private implementation.

## Backend Capability Gap

Static inspection found that `dispatch.rs` routes 127 command names, while the SDK wraps only a small subset of those commands. This is expected for a public plugin SDK, but it means the SDK is not a complete capability layer yet.

The current exposed command set is centered on:

- session read/list/open
- plugin record read/write/search
- full-text search
- sidechat ask
- model option list
- basic kanban tag operations

Large command families are not exposed:

| Family | Examples | Default plugin exposure |
| --- | --- | --- |
| App/admin | `reset_database`, `backup_database`, `toggle_devtools` | no |
| API keys | `list_api_keys`, `create_api_key`, `revoke_api_key` | no |
| Raw terminal | `terminal_create`, `terminal_write`, `terminal_resize`, `terminal_close` | no |
| Pi Live control | `pi_agent_prompt`, `pi_agent_steer`, `pi_agent_abort` | privileged only |
| Settings/config | `save_app_settings`, `save_server_settings`, `restore_config_version` | host-internal by default |
| File/session mutation | `delete_sessions`, `rename_session`, `fork_session`, `export_session` | privileged only |
| Plugin management | `install_psm_plugin`, `uninstall_psm_plugin`, `read_npm_psm_plugin_module_source` | host-internal |

## Contract Mismatches

These are concrete places where the current public types and actual behavior diverge.

| Area | Current mismatch | Impact |
| --- | --- | --- |
| Record indexes | `manifest.records.indexes` can declare indexes, backend `upsert_plugin_record` accepts `indexValues`, but SDK `records.upsert` never sends them | plugins cannot fully use declared secondary indexes |
| Record search scope | `PluginRecordSearchParams` includes `scopeType` and `scopeId`, but client/backend search do not use them | type promises scope filtering that does not exist |
| Record list plugin filter | `PluginRecordListParams` includes `pluginId`, but client/backend list do not use it | callers may expect filtering that is ignored |
| Session entries limit | `sessions.readEntries(path, { limit })` accepts an option, but client ignores it | API surface has a non-functional option |
| Session/search result types | several SDK return types use `unknown[]` | plugin authors cannot rely on stable shape without local casts |
| Sidechat response | Rust response includes extra fields such as `used_entry_ids` and `session_path`; SDK only models a subset | public contract is not lossless |
| Tag casing | SDK tag types accept both camelCase and snake_case fields | boundary normalization is incomplete |

## Permission Model

The backend has an opt-in plugin permission context carried as `__psm` in the command payload. If no plugin context is present, normal app calls continue to work. If plugin context is present, selected commands require declared permissions.

Current permissions:

| Permission | Intended scope |
| --- | --- |
| `sessions:read` | scan/list/read session data |
| `records:read` | read/search plugin records |
| `records:write` | upsert plugin records |
| `search:read` | full-text search |
| `kanban:read` | read tags and session tags |
| `kanban:write` | create/assign/remove tags |
| `model:invoke` | invoke model-backed operations or list model options |

This is the right foundation, but it should be expanded into a declarative capability table that records command name, permission, exposure level, request type, and response type.

## Recommended Exposure Model

Do not expose raw dispatch wholesale. Classify each command first.

| Exposure level | Meaning | Examples |
| --- | --- | --- |
| `public` | safe for normal plugins with declared permission | session read, record read/write, search, sidechat, model list, kanban read/write |
| `privileged` | useful but mutating or high impact; requires explicit grant and UI confirmation | rename/fork/export sessions, Pi Live prompt/steer, workspace mutation |
| `host-internal` | app maintenance or desktop-private operation | settings writes, npm plugin install, database backup/reset, devtools |
| `unsafe` | should stay unavailable to third-party browser plugins | raw terminal write, arbitrary file open/write, API key management |

The SDK should expose complete public capabilities first. Privileged capabilities can come later behind explicit manifest permissions and Settings UI warnings.

## Definition Reuse Plan

Current definitions are hand-written in multiple places: Rust structs, app frontend types, SDK types, runtime provider types, and HTTP request structs. This is manageable while small, but it is already drifting.

Preferred direction:

```text
packages/
  psm-contract/
    src/public.ts      # stable plugin-facing contract
    src/internal.ts    # app-only contract, not exported by plugin SDK
    src/commands.ts    # command metadata: name, payload, response, permission, exposure

  runtime-sdk/
    src/index.ts       # re-export public contract + client factory
    src/client.ts      # typed facade over public command metadata
```

Short-term work:

1. Move stable public TS types into one package or SDK module.
2. Make the app import those shared public types instead of duplicating them.
3. Replace `unknown[]` in SDK public methods with concrete shared types.
4. Add SDK tests that compare client payload keys with backend dispatch expectations.
5. Add a small command exposure table and deny unclassified command exposure.

Medium-term work:

1. Generate TS types from Rust `Serialize`/`Deserialize` structs, or generate Rust/TS from a shared schema.
2. Keep plugin public contracts separate from app-internal contracts.
3. Generate SDK client wrappers from command metadata where practical.

The repository does not currently use `specta`, `ts-rs`, or `typeshare`. Introducing one of them would be a deliberate build-system change. Until then, a `psm-contract` TypeScript package plus strict tests is the least disruptive path.

## Acceptance Criteria For A Complete Public SDK

The SDK should be considered complete when these checks pass:

- Every public plugin-safe backend command has an SDK method or is explicitly marked unsupported.
- Every SDK method maps to exactly one backend command or documented composed operation.
- Every public method has typed payload and typed result, not `unknown[]`.
- Every public command has a permission entry and exposure level.
- Manifest record declarations and record upsert/search behavior agree, including index values.
- App frontend and SDK import shared public types from the same source.
- Tests verify command payload key casing, permission injection, and backend dispatch compatibility.

## Proposed First Patch Set

1. Add `PluginRecordIndexValue` to SDK types and support `indexValues` in `records.upsert`.
2. Remove or implement unsupported params: `scopeType/scopeId` in record search, `pluginId` in record list, and `limit` in `readEntries`.
3. Export concrete `PsmSessionInfo`, `PsmSessionEntry`, `PsmFullTextSearchHit`, and complete `PsmSideChatResponse` types.
4. Add `capabilities.ts` with public command metadata and permissions.
5. Add tests asserting SDK client command payloads match backend dispatch field names.

This keeps the SDK honest without widening plugin power too quickly.
