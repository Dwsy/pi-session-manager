# PSM Plugin Platform Development And Testing Guide

Date: 2026-05-23

## Purpose

This document explains how to develop, extend, and test the issue #36 proof of concept: a lightweight PSM plugin API plus the first AI session summary/metadata plugin.

The feature turns Pi Session Manager into a Rust-kernel + TypeScript plugin platform:

- Rust owns sessions, SQLite, FTS, model calls, dispatch, HTTP, and persistence invariants.
- TypeScript plugins call governed PSM capabilities through `@pi-session-manager/plugin-sdk`.
- Plugin-owned facts are stored as generic `plugin_records`, not one table per feature.
- The first record type is `session.intelligence`, produced by `builtin.session-summary`.

PSM plugins serve Pi Session Manager. They may use pi-flavored authoring patterns, but they are not Pi runtime plugins.

## Architecture At A Glance

| Layer | Files | Role |
|---|---|---|
| SQLite substrate | `src-tauri/src/data/sqlite/plugin_records.rs` | Store plugin records, FTS text, declared index values |
| Rust command layer | `src-tauri/src/commands/plugin_records.rs` | Tauri command wrappers and session intelligence refresh |
| Dispatch | `src-tauri/src/dispatch.rs` | Expose commands to WebSocket/HTTP-style dispatch |
| HTTP API | `src-tauri/src/server/http/plugin_records.rs` | External API routes for records/search/refresh |
| Summary domain | `src-tauri/src/domain/session_summary/mod.rs` | Build context, call model, convert result to plugin record |
| TS SDK | `packages/runtime-sdk/` | Capability client, manifest types, logic/UI contribution types |
| Search integration | `src/plugins/plugin-records/` | Search provider for `session.intelligence` records |
| Sample plugin | `extensions/psm-session-summary/` | Pi-flavored PSM plugin proof of concept |

## Data Model

Plugin-owned data is persisted in SQLite as generic records:

```text
plugin_id   = builtin.session-summary
scope_type  = session
scope_id    = <session path>
record_type = session.intelligence
```

Core tables:

```text
plugin_records
plugin_records_fts
plugin_record_index_values
```

`plugin_records.payload_json` is validated JSON text. Do not assume PostgreSQL-style JSONB. SQLite JSONB may be evaluated later, but V1 uses JSON text for compatibility with bundled SQLite.

`session.intelligence` payload shape:

```json
{
  "summary": "What happened in the session",
  "objective": "Inferred user goal",
  "status": "active | completed | blocked | unknown",
  "topics": ["plugin-api", "session-intelligence"],
  "unresolvedTasks": [],
  "nextSteps": [],
  "confidence": 0.82,
  "provider": "3838",
  "model": "gpt-5.5",
  "messageCount": 12
}
```

Do not store API keys or provider secrets in plugin records.

## Capability Surface

The TypeScript runtime SDK exposes first-stage PSM capabilities:

| Capability | Methods | Permission |
|---|---|---|
| `sessions` | `scan`, `list`, `readEntries`, `readFileChunk`, `getLabels`, `open` | `sessions:read` |
| `records` | `get`, `list`, `search`, `upsert`, `refreshSessionIntelligence` | `records:read`, `records:write` |
| `search` | `fulltext`, `pluginRecords` | `search:read` |
| `kanban` | `listTags`, `createTag`, `assignTag`, `removeTag`, `listSessionTags` | `kanban:read`, `kanban:write` |
| `sidechat` | `ask` | `sidechat:ask` |
| `models` | `listOptions` | `model:invoke` |

The SDK maps TypeScript camelCase inputs to backend-compatible snake_case payloads where needed.

## Boundary Decision

Stable plugin SDK surface:

- `PsmPluginManifest`, including optional `manifestVersion`, `runtime`, and `package` metadata
- `PsmPermission`
- `PsmRecordDeclaration`
- `PsmTransport`
- `createPluginCapabilityClient(...)`
- `PsmPluginHostContext`, `PsmPluginModule`, and activation/disposal types
- `ctx.ui.registerSessionToolbarItem(...)` and `ctx.ui.registerSessionPanel(...)`

App-internal direct paths:

- direct `invoke(...)` calls
- app providers under `src/runtime-data/` and `src/utils/`
- React components, hooks, stores, and layout internals
- Rust command implementations and SQLite modules

These app-internal paths are not plugin SDK. Do not migrate them just to make the app look more plugin-shaped. Migrate a caller only when it is intentionally acting as a PSM-hosted plugin or exercising the host boundary.

