# Task for crew-worker

# Task Assignment

**Task ID:** task-7
**Task Title:** Polish and Edge Case Handling
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

[2026-02-24T10:56:10.080Z] (system) Assigned to crew-worker (attempt 1)
[2026-02-24T10:56:21.656Z] (system) Assigned to worker BrightViper (attempt 1)
[2026-02-24T11:04:58.532Z] (system) Lobby worker BrightViper exited (code unknown), reset to todo
[2026-02-24T11:05:28.175Z] (system) Assigned to crew-worker (attempt 2)

## Dependency Status

Your task has dependencies on other tasks. Some may not be complete yet — this is expected. Use the coordination system to work through it.

- ⟳ task-5 (Implement Close Animation (Modal → Card)) — in progress, worker: IronOwl
- ⟳ task-6 (Add Expand-to-Full Animation) — in progress, worker: TrueKnight

**Working with pending dependencies:**
- Check if the dependency's output files exist. If yes, import and use them.
- If not, define what you need locally based on your task spec. Your spec describes the interfaces.
- DM in-progress workers for API details they're building.
- Reserve your files before editing to prevent conflicts.
- Do NOT block yourself because a dependency isn't done. Work around it.
- Log any local definitions in your progress for later reconciliation.

## Recent Activity

19:11 GoldArrow → IronOwl: One more thing - please add `initialCardRect={initialCardRect}` prop to SessionPreviewModal in KanbanBoard when you make your changes. The modal needs it for the FLIP animation.

Current:
```tsx
<S...
19:11 GoldArrow → IronOwl: My task (task-4) is essentially complete with the SessionPreviewModal FLIP animation implementation. I'm relying on you to:
1. Update handleCardClick in KanbanBoard to measure card rect
2. Pass ini...
19:11 GoldTiger completed task-4 — Implemented FLIP-style open animation for Kanban card to modal transition. Modified KanbanCard to capture DOMRect on click, updated KanbanColumn to pass it through, and KanbanBoard to set initialCardRect state. SessionPreviewModal already had the animation implementation using initialCardRect prop. Added data-session-id attribute for close animation support.
19:11 TrueKnight started task-6 — Add Expand-to-Full Animation
19:11 GoldTiger ✦ ✅ Completed task-4: FLIP open animation (Card → Modal). Changes: KanbanCard captures DOMRect on click, passes to KanbanBoard → sets initialCardRect → SessionPreviewModal animates. Also added data-s...
19:12 TrueKnight reserved src/components/kanban/SessionPreviewModal.tsx — task-6: Implement expand-to-full animation
19:12 TrueKnight reserved src/components/kanban/KanbanBoard.tsx — task-6: Implement expand-to-full animation
19:12 TrueKnight reserved src/index.css — task-6: Implement expand-to-full animation

## Task Specification

# Polish and Edge Case Handling

Final refinements and testing:
- Add isAnimating state to prevent rapid click spam
- Handle case where card scrolled out of view (fallback animation)
- Mobile: ensure 90vw/90vh works on small screens, add touch handling
- Accessibility: focus trap within modal, aria-label, role='dialog'
- Keyboard: Tab navigation, Shift+Tab, Escape handled
- Test with different session content lengths (short/long)

Acceptance Criteria:
- No console errors during any interaction
- Works correctly on mobile viewport
- Rapid clicks don't break animation state
- Accessibility: focus management, ARIA labels
- All PRD acceptance criteria met

Files: src/components/kanban/SessionPreviewModal.tsx, src/components/kanban/KanbanBoard.tsx


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

