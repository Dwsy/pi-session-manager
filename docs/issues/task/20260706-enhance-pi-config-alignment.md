---
id: "2026-07-06-enhance-pi-config-alignment"
title: "Enhance Pi Config UI to align with upstream pi config"
status: "ready-for-agent"
created: "2026-07-06"
updated: "2026-07-06"
category: "task"
tags: ["pi-config", "settings", "resources", "tauri", "react"]
---

# Issue: Enhance Pi Config UI to Align with Upstream `pi config`

## Goal

Bring Pi Session Manager's Pi Config settings panel into behavioral alignment with upstream `pi config`, especially package resources, project/user scopes, exact enable/disable semantics, and settings persistence.

The existing PSM UI already has a Pi Config section, but its backend scans only top-level local folders and hand-rolls enable/disable rules. It should become a GUI/API equivalent of upstream `pi config`, not a parallel partial implementation.

## Current State

PSM implementation:

- Frontend entry: `src/components/settings/sections/PiConfigSettings.tsx`
- Resources tab: `src/components/settings/sections/pi-config/ResourcesTab.tsx`
- Settings tab: `src/components/settings/sections/pi-config/SettingsTab.tsx`
- Resource backend: `src-tauri/src/commands/skills.rs`
- Settings backend: `src-tauri/src/commands/settings.rs`
- Dispatch routes: `src-tauri/src/dispatch.rs`
- Type contract: `src/types.ts`

Current backend behavior:

- `scan_all_resources_internal()` manually scans `~/.pi/agent/{skills,extensions,prompts,themes}` and optional `<cwd>/.pi/{...}`.
- `toggle_resource_internal()` writes `+path` or `-path` only into top-level `skills/extensions/prompts/themes` arrays.
- It does not resolve package resources from `settings.packages`.
- It does not apply pi package manifest rules, package filters, deduplication, `.agents/skills`, or project trust behavior.
- It cannot toggle a resource inside a package object, e.g. `{ source, skills: ["+skills/foo/SKILL.md"] }`.

Upstream Pi behavior verified from installed `@earendil-works/pi-coding-agent@0.80.2`:

- `dist/package-manager-cli.js::handleConfigCommand()` creates `SettingsManager`, resolves project trust, runs `DefaultPackageManager.resolve()`, opens TUI selector, then exits.
- `dist/cli/config-selector.js::selectConfig()` is terminal-TUI only.
- `dist/modes/interactive/components/config-selector.js` contains toggle behavior.
- Public package exports include `DefaultPackageManager`, `SettingsManager`, `getAgentDir`, resource types, and settings types.
- Deep import of `package-manager-cli` is blocked by package exports; do not depend on it.

## Upstream Semantics to Match

Resource discovery must match `DefaultPackageManager.resolve()`:

- Resource types: `extensions`, `skills`, `prompts`, `themes`.
- Sources:
  - user top-level resources under `~/.pi/agent/`
  - user `.agents/skills`
  - project top-level resources under `<cwd>/.pi/`
  - project `.agents/skills` from cwd ancestors when trusted
  - package resources from user/project `settings.packages`
  - package manifest resources from `package.json#pi`
  - conventional package directories when no manifest exists
- Deduplication: project package wins over user package for same package identity.
- Enabled state:
  - default enabled unless excluded by config.
  - `!pattern` excludes glob matches.
  - `+path` force-includes exact path.
  - `-path` force-excludes exact path.
- Toggle top-level resource:
  - write to the relevant top-level array in user/project settings.
  - remove previous `!/+/-` entry for same exact path before adding new `+path` or `-path`.
- Toggle package resource:
  - convert package source string to object form if needed.
  - write to the resource array inside that package object.
  - clean empty package filter object back to string form.
- Persistence must flush before returning success.

## Recommended Architecture

Use upstream Pi JS as the source of truth instead of porting all package-manager logic to Rust.

Preferred shape:

1. Add a small `pi-config` bridge layer that runs in Node and imports public Pi SDK exports:
   - `DefaultPackageManager`
   - `SettingsManager`
   - `getAgentDir`
   - resource/settings types
2. Expose JSON commands from the bridge:
   - `listResources({ cwd, projectTrusted })`
   - `setResourceEnabled({ cwd, resourceType, path, metadata, enabled, projectTrusted })`
   - `loadSettings({ cwd, projectTrusted, scope })`
   - `saveSetting({ cwd, key, value, scope })`
   - optional: `listPackages`, `installPackage`, `removePackage` if the UI grows package management.
3. Rust commands call the bridge, validate input/output, and map errors to existing Tauri/HTTP/WS responses.
4. React keeps the existing Pi Config tabs but consumes richer resource metadata.

Avoid:

- Deep-importing `@earendil-works/pi-coding-agent/package-manager-cli`.
- Spawning `pi config`, because it opens a TUI and exits the process.
- Reimplementing all of `DefaultPackageManager` in Rust unless bridge packaging proves impossible.

Open architecture decision:

- Confirm whether production PSM can rely on `node`/`pi` being installed, or whether the bridge must be bundled into the app.
- If Node cannot be assumed in packaged desktop builds, create an ADR before implementation and choose between bundling a JS sidecar or Rust parity implementation.

## Acceptance Criteria