Host responsibilities for npm-installable plugins:

- discover installed packages from a PSM-managed plugin directory or lockfile
- resolve the declared ESM export
- validate the exported manifest
- check manifest, SDK, and host compatibility
- construct a permission context from the validated manifest
- provide the transport and capability client
- register plugin commands/tools/UI contributions
- catch load and activation failures, unregister partial contributions, and keep the app running
- call `dispose()` and/or `deactivate()` on reload/uninstall

`appPsmTransport` is not part of the publishable SDK package. It is the current in-app host adapter, because it imports PSM frontend transport internals.

## Permission Context And Enforcement

PSM plugin-style callers can now attach an explicit permission envelope:

```ts
createPluginCapabilityClient({
  transport: appPsmTransport,
  permissions: {
    pluginId: 'builtin.session-intelligence-toolbar',
    permissions: ['records:read', 'records:write', 'model:invoke'],
  },
})
```

Each SDK call carries this payload fragment when permissions are supplied:

```json
{
  "__psm": {
    "pluginId": "builtin.session-intelligence-toolbar",
    "permissions": ["records:read", "records:write", "model:invoke"]
  }
}
```

Backend enforcement happens in `src-tauri/src/dispatch.rs`.
It is intentionally opt-in: only requests carrying `__psm` are checked.
Legacy app-internal calls without `__psm` keep current behavior.

Current command-to-permission mapping:

| Command | Required permission(s) |
|---|---|
| `scan_sessions`, `scan_sessions_paginated`, `get_session_entries`, `read_session_file_chunk`, `get_session_labels` | `sessions:read` |
| `get_plugin_record`, `list_plugin_records_for_scope`, `search_plugin_records` | `records:read` |
| `upsert_plugin_record` | `records:write` |
| `refresh_session_intelligence_record` | `records:write`, `model:invoke` |
| `full_text_search` | `search:read` |
| `get_all_tags`, `get_all_session_tags` | `kanban:read` |
| `create_tag`, `assign_tag`, `remove_tag_from_session` | `kanban:write` |
| `ask_session_sidechat` | `sidechat:ask` |
| `list_model_options_fast` | `model:invoke` |

Permission denial shape:

```text
Plugin permission denied: <pluginId|unknown-plugin> cannot call <command>
```

## Developing A PSM Plugin

Create plugin code under `extensions/<plugin-name>/` for samples or local experiments.

