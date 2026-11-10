# PSM Mesh Plugin Integration Design

> Date: 2026-11-01  
> Status: Superseded / historical draft (2026-11-02)  
> Target: Convert the pi-mesh reference WebUI into a native PSM built-in plugin without duplicating PSM capabilities.

## Current decision — 2026-11-02

The current plan is [Pi Mesh PSM plugin v1.3](architecture/pi-mesh-psm-plugin.md). The user explicitly requires all Mesh plugin online messages, steer, follow-up and stop operations to use the existing Mesh Hub and Mesh extension. Pi Live / pi-session-bridge must not execute these operations or serve as fallback.

| Action | Existing Mesh operation |
| --- | --- |
| Online message | send_message with the selected delivery mode (default followUp) |
| Steer | send_message, mode=steer |
| Follow-up | send_message, mode=followUp |
| Stop | cancel; target Mesh extension calls ctx.abort() |

PSM contributes the native viewer, shared input UI/controller, review, search and terminal surfaces. Reusing PiLiveChatInput requires a fixed Mesh execution binding in Mesh mode. No bridge installation or Pi Live setting is required; unavailable Mesh control remains unavailable and preserves drafts.

The following original draft is retained only as historical evidence. Its Pi Live RPC routing, bridge prerequisites and “no Hub integration” recommendations are superseded. Other differences, including Favorites versus directed Mesh follow, are resolved by the canonical plan. The code has not been switched by this documentation edit.

## Historical draft — not current implementation requirements

## 1. Objective

Deliver a native PSM plugin named **PSM Mesh** that brings the useful peer-discovery and activity overview from pi-mesh into PSM.

PSM remains the only host, source of truth, runtime, session viewer, message transport, review surface, and terminal owner. The plugin is an integration/presentation layer, not a second session-management system.

### Success criteria

- Discover online Pi sessions already registered in PSM's Pi Live registry.
- Browse historical Pi sessions already indexed by PSM.
- Selecting a peer selects its PSM session and reuses the native Session Viewer.
- Native Pi Live ChatInput continues to own prompt/steer/follow-up/abort behavior.
- Native psm-code-review continues to own review/diff behavior.
- Native TerminalPanel continues to own PTY lifecycle and rendering.
- Show useful recent Pi Live activity and allow local session favorites.
- Use PSM's plugin permissions, plugin SDK, AppView/AppSidebarView, and EventBus.
- Do not add a Hub daemon, peer registry, REST/SSE server, socket protocol, second transcript store, chat implementation, review implementation, or PTY implementation.

## 2. Source Context

### 2.1 pi-mesh reference

The reference project is located at `~/.pi/agent/extensions/pi-mesh`. Its WebUI productization work includes a peer workbench, online/idle/offline states, search/grouping, follow graph, activity, session history, changes/review, message composer, terminal, and resume actions.

The pi-mesh Hub owns peer heartbeats, persisted peer records, directed follow edges, message routing, notifications, transcript/review endpoints, and a web terminal. Those are implementation details of the standalone Pi extension and are not to be copied wholesale into PSM.

The pi-mesh directory is nested under the Pi Agent parent repository and is currently untracked there; it is treated as a read-only reference during this integration.

### 2.2 PSM host capabilities

PSM already provides:

- `extensions/pi-session-bridge`: Pi extension that registers live sessions, forwards Pi events, and serves PSM-to-Pi RPC for prompt, steer, follow-up, abort, model and state operations.
- Rust `PiAgentRegistry`: the existing online-agent registry and RPC connection owner.
- `usePiLive` / `usePiLiveSessions`: host live-session state and event integration.
- `PiLiveChatInput`: native session-viewer prompt, steer, follow-up, abort, slash-command and input-history UI.
- Session Viewer: native transcript, live updates, search, tool rendering, and session actions.
- `psm-code-review`: existing review/diff UI.
- TerminalPanel / terminal scopes: host-managed PTY lifecycle and xterm rendering.
- `ctx.psm.sessions`, `ctx.psm.favorites`, `ctx.events`, plugin config/records, and AppView/AppSidebarView contributions.

