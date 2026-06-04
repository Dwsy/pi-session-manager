# Plugin Runtime Hardening

Status: Phase 1-2 implemented
Date: 2026-05-31
Owner: PSM

## Problem

PSM plugins can currently crash or destabilize the whole frontend runtime. Some failures are visible as in-memory diagnostics, but there is no durable crash ledger and not every plugin boundary is protected.

Observed code evidence:

- `src/plugins/runtime-host/PluginContributionBoundary.tsx` catches React render failures for plugin UI contributions and calls `psmPluginHost.recordUiRenderError(...)`.
- `src/plugins/runtime-host/host.ts` catches module load, manifest validation, and activation failures in `loadEntry(...)`.
- `src/plugins/runtime-host/host.ts` executes plugin commands and tools through `command.run(...)` and `tool.run(...)` without recording failures into plugin status.
- Plugin event handlers are subscribed through `createPluginEventsClient(...)`; handler failure containment needs to be verified and hardened.
- Diagnostics are part of `PsmPluginStatus`, but they are runtime-memory state only and are not persisted as a crash/error history.
- The global `src/components/ErrorBoundary.tsx` still shows a whole-screen fallback when an uncaught plugin-related error escapes the contribution boundary.

## Reference Note

VSCode is useful only as a failure-containment reference: extension failures are routed to logs/status instead of crashing the workbench. PSM does not need to copy VSCode's extension-host architecture in this iteration.

This issue focuses on traceability: plugin crashes must identify which plugin, source, phase, contribution, message, stack, timestamp, and occurrence count caused the failure.

## Goal

Make plugin failures non-fatal, visible, durable, and eventually sandboxable across desktop and browser runtimes.

## Non-Goals

- Do not redesign every plugin API in one pass.
- Do not move all built-in plugins to external packages in this iteration.
- Do not add Node-only plugin assumptions; external plugins remain browser-compatible ESM.

## Plan

### Phase 1: Crash Ledger and Runtime Diagnostics

Status: Implemented for frontend runtime diagnostics in `src/plugins/runtime-host/diagnostics.ts`.

Persist plugin failure records with plugin id, source id, phase, contribution id, message, stack when available, timestamp, and occurrence count.

Failure phases:

- discovery
- module-load
- manifest-validation
- activation
- command
- tool
- event-handler
- ui-render
- cleanup

Acceptance:

- Plugin command/tool/UI failures appear in Settings -> PSM Plugins -> Diagnostics.
- Runtime diagnostics can express `phase`, `pluginId`, `sourceId`, `contributionId`, `message`, `stack`, timestamps, and occurrence `count`.
- Failures survive app reload via a durable local store or plugin config adjacent file.
- Duplicate failures are coalesced by plugin + source + phase + contribution + message.

### Phase 2: Containment Wrappers

Status: Implemented for command, tool, event-handler, and UI render failures.

Route every plugin-entered callback through host-owned guarded execution helpers.

Targets:

- `executeCommand(...)`
- `runTool(...)`
- event bus handlers
- contribution `render`, `when`, matchers, preview/search hooks where applicable
- cleanup/dispose/deactivate

Acceptance:

- A throwing command rejects that command only and records a diagnostic.
- A throwing tool returns/rejects through the tool protocol only and records a diagnostic.
- A throwing event handler does not prevent other handlers from running.
- A throwing UI contribution shows local fallback only.

### Phase 3: Quarantine and Recovery

Status: Deferred. This needs a separate threshold policy and `quarantined` state design.

Add per-plugin health policy.

Policy:

- Render/command/tool failures increment plugin health counters.
- Repeated failures can mark plugin state as `quarantined` for the current runtime.
- Quarantined plugin contributions are hidden or replaced with a compact failure chip.
- User can reset/clear diagnostics and re-enable from Settings.

Acceptance:

- Repeatedly crashing plugin cannot keep crashing the main app loop.
- Settings clearly shows active/disabled/error/quarantined state.
- Reload plugins resets runtime quarantine only when requested or after successful reload.

### Phase 4: Scope Note

Status: Re-scoped. Do not force a VSCode-style browser extension-host architecture here.

Acceptance:

- Document that VSCode is reference material only.
- Keep this iteration centered on crash traceability and runtime containment.
- Do not add Worker/iframe/plugin-host migration work unless explicitly requested later.

## Verification Commands

Targeted first:

```bash
pnpm exec vitest run src/plugins/runtime-host/__tests__/host.test.ts src/plugins/runtime-host/__tests__/PluginContributionBoundary.test.tsx
pnpm exec vitest run src/components/settings/sections/PsmPluginsSettings.test.tsx
```

Broader frontend:

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
```

Backend if durable ledger adds Rust commands:

```bash
cd src-tauri && cargo test psm_plugins -- --nocapture
```

## Risks

- A full Worker/iframe migration is architectural and should not be mixed into the first crash-fix diff.
- Built-in plugins import host internals today; they cannot all move to browser sandbox without public SDK surface expansion.
- React render isolation does not catch async effects, global listeners, or promise rejections; those need explicit wrapper/ledger handling.