Minimal repo-local shape:

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-summary',
  name: 'Session Summary',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke'],
  records: [
    {
      type: 'session.intelligence',
      scope: 'session',
      schemaVersion: 1,
    },
  ],
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('session-summary.refresh', async (args) => {
    return ctx.psm.records.refreshSessionIntelligence({
      path: String(args.path),
      provider: typeof args.provider === 'string' ? args.provider : undefined,
      model: typeof args.model === 'string' ? args.model : undefined,
    })
  })
}
```

Rules:

- Use PSM capabilities, not direct DB or filesystem access.
- Keep plugin state in `plugin_records` or future governed storage APIs.
- Declare permissions in the manifest and pass a matching `permissions` context when constructing a runtime capability client.
- Keep searchable fields in `searchable_text` through Rust-side projection.
- Do not hard-code model API keys in plugin code.

## Npm-installable Plugin V1 Design

The first npm-installable design keeps PSM plugins as PSM-hosted extensions, not Pi runtime plugins.

### Package boundary

Publishable SDK package:

```text
@pi-session-manager/plugin-sdk
```

It exports the stable SDK types/client listed above and excludes `appPsmTransport`, React UI internals, app stores, Rust command modules, and SQLite code.

Plugin package example:

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

The plugin module exports `manifest` and either a default activation function or `activate(ctx)`.

### Manifest and version compatibility

Npm-installable plugins should declare:

```ts
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
  permissions: ['sessions:read', 'records:read'],
}
```

The current manifest validator rejects unsupported manifest versions, unknown permissions, malformed record declarations, malformed runtime metadata, and malformed package metadata. Full semver range comparison and installed-package identity checks are loader responsibilities and remain deferred.

### Loader lifecycle

First-pass loader lifecycle:

1. Discover installed package records from a PSM-managed plugin directory or lockfile.
2. Resolve the package export to an ESM module.
3. Read and validate `module.manifest`.
4. Check `manifestVersion`, `runtime.sdk`, and `runtime.host`.
5. Build `PsmPermissionContext` from `manifest.id` and `manifest.permissions`.
6. Create a host-owned transport and `PsmCapabilityClient`.
7. Build `PsmPluginHostContext`.
8. Call `module.activate(ctx)` or `module.default(ctx)`.
9. Store registrations and any returned `dispose()` handle.
10. On reload/uninstall, unregister contributions, call `dispose()`, then call `deactivate()` if present.

### Failure and isolation behavior

V1 containment rules:

- A failed package resolution disables only that plugin.
- A failed manifest validation disables only that plugin.
- Incompatible SDK/host metadata disables only that plugin.
- Activation exceptions are caught and partial command/tool registrations are removed.
- Plugin command/tool handler exceptions are returned as plugin command errors.
- Permission failures are enforced by dispatch when the call carries `__psm`.
- Npm-installed plugins must receive host-derived permission context; they should not construct their own elevated context.

This does not provide a security sandbox. Remote update policy, signing, iframe/worker isolation, and other security hardening are deliberately outside this first pass.

### Distribution and install model

The first install model should be deterministic and local:

- Resolve npm packages outside normal app startup.
- Copy or snapshot plugin artifacts into a PSM-managed local plugin directory.
- Store package name, version, export path, manifest id, and integrity metadata in a local registry/lockfile.
- Load runtime plugins only from that managed registry.
- Do not fetch arbitrary package code during normal startup.

## Backend Flow: Refresh Session Intelligence

`refresh_session_intelligence_record` performs:

1. Open the configured SQLite connection.
2. Read session entries for the given path.
3. Build compact summary context.
4. Invoke `generate_session_summary` using provider/model if supplied.
5. Convert model output to a `session.intelligence` plugin record.
6. Upsert the record into `plugin_records`.
7. Update `plugin_records_fts` for search.

The model caller supports OpenAI-compatible reasoning models by trying `max_completion_tokens` first and falling back to `max_tokens` on compatible 400/404/422 failures.

## HTTP API

List records for a scope:

```bash
curl 'http://127.0.0.1:<port>/v1/plugin-records?scope_type=session&scope_id=/path/to/session.jsonl&record_type=session.intelligence'
```

Search plugin records:

```bash
curl -X POST 'http://127.0.0.1:<port>/v1/plugin-records/search' \
  -H 'content-type: application/json' \
  -d '{"query":"plugin API","record_type":"session.intelligence","limit":10}'
```

Refresh AI session intelligence:

```bash
curl -X POST 'http://127.0.0.1:<port>/v1/plugin-records/session-intelligence/refresh' \
  -H 'content-type: application/json' \
  -d '{"path":"/path/to/session.jsonl","provider":"3838","model":"gpt-5.5"}'
```

Use real provider/model names from local PSM model configuration. Never paste API keys into commands, docs, or committed files.

## Local Development Checklist

1. Change Rust storage or commands.
2. Update TypeScript SDK types/client if the command contract changes.
3. Update plugin sample if plugin authoring shape changes.
4. Add or adjust focused tests.
5. Run Rust, TypeScript, and live-path verification below.
6. Check that unrelated user changes are not staged.
7. Check that no local secrets were written to the repository.

## Focused Test Commands

Run from repo root unless noted.

### TypeScript SDK And Search Plugin

```bash
npx vitest run \
  packages/runtime-sdk/src/__tests__/manifest.test.ts \
  src/plugins/plugin-records/__tests__/PluginRecordSearchPlugin.test.tsx
```

Expected current result:

```text
PASS / FAIL 0
```

### TypeScript Type Check

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

### Rust Plugin Records Tests

```bash
cd src-tauri && cargo test --test plugin_records_test -- --nocapture
```

Expected current result:

```text
5 passed
```

### Rust Library Tests

```bash
cd src-tauri && cargo test --lib --quiet
```

Expected current result:

```text
103 passed
```

### Rust Lint

```bash
cd src-tauri && cargo clippy -- -D warnings
```

Expected: no errors. A workspace profile warning may appear and is unrelated to this feature.

### Rust Formatting For Touched Files

Prefer checking touched Rust files to avoid unrelated historical formatting drift:

```bash
rustfmt --check \
  src-tauri/src/commands/plugin_records.rs \
  src-tauri/src/data/sqlite/plugin_records.rs \
  src-tauri/src/domain/session_summary/mod.rs \
  src-tauri/src/server/http/plugin_records.rs \
  src-tauri/tests/plugin_records_test.rs
