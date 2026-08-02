---
id: "2026-08-01-refactor-frontend-app-shell"
title: "Refactor frontend application shell for feature extensibility"
status: "done"
created: "2026-08-01"
updated: "2026-08-01"
category: "task"
tags: ["frontend", "react", "architecture", "app-shell", "hooks"]
---

# Issue: Refactor Frontend Application Shell for Feature Extensibility

## Goal

Reduce the cost and risk of extending the React application by moving cohesive feature controllers out of the 1,900-line `App.tsx` while preserving all routes, shortcuts, dialogs, mobile/desktop layouts, and runtime behavior.

## Current State

- `src/App.tsx` is approximately 1,900 lines and owns runtime detection, plugin initialization, sessions, tags, filters, routing, terminal scopes, resume flows, shortcuts, overlays, and layout composition.
- The repository already has `components/app/` and `hooks/app/`, but several cohesive controllers remain embedded in the root component.
- Terminal scope lifecycle is a self-contained feature: scope identity, bounded cache, pending commands, active scope, maximized state, and open/close/toggle behavior.
- Pure app-view route and shortcut normalization helpers also live in `App.tsx` without tests.

## Scope

1. Extract terminal scope state and behavior into `hooks/app/useTerminalScopes.ts`.
2. Add focused hook tests for scope selection, pending commands, disabled behavior, and reset behavior.
3. Extract pure app-view navigation helpers into a small tested module when doing so remains mechanical.
4. Keep `App.tsx` as the composition root and preserve existing component props and runtime behavior.
5. Update frontend architecture documentation and validate production build plus relevant tests.

## Non-Goals

- No UI redesign or styling changes.
- No state-management library or new dependency.
- No broad rewrite of session viewer, settings, plugins, or transport in this issue.
- Do not combine this work with the completed Rust backend refactor beyond preserving its working-tree changes.

## Acceptance Criteria

- [x] Terminal scope cache and lifecycle no longer live inline in `App.tsx`.
- [x] The extracted hook owns active scope, bounded scope cache, pending commands, visibility, and maximized state.
- [x] Terminal behavior remains unchanged for session, project, workspace, desktop, web, and disabled-terminal paths.
- [x] App-view route/shortcut normalization helpers are outside `App.tsx` and covered by tests.
- [x] Existing mobile and desktop rendering contracts remain unchanged.
- [x] `pnpm build` passes.
- [x] Focused app-shell tests pass.
- [x] Full frontend Vitest suite passes.
- [x] Architecture documentation describes `App.tsx` as composition root and `hooks/app/` as feature controllers.

## Baseline

On 2026-08-01 before frontend edits:

- `pnpm build`: passed.
- Targeted app layout and route-sync tests: passed.
- `src/App.tsx`: 1,909 lines by AST outline.
- Frontend source: 711 TypeScript/TSX files, approximately 130,309 lines.

## Implementation Summary

- Added `useTerminalScopes` for terminal visibility, active scope, bounded scope cache, pending commands, maximized state, and disabled-terminal cleanup.
- Added `useAppViewNavigation` for plugin app-view routes, desktop/sidebar items, mobile tabs, and shortcut catalogs.
- Moved route and shortcut normalization into exported pure helpers with focused tests.
- Reduced `src/App.tsx` from 1,909 to 1,712 lines while preserving its role as the composition root.
- Updated `agent-docs/02-frontend.md` with the application-shell ownership model.

## Validation

Completed on 2026-08-01:

- Focused app-shell tests: 8 passed.
- Full frontend Vitest suite: 613 passed, 0 failed.
- `pnpm build`: passed (`tsc && vite build`).
- `git diff --check`: passed.
- Existing build warnings remain unchanged: pnpm override location, stale Browserslist data, and browser externalization of `node:fs` from `@earendil-works/pi-ai`.
