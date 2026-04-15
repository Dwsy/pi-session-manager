# Session Scan Performance Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Reduce session scan latency and disk I/O by fixing scan mechanics first, then optimizing hot paths with evidence.

**Architecture:** Split the current scanning pipeline into observable phases, add persisted scan-state to avoid wasteful rediscovery, then decouple lightweight session listing from heavy content/index maintenance. Keep watcher-driven incremental updates as the primary steady-state path and reserve full scans for startup, repair, or explicit user actions.

**Tech Stack:** Rust, Tauri, SQLite, notify, Tokio, tracing

---

## Problem Summary

Current scan flow lives mainly in `src-tauri/src/core/scanner.rs` and `src-tauri/src/file_watcher.rs`.

Observed structural costs:
- Full scans still recurse through all configured roots before deciding what changed.
- External providers add heterogeneous parse cost; OpenCode is especially expensive because one DB expands into many virtual sessions.
- `SessionInfo` carries heavy text fields even when list views do not need them.
- Cache invalidation is still coarse in several flows.
- SQLite upsert path pays per-session transactional/index maintenance cost.

The right strategy is not “make full scan faster” first. The right strategy is “stop doing unnecessary full scans, then optimize the expensive work that remains.”

---

## Phase 1: Add Observability Before Changing Behavior

### Task 1: Instrument scan phase timings

**Files:**
- Modify: `src-tauri/src/core/scanner.rs`
- Modify: `src-tauri/src/file_watcher.rs`
- Modify: `src-tauri/src/domain/session_bridge/api.rs`

**Step 1: Add phase timers in `scan_sessions_with_config`**

Record elapsed ms for:
- load config / init db
- collect session dirs
- collect candidate files
- identify files_to_parse
- parallel parse
- sqlite upserts
- final merge/sort

**Step 2: Add counters in log output**

Include:
- total roots
- total candidate files
- files_to_parse
- realtime_count
- historical_count
- provider distribution if cheap to compute

**Step 3: Instrument watcher incremental rescans**

In `process_events_with_merge`, log:
- batched changed file count
- rescan_changed_files elapsed ms
- diff updated/removed counts

**Step 4: Instrument vendor/provider read path**

In `session_bridge/api.rs`, log provider type and parse path only at debug/trace level.

**Step 5: Verify**

Run:
```bash
cd src-tauri && cargo test scanner -- --nocapture
```
Expected: existing scanner tests still pass, new logs appear when debug level is enabled.

---

## Phase 2: Remove Obvious Mechanical Waste

### Task 2: Split lightweight list payload from heavy text payload

**Files:**
- Modify: `src-tauri/src/types.rs` or equivalent session type definition location
- Modify: `src-tauri/src/core/scanner.rs`
- Modify: `src-tauri/src/data/sqlite/sessions.rs`
- Modify: list/paginated API call sites if needed

**Step 1: Define a lightweight session list representation**

Fields should include only what list view needs:
- path, id, cwd, name, created, modified, message_count, first_message, last_message, last_message_role, parent_session_path

**Step 2: Stop cloning heavy text blobs for list-first paths**

Use the existing `get_cached_sessions_for_list()` idea as the default list-serving path where possible.

**Step 3: Keep heavy fields only for search/index/detail paths**

Do not break compatibility silently. Add a narrow adapter if the frontend still expects the old shape.

**Step 4: Verify**

Run:
```bash
cd src-tauri && cargo test session -- --nocapture
```
Expected: session list APIs still pass tests.

### Task 3: Tighten no-op and early-exit behavior around scan triggers

**Files:**
- Modify: `src-tauri/src/core/scanner.rs`
- Modify: `src-tauri/src/file_watcher.rs`
- Modify: any commands that invalidate scan cache unnecessarily

**Step 1: Audit all `invalidate_cache()` call sites**

Classify each as:
- required
- can be narrowed to provider/path scope
- can be removed

**Step 2: Add targeted helper APIs**

Examples:
- invalidate specific path
- invalidate provider scope
- invalidate only list cache / only detail cache

**Step 3: Replace coarse invalidations where safe**

Keep global invalidation only for config shape changes or DB repair.

