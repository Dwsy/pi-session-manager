# Task for crew-worker

# Task Assignment

**Task ID:** task-3
**Task Title:** Integrate SessionViewer into Preview Modal
**PRD:** Implement Kanban Session Preview Modal with Full-Screen E...
**Attempt:** 2 (retry after previous attempt)

## Your Mission

Implement this task following the crew-worker protocol:
1. Join the mesh
2. Read task spec to understand requirements
3. Start task and reserve files
4. Implement the feature
5. Commit your changes
6. Release reservations and mark complete

## Progress from Prior Attempts

[2026-02-24T10:56:10.079Z] (system) Assigned to crew-worker (attempt 1)
[2026-02-24T10:56:10.588Z] (system) Assigned to worker SwiftXenon (attempt 1)
[2026-02-24T11:04:58.530Z] (system) Lobby worker SwiftXenon exited (code unknown), reset to todo

## Dependency Status

Your task has dependencies on other tasks. Some may not be complete yet — this is expected. Use the coordination system to work through it.

- ○ task-2 (Add Preview State Management to KanbanBoard) — not yet started

**Working with pending dependencies:**
- Check if the dependency's output files exist. If yes, import and use them.
- If not, define what you need locally based on your task spec. Your spec describes the interfaces.
- DM in-progress workers for API details they're building.
- Reserve your files before editing to prevent conflicts.
- Do NOT block yourself because a dependency isn't done. Work around it.
- Log any local definitions in your progress for later reconciliation.

## Concurrent Tasks

These tasks are being worked on by other workers in this wave. Discover their agent names after joining the mesh via `pi_messenger({ action: "list" })`.

- task-1: Create SessionPreviewModal Component Skeleton
- task-2: Add Preview State Management to KanbanBoard
- task-4: Implement Open Animation (Card → Modal)
- task-5: Implement Close Animation (Modal → Card)
- task-6: Add Expand-to-Full Animation
- task-7: Polish and Edge Case Handling

## Recent Activity

18:56 IronJaguar reserved src/components/kanban/KanbanBoard.tsx — task-4: Implement FLIP-style open animation
18:56 UltraGrove reserved src/components/kanban/SessionPreviewModal.tsx — task-5: Implement Close Animation (Modal → Card)
18:56 UltraGrove reserved src/components/kanban/KanbanBoard.tsx — task-5: Implement Close Animation (Modal → Card)
19:04 NiceArrow released src/components/kanban/SessionPreviewModal.tsx
19:04 SwiftXenon reset task-3 — worker exited
19:04 BrightViper reset task-7 — worker exited
19:04 SageViper reset task-2 — worker exited
19:04 PureBear reset task-1 — worker exited

## Task Specification

# Integrate SessionViewer into Preview Modal

Modify SessionPreviewModal to reuse SessionViewer component:
- Import SessionViewer from '../SessionViewer'
- Render SessionViewer in modal content area
- Handle required props: onExport, onRename, onBack, terminal, piPath, customCommand
- Adjust styling: h-[calc(90vh-4rem)] for content area to fit within modal
- Ensure SessionViewer works in constrained modal space

Acceptance Criteria:
- SessionViewer renders correctly inside modal
- Session content loads and displays
- Scroll works within modal
- No duplicate code between modal and full view

Files: src/components/kanban/SessionPreviewModal.tsx


## Plan Context

Now I have a comprehensive understanding of the codebase. Let me create the task breakdown.

---

## 1. PRD Understanding Summary

**Feature**: Kanban Session Preview Modal with Full-Screen Expand

**Core Requirements:**
- Click Kanban card → Open preview modal (90vw × 90vh) instead of direct navigation
- Modal contains "Expand" button → Navigate to full SessionViewer
- ESC / Click overlay → Close preview modal
- Smooth animations: card position → modal center (300ms, ease-out), modal → full page transition

**Key Technical Constraints:**
- Reuse existing `SessionViewer` component for preview content
- No framer-motion available — use CSS transitions with Tailwind
- Follow existing dialog pattern (fixed overlay with backdrop-blur)
- Support both desktop and web desktop (Tauri/non-Tauri)

**Integration Points:**
- Modify `KanbanBoard` to intercept card clicks (currently calls `onSelectSession` directly)
- Create `SessionPreviewModal` component
- Add state management for preview mode vs full-screen mode

---

## 2. Relevant Code/Docs/Resources Reviewed

| Resource | Purpose |
|----------|---------|
| `docs/KANBAN_UX_ANALYSIS.md` | Kanban UX context and BBD tests |
| `src/components/kanban/KanbanBoard.tsx` | Main Kanban container, handles `onSelectSession` |
| `src/components/kanban/KanbanCard.tsx` | Individual card component, draggable |
| `src/components/kanban/KanbanColumn.tsx` | Column container, renders cards |
| `src/components/SessionViewer.tsx` | Full session view component (to reuse) |
| `src/components/ExportDialog.tsx` | Dialog pattern reference |
| `src/components/SystemPromptDialog.tsx` | Modal overlay implementation pattern |
| `src/App.tsx` | Session selection flow, state management |
| `src/index.css` | CSS transitions: `cubic-bezier(0.4, 0, 0.2, 1)` |
| `src/types.ts` | `SessionInfo` interface |

**Key Findings:**
- Current flow: `KanbanCard.onClick` → `KanbanBoard.onSelectSession` → `App.handleSelectSession` → `setSelectedSession` → renders `SessionVi

[Spec truncated - read full spec from .pi/messenger/crew/plan.md]
## Coordination

**Message budget: 10 messages this session.** The system enforces this — sends are rejected after the limit.

**Broadcasts go to the team feed — only the user sees them live.** Other workers see your broadcasts in their initial context only. Use DMs for time-sensitive peer coordination.

### Announce yourself
After joining the mesh and starting your task, announce what you're working on:

```typescript
pi_messenger({ action: "broadcast", message: "Starting <task-id> (<title>) — will create <files>" })
```

### Coordinate with peers
If a concurrent task involves files or interfaces related to yours, send a brief DM. Only message when there's a concrete coordination need — shared files, interfaces, or blocking questions.

```typescript
pi_messenger({ action: "send", to: "<peer-name>", message: "I'm exporting FormatOptions from types.ts — will you need it?" })
```

### Responding to messages
If a peer asks you a direct question, reply briefly. Ignore messages that don't require a response. Do NOT start casual conversations.

### On completion
Announce what you built:

```typescript
pi_messenger({ action: "broadcast", message: "Completed <task-id>: <file> exports <symbols>" })
```

### Reservations
Before editing files, check if another worker has reserved them via `pi_messenger({ action: "list" })`. If a file you need is reserved, message the owner to coordinate. Do NOT edit reserved files without coordinating first.

### Questions about dependencies
If your task depends on a completed task and something about its implementation is unclear, read the code and the task's progress log at `.pi/messenger/crew/tasks/<task-id>.progress.md`. Dependency authors are from previous waves and are no longer in the mesh.

### Claim next task
After completing your assigned task, check if there are ready tasks you can pick up:

```typescript
pi_messenger({ action: "task.ready" })
```

If a task is ready, claim and implement it. If `task.start` fails (another worker claimed it first), check for other ready tasks. Only claim if your current task completed cleanly and quickly.

