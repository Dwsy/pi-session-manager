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
- Current flow: `KanbanCard.onClick` → `KanbanBoard.onSelectSession` → `App.handleSelectSession` → `setSelectedSession` → renders `SessionViewer`
- Dialogs use `fixed inset-0 bg-black/50 backdrop-blur-sm` overlay pattern
- Tailwind transitions use custom easing matching the spec
- No animation library — pure CSS/Tailwind approach needed

---

## 3. Sequential Implementation Steps

1. **Create SessionPreviewModal Component**
   - Build `src/components/kanban/SessionPreviewModal.tsx`
   - Accept `session`, `isOpen`, `onClose`, `onExpand` props
   - Render 90vw×90vh modal with overlay
   - Integrate `SessionViewer` for content display
   - Add Expand button in header
   - Handle ESC key and overlay click

2. **Add Preview State to KanbanBoard**
   - Add `previewSession` state to `KanbanBoard`
   - Create `handleCardClick` that opens preview instead of calling `onSelectSession`
   - Pass `onExpand` callback that calls `onSelectSession` to go full-screen
   - Render `SessionPreviewModal` when `previewSession` is set

3. **Implement Card-to-Modal Animation**
   - Measure card position on click using `getBoundingClientRect`
   - Calculate transform from card position to modal center
   - Apply CSS transition with scale and opacity animation
   - Use `transform-origin` matching card position for natural feel

4. **Implement Modal Close Animation**
   - Store original card position for return animation
   - Apply reverse transform when closing
   - Wait for animation to complete before clearing `previewSession`

5. **Wire Up Full-Screen Expand**
   - Expand button triggers `onExpand` → `setSelectedSession`
   - Modal closes, App renders `SessionViewer`
   - Optional: Add transition animation for modal→full-screen

6. **Polish and Edge Cases**
   - Handle rapid open/close (animation interruption)
   - Handle card no longer visible (scrolled out) during close
   - Mobile responsive behavior
   - Web desktop (non-Tauri) compatibility

---

## 4. Parallelized Task Graph

### Task Breakdown

### Task 1: Create SessionPreviewModal Component Skeleton

Create `src/components/kanban/SessionPreviewModal.tsx` with basic structure:
- Modal container (90vw × 90vh, centered)
- Overlay (rgba(0,0,0,0.6), click to close)
- Header with session name and Expand button
- Content area (placeholder for SessionViewer)
- ESC key handler
- TypeScript interfaces for props

**Acceptance Criteria:**
- Component renders without errors
- Modal opens/closes with isOpen prop
- Overlay click closes modal
- ESC key closes modal
- Expand button calls onExpand callback

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx` (new)

**Dependencies:** None

---

### Task 2: Add Preview State Management to KanbanBoard

Modify `KanbanBoard.tsx` to support preview mode:
- Add `previewSession: SessionInfo | null` state
- Create `handleCardClick` that sets preview state instead of calling `onSelectSession`
- Create `handleExpandToFull` that calls `onSelectSession` and clears preview
- Render `SessionPreviewModal` when previewSession exists
- Pass required props to modal

**Acceptance Criteria:**
- Clicking Kanban card opens preview modal (not full SessionViewer)
- Modal shows session name in header
- Expand button navigates to full SessionViewer
- Close button returns to Kanban

**Files to Create/Modify:**
- `src/components/kanban/KanbanBoard.tsx`

**Dependencies:** Task 1

---

### Task 3: Integrate SessionViewer into Preview Modal

Modify `SessionPreviewModal` to reuse `SessionViewer`:
- Import and render `SessionViewer` in modal content area
- Handle props passing (onExport, onRename, etc.)
- Adjust styling to fit in modal container (90vh height)
- Ensure SessionViewer works in constrained space

**Acceptance Criteria:**
- SessionViewer renders correctly inside modal
- Session content loads and displays
- Scroll works within modal
- No duplicate code between modal and full view

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx`

**Dependencies:** Task 1, Task 2

---

### Task 4: Implement Open Animation (Card → Modal)

Add FLIP-style animation for opening:
- Measure card position using `getBoundingClientRect` on click
- Calculate center position for modal
- Apply initial transform matching card position
- Animate to modal position with scale + opacity
- Use `cubic-bezier(0.4, 0, 0.2, 1)` easing, 300ms duration

