# Plugin Runtime Hardening

Date: 2026-05-31
Related issue: `docs/issues/20260531-plugin-runtime-hardening.md`

## Why This Exists

PSM plugins are useful precisely because they can extend host behavior. That also makes them a fault boundary. A plugin failure must be visible and debuggable, but it must not crash the main app shell.

This document records the current traceability and containment direction. VSCode is reference material only; this is not a plan to force PSM into VSCode's extension-host architecture.

## Reference Boundary

The useful lesson from VSCode is simple: extension failures should become logs/status/diagnostics, not whole-app crashes.

For PSM, the current target is narrower:

- identify the plugin that failed
- identify the source entry that loaded it
- identify the failure phase
- identify the contribution that failed, when applicable
- preserve message, stack, timestamps, and occurrence count
- expose the record in Settings
- allow clearing stale diagnostics after a plugin is fixed or rebuilt

## Current PSM Runtime Shape

Current PSM browser plugins are browser-compatible ESM modules. Built-in plugins are imported by the app source graph; external npm/path/dev plugins are loaded as built ESM entries.

Current host files:

- `src/plugins/runtime-host/host.ts` owns loading, activation, contribution registries, commands, tools, and status.
- `src/plugins/runtime-host/PluginContributionBoundary.tsx` isolates React contribution render failures.
- `src/plugins/runtime-host/diagnostics.ts` persists runtime diagnostics in a browser-safe local ledger.
- `src/components/settings/sections/PsmPluginsSettings.tsx` surfaces plugin status, diagnostics, and recovery controls.
- `packages/runtime-sdk/src/types.ts` and `packages/runtime-sdk/src/manifest.ts` define the public plugin contract.

## Hardening Layers

### Layer 1: In-Process Fault Containment

This is the current minimum viable hardening layer.

- Module load, manifest validation, and activation failures are recorded as plugin status errors.
- Command, tool, event handler, and UI render failures are recorded as runtime diagnostics.
- Repeated runtime failures are coalesced by plugin, phase, contribution id, and message.
- Settings can clear plugin diagnostics without uninstalling the plugin.

This keeps today’s plugin architecture intact while preventing common plugin bugs from turning into whole-app failures.

### Layer 2: Runtime Quarantine

A later step should add a health policy over the diagnostics ledger.

Suggested policy:

- Track repeated failures per plugin and phase.
- Hide or disable only the failing contribution when possible.
- Mark the plugin `quarantined` when repeated failures exceed a threshold.
- Let the user reset quarantine from Settings after fixing or rebuilding the plugin.

This should remain local and reversible. It is a runtime safety policy, not a permanent uninstall.

### Layer 3: Deferred Architecture Work

Worker hosts, iframe/webview UI isolation, and broader browser-extension compatibility are not part of this hardening iteration.

They may be reconsidered later if plugin trust boundaries or distribution requirements demand it. Until then, the implementation should stay focused on traceable failures, clear diagnostics, and minimal runtime containment.

## Plugin Boundary Rules

External plugins still need to respect the existing public SDK boundary:

- No Tauri API imports.
- No app aliases such as `@/components`, `@/hooks`, or `@/plugins`.
- Capabilities must go through `ctx.psm`, `ctx.ui`, `ctx.settings`, `ctx.i18n`, and `ctx.events`.

These rules protect the current host boundary. They do not imply a forced VSCode-style migration.

## Verification

Relevant checks:

```bash
pnpm exec vitest run src/plugins/runtime-host/__tests__/host.test.ts src/plugins/runtime-host/__tests__/diagnostics.test.ts src/plugins/runtime-host/__tests__/PluginContributionBoundary.test.tsx --maxWorkers=1
pnpm exec vitest run src/components/settings/sections/PsmPluginsSettings.test.tsx --maxWorkers=1
pnpm exec tsc --noEmit
```
