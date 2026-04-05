# Pi Live Refactoring Plan

> **Goal:** Add settings toggle for Pi Live (default: off), refactor architecture to make PSM Rust layer lightweight, frontend TS handles protocol understanding and business logic.

> **Architecture:** Pi (TS) → WS → PSM Rust (pass-through) → Frontend TS (business)

---

## Architecture Design

### Current Issues

| Issue | Location | Impact |
|-------|----------|--------|
| Rust layer protocol parsing too heavy | `ws_adapter.rs` (270+ lines) | Hard to maintain, type inconsistency |
| Duplicate type definitions | `pi_agent_registry.rs` / `pi_live.rs` / Frontend | Sync overhead |
| No feature toggle | App.tsx hardcodes `showPiLive` | User cannot control |
| Business logic misplaced | Rust handles state cache/event forwarding | Role confusion |

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend TS (Business Intelligence Layer)                         │
│  ├── src/types/pi-live.ts        # Unified type definitions       │
│  ├── src/hooks/usePiLive.ts      # Session state + event mgmt    │
│  ├── src/components/pi-live/     # UI components                 │
│  └── src/settings/sections/PiLiveSettings.tsx  # Settings UI    │
├─────────────────────────────────────────────────────────────────┤
│  PSM Rust (Lightweight Pass-through)                           │
│  ├── pi_agent_registry.rs        # Memory table + RPC queue     │
│  ├── ws_adapter.rs              # WS pass-through + routing     │
│  └── pi_live.rs                 # Command registry (no logic)    │
├─────────────────────────────────────────────────────────────────┤
│  pi-session-bridge.ts (Protocol Bridge, exists)               │
│  ├── Event conversion (Pi Event ↔ PSM Protocol)               │
│  └── Command conversion (PSM Command → Pi API Call)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Task Breakdown

### Phase 1: Frontend Types & Settings System

#### Task 1.1: Create Unified Type Definitions

**Files:**
- Create: `src/types/pi-live.ts`

```typescript
// Session info
export interface PiLiveSession {
  session_id: string
  session_path?: string
  pid?: number
  cwd?: string
  is_streaming: boolean
  entry_count: number
  last_seen: string
  model?: PiLiveModelInfo
  thinking_level?: string
  context_usage?: PiLiveContextUsage
  tags?: PiLiveTag[]
}

// Model info
export interface PiLiveModelInfo {
  provider: string
  id: string
  name?: string
}

// Context usage
export interface PiLiveContextUsage {
  used: number
  limit: number
  unit?: string
}

// Tags
export interface PiLiveTag {
  id: string
  name: string
  color: string
}

// Command types
export type PiLiveCommandType =
  | 'steer'
  | 'prompt'
  | 'set_model'
  | 'set_thinking'
  | 'abort'
  | 'get_state'

// Command arguments
export interface PiLiveCommand {
  type: PiLiveCommandType
  sessionId: string
  message?: string
  provider?: string
  modelId?: string
  level?: string
  deliverAs?: string
  streamingBehavior?: string
}

// Event types
export type PiLiveEventType =
  | 'pi-agent:register'
  | 'pi-agent:disconnect'
  | 'pi-agent:entry'
  | 'pi-agent:session_state'

// Connection state
export type PiLiveConnectionState = 'connected' | 'reconnecting' | 'disconnected'

// Settings type
export interface PiLiveSettings {
  enabled: boolean          // Feature toggle, default false
  showInSidebar: boolean   // Show in sidebar
  autoReconnect: boolean  // Auto reconnect
  maxEntries: number      // Max entry cache
  showModelInfo: boolean   // Show model info
  showThinkingLevel: boolean // Show thinking level
}
```

#### Task 1.2: Add Settings Type

**Files:**
- Modify: `src/components/settings/types.ts`

```typescript
// Add to AppSettings
export interface AppSettings {
  // ... existing fields
  piLive: PiLiveSettings  // New
}

// Default values
export const defaultSettings: AppSettings = {
  // ... existing
  piLive: {
    enabled: false,
    showInSidebar: true,
    autoReconnect: true,
    maxEntries: 200,
    showModelInfo: true,
    showThinkingLevel: true,
  }
}
```

#### Task 1.3: Create Settings UI

**Files:**
- Create: `src/components/settings/sections/PiLiveSettings.tsx`

```typescript
// ~80 lines, settings UI component
// Uses existing SettingsToggleRow, SettingsSliderField components
// Contains: toggle, max entries slider, display options
```

