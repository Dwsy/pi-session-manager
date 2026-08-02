---
id: "2026-08-01-refactor-plugin-contribution-catalog"
title: "Refactor plugin UI contribution ownership and lifecycle"
status: "done"
created: "2026-08-01"
updated: "2026-08-01"
category: "task"
tags: ["plugins", "frontend", "architecture", "runtime-host", "lifecycle"]
---

# Issue: Refactor Plugin UI Contribution Ownership and Lifecycle

## Goal

Make plugin UI contributions easier to extend and safer to reload by centralizing registration, ordering, snapshots, and plugin-owned cleanup without changing the public Plugin SDK.

## Current State

- `src/plugins/runtime-host/host.ts` is approximately 1,080 lines and owns nine separate UI contribution maps.
- Every contribution type repeats registration, duplicate handling, sorting, snapshot publication, activation rollback, and full-reload cleanup.
- Activation rollback tracks many parallel id arrays, making new contribution types easy to omit from cleanup.
- The existing SDK and plugin manifests already define stable public contribution contracts; this issue should improve host internals only.

## Scope

1. Add an ownership-aware UI contribution catalog under `src/plugins/runtime-host/`.
2. Move the nine UI contribution maps, sorted list accessors, session UI snapshot construction, full clear, and per-plugin removal into that catalog.
3. Preserve current duplicate behavior and session panel default side.
4. Integrate the catalog into `PsmPluginHost` without changing public host or SDK method signatures.
5. Add focused catalog and host lifecycle tests.
6. Update plugin authoring/architecture documentation and validate the full frontend suite.

## Non-Goals

- No public SDK additions or breaking manifest changes.
- No redesign of Settings -> PSM Plugins.
- No changes to command, tool, agent, transport, or permission semantics.
- Do not refactor large individual plugins in this issue.

## Acceptance Criteria

- [x] UI contribution maps no longer live directly in `PsmPluginHost`.
- [x] All UI contribution lists remain sorted by id.
- [x] Session UI snapshots preserve the existing shape and ready behavior.
- [x] Activation failure removes every UI contribution owned by the failed plugin.
- [x] Reload clears previous plugin UI contributions without stale entries.
- [x] Duplicate diagnostics remain compatible with current behavior.
- [x] Session panels still default to `side: "right"`.
- [x] Plugin host and catalog focused tests pass.
- [x] Full frontend Vitest suite and production build pass.
- [x] Public `@pi-session-manager/plugin-sdk` contracts are unchanged.

## Baseline

On 2026-08-01 before edits:

- Full frontend Vitest suite: 613 passed, 0 failed.
- `pnpm build`: passed.
- `src/plugins/runtime-host/host.ts`: 1,081 lines.
- Runtime host tests already cover duplicate UI ids, snapshots, tool renderer cleanup, and reload notifications.

## Implementation Summary

- Added `PsmPluginUiContributionCatalog` as the single owner of nine UI contribution registries.
- Centralized sorted lists, session UI snapshots, duplicate policies, panel side normalization, full clear, and per-plugin removal.
- Removed nine UI maps and nine parallel activation id arrays from `PsmPluginHost`.
- Replaced activation-error deletion loops with one ownership-aware `removePlugin()` call.
- Kept command, tool, tool renderer, transformer, permission, and public SDK behavior unchanged.
- Reduced `src/plugins/runtime-host/host.ts` from 1,081 to 1,000 lines.

## Validation

Completed on 2026-08-01:

- Focused plugin runtime tests: 38 passed, 0 failed.
- Contribution catalog tests cover sorting, duplicate policy, panel normalization, ownership removal, and clear behavior.
- Host lifecycle test verifies failed activation rolls back all nine UI contribution kinds while preserving healthy plugin contributions.
- Full frontend Vitest suite: 617 passed, 0 failed.
- Extension TypeScript check: passed with no errors.
- Main application `pnpm build`: passed.
- Plugin SDK `pnpm --dir packages/runtime-sdk build`: passed with no tracked SDK changes.
- `git diff --check`: passed.
- Existing build warnings remain unchanged: pnpm override location, stale Browserslist data, and browser externalization of `node:fs` from `@earendil-works/pi-ai`.