The existing `extensions/pi-session-bridge` has local uncommitted changes. It must not be reset or modified as part of this task.

## 3. Reuse Matrix

| pi-mesh feature | PSM source of truth / host surface | PSM Mesh responsibility |
|---|---|---|
| Peer list and online state | PiAgentRegistry + Pi Session Bridge | Render a lightweight peer list |
| Live/idle state | Pi Live event stream and registry | Render status; refresh on existing events |
| Historical sessions | PSM indexed SessionInfo list | Filter Pi sessions and join by session path/UUID |
| Session transcript | PSM Session Viewer | Select the session; do not render JSONL again |
| Prompt/steer/follow-up/abort | PiLiveChatInput + Pi Live RPC | No new composer or RPC client |
| Changes/review/diff | psm-code-review | Select session; reuse existing review action |
| Terminal | PSM TerminalPanel and terminal scopes | Request host terminal open at peer cwd |
| Resume/new session | AppPluginSurfaceData callbacks | Reuse `onResumeSession` / `onNewSession` |
| Follow | PSM Favorites | Map to user-level session favorite; do not fake peer-to-peer edges |
| Recent activity | Existing PSM plugin EventBus events | Present a compact event feed |
| Hub, heartbeat, REST/SSE, sockets | Not needed in PSM | Do not port |
| Git branch / peer file index | Not currently exposed as a stable PSM plugin contract | Omit until a real PSM API exists |

## 4. Target Architecture

```
PSM Core (Rust / SQLite / PiAgentRegistry / terminal manager)
  ├─ Pi Session Bridge (existing Pi-side extension)
  ├─ Session Viewer + PiLiveChatInput (existing)
  ├─ psm-code-review (existing)
  ├─ TerminalPanel / PTY (existing)
  └─ Plugin SDK (two narrow additions)
       ├─ ctx.psm.liveAgents.list()     -> lightweight live-agent summaries
       └─ ctx.psm.terminal.open(...)    -> host-owned terminal-open request
             |
             v
extensions/psm-mesh
  ├─ AppView(mainContent: "keep")
  ├─ AppSidebarView (desktop peer list)
  ├─ AppView renderer (mobile peer list)
  ├─ PSM Favorites integration
  └─ ctx.events subscriptions (activity / live-state refresh)
```

### Desktop interaction

- The plugin AppView uses `mainContent: "keep"`.
- Its AppSidebarView replaces the session-list sidebar while Mesh is active.
- Clicking a peer calls the existing AppPluginSurfaceData `onSelectSession`.
- The main pane remains the PSM Session Viewer, which already displays PiLiveChatInput for live sessions.
- Existing psm-code-review toolbar actions remain available.
- The peer terminal action calls `ctx.psm.terminal.open`, which asks the app shell to open the existing TerminalPanel.

### Mobile interaction

- PSM's AppView renderer displays the peer list as a full-screen app tab.
- Selecting a persisted session uses the existing host selection callback; the native session viewer opens as the mobile session layer.
- Terminal action is hidden when the host reports that its terminal surface is unavailable on mobile.

## 5. Minimal SDK / Host Enhancements

### 5.1 Read-only live-agent summary

Add `ctx.psm.liveAgents.list(): Promise<PsmLiveAgentSessionSummary[]>`.

- New plugin permission: `live-agents:read`.
- New dispatch command: `plugin_live_agents_list`.
- Implement as a projection of the existing PiAgentRegistry; never create another registry.
- Exclude full transcript/entry arrays from the plugin response.
- Include only sessionId, sessionPath, pid, cwd, streaming state, entry count, model, available models, thinking level, context usage, queue summary, tags, and last-seen metadata.
- Existing `ctx.events.subscribe` with `events:read` is used for Pi Live events; no new event transport.

### 5.2 Host-owned terminal open

Add `ctx.psm.terminal.open({ cwd, label? }): Promise<void>`.