- [ ] Resources tab lists the same enabled/disabled resources as upstream `pi config` for a representative user install.
- [ ] User top-level resources appear with correct scope/source/origin metadata.
- [ ] Project top-level resources appear only when cwd/project trust allows them.
- [ ] User and project `.agents/skills` resources appear consistently with upstream Pi.
- [ ] Package resources from `settings.packages` appear, including resources declared via `package.json#pi`.
- [ ] Package object filters are honored: omitted key loads all, `[]` loads none, `!`, `+`, `-` behave like upstream.
- [ ] Toggling top-level resources writes the same `+path`/`-path` patterns upstream `pi config` would write.
- [ ] Toggling package resources updates the matching package object, not top-level arrays.
- [ ] Package string entries are converted to object form only when needed and cleaned back when no filters remain.
- [ ] Settings tab continues to load and save existing Pi settings without breaking consumers like onboarding and plugin settings.
- [ ] Errors are user-visible and actionable when Pi package is missing, Node bridge fails, project is untrusted, or settings JSON is invalid.
- [ ] HTTP/WS dispatch behavior remains available for existing commands or replacement commands.
- [ ] Existing `read_resource_file` behavior is preserved for top-level resources; package resource viewing is either supported safely or hidden with clear disabled state.
- [ ] No broad UI redesign; changes stay inside Pi Config settings surface.

## Non-Goals

- Do not implement a full package marketplace.
- Do not modify upstream Pi package source.
- Do not add speculative resource categories beyond `extensions`, `skills`, `prompts`, `themes`.
- Do not change model/auth config behavior unless required for shared settings infrastructure.

## Implementation Plan

### Phase 1: Contract and Bridge Spike

- [ ] Create a minimal Node bridge prototype that imports Pi public exports and returns `DefaultPackageManager.resolve()` output as JSON.
- [ ] Verify bridge can run from the app repo without relying on forbidden deep imports.
- [ ] Define stable JSON schema for resource list and toggle requests.
- [ ] Include `metadata.baseDir` or equivalent so package/top-level relative paths can be computed safely.
- [ ] Add fixture tests for user top-level, project top-level, `.agents/skills`, and package resources.

Suggested files:

- Create: `scripts/pi-config-bridge.mjs` or `src-tauri/bin/pi-config-bridge.mjs` after packaging decision.
- Create: `src-tauri/src/domain/pi_config/` if Rust domain wrapper is added.
- Modify: `src-tauri/src/commands/skills.rs` or split new `commands/pi_config.rs`.

### Phase 2: Rust Command Integration

- [ ] Add Rust command wrappers for bridge calls.
- [ ] Keep command layer thin: validate payload, call domain/bridge, return typed JSON.
- [ ] Register commands in `commands/mod.rs`, `lib.rs`, `main.rs`, and `dispatch.rs` as needed.
- [ ] Preserve old command names if practical: `scan_all_resources`, `toggle_resource`, `load_pi_settings_full`, `save_pi_setting`.
- [ ] If command payload must change, add versioned replacement commands and migrate frontend deliberately.
- [ ] Add Rust tests for command parsing, error mapping, and project scope handling.

### Phase 3: Resource UI Alignment

- [ ] Extend `ResourceMetadata` in `src/types.ts` to include package source, baseDir/display group, and origin details needed by GUI.
- [ ] Update `ResourcesTab.tsx` to group like upstream: packages first, then top-level; user before project.
- [ ] Show package source and scope in group labels.
- [ ] Preserve compact filtering and type tabs.
- [ ] Toggle using richer metadata so package resources update package filters correctly.
- [ ] Handle package resource preview safely; if bridge can return content path, enable view; otherwise disable view for package resources.

### Phase 4: Settings and Project Trust

- [ ] Decide how GUI selects cwd for project-local config.
- [ ] Add explicit project trust state/confirmation before loading or writing project `.pi/settings.json`.
- [ ] Ensure settings writes flush before UI reports success.
- [ ] Keep `load_pi_settings_full` user-scope behavior compatible with existing code paths.
- [ ] Add project-scope support only where UI exposes it.

### Phase 5: Verification and Parity Tests

- [ ] Build fixture settings under a temp HOME/agentDir and temp project cwd.
- [ ] Compare bridge output against a direct JS call to `DefaultPackageManager.resolve()` for the same fixture.
- [ ] Test toggling:
  - top-level user extension
  - top-level project prompt
  - package skill from string package entry
  - package theme from object package entry
  - previous `+path` replaced by `-path`
  - object package cleaned back to string when filters empty
- [ ] Run Rust and frontend validation commands.
- [ ] Manual check against actual `pi config` on local machine.

## Suggested Verification Commands

```bash
cd ~/Dev/AI/pi-session-manager
pnpm tsc --noEmit
pnpm build
cd src-tauri && cargo test
cd src-tauri && cargo clippy -- -D warnings
```

Manual parity check:

```bash
pi config
```

Then compare visible resource groups/counts/toggle effects with PSM Settings -> Pi Config -> Resources.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Packaged app lacks Node runtime | Bridge cannot run | Decide early; bundle sidecar or choose Rust parity path via ADR |
| Pi SDK public API changes | GUI breaks on Pi update | Pin supported Pi versions and add runtime version diagnostics |
| Project trust mismatch | GUI reads/writes unsafe project config | Require explicit project trust confirmation before project scope |
| Package resource path traversal | Unsafe file read preview | Canonicalize paths and only read bridge-resolved paths inside package roots |
| Partial parity creates confusion | GUI says enabled but Pi loads differently | Use `DefaultPackageManager.resolve()` as oracle in tests |

## Notes for Implementing Agent

- Read upstream Pi docs before coding:
  - Pi `docs/packages.md`
  - Pi `docs/settings.md`
  - Pi `docs/sdk.md`
- Read upstream implementation before coding:
  - `dist/package-manager-cli.js`
  - `dist/cli/config-selector.js`
  - `dist/modes/interactive/components/config-selector.js`
  - `dist/core/package-manager.js`
- Do not use `pi config` as subprocess API.
- Do not deep import unexported Pi internals.
- Prefer one bridge boundary with typed JSON over scattering process calls through UI code.

## Status Log

- **2026-07-06**: Task generated from code inspection and upstream Pi config research. Status set to `ready-for-agent`.
