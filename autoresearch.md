# Autoresearch: SQL index creation + retrieval performance

## Objective
Improve SQLite-backed indexing and full-text retrieval performance in Pi Session Manager without changing search behavior or cheating on the benchmark.

The benchmark uses the real Rust code path for:
1. fresh database initialization,
2. session parsing + `upsert_session` indexing into `sessions`, `message_entries`, and `message_fts`,
3. representative `full_text_search` queries across multiple query shapes.

## Metrics
- **Primary**: `total_ms` (ms, lower is better) — median total time for DB init + indexing + mixed retrieval workload
- **Secondary**:
  - `init_ms` — DB/bootstrap/index schema setup time
  - `ingest_ms` — session parsing + SQL write/index build time
  - `search_ms` — mixed retrieval query suite time
  - `total_hits` — guardrail to ensure the workload still returns the same amount of data

## How to Run
`./autoresearch.sh`

The script runs `src-tauri/examples/sql_index_bench.rs`, which outputs structured `METRIC ...` lines.

## Workload Definition
Synthetic but representative workload using the real application code:
- 180 session JSONL files
- 18 messages per session
- three project roots for project-path filtering
- five query shapes:
  - common FTS multi-term search
  - quoted phrase search
  - assistant-only filtered search
  - project-path filtered search
  - paginated user-only search
- benchmark reports median across 5 inner runs

This workload is fixed after baseline unless a harness bug is found.

## Files in Scope
- `autoresearch.sql_index_bench.rs` — preserved benchmark source of truth
- `src-tauri/examples/sql_index_bench.rs` — generated benchmark driver used by `autoresearch.sh`
- `src-tauri/src/sqlite_cache/sessions.rs` — session upsert/indexing path
- `src-tauri/src/sqlite_cache/message_index.rs` — message entry + FTS maintenance
- `src-tauri/src/sqlite_cache/bootstrap.rs` — schema/index creation
- `src-tauri/src/sqlite_cache/migrations.rs` — index migrations
- `src-tauri/src/commands/search.rs` — full text retrieval SQL
- `src-tauri/tests/full_text_search_*` and `src-tauri/tests/migration_test.rs` — correctness coverage

## Off Limits
- Frontend UI and unrelated features
- Benchmark dataset/query mix after baseline, unless fixing a benchmark bug
- Fake shortcuts that skip real indexing/search code paths

## Constraints
- No new runtime dependencies unless clearly justified
- Keep behavior and test expectations unchanged
- Passing benchmark results must also pass `autoresearch.checks.sh`
- Prefer optimizations that improve both indexing and retrieval, not just one happy-path query

## What's Been Tried
- Initial benchmark harness created around the real init/index/search path.
- Harness bug found on first run: project-path filtered query returned zero hits because the synthetic dataset did not guarantee `tokio async` content inside `/workspace/project-b`. Fixed by ensuring project-b sessions carry that term.
- Checks bug found on second run: `--no-default-features --features cli` test commands compile an existing broken CLI-only path unrelated to search/index behavior. Checks were narrowed to the same relevant tests under the default feature set.
- Suspected hotspots before experiments:
  - redundant delete work during `upsert_session` + `upsert_message_entries`
  - extra session lookups after search rows are fetched
  - missing composite indexes for window-function-heavy retrieval paths
