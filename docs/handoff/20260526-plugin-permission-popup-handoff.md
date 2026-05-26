# Handoff: Plugin Permission Request Popup

Date: 2026-05-26

Scope update: runtime prompts should only cover restricted local file access. `plugin_widgets_*` and `widgets:read` are not used; saved widget HTML goes through `plugin_fs_read` on the `widgets` root with `fs:read`.

## Goal For Next Session

Implement runtime permission request popups for PSM plugins.

Current state already supports static, settings-managed authorization. The missing piece is an interactive runtime flow:

```text
plugin calls ctx.psm capability
  -> host sees required permission is not currently granted
  -> user sees permission request popup
  -> Allow persists grant and retries call
  -> Deny keeps permission revoked and returns a clear error
```

## Current State Completed In This Session

### Static Authorization System

Implemented and verified:

- Plugins declare requested permissions through `manifest.permissions`.
- Per-plugin authorization overrides are stored in existing `plugins.json` as `permissionOverrides`.
- `permissionOverrides` currently stores revoked permissions as `false`; granted/default permissions are omitted.
- Runtime host computes effective permissions before injecting `ctx.psm` and `ctx.psm.agent`.
- Settings -> Plugins -> individual plugin detail page now shows an Authorization section with per-permission toggles.
- Permission-only plugins now get a plugin settings subsection even when they do not define `manifest.configuration`.

### Important Files Already Touched

Frontend runtime host:

- `src/plugins/runtime-host/types.ts`
  - `PsmPluginConfigEntry.permissionOverrides`
  - `PsmPluginStatus.permissions`
- `src/plugins/runtime-host/host.ts`
  - `permissionStatusesFor(...)`
  - `effectivePermissionsFor(...)`
  - Injects only effective permissions into `ctx.psm` and agent bridge.
- `src/plugins/runtime-host/service.ts`
  - `setPsmPluginPermissions(...)`

Settings UI:

- `src/components/settings/sections/PsmPluginsSettings.tsx`
  - Authorization section.
  - Per-permission toggle persistence.
  - Permission count in plugin summaries.
- `src/components/settings/SettingsToggleRow.tsx`
  - Added `disabled` prop passthrough.
- `src/components/settings/settingsRegistry.tsx`
  - Plugin subsections now include permission-only plugins.
- `src/components/settings/settingsSearchIndex.ts`
  - Permission authorization entries are searchable.

Backend:

- `src-tauri/src/commands/psm_plugins.rs`
  - `PsmPluginConfigEntry.permission_overrides`
  - `set_psm_plugin_permissions(...)`
  - Tests for writing permission overrides.
- `src-tauri/src/dispatch.rs`
  - Dispatch route for `set_psm_plugin_permissions`.
- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
  - Tauri command registration.

Docs:

- `docs/PSM_PLUGIN_SDK.md`
- `extensions/README.md`

## Verification Already Run

Passing:

```bash
pnpm exec tsc --noEmit
# TypeScript: No errors found

pnpm exec vitest run
# PASS (360) FAIL (0)

cd src-tauri && cargo test
# 224 passed

pnpm exec vite build
# passed; warning only for existing large chunks / node:fs externalization from pi-ai
```

Focused checks also passed:

```bash
pnpm exec vitest run \
  src/plugins/runtime-host/__tests__/host.test.ts \
  src/plugins/runtime-host/__tests__/service.test.ts \
  src/components/settings/sections/PsmPluginsSettings.test.tsx \
  src/components/settings/settingsRegistry.test.ts
# PASS (44) FAIL (0)

cd src-tauri && cargo test psm_plugins
# 16 passed
```

Known verification caveat:

```bash
cd src-tauri && cargo fmt --all --check
```

This still fails only because of an unrelated existing/untracked file:

- `src-tauri/src/commands/update.rs`

Do not format or rewrite that file unless the user explicitly wants to include the updater work in the same change.

## What Is Not Implemented Yet

There is no runtime permission request popup.

Current behavior:

- User can grant/revoke permissions from Settings.
- If a permission is revoked, the plugin receives only the reduced permission list.
- A revoked SDK call eventually fails permission checks; there is no Allow/Deny dialog at call time.

## Recommended Implementation Plan

### 1. Add a frontend permission requirement map

Create a small host-side command-to-permission map near runtime host transport code. Do not depend on Rust dispatch internals at runtime.

Suggested file:

```text
src/plugins/runtime-host/permissions.ts
```

Suggested shape:

```ts
import type { PsmPermission } from '@pi-session-manager/plugin-sdk'

export function requiredPermissionForPsmCommand(command: string): PsmPermission | null {
  switch (command) {
    case 'scan_sessions':
    case 'scan_sessions_paginated':
    case 'get_session_entries':
    case 'read_session_file_chunk':
    case 'get_session_labels':
    case 'open_session_in_browser':
    case 'open_session_in_terminal':
      return 'sessions:read'
    case 'plugin_widgets_list':
    case 'plugin_widgets_get':
    case 'plugin_widgets_read_html':
      return 'widgets:read'
    case 'plugin_agent_create_session':
    case 'plugin_agent_run':
    case 'plugin_agent_abort':
    case 'plugin_agent_dispose':
      return 'agent:invoke'
    default:
      return null
  }
}
```

