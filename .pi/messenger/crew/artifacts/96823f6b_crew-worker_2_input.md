# Task for crew-worker

# Task Assignment

**Task ID:** task-5
**Task Title:** Implement Close Animation (Modal → Card)
**PRD:** Implement Kanban Session Preview Modal with Full-Screen E...


## Your Mission

Implement this task following the crew-worker protocol:
1. Join the mesh
2. Read task spec to understand requirements
3. Start task and reserve files
4. Implement the feature
5. Commit your changes
6. Release reservations and mark complete

## Dependency Status

Your task has dependencies on other tasks. Some may not be complete yet — this is expected. Use the coordination system to work through it.

- ○ task-4 (Implement Open Animation (Card → Modal)) — not yet started

**Working with pending dependencies:**
- Check if the dependency's output files exist. If yes, import and use them.
- If not, define what you need locally based on your task spec. Your spec describes the interfaces.
- Reserve your files before editing to prevent conflicts.
- Do NOT block yourself because a dependency isn't done. Work around it.
- Log any local definitions in your progress for later reconciliation.

## Task Specification

# Implement Close Animation (Modal → Card)

Add reverse animation for closing modal:
- Store original card position in SessionPreviewModal state
- On close, apply transform to move modal back toward card position
- Scale down to 0.95 and fade out opacity to 0
- Wait for animation (300ms) before calling onClose
- Handle edge case: if card no longer visible (scrolled), fade out in place
- Use setTimeout or onTransitionEnd to clear state after animation

Acceptance Criteria:
- Modal shrinks back toward original card position
- If card not visible, fade out in place
- Animation completes cleanly before unmounting
- No visual glitches during rapid open/close

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