**Acceptance Criteria:**
- Card appears to "grow" into modal position
- Animation is smooth at 60fps
- Modal overlay fades in simultaneously
- Animation completes before content fully loads

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx`
- `src/components/kanban/KanbanBoard.tsx`

**Dependencies:** Task 2

---

### Task 5: Implement Close Animation (Modal → Card)

Add reverse animation for closing:
- Store original card position in state
- Apply transform to move modal back toward card position
- Scale down and fade out
- Clear `previewSession` after animation completes
- Handle case where card is no longer visible (fallback to fade out)

**Acceptance Criteria:**
- Modal shrinks back toward original card position
- If card not visible, fade out in place
- Animation completes cleanly before unmounting
- No visual glitches during rapid open/close

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx`
- `src/components/kanban/KanbanBoard.tsx`

**Dependencies:** Task 4

---

### Task 6: Add Expand-to-Full Animation

Implement modal → full-screen transition:
- Add shared element transition for header
- Animate modal dimensions to full viewport
- Fade overlay to 0 opacity
- Ensure SessionViewer layout adjusts smoothly
- Support reduced motion preference

**Acceptance Criteria:**
- Clicking Expand smoothly transitions to full SessionViewer
- No jarring layout jumps
- Works on both desktop and web desktop
- Respects prefers-reduced-motion

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx`
- `src/components/kanban/KanbanBoard.tsx`

**Dependencies:** Task 3, Task 4

---

### Task 7: Polish and Edge Case Handling

Final refinements:
- Handle rapid click spam (debounce or animation lock)
- Handle card scrolled out of view during preview
- Mobile layout adjustments
- Focus trap within modal for accessibility
- Keyboard navigation (Tab, Shift+Tab)
- Test with different session content lengths

**Acceptance Criteria:**
- No console errors during any interaction
- Works correctly on mobile viewport
- Rapid clicks don't break animation state
- Accessibility: focus management, ARIA labels
- All acceptance criteria from PRD met

**Files to Create/Modify:**
- `src/components/kanban/SessionPreviewModal.tsx`
- `src/components/kanban/KanbanBoard.tsx`

**Dependencies:** Task 5, Task 6

---

```tasks-json
[
  {
    "title": "Create SessionPreviewModal Component Skeleton",
    "description": "Create src/components/kanban/SessionPreviewModal.tsx with basic modal structure:\n- Modal container (90vw × 90vh, centered)\n- Overlay (rgba(0,0,0,0.6), click to close)\n- Header with session name and Expand button\n- Content area placeholder\n- ESC key handler\n- TypeScript interfaces: SessionPreviewModalProps { session, isOpen, onClose, onExpand }\n\nAcceptance Criteria:\n- Component renders without errors\n- Modal opens/closes with isOpen prop\n- Overlay click closes modal\n- ESC key closes modal\n- Expand button calls onExpand callback\n\nFiles: src/components/kanban/SessionPreviewModal.tsx (new)",
    "dependsOn": []
  },
  {
    "title": "Add Preview State Management to KanbanBoard",
    "description": "Modify KanbanBoard.tsx to support preview mode:\n- Add previewSession: SessionInfo | null state\n- Create handleCardClick that sets preview state instead of calling onSelectSession directly\n- Create handleExpandToFull that calls onSelectSession(session) and clears preview\n- Render SessionPreviewModal when previewSession exists\n- Pass required props: session, isOpen={!!previewSession}, onClose, onExpand\n\nAcceptance Criteria:\n- Clicking Kanban card opens preview modal (not full SessionViewer)\n- Modal shows session name in header\n- Expand button navigates to full SessionViewer\n- Close button returns to Kanban\n\nFiles: src/components/kanban/KanbanBoard.tsx",
    "dependsOn": ["Create SessionPreviewModal Component Skeleton"]
  },
  {
    "title": "Integrate SessionViewer into Preview Modal",
    "description": "Modify SessionPreviewModal to reuse SessionViewer component:\n- Import SessionViewer from '../SessionViewer'\n- Render SessionViewer in modal content area\n- Handle required props: onExport, onRename, onBack, terminal, piPath, customCommand\n- Adjust styling: h-[calc(90vh-4rem)] for content area to fit within modal\n- Ensure SessionViewer works in constrained modal space\n\nAcceptance Criteria:\n- SessionViewer renders correctly inside modal\n- Session content loads and displays\n- Scroll works within modal\n- No duplicate code between modal and full view\n\nFiles: src/components/kanban/SessionPreviewModal.tsx",
    "dependsOn": ["Create SessionPreviewModal Component Skeleton", "Add Preview State Management to KanbanBoard"]
  },
  {
    "title": "Implement Open Animation (Card → Modal)",
    "description": "Add FLIP-style animation for opening modal:\n- In KanbanBoard, measure card position using getBoundingClientRect on click\n- Pass initialCardRect to SessionPreviewModal\n- In SessionPreviewModal, calculate transform from card position to modal center\n- Apply CSS: initial transform matches card position, opacity: 0\n- Animate to final position with scale(1) opacity(1)\n- Use transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)\n\nAcceptance Criteria:\n- Card appears to 'grow' into modal position\n- Animation is smooth at 60fps\n- Modal overlay fades in simultaneously\n- Animation completes before content fully loads\n\nFiles: src/components/kanban/SessionPreviewModal.tsx, src/components/kanban/KanbanBoard.tsx",
    "dependsOn": ["Add Preview State Management to KanbanBoard"]
  },
  {
    "title": "Implement Close Animation (Modal → Card)",
    "description": "Add reverse animation for closing modal:\n- Store original card position in SessionPreviewModal state\n- On close, apply transform to move modal back toward card position\n- Scale down to 0.95 and fade out opacity to 0\n- Wait for animation (300ms) before calling onClose\n- Handle edge case: if card no longer visible (scrolled), fade out in place\n- Use setTimeout or onTransitionEnd to clear state after animation\n\nAcceptance Criteria:\n- Modal shrinks back toward original card position\n- If card not visible, fade out in place\n- Animation completes cleanly before unmounting\n- No visual glitches during rapid open/close\n\nFiles: src/components/kanban/SessionPreviewModal.tsx, src/components/kanban/KanbanBoard.tsx",
    "dependsOn": ["Implement Open Animation (Card → Modal)"]
  },
  {
    "title": "Add Expand-to-Full Animation",
    "description": "Implement modal → full-screen transition:\n- On expand click, start exit animation (modal fades out quickly)\n- Simultaneously call onExpand to trigger full SessionViewer render\n- Use CSS transition for smooth handoff\n- Ensure App.tsx renders SessionViewer immediately on setSelectedSession\n- Add reduced motion support: @media (prefers-reduced-motion: reduce) { transition: none }\n\nAcceptance Criteria:\n- Clicking Expand smoothly transitions to full SessionViewer\n- No jarring layout jumps\n- Works on both desktop and web desktop\n- Respects prefers-reduced-motion\n\nFiles: src/components/kanban/SessionPreviewModal.tsx, src/components/kanban/KanbanBoard.tsx",
    "dependsOn": ["Integrate SessionViewer into Preview Modal", "Implement Open Animation (Card → Modal)"]
  },
  {
    "title": "Polish and Edge Case Handling",
    "description": "Final refinements and testing:\n- Add isAnimating state to prevent rapid click spam\n- Handle case where card scrolled out of view (fallback animation)\n- Mobile: ensure 90vw/90vh works on small screens, add touch handling\n- Accessibility: focus trap within modal, aria-label, role='dialog'\n- Keyboard: Tab navigation, Shift+Tab, Escape handled\n- Test with different session content lengths (short/long)\n\nAcceptance Criteria:\n- No console errors during any interaction\n- Works correctly on mobile viewport\n- Rapid clicks don't break animation state\n- Accessibility: focus management, ARIA labels\n- All PRD acceptance criteria met\n\nFiles: src/components/kanban/SessionPreviewModal.tsx, src/components/kanban/KanbanBoard.tsx",
    "dependsOn": ["Implement Close Animation (Modal → Card)", "Add Expand-to-Full Animation"]
  }
]
```

---

> 「一歩ずつ、確実に」— 脚踏实地，一步一个脚印

The task breakdown is complete. The plan follows a logical sequence from skeleton → state management → content integration → animations → polish. Tasks 1-3 establish the foundation, Tasks 4-6 add the animation layers (can be worked in parallel once base is solid), and Task 7 provides the final polish.