Keep it narrow and aligned with currently exposed `ctx.psm` methods.

### 2. Add a permission request coordinator

The popup needs a central owner outside individual plugin components.

Recommended files:

```text
src/plugins/runtime-host/permissionRequests.ts
src/plugins/runtime-host/usePsmPluginPermissionRequests.tsx
```

Coordinator responsibilities:

- Queue one request at a time.
- De-duplicate simultaneous requests for the same `pluginId + permission`.
- Return `Promise<boolean>`.
- Allow UI to subscribe to the active request.

Request payload should include:

```ts
interface PsmPluginPermissionRequest {
  id: string
  pluginId: string
  pluginName: string
  permission: PsmPermission
  reason?: string
}
```

### 3. Wrap plugin transport in `host.ts`

Do not change public plugin SDK first. The host already constructs the capability client in `PsmPluginHost.loadEntry(...)`.

Add a permission-aware transport wrapper there:

```text
appPsmTransport
  -> permission-aware plugin transport
  -> createPluginCapabilityClient(...)
```

Behavior:

1. `requiredPermissionForPsmCommand(command)` returns null: invoke normally.
2. Required permission already in `permissions.permissions`: invoke normally.
3. Required permission not declared by manifest: throw a clear error without popup.
4. Required permission declared but revoked: call permission request coordinator.
5. If user allows:
   - Persist permission overrides via `setPsmPluginPermissions(...)`.
   - Remove that permission from the local false override set.
   - Mutate the injected permission context array so the retry uses the updated permission.
   - Retry original command once.
6. If user denies: throw a clear permission denied error.

Important: avoid a full plugin reload inside the middle of a tool call if possible. Mutating the local `permissions.permissions` array is acceptable because `createPluginCapabilityClient` reads the permission context object when invoking commands.

### 4. Add popup UI in app overlays

Find app overlay owner first, likely:

```text
src/components/app/AppOverlays.tsx
```

Add a compact modal/dialog component, for example:

```text
src/components/plugins/PsmPluginPermissionRequestDialog.tsx
```

Design constraints:

- Use existing tokens: `bg-surface`, `border-border`, `text-foreground`, `text-muted-foreground`.
- Keep it utility-panel style, not marketing-card style.
- Show plugin name, permission label, permission id, and short capability description.
- Buttons: primary `Allow`, secondary `Deny`.
- No broad prose wall.

### 5. Persist decision through existing service

Use the service already added:

```ts
setPsmPluginPermissions({
  pluginId,
  permissionOverrides,
  source,
  packageName,
  entryPath,
  projectPath,
})
```

Need host access to source metadata for the requesting plugin. `ActivePlugin` already stores source/sourceId/packageName/projectPath. If entryPath is needed, add it to `ActivePlugin` or look up current `PsmPluginStatus`.

### 6. Tests to add

Runtime host tests:

- Revoked but declared permission triggers request and retries after allow.
- Revoked but denied permission rejects and does not invoke transport.
- Undeclared permission rejects without showing request.

Settings/UI tests:

- Existing authorization toggles should remain passing.
- Add popup dialog test if placed under app overlays or plugin runtime host hook.

Service tests:

- Already covers `setPsmPluginPermissions(...)`; extend only if payload shape changes.

## Suggested Verification Commands

Run narrow first:

```bash
pnpm exec vitest run \
  src/plugins/runtime-host/__tests__/host.test.ts \
  src/plugins/runtime-host/__tests__/service.test.ts \
  src/components/settings/sections/PsmPluginsSettings.test.tsx

pnpm exec tsc --noEmit
```

Then full:

```bash
pnpm exec vitest run
pnpm exec vite build
cd src-tauri && cargo test
```

Do not claim `cargo fmt --all --check` passes unless `src-tauri/src/commands/update.rs` has been handled or excluded by a targeted rustfmt check.

## Current Worktree Caution

The worktree is dirty with several unrelated changes from parallel/prior work. Do not revert them.

Known unrelated examples from `git status` include:

- updater files and update workflow/config changes
- Kanban sidebar/pin changes
- AGENTS/docs changes
- existing `src-tauri/src/commands/update.rs` formatting issue

For the runtime permission popup, focus only on runtime-host, app overlay/dialog, settings tests if needed, and docs.

## Completion Criteria For Next Session

- Runtime permission popup appears when a plugin calls a declared but revoked permission.
- Allow persists the grant and retries the SDK call successfully.
- Deny leaves the permission revoked and returns a clear error.
- Undeclared permissions never prompt; they fail directly.
- Existing Settings -> Plugins authorization toggles still work.
- `pnpm exec tsc --noEmit`, focused Vitest, full Vitest, Vite build, and `cargo test` pass.