#### Task 1.4: Register Settings Entry

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`
- Add Pi Live settings card entry

---

### Phase 2: Frontend Hook Refactor

#### Task 2.1: Create Unified Hook

**Files:**
- Create: `src/hooks/usePiLive.ts`
- Deprecate: `src/hooks/usePiLiveSessions.ts` (merge)

```typescript
// Features:
1. Fetch session list from backend
2. Listen to WS events (pi-agent:register/disconnect/entry/session_state)
3. Manage connection state
4. Provide CRUD methods (refresh, disconnect, reconnect)
5. Read settings to decide if enabled
```

#### Task 2.2: Migrate Existing Components

**Files:**
- Modify: `src/hooks/usePiLiveSessions.ts` → Re-export `usePiLive`
- Modify: `src/components/PiLivePanel.tsx` → Use `usePiLive`
- Modify: `src/components/SessionViewer.tsx` → Use `usePiLive`
- Modify: `src/components/SessionViewerOnlineStatusBar.tsx` → Use `usePiLive`
- Modify: `src/components/session-viewer/SessionViewerModelControls.tsx` → Use `usePiLive`
- Modify: `src/App.tsx` → Use settings to control feature

---

### Phase 3: Frontend UI Component Refactor

#### Task 3.1: Reorganize Component Directory

**Files:**
- Create: `src/components/pi-live/index.ts`
- Move+rename: `src/components/PiLivePanel.tsx` → `src/components/pi-live/PiLivePanel.tsx`
- Move+rename: `src/components/ChatInput.tsx` → `src/components/pi-live/PiLiveChatInput.tsx`

#### Task 3.2: Enhance Session Card

**Files:**
- Create: `src/components/pi-live/PiLiveSessionCard.tsx`

```typescript
// Features:
1. Show session info (ID, PID, CWD)
2. Show stream status (Live indicator)
3. Show model info (optional)
4. Show thinking level (optional)
5. Show context usage (optional)
6. Action buttons (Steer, Abort)
```

#### Task 3.3: Enhance Status Bar

**Files:**
- Create: `src/components/pi-live/PiLiveStatusBar.tsx`

```typescript
// Features:
1. Connection status indicator (green/yellow/red)
2. Session count
3. Auto-refresh toggle
```

---

### Phase 4: PSM Rust Lightweighting

#### Task 4.1: Lightweight pi_agent_registry.rs

**Files:**
- Modify: `src-tauri/src/pi_agent_registry.rs`

```rust
// Remove responsibilities:
- Protocol parsing
- Event type handling
- Business state transitions

// Keep responsibilities:
- In-memory session table (HashMap<session_id, PiLiveSession>)
- RPC response channel registration
- Response forwarding (forward_response)
- Basic CRUD (register, remove, list, get_live_session)
```

**Types migrated to frontend:**
- `PiLiveSession` struct → `src/types/pi-live.ts`
- `PiAgentConnection` → Internal private

#### Task 4.2: Lightweight ws_adapter.rs

**Files:**
- Modify: `src-tauri/src/ws_adapter.rs`

```rust
// Remove:
- pi-agent:register message parsing (extract to frontend)
- pi-agent:entry message parsing (entry_count updates extracted)
- session_state message parsing
- Hardcoded event type handling

// Keep:
- WebSocket connection management
- Message pass-through (raw passthrough)
- Event broadcast to frontend
- Heartbeat (ping/pong)
```

**New flow:**
```
WS message → Check type field →
  If type starts with "pi-agent:" → Forward directly to frontend
  If type is "response" → Forward to pi_agent_registry
  Other → Original logic
```

#### Task 4.3: Lightweight pi_live.rs

**Files:**
- Modify: `src-tauri/src/commands/pi_live.rs`

```rust
// Remove:
- Complex command building logic

// Keep:
- Command function signatures
- Simple state read/write
```

---

### Phase 5: Backend Command Unification

#### Task 5.1: Unify Command Paths

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/dispatch.rs`

```rust
// Command unified prefix: pi_live_*
// pi_agent_steering → pi_live_steer
// pi_agent_send_message → pi_live_send_message
// pi_agent_set_model → pi_live_set_model
// pi_agent_set_thinking → pi_live_set_thinking
// pi_agent_abort → pi_live_abort
// pi_agent_get_state → pi_live_get_state
```

#### Task 5.2: Update Frontend Command Calls