```

Known note: full `cargo fmt --check` may report existing formatting drift in unrelated `src-tauri/src/deep_link.rs`.

## Live AI Summary Verification

Use this only when local model configuration is valid and available.

Requirements:

- `~/.pi/agent/models.json` must be valid JSON.
- Provider/model must be configured locally.
- Do not print or commit API keys.
- Use `/tmp` for throwaway test harnesses.

A safe temporary harness can call the domain function directly:

```bash
work=$(mktemp -d /tmp/psm-live-summary.XXXXXX)
```

Create `$work/Cargo.toml`:

```toml
[package]
name = "psm-live-summary"
version = "0.1.0"
edition = "2021"

[dependencies]
pi-session-manager = { path = "/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri", default-features = false, features = ["cli"] }
tokio = { version = "1", features = ["full"] }
serde_json = "1"
```

Create `$work/src/main.rs`:

```rust
#[tokio::main]
async fn main() {
    let context = "user: We are designing a lightweight PSM plugin API.\n\nassistant: Use generic plugin_records storage and make the first plugin generate session intelligence summaries.";
    match pi_session_manager::domain::session_summary::generate_session_summary(
        context,
        Some("3838"),
        Some("gpt-5.5"),
    ).await {
        Ok((summary, provider, model)) => {
            println!(
                "LIVE_SUMMARY_OK provider={} model={} status={} topics={} summary={}",
                provider,
                model,
                summary.status,
                summary.topics.join(","),
                summary.summary
            );
        }
        Err(error) => {
            println!("LIVE_SUMMARY_ERR {}", error);
            std::process::exit(1);
        }
    }
}
```

Run:

```bash
CARGO_TARGET_DIR=/tmp/psm-live-summary-target cargo run --manifest-path "$work/Cargo.toml" --quiet
```

Expected successful shape:

```text
LIVE_SUMMARY_OK provider=3838 model=gpt-5.5 status=active topics=... summary=...
```

If it fails with JSON parsing errors, validate local config without printing secrets:

```bash
python3 -m json.tool "$HOME/.pi/agent/models.json" >/dev/null
```

Only repair `~/.pi/agent/models.json` after explicit user approval, and make a timestamped backup first.

## Secret Safety Checks

Before committing, run a targeted scan over repository paths touched by this feature:

```bash
rg -n "sk-|apiKey.*sk-|localhost:3838|gpt-5.5" \
  docs src src-tauri extensions \
  --glob '!node_modules/**' \
  --glob '!target/**' \
  --glob '!dist/**' || true
```

Expected: no API key. Mentions of local provider/model names in documentation may be acceptable; secrets are not.

## Git Hygiene

Check status before staging:

```bash
git status --short
```

Known unrelated files from the implementation session:

```text
src/components/__tests__/SessionTree.test.tsx
src/components/session-tree/SessionTree.tsx
src/components/session-viewer/SessionFlowView.tsx
```

Do not stage these unless the active task explicitly concerns them.

Stage only feature docs or intended files:

```bash
git add docs/PLUGIN_PLATFORM_DEVELOPMENT_AND_TESTING.md
```

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `Parse models.json: trailing comma` | Local model config is not valid JSON | Ask user approval, back up file, remove trailing comma |
| `folder .../dist does not exist` in default Rust build | GUI default feature expects built frontend assets | Run core checks with `--no-default-features` or build frontend first |
| Tauri IPC command gets missing arguments | Frontend sent camelCase where Rust expects snake_case | Fix SDK transport payload mapping |
| Search returns no session intelligence records | `searchable_text` empty or FTS not updated | Verify `upsert_plugin_record` refreshed `plugin_records_fts` |
| Reasoning model rejects request | Provider may expect `max_completion_tokens` | Confirm fallback path in `session_summary/mod.rs` |

## Current Completion State

The POC currently has:

- Generic plugin record substrate committed.
- Expanded runtime SDK capability client committed.
- AI session summary plugin POC committed.
- Opt-in backend permission enforcement committed in `dispatch.rs`.
- Tauri plugin-facing transport routed through `plugin_dispatch_command`.
- Real runtime SDK entry points now pass explicit `pluginId` + `permissions` context.
- Handoff archive committed at `docs/handoff/issue-36-plugin-poc-handoff.md`.
- Focused Rust/TS verification passed.
- Live `gpt-5.5` summary generation passed after local config JSON was repaired with user approval.
- Full `cargo test --lib --quiet` currently passes again after test env isolation fix.

Remaining natural follow-ups:

- Decide and document which internal app paths should remain direct `invoke(...)` and which should converge on plugin-style capability boundaries.
- Add plugin loader lifecycle if/when PSM needs dynamic external plugin loading.
- Add broader capability tests if new plugin-facing commands are added beyond records/search/sidechat/models.