**Step 4: Verify**

Run:
```bash
cd src-tauri && cargo test settings scanner -- --nocapture
```
Expected: settings and scanner tests still pass.

---

## Phase 3: Persist Scan State So Startup Does Less Work

### Task 4: Add scan state table

**Files:**
- Modify: `src-tauri/src/data/sqlite/bootstrap.rs`
- Create/Modify: `src-tauri/src/data/sqlite/scan_state.rs`
- Modify: `src-tauri/src/data/sqlite/mod.rs`
- Modify: `src-tauri/src/core/scanner.rs`

**Step 1: Create `scan_state` table**

Suggested columns:
- path PRIMARY KEY
- backing_path
- provider_slug
- file_modified
- file_size
- last_scanned_at
- last_parse_status

**Step 2: Populate/update scan_state during parsing**

On successful parse, update metadata.
On parse failure, record failure state without crashing the whole scan.

**Step 3: Use scan_state to prune work**

During full scan:
- compare current metadata against scan_state
- skip both parse and some DB lookups when unchanged

**Step 4: Verify**

Run:
```bash
cd src-tauri && cargo test sqlite scanner -- --nocapture
```
Expected: schema and scanner tests pass.

---

## Phase 4: Provider-Specific Cost Control

### Task 5: Special-case OpenCode scan state

**Files:**
- Modify: `src-tauri/src/domain/casr_min/providers/opencode.rs`
- Modify: `src-tauri/src/domain/session_bridge/api.rs`
- Modify: `src-tauri/src/core/scanner.rs`

**Step 1: Cache OpenCode DB expansion metadata**

Track:
- db path
- db mtime
- expanded session count
- last expansion time

**Step 2: Skip repeated `list_session_paths_in_db` when DB metadata unchanged**

**Step 3: Verify**

Run targeted tests:
```bash
cd src-tauri && cargo test opencode -- --nocapture
```
Expected: OpenCode tests pass.

### Task 6: Move to provider-specific discovery functions

**Files:**
- Modify: `src-tauri/src/core/scanner.rs`
- Create: `src-tauri/src/core/scanners/pi.rs`
- Create: `src-tauri/src/core/scanners/codex.rs`
- Create: `src-tauri/src/core/scanners/claude.rs`
- Create: `src-tauri/src/core/scanners/opencode.rs`
- Create: `src-tauri/src/core/scanners/gemini.rs`

**Step 1: Extract current generic walk into provider-specific discoverers**

**Step 2: Keep one orchestrator that merges provider outputs**

**Step 3: Add provider-specific skip rules**

This is where you stop paying the abstraction tax of one generic recursive walker.

**Step 4: Verify**

Run:
```bash
cd src-tauri && cargo test scanner session_bridge -- --nocapture
```
Expected: scanning and bridge tests pass.

---

## Phase 5: Separate Listing from Indexing

### Task 7: Decouple list scan from search/index maintenance

**Files:**
- Modify: `src-tauri/src/core/scanner.rs`
- Modify: `src-tauri/src/data/sqlite/message_index.rs`
- Modify: `src-tauri/src/data/search/...` as needed

**Step 1: Make list scan stop depending on large text materialization**

**Step 2: Move heavy text/index refresh to background maintenance**

**Step 3: Ensure UI can render session lists before indexing completes**

**Step 4: Verify**

Run:
```bash
cd src-tauri && cargo test search scanner -- --nocapture
```
Expected: search and scanner tests pass.

---

## Acceptance Criteria

A phase is only done when:
- tracing shows fewer unnecessary scans or less parse work
- relevant tests pass
- no user-visible regression in session list, preview, search, or convert flows

Quantitative success targets:
- unchanged startup scan should parse dramatically fewer files than today
- watcher steady-state should avoid full recursive walks
- settings changes unrelated to session roots/providers should not trigger heavy scan work
- list responses should avoid carrying heavy text blobs by default

---

## Rollout Notes

- Phase 1 and Phase 2 are low-risk and should happen first.
- Phase 3 is the big win.
- Phase 4 and Phase 5 are architectural cleanup after you have measurements.
- Do not refactor blindly. Measure first, then kill waste.
