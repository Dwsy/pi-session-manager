---
id: "2026-08-01-refactor-rust-command-routing"
title: "Refactor Rust command routing for feature extensibility"
status: "done"
created: "2026-08-01"
updated: "2026-08-01"
category: "task"
tags: ["rust", "architecture", "dispatch", "tauri", "search"]
---

# Issue: Refactor Rust Command Routing for Feature Extensibility

## Goal

Reduce the cost and risk of adding Rust backend features by separating composition, protocol routing, and business logic while preserving all existing command contracts.

## Current State

- `src-tauri/src/dispatch.rs` is a 1,500-line central router with 160 command names, permission enforcement, payload conversion, GUI/CLI branching, and tests.
- `src-tauri/src/lib.rs` owns a 175-entry Tauri handler list and the complete GUI composition root.
- `src-tauri/src/commands/search.rs` mixes Tauri adapters with database orchestration, ranking, pagination, timeout, and metrics.
- Adding a command commonly requires edits across `commands/`, `lib.rs`, and `dispatch.rs`.

## Scope

1. Characterize command catalogs and preserve public names, payloads, responses, errors, and GUI/CLI availability.
2. Convert `dispatch.rs` into capability-oriented `dispatch/` modules with a small top-level router.
3. Extract plugin permission enforcement into `dispatch/permissions.rs`.
4. Move the Tauri composition root into `app/` and remove duplicate handler registrations.
5. Move Search orchestration into `domain/session_search/`; keep `commands/search.rs` as a typed adapter.
6. Document module ownership and the extension path.

## Non-Goals

- No new dependencies, trait registry, procedural macros, or broad infrastructure relocation.
- Do not refactor `commands/psm_plugins.rs` or `commands/skills.rs` business logic in this issue.
- Do not change frontend contracts or redesign the UI.

## Acceptance Criteria

- [x] `dispatch/mod.rs` contains only common entry behavior, capability delegation, and unknown-command handling.
- [x] Command arms are grouped into capability modules instead of one central match.
- [x] Permission parsing and enforcement live in `dispatch/permissions.rs` with regression tests.
- [x] `commands/search.rs` contains only typed Tauri adapter functions.
- [x] Search algorithms, database orchestration, pagination, timeout, and metrics live in `domain/session_search/`.
- [x] Tauri application setup and handler registration live under `app/`.
- [x] Duplicate Tauri handler registrations are removed without changing public commands.
- [x] Existing command names, payload aliases, return shapes, errors, and GUI/CLI behavior remain compatible.
- [x] `cargo fmt --all --check` passes.
- [x] GUI and CLI library checks pass.
- [x] Targeted dispatch/search tests and full Rust tests pass.

## Implementation Plan

- [x] Characterize command registries and baseline tests.
- [x] Extract Search domain implementation and thin adapter.
- [x] Extract dispatch permissions and capability routers.
- [x] Move Tauri composition root to `app/`.
- [x] Add architecture documentation and run complete validation.

## Baseline

On 2026-08-01 before edits:

- GUI `cargo check --lib`: passed.
- CLI `cargo check --lib --no-default-features --features cli`: passed.
- Dispatch tests: 18 passed.
- Search tests: 7 passed.
- Git working tree: clean.

## Validation

Completed on 2026-08-01:

- `cargo fmt --all --check`: passed.
- GUI `cargo check --manifest-path src-tauri/Cargo.toml --lib`: passed.
- CLI `cargo check --manifest-path src-tauri/Cargo.toml --lib --no-default-features --features cli`: passed.
- GUI library tests: 174 passed.
- CLI library tests: 173 passed.
- Dispatch regression tests: 19 passed, including command catalog uniqueness/completeness.
- Search domain tests: 7 passed.
- Tauri handler catalog: 174 unique handlers; expected Tauri-only and dispatch-only differences are asserted.
- `git diff --check`: passed.
