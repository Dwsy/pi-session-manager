# psm-bridge

Bridge Pi agent sessions to Pi Session Manager — live sync, paginated discovery, bounded search/context recall, and tag management.

## Architecture

```text
src/
├── config.ts               # Env vars, URLs, request deadlines
├── types.ts                # Bridge/PSM transport interfaces
├── psm-client.ts           # Bounded HTTP client for PSM POST /api dispatch
├── bridge-connection.ts    # WebSocket connection + heartbeat + RPC
├── connection-manager.ts   # Live mode lifecycle, event forwarding, RPC handling
├── tools.ts                # LLM tools: list/search/context/recall/tag
├── commands.ts             # /psm interactive panel
├── kanban-store.ts         # Compatibility facade over the PSM tag API
├── env.d.ts                # Pi runtime type declarations
└── index.ts                # Extension entry point
```

The bridge treats PSM as the data/index source of truth. Default retrieval paths do not build a second catalog/index, download the full session catalog, or materialize a full Pi JSONL session just to return a small context window.

Before using newer retrieval features the client checks PSM bridge protocol/capabilities. HTTP commands also have finite deadlines so an unavailable or incompatible PSM instance fails with an actionable error instead of blocking an agent turn indefinitely.

## Features

### /psm — Interactive Panel

Single entry point for live-bridge and tag operations:

```text
 PSM Bridge
   Status:    ● connected
   Live Mode: OFF
   Session:   abc123...
 → ● Connect / ○ Disconnect
   ○ Live: OFF (toggle on)
   ─── Tags ───
     Manage Tags...
     Clear All Tags
   ───
     Close
```

All tag reads/writes go through PSM dispatch. The extension does not directly modify `tags_config.json` or `session_mark.json`.

### Live Mode

When connected over WebSocket:

- Event forwarding: agent/turn/message/tool lifecycle events and model selection.
- RPC handling: prompt, steer, follow-up, model/thinking changes, state, and abort.
- Session state sync: model, thinking level, and streaming state.

### LLM Tools

| Tool | Description |
|------|-------------|
| `session_list` | Paginated session discovery with metadata/project/tag/source filters |
| `session_search` | Bounded FTS evidence with full session ID/path + entry ID |
| `session_recall` | FTS top-N followed by bounded anchored context windows |
| `session_context` | Bounded tail or anchored window from one known session |
| `session_tag` | List/set/remove current-session tags through the PSM API |

#### `session_list`

Important parameters:

- `query`: optional session-metadata search.
- `projectPath`: exact project/cwd filter.
- `tag`: tag-name filter.
- `source`: session-provider slug.
- `sortBy`: metadata sort mode.
- `offset`: default `0`.
- `limit`: default `20`, max `50`.

Results include full `sessionId` and `sessionPath` so follow-up context calls do not need a full-catalog lookup.

#### `session_search`

Important parameters:

- `query`: required search text.
- `roleFilter`: `all | user | assistant`, default `all`.
- `matchMode`: `any | all | phrase | smart`, default `any`.
- `pageSize`: top-K size, `1..20`, default `8`.
- `sortOrder`: `relevance | newest | oldest`, default `relevance`.
- `includeTools`: include indexed `toolResult` evidence, default `true`.
- `from` / `to`: optional RFC3339 time range.
- `projectPath`: optional exact session cwd/project filter.

`smart` is intentionally opt-in until a relevance benchmark demonstrates that changing the default does not regress historical retrieval. The agent-facing tool exposes bounded top-K behavior rather than treating the backend's truncated search window as an exact deep-pagination count.

PSM bounds search-hit content before transporting it to the bridge. Tool-result indexing is text-only and capped at 16 KiB per indexed result; Bridge search requests additionally cap transported hit content and render short excerpts.

#### `session_context`

Use either `sessionId` or `sessionPath`. Full IDs returned by list/search are preferred. Legacy short IDs are supported only through bounded prefix lookup and fail on ambiguity.

Optional controls:

- `anchorEntryId`: center the window on a known FTS entry.
- `before` / `after`: bounded neighboring entries.
- `includeTools`: include `toolResult` entries.
- `maxChars`: hard text budget, default `16000`, max `32000` at the tool layer.

For Pi JSONL sessions, PSM scans entries through a streaming/ring-buffer path and does not materialize the full session object. A missing/stale anchor is reported explicitly; unrelated context is not substituted.

#### `session_recall`

Recall uses this pipeline:

```text
FTS top-N hit (session_path + entry_id)
  -> bounded get_session_entry_window
  -> bounded concurrent rendering
  -> hard final output budget
```

It does not call `scan_sessions()` to resolve a hit and does not read an entire Pi session by default.

## Scale and consistency notes

- Paginated session listing removes full-catalog transfer from the bridge hot path. PSM currently still filters/sorts an in-memory list on cache miss; DB-native cursor/keyset pagination is a separate follow-up if 50k/100k corpus benchmarks cross the latency target.
- Tag mutations invalidate PSM's derived paginated-list cache so the next identical tag-filtered list reflects the mutation.
- Schema v20 widens `message_entries` to support bounded `toolResult` / `tool_result` evidence while preserving existing indexed rows. The row-version refresh then backfills the new bounded tool-result rows.
- The first anchored-window implementation guarantees bounded response/materialization. It does not claim O(window) latency for an anchor near the end of a large file; a persistent canonical entry locator remains a future optimization if measurements require it.
- Session-intelligence hybrid retrieval and live-tail merging are deliberately not required for the base retrieval path.

## Configuration

```bash
# PSM port is auto-read from ~/.pi/pi-session-manager/config.json.
# HTTP fallback port: 52131
export PSM_URL=ws://127.0.0.1:5002/ws

# Optional auth token
export PSM_TOKEN=your-token
```

## Requirements

- Node.js >= 21.0.0
- A compatible Pi Session Manager instance running for search/context/tag/live operations

## Validation

The retrieval upgrade is covered by Bridge TypeScript/Vitest tests plus Rust unit/regression tests for capability catalogs, schema migration, 10k pagination payload bounds, tool-result indexing, search-content truncation, tag-cache invalidation, and anchored windows.
