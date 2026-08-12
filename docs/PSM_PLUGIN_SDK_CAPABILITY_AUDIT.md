# PSM Plugin SDK Capability Audit

> Date: 2026-05-25
> Scope: `@pi-session-manager/plugin-sdk`, runtime host injection, backend dispatch permissions, and shared contract reuse.

## Summary

The public plugin SDK is now a real authoring surface, but the docs need to stay honest about what is stable, what is supported, and what remains host-owned.

The SDK should expose plugin-safe capabilities, not the entire app control plane. That boundary is good. The main task for the docs is to describe the current public surface clearly, call out the intentionally hidden parts, and keep the remaining gaps visible so they do not get reintroduced as stale examples.

## Current Public Surface

The package entry point is intentionally small:

```ts
export * from './types'
export * from './manifest'
export * from './client'
```

It exposes:

| Group | Exposed API |
| --- | --- |
| Manifest contract | `PsmPluginManifest`, `PsmPackageManifest`, runtime/package/permission/record/config/i18n declarations |
| Validation | `validatePsmPluginManifest`, `assertPsmPluginManifest`, `validatePsmPackageManifest`, `assertPsmPackageManifest` |
| Host context | `manifest`, `psm`, `permissions`, `settings`, `i18n`, `events`, `ui`, `registerCommand`, `registerTool` |
| Capability client | `createPluginCapabilityClient(options)` |
| UI contributions | app view, app sidebar view bound by `appViewId`, session list action, session list column, project list action, session context menu action, session toolbar item, session main view, session right panel, session tree view |
| Session viewer control | `PsmSessionUiRenderProps.viewer?.revealEntry(...)`, `viewer?.revealToolCall(...)` |
| Settings/config | `manifest.configuration`, `ctx.settings.get(...)`, `ctx.settings.all()`, plugin-scoped JSON config |
| I18n | `manifest.i18n`, `ctx.i18n.t(...)`, `ctx.i18n.language` |

The injected `ctx.psm` client currently has these namespaces:

| Namespace | Methods |
| --- | --- |
| `records` | `search`, `listForScope`, `upsert` |
| `sessions` | `scan`, `list`, `readEntries`, `readFileChunk`, `getLabels`, `open` |
| `search` | `fulltext`, `pluginRecords` |
| `agent` | `createSession`, `run`, `runStream`, `abort`, `dispose` |
| `models` | `listOptions` |
| `agentUsage` | `getStatus` |
| `tags` | `listTags`, `createTag`, `assignTag`, `removeTag`, `listSessionTags` |
| `config` | `read`, `write` |

## What the docs should emphasize

1. `records.upsert` supports `indexValues` and record declarations can define secondary indexes.
2. `sessions.readEntries(path, { limit })` is supported and should be documented as a real option.
3. AI plugins should use host-managed Pi Agent sessions through `ctx.psm.agent`.
4. Plugins that call `ctx.psm.agent` must declare `agent:invoke` plus the permissions for any PSM tools exposed to that agent.
5. The SDK does not expose raw dispatch or host-private commands.
6. Plugin source loading is limited to `builtin`, `npm`, and `path` sources.

## Capability Boundaries

The backend still contains many commands that are not meant to be part of the public SDK.
Keep these grouped as host-owned or privileged surfaces in the docs:

| Family | Examples | Public SDK stance |
| --- | --- | --- |
| App/admin | `reset_database`, `backup_database`, `toggle_devtools` | host-internal |
| API keys | `list_api_keys`, `create_api_key`, `revoke_api_key` | host-internal |
| Raw terminal | `terminal_create`, `terminal_write`, `terminal_resize`, `terminal_close` | host-internal |
| Pi Live control | `pi_agent_prompt`, `pi_agent_steer`, `pi_agent_abort` | privileged or host-internal |
| Settings/config | app and server settings writes | host-internal except plugin-scoped JSON config |
| File/session mutation | `delete_sessions`, `rename_session`, `fork_session`, `export_session` | privileged or host-internal |
| Plugin management | `install_psm_plugin`, `uninstall_psm_plugin` | host-internal |

## Session viewer control notes

The new session viewer controller closes an important SDK gap for session panels and toolbar-driven plugin UI.

| Surface | Public contract | Notes |
| --- | --- | --- |
| `viewer?.revealEntry(entryId, options)` | reveal a concrete session entry already known to the plugin | generic message-level navigation path |
| `viewer?.revealToolCall(toolCallId, options)` | reveal a rendered tool/widget block by tool call id | preferred path for widget and review plugins |
| `viewer?.navigateBranch(leafEntryId, targetEntryId, options)` | activate a terminal branch while revealing an entry on that branch | optional for host compatibility; used by branch-aware main views |
| `PsmSessionTreeViewRenderProps.onNavigate(...)` | tree-specific navigation callback | unchanged; still the right surface for tree projections |

Important limits:

- `viewer` is available only on `PsmSessionUiRenderProps`, not on the capability client.
- `viewer` remains optional for compatibility with older host/runtime combinations.
- The host owns active-branch state, DOM lookup, scroll timing, conversation-turn expansion, and tool-card expansion.
- Plugins should pass stable ids from session content, not fabricate host-private render ids such as `tool-result-*`.

## Remaining Documentation Gaps

These are the places that still deserve explicit notes in the docs because they can confuse plugin authors if left implicit.

| Area | Current state | Doc note |
| --- | --- | --- |
| Record search | plugin record search is available, but filtering needs to be described in terms of the current client surface | document the accepted params and avoid promising extra filtering semantics |
| Session payloads | several session methods still return host-shaped opaque values | note the shapes that are stable and point authors to the right render helpers |
| Agent lifecycle | `ctx.psm.agent` is now the recommended AI path, but examples must show session disposal and plugin-scoped storage choices | document `createSession`, `run`, `runStream`, `abort`, and `dispose` together |
| Legacy AI helpers | older `ctx.psm.ai`, `ctx.psm.sidechat`, and `records.refreshSessionIntelligence` paths may appear in existing code or backend compatibility routes | mark them compatibility-only and do not use them in new recommended examples |
| Tag casing | camelCase and snake_case appear in some payloads | document the normalized field names that plugin authors should prefer |

## Recommended Doc Structure

For the public SDK doc, keep these sections in this order:

1. Overview
2. Quick start
3. Package shape
4. Manifest contract
5. Permissions
6. Capability client
7. Logic contributions
8. UI contributions
9. Events
10. Runtime notes
11. Examples
12. Intentionally private surfaces

For the audit doc, keep it short and current:

- what is exposed now
- what is intentionally hidden
- what still needs cleanup in the docs
- what to revisit when the SDK grows

## Authoring Checklist

Before publishing any SDK doc change, verify that:

- every method named in the docs exists in `packages/runtime-sdk/src/types.ts` or `client.ts`
- examples use only exported names from `packages/runtime-sdk/src/index.ts`
- no example relies on desktop-private runtime internals
- `agent:invoke`, `indexValues`, `readEntries({ limit })`, and `ctx.psm.agent.runStream` are documented correctly
- legacy AI helper paths are marked compatibility-only, not recommended plugin APIs
- the docs point plugin authors to `extensions/README.md` and the capability audit

## Notes for Future Expansion

If new public plugin-safe capabilities are added later, document them in two places at once:

- the SDK docs in `docs/PSM_PLUGIN_SDK.md`
- the capability audit in `docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md`

That keeps the contract and the gap list from drifting apart again.
