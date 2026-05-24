# Ariadne Trace & Timeline — Implementation Plan

> "The details are not the details. They make the design." — Charles Eames

## Reference

This plan is inspired by **Ariadne** — an AI Agent session observability tool by [@0xcgn](https://x.com/0xcgn):

> "I've been thinking about visualizing the sessions for a while and had some primitives in ariadne.
> Given the recent push from @badlogicgames and general interest on agent traces, I did a little update
> and added details, analytics and traces views to session details…
> it is amazing how much information you can extract from just parsing the session jsonl files…"
> — [Original tweet](https://x.com/0xcgn/status/2042245895295578459), 2026-04

Key insight from Ariadne: **existing session JSONL files already contain full execution traces** —
tool calls, tokens, costs, file edits, timing — no extra instrumentation needed. This plan applies
that same philosophy to PSM, reusing the existing Pi JSONL format as the sole data source.

## 0. Executive Summary

Transform Pi Session Manager from a **session browser** into an **Agent behavior observability platform** — inspired by Ariadne's Trace/Timeline/Inspector, but built on **existing PSM infrastructure**.

### Core Principles
1. **Zero new database tables** — all data comes from existing JSONL files
2. **Zero new storage files** — no trace.jsonl, no extra metadata files
3. **Rust does the heavy lifting** — parse JSONL once in Rust, return structured analytics
4. **Frontend renders** — TS components consume pre-computed data
5. **Progressive enhancement** — old sessions work (basic stats), rich data only when JSONL has usage info

---

## 1. What We Already Have (Existing Infrastructure)

### Backend (Rust) — Already Works
| Capability | Location | Status |
|-----------|----------|--------|
| JSONL parsing | `core/parser.rs` `parse_session_details()` | ✅ Extracts tokens/cost/model per session |
| Entry extraction | `commands/session_file.rs` `get_session_entries_impl()` | ✅ Returns all entries with message data |
| Chunked reading | `read_session_file_chunk/incremental` | ✅ 256KB chunks, UTF-8 safe |
| Stats aggregation | `domain/stats/aggregator.rs` | ✅ Per-model, per-project, heatmap, hourly |
| Tool call data | In `message.usage` + `message.tool_calls` | ✅ Already in JSONL |
| Session scanning | `core/scanner.rs` | ✅ Parallel, cached, incremental |
| Live streaming | Pi Live WebSocket | ✅ Real-time event push |

### Frontend (TS/React) — Already Works
| Capability | Location | Status |
|-----------|----------|--------|
| Session loading | `useSessionViewerData` | ✅ Chunked + live |
| Entry rendering | `SessionViewerMessages` | ✅ User/Assistant/ToolResult |
| Tool result display | `toolResultByCallId` map | ✅ Links tool calls to results |
| Stats computation | `utils/session.ts` `computeStats()` | ✅ LegacySessionStats |
| Tree navigation | `SessionTree` | ✅ Branch visualization |
| Live events | Pi Live WebSocket listeners | ✅ Real-time entry updates |
| Recharts charts | Dashboard pages | ✅ Already installed |
| @xyflow/react | SessionFlowView | ✅ Already installed |

### What's Already in the JSONL (Per `message` Entry)
```json
{
  "type": "message",
  "id": "8eaf2a7e",
  "parentId": "5717d85f",
  "timestamp": "2026-04-07T01:19:43.144Z",
  "message": {
    "role": "assistant",
    "provider": "anthropic",
    "model": "claude-opus-4-6",
    "content": [{"type":"text","text":"..."},{"type":"toolCall","id":"tc_1","name":"bash","arguments":"{...}"}],
    "usage": {
      "input": 40774, "output": 197,
      "cacheRead": 0, "cacheWrite": 0,
      "totalTokens": 40971,
      "cost": {"input":0.408,"output":0.002,"cacheRead":0,"cacheWrite":0,"total":0.410}
    }
  }
}
```

**Every assistant message already has**: tokens, cost, tool calls, model info.
**Every entry already has**: id, parentId, timestamp.

---

## 2. Gap Analysis: Current vs Ariadne

| Feature | PSM Current | Ariadne Target | Gap |
|---------|-------------|----------------|-----|
| Session list | List/Board/Project views | Sortable table with Duration/Cost/Tokens/Tools | Medium — need to compute duration + aggregate tool count |
| Session overview cards | Basic stats | 7-card dashboard (Sessions/Cost/Tokens/Avg/Projects/Tools/Disk) | Small — mostly reuse existing stats |
| Chat replay | Full chat view | Lighter "trace" view with event-type coloring | Small — new render mode |
| Details panel | None | Duration/Cost/Tokens/Messages/Tools + charts | Medium — new component + data |
| Analytics panel | Dashboard (heatmap/trends) | Tool call breakdown + file lists + bash stats | Medium — new component |
| Timeline (Gantt) | TimelineNav (basic) | Color-coded Gantt with duration bars + zoom | Large — new visualization |
| Inspector drawer | None | Click any event → CONTENT/RESULT/USAGE/RAW JSON | Large — new component |
| Error highlighting | None | 5 errors shown, clickable | Small — filter existing tool results |

---

## 3. Data Flow Architecture (Zero New Files)

```
┌─────────────────────────────────────────────────────┐
│  Existing JSONL (~/.pi/agent/sessions/*.jsonl)     │
│  Each line: {type, id, parentId, timestamp, ...}    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  NEW Rust Command: get_session_trace_analytics      │
│  Input: session_path                                │
│  Output: SessionTraceAnalytics (struct below)       │
│  Logic:                                             │
│    1. Read JSONL file (already have read impl)      │
│    2. Parse all entries (already have parser)       │
│    3. Extract per-entry:                            │
│       - role, model, tokens, cost, tool calls       │
│       - duration (timestamp delta between entries)  │
│       - tool names, file paths, error flags         │
│    4. Aggregate:                                    │
│       - totals, breakdowns, top models, file lists  │
│    5. Return structured JSON                        │
└──────────────────────┬──────────────────────────────┘
                       │ Single Tauri invoke
                       ▼
┌─────────────────────────────────────────────────────┐
│  Frontend: useSessionTrace Hook                     │
│  - invoke('get_session_trace_analytics', {path})    │
│  - Cache result (per session)                       │
│  - Expose: analytics, timeline, events              │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   TraceChatPanel  TimelineGantt  TraceInspector
   (left)          (center)       (right drawer)
```

**Key insight**: The JSONL already has everything. We just need one Rust command to parse it into a trace-friendly shape, and TS components to render it.

---

## 4. New Rust Types & Command

### 4.1 Types (`src-tauri/src/domain/trace/types.rs`)

```rust
/// Per-entry trace data (one per JSONL entry with meaningful content)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceEvent {
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: String,
    pub offset_ms: u64,          // ms from session header timestamp
    pub duration_ms: u64,        // ms until next event (0 for last)
    pub event_type: TraceEventType,
    pub role: Option<String>,    // user/assistant/toolResult
    pub model: Option<String>,   // "anthropic/claude-opus-4-6"
    pub provider: Option<String>,
    pub thinking: Option<String>, // truncated thinking content

    // Tool call data (if this message has tool calls)
    pub tool_calls: Vec<TraceToolCall>,

    // Token & cost (from assistant messages)
    pub tokens: Option<TraceTokens>,
    pub cost: Option<TraceCost>,

    // Content preview (first 200 chars of user/assistant text)
    pub content_preview: Option<String>,

    // Error info (from tool results)
    pub is_error: bool,
    pub error_message: Option<String>,

    // Files touched (extracted from tool call args)
    pub files_read: Vec<String>,
    pub files_written: Vec<String>,
    pub files_edited: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TraceEventType {
    UserPrompt,
    AssistantResponse,
    ToolCall,
    ToolResult,
    ModelChange,
    ThinkingLevelChange,
    Compaction,
    CustomMessage,
    SystemEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceToolCall {
    pub id: String,
    pub name: String,
    pub arguments_preview: String,  // first 200 chars
    pub status: String,             // "running" | "completed" | "error"
    pub result_preview: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceTokens {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceCost {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
    pub total: f64,
}

/// Full trace analytics for a single session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTraceAnalytics {
    // === Overview ===
    pub session_id: String,
    pub session_path: String,
    pub cwd: String,
    pub name: Option<String>,
    pub created: String,
    pub modified: String,
    pub duration_secs: u64,          // header → last entry
    pub active_secs: u64,            // first user msg → last assistant msg

    // === Totals ===
    pub total_events: usize,
    pub total_messages: usize,
    pub total_user_messages: usize,
    pub total_assistant_messages: usize,
    pub total_tool_calls: usize,
    pub total_tool_results: usize,
    pub total_errors: usize,
    pub total_tokens: TraceTokens,
    pub total_cost: TraceCost,
    pub primary_model: String,
    pub models_used: Vec<String>,
    pub compaction_count: usize,

    // === Tool breakdown ===
    pub tool_call_counts: HashMap<String, usize>,    // "bash" → 57
    pub tool_call_durations: HashMap<String, Vec<u64>>, // "bash" → [1200, 3400, ...]

    // === File tracking ===
    pub files_read: Vec<String>,        // unique paths
    pub files_written: Vec<String>,
    pub files_edited: Vec<String>,
    pub files_read_count: usize,        // total reads (including repeats)
    pub files_written_count: usize,
    pub files_edited_count: usize,

    // === Bash commands ===
    pub bash_commands: Vec<BashCommandStat>, // command prefix + count

    // === Timeline events (flat, sorted by timestamp) ===
    pub events: Vec<TraceEvent>,

    // === Token & cost breakdown by model ===
    pub tokens_by_model: HashMap<String, TraceTokens>,
    pub cost_by_model: HashMap<String, TraceCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BashCommandStat {
    pub command_prefix: String,  // first 80 chars
    pub count: usize,
    pub total_duration_ms: u64,
}
```

### 4.2 New Command (`src-tauri/src/commands/trace.rs`)

```rust
#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_trace_analytics(
    session_path: String,
) -> Result<SessionTraceAnalytics, String> {
    crate::domain::trace::extractor::extract_trace_analytics(&session_path)
}
```

### 4.3 Extractor Logic (`src-tauri/src/domain/trace/extractor.rs`)

Core algorithm:
1. Read JSONL file (reuse `read_session_file_impl`)
2. Parse header for session_id, timestamp, cwd, name
3. Walk all entries linearly:
   - Compute `offset_ms` = entry.timestamp - header.timestamp
   - Compute `duration_ms` = next_entry.timestamp - entry.timestamp
   - For `message` entries:
     - Extract role, model, provider, usage (tokens + cost)
     - Extract tool_calls from content array (type=="toolCall")
     - Extract text content for preview
     - Extract file paths from tool call arguments
   - For `model_change` / `thinking_level_change` / `compaction`: create system events
   - For tool results: track errors, match to tool calls
4. Aggregate all data into `SessionTraceAnalytics`
5. Return

**Performance**: Single pass through JSONL. For 10K-line files (~10MB), ~50ms in Rust.

### 4.4 Registration

- Add to `src-tauri/src/dispatch.rs`
- Add module: `mod trace;` in `src-tauri/src/domain/mod.rs`

---

## 5. Frontend Implementation

### 5.1 New Hook: `useSessionTrace.ts`

```typescript
// src/hooks/useSessionTrace.ts

interface UseSessionTraceResult {
  analytics: SessionTraceAnalytics | null;
  loading: boolean;
  error: string | null;
  // Convenience getters
  totalEvents: number;
  totalToolCalls: number;
  totalErrors: number;
  totalDuration: string;  // formatted "2h 21m"
  primaryModel: string;
}
```

Logic:
- `invoke('get_session_trace_analytics', { sessionPath })`
- Cache by session path (LRU, max 5 sessions)
- Return parsed analytics + convenience getters

### 5.2 New Components

| Component | File | Purpose |
|-----------|------|---------|
| `TraceView` | `src/components/trace/TraceView.tsx` | Top-level container, 3-tab layout |
| `TraceChatPanel` | `src/components/trace/TraceChatPanel.tsx` | Left: chat-style event list |
| `TraceDetailsPanel` | `src/components/trace/TraceDetailsPanel.tsx` | Right: Details tab (stats + charts) |
| `TraceAnalyticsPanel` | `src/components/trace/TraceAnalyticsPanel.tsx` | Right: Analytics tab (tool breakdown) |
| `TimelineGantt` | `src/components/trace/TimelineGantt.tsx` | Full-screen Gantt chart |
| `TraceInspectorDrawer` | `src/components/trace/TraceInspectorDrawer.tsx` | Right drawer: event details |
| `TraceEventBar` | `src/components/trace/TraceEventBar.tsx` | Single Gantt bar (color-coded) |
| `TraceEventCard` | `src/components/trace/TraceEventCard.tsx` | Single event in chat panel |

### 5.3 Component Architecture

```
TraceView
├── TraceHeader (breadcrumbs + stats strip + Expand button)
├── TabBar [Details | Tree | Analytics]
├── MainContent (split pane)
│   ├── Left: TraceChatPanel (virtualized list)
│   │   ├── TraceEventCard (User — gray bubble)
│   │   ├── TraceEventCard (Assistant — green bubble)
│   │   ├── TraceEventCard (ToolCall — yellow badge)
│   │   └── TraceEventCard (Error — red badge)
│   └── Right: TabContent
│       ├── Details Tab
│       │   ├── StatsCards (Duration/Cost/Tokens/Messages/Tools)
│       │   ├── TokenChart (recharts bar: Input/Output/Cache)
│       │   ├── CostChart (recharts bar)
│       │   └── ModelsUsed (list)
│       └── Analytics Tab
│           ├── ToolCallsChart (recharts bar)
│           ├── BashCommandsList
│           ├── FilesRead (clickable list)
│           ├── FilesEdited (clickable list)
│           └── FilesWritten (clickable list)
└── TimelineGantt (fullscreen overlay)
    ├── TimelineHeader (Events/Tools/Errors stats)
    ├── GanttViewport (scrollable, zoomable)
    │   └── TraceEventBar[] (color-coded horizontal bars)
    └── TraceInspectorDrawer (slide-in panel)
        ├── EventMeta (Time/Offset/Duration/ID)
        ├── TabBar [CONTENT | RESULT | USAGE | RAW JSON]
        └── TabContent
```

### 5.4 Color Mapping (Ariadne-style)

| Event Type | Color | Purpose |
|-----------|-------|---------|
| User prompt | Orange `#f97316` | High visibility |
| Assistant response | Green `#22c55e` | Primary flow |
| Tool call (bash) | Yellow `#eab308` | Action |
| Tool call (read) | Blue `#3b82f6` | Observation |
| Tool call (edit/write) | Purple `#a855f7` | Modification |
| Tool result (error) | Red `#ef4444` | Error highlighting |
| Model change | Gray `#6b7280` | System event |
| Thinking | Light gray `#d1d5db` | Background process |
| Compaction | Teal `#14b8a6` | Context management |

### 5.5 Timeline Gantt Implementation

Use a simple div-based approach (no heavy library):

```tsx
// TimelineGantt.tsx — simplified concept
function TimelineGantt({ events, onSelectEvent, selectedEvent }) {
  const totalDuration = events[events.length-1].offset_ms + events[events.length-1].duration_ms;
  const zoom = useZoom(); // default 1x, can zoom in/out

  return (
    <div className="relative overflow-x-auto">
      {/* Time axis */}
      <div className="flex border-b">
        {timeMarkers.map(t => <span>{formatTime(t)}</span>)}
      </div>
      {/* Event bars */}
      {events.map(evt => (
        <div
          key={evt.id}
          className="h-6 mb-1 cursor-pointer"
          style={{
            marginLeft: `${(evt.offset_ms / totalDuration) * 100}%`,
            width: `${(evt.duration_ms / totalDuration) * 100}%`,
            backgroundColor: getEventColor(evt),
          }}
          onClick={() => onSelectEvent(evt)}
        >
          {evt.tool && <span className="text-xs">{evt.tool}</span>}
        </div>
      ))}
      {/* Inspector drawer */}
      {selectedEvent && <TraceInspectorDrawer event={selectedEvent} />}
    </div>
  );
}
```

### 5.6 Route Integration

Add to existing session viewer via **view mode toggle**:

```
SessionViewer (current)
  └── Toggle: "Trace Mode" (button in toolbar)
       └── TraceView (new component)
            ├── Details Tab
            ├── Tree Tab (reuse existing SessionTree)
            └── Analytics Tab
                 └── "Open Timeline" button → full Gantt + Inspector
```

This keeps the existing SessionViewer intact and adds Trace as an alternate view.

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1)
| # | Task | Files | Est |
|---|------|-------|-----|
| 1.1 | Add Rust types + module structure | `domain/trace/{mod,types}.rs` | 2h |
| 1.2 | Implement `extract_trace_analytics()` | `domain/trace/extractor.rs` | 6h |
| 1.3 | Register Tauri command | `commands/trace.rs`, `dispatch.rs` | 1h |
| 1.4 | Add TS types | `src/types/trace.ts` | 1h |
| 1.5 | Create `useSessionTrace` hook | `src/hooks/useSessionTrace.ts` | 2h |
| 1.6 | Basic TraceView shell + toolbar toggle | `src/components/trace/TraceView.tsx` | 3h |

**Deliverable**: Click "Trace" button → see session stats cards + event list.

### Phase 2: Details & Analytics Panels (Week 2)
| # | Task | Files | Est |
|---|------|-------|-----|
| 2.1 | TraceDetailsPanel (stats cards + charts) | `src/components/trace/TraceDetailsPanel.tsx` | 4h |
| 2.2 | TraceAnalyticsPanel (tool breakdown + file lists) | `src/components/trace/TraceAnalyticsPanel.tsx` | 4h |
| 2.3 | TraceChatPanel (event list, color-coded) | `src/components/trace/TraceChatPanel.tsx` | 4h |
| 2.4 | i18n keys for trace UI | `src/i18n/locales/*.json` | 2h |

**Deliverable**: Full 3-tab Trace view with stats, charts, and event list.

### Phase 3: Timeline Gantt + Inspector (Week 3)
| # | Task | Files | Est |
|---|------|-------|-----|
| 3.1 | TimelineGantt component (basic Gantt) | `src/components/trace/TimelineGantt.tsx` | 6h |
| 3.2 | TraceInspectorDrawer (4-tab panel) | `src/components/trace/TraceInspectorDrawer.tsx` | 4h |
| 3.3 | Gantt zoom + scroll + click-to-inspect | TimelineGantt + Inspector | 4h |
| 3.4 | Error highlighting + filter | TraceChatPanel + TimelineGantt | 2h |

**Deliverable**: Full Ariadne-style Timeline with Inspector.

### Phase 4: Polish & Performance (Week 4)
| # | Task | Files | Est |
|---|------|-------|-----|
| 4.1 | Virtualize large event lists | TraceChatPanel | 3h |
| 4.2 | Optimize Rust extractor for large files | `extractor.rs` | 2h |
| 4.3 | Live mode support (real-time trace updates) | `useSessionTrace` | 3h |
| 4.4 | External agent support (Claude/OpenCode) | `extractor.rs` parser | 4h |
| 4.5 | Testing + bug fixes | All | 4h |

**Deliverable**: Production-ready Trace/Timeline/Inspector.

---

## 7. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large JSONL files (100K+ lines) | Slow parsing | Rust single-pass is fast; add chunked parsing if needed |
| JSONL without usage data | Missing cost/tokens | Graceful fallback: show "0" or "N/A" |
| Claude/OpenCode different format | Parser mismatch | SessionBridge already normalizes; use canonical format |
| Gantt performance with 1000+ events | Slow render | Virtualize bars; only render visible viewport |
| TypeScript type complexity | Maintenance burden | Keep types flat; use `any` for raw JSON passthrough |

---

## 8. File Changes Summary

### New Files (~12)
```
src-tauri/src/domain/trace/mod.rs
src-tauri/src/domain/trace/types.rs
src-tauri/src/domain/trace/extractor.rs
src-tauri/src/commands/trace.rs
src/types/trace.ts
src/hooks/useSessionTrace.ts
src/components/trace/TraceView.tsx
src/components/trace/TraceChatPanel.tsx
src/components/trace/TraceDetailsPanel.tsx
src/components/trace/TraceAnalyticsPanel.tsx
src/components/trace/TimelineGantt.tsx
src/components/trace/TraceInspectorDrawer.tsx
```

### Modified Files (~6)
```
src-tauri/src/domain/mod.rs          (add trace module)
src-tauri/src/dispatch.rs            (register command)
src/components/SessionViewer.tsx     (add Trace mode toggle)
src/components/session-viewer/SessionViewerToolbar.tsx  (Trace button)
src/i18n/locales/en-US.json          (trace keys)
src/i18n/locales/zh-CN.json          (trace keys)
```

**Total**: ~12 new files, ~6 modified files. Zero DB changes. Zero new storage files.

---

## 9. Success Criteria

1. **Trace view loads** for any existing Pi session within 2 seconds
2. **All 7 stats cards** display correctly (Sessions/Cost/Tokens/Avg/Projects/Tools/Disk)
3. **Timeline renders** 500+ events at 60fps
4. **Inspector drawer** shows CONTENT/RESULT/USAGE/RAW JSON for any clicked event
5. **Tool breakdown** matches actual tool call counts in JSONL
6. **Cost totals** match `cost.ts` script output for the same session
7. **i18n**: All trace labels available in zh-CN and en-US

---

## 10. Next Steps

1. ✅ Review this plan
2. 📋 Confirm scope (adjust phases if needed)
3. 🔨 Start Phase 1 (Rust types + extractor + command)
4. 🧪 Test with real session JSONL files
5. 🎨 Build frontend components

---

*"在细节中发现美，在数据中找到答案。" ♪*