**Files:**
- Modify: `src/transport.ts` or command call sites
- Update all `pi_agent_*` calls to `pi_live_*`

---

### Phase 6: Event System Optimization

#### Task 6.1: Unify Event Prefixes

**Event prefix:** `pi-live:*`

```typescript
// Existing → New
'pi-agent:register'    → 'pi-live:session_registered'
'pi-agent:disconnect'  → 'pi-live:session_disconnected'
'pi-agent:entry'       → 'pi-live:entry_received'
'pi-agent:session_state' → 'pi-live:state_updated'
```

#### Task 6.2: Update Event Listeners

**Files:**
- Modify: `src/hooks/usePiLive.ts`
- Modify: `pi-session-bridge.ts` (extension, sends events)

---

### Phase 7: Testing & Documentation

#### Task 7.1: Add Integration Tests

**Files:**
- Create: `src-tauri/tests/pi_live_test.rs`

```rust
// Tests:
1. get_pi_live_sessions returns empty list
2. Registered session appears in list
3. Disconnected session removed from list
4. RPC command sent successfully
```

#### Task 7.2: Update Documentation

**Files:**
- Modify: `docs/PI_LIVE_ARCHITECTURE.md` (create new)
- Modify: `README.md` (add feature description)

---

## File Change Summary

### New Files
- `src/types/pi-live.ts`
- `src/components/settings/sections/PiLiveSettings.tsx`
- `src/components/pi-live/index.ts`
- `src/components/pi-live/PiLivePanel.tsx`
- `src/components/pi-live/PiLiveSessionCard.tsx`
- `src/components/pi-live/PiLiveChatInput.tsx`
- `src/components/pi-live/PiLiveStatusBar.tsx`
- `src-tauri/tests/pi_live_test.rs`
- `docs/PI_LIVE_ARCHITECTURE.md`

### Modified Files
- `src/components/settings/types.ts`
- `src/components/settings/SettingsPanel.tsx`
- `src/hooks/usePiLiveSessions.ts` → Re-export
- `src/hooks/usePiLive.ts` → New main hook
- `src/components/SessionViewer.tsx`
- `src/components/app/AppDesktopSidebar.tsx`
- `src/components/session-viewer/SessionViewerOnlineStatusBar.tsx`
- `src/components/session-viewer/SessionViewerModelControls.tsx`
- `src/App.tsx`
- `src-tauri/src/pi_agent_registry.rs`
- `src-tauri/src/ws_adapter.rs`
- `src-tauri/src/commands/pi_live.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/dispatch.rs`

### Deleted Files
- `src/components/PiLivePanel.tsx` (moved to pi-live/)
- `src/components/ChatInput.tsx` (moved to pi-live/)

---

## Implementation Order

```
Phase 1 (Frontend Types & Settings)
  └─ Task 1.1 → 1.2 → 1.3 → 1.4

Phase 2 (Frontend Hook Refactor)
  └─ Task 2.1 → 2.2

Phase 3 (Frontend UI Refactor)
  └─ Task 3.1 → 3.2 → 3.3

Phase 4 (Rust Lightweighting) [Can parallel with Phase 2-3]
  └─ Task 4.1 → 4.2 → 4.3

Phase 5 (Command Unification)
  └─ Task 5.1 → 5.2

Phase 6 (Event System)
  └─ Task 6.1 → 6.2

Phase 7 (Testing & Documentation)
  └─ Task 7.1 → 7.2
```

---

## Key Design Decisions

### 1. Why not delete pi_session_bridge.ts?
- It handles Pi (TS) ↔ PSM (Rust) protocol conversion
- Modifying it would add complexity
- Current task is to lightweight PSM Rust, not modify protocol

### 2. Why change event prefix to pi-live:*?
- Avoid confusion with Pi internal events
- Clarify this is PSM frontend's responsibility

### 3. Why deprecate usePiLiveSessions and create usePiLive?
- New hook contains complete features (state management + event listening + settings reading)
- Single responsibility principle
- Easier to test and maintain

### 4. Why keep memory table in Rust layer?
- Frontend needs fast session list queries
- Avoid fetching via WS every time
- But state cache moves to frontend

---

## Verification Criteria

1. Settings UI can toggle Pi Live feature
2. Sidebar hides Pi Live entry when disabled
3. Can connect to Pi sessions when enabled
4. Model/thinking level display correctly
5. Steering messages sent successfully
6. Rust code line count reduced by ≥ 30%
7. Frontend types unified, no duplicates
8. Existing features unaffected