- New plugin permission: `terminal:open`, opt-in because it opens a local shell.
- New dispatch command: `plugin_terminal_open`.
- The command validates an absolute existing directory and emits a narrow host event.
- App.tsx listens and opens a new/reused terminal scope in the existing TerminalPanel.
- No raw PTY create/write/resize/close API is exposed to the plugin.
- The plugin hides the action when `AppPluginSurfaceData.terminalAvailable` is false.

### 5.3 No live-agent control API

Do not add plugin `send`, `steer`, `followUp`, or `abort` methods in this iteration. The native Session Viewer already owns these actions through PiLiveChatInput and PSM's existing RPC path. This avoids duplicating privileged control APIs and preserves existing message semantics.

## 6. Data and State Semantics

- Join live agents to indexed sessions by exact `sessionPath`, then by normalized Pi session UUID.
- Do not match different sessions by cwd alone.
- Live registry entry + `isStreaming=true` => Running.
- Live registry entry + `isStreaming=false` => Idle.
- Persisted Pi session absent from live registry => Offline.
- PSM does not currently expose a reliable Closed-vs-Offline distinction; do not invent one.
- Live sessions without a matching persisted SessionInfo are shown as ephemeral and have no transcript action.
- Preserve PSM's session ordering; do not reorder peers on heartbeat/lastSeen updates.
- Filter historical rows to PSM's Pi source (`getSessionSourceSlug(path) === "pi"`).

## 7. Follow and Activity Adaptation

### Follow

pi-mesh stores directed peer-to-peer follow edges on each agent. PSM's UI is a human operator surface and has no equivalent agent identity. PSM Mesh therefore maps Follow to the existing PSM user-level session Favorites API.

- UI may label this as Follow/关注 for familiarity.
- Persistence is owned by PSM Favorites, not a plugin-local duplicate store.
- No follower count or cross-agent directed-edge claim is shown.
- A favorite session can be included in a dedicated filter.

### Activity

Subscribe to existing PSM runtime events such as:

- `pi-live:session_registered`
- `pi-live:session_disconnected`
- `pi-live:state_updated`
- `agent_start` / `agent_end`
- `queue_update`
- `tool_execution_end`

Render a compact recent-activity list with session identity, event kind, and timestamp. Clicking an activity item selects its PSM session when available. The PSM Session Viewer and Code Review remain the detailed source for transcript and file changes.

## 8. Permissions

| Permission | Use | Default |
|---|---|---|
| `live-agents:read` | Read lightweight online-agent summaries | Normal read permission |
| `events:read` | Subscribe to existing Pi Live events | Normal event permission |
| `terminal:open` | Ask PSM to open its host-managed terminal | Explicit opt-in |

The plugin does not need `live-agents:control`, raw filesystem access, terminal write access, or its own socket/network permission.

## 9. Non-Goals

- Do not modify the pi-mesh reference project.
- Do not port pi-mesh's Hub, registry JSON, heartbeat, REST/SSE, Unix socket, or WTerm terminal.
- Do not create a second session list, transcript viewer, message composer, RPC transport, review engine, or PTY.
- Do not add herdr-specific focus/resume/new-session behavior; use PSM's native resume/new-session actions.
- Do not invent Git branch, file index, Closed state, or peer follower counts when PSM does not expose those contracts.
- Do not modify pre-existing uncommitted files in PSM or the Pi Agent parent repository.

## 10. Acceptance / Verification

1. PSM plugin loads through the existing built-in extension discovery.
2. Desktop Mesh AppView displays live Pi peers and historical Pi sessions.
3. Live state updates on existing Pi Live events without polling the Hub.
4. Selecting a persisted peer opens the native Session Viewer and native PiLiveChatInput.
5. Existing Code Review remains available and no duplicate review UI is introduced.
6. Terminal open uses the host TerminalPanel and requires explicit `terminal:open` permission.
7. Follow uses PSM Favorites and survives app/plugin reload.
8. Activity items resolve to PSM sessions where possible.
9. Mobile AppView renders a usable peer list and hides unsupported terminal actions.
10. SDK tests, Rust permission/registry tests, extension typecheck, root build, and focused integration tests pass.
11. Existing unrelated worktree changes remain untouched.
