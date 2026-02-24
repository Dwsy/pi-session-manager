# Task for crew-planner

Create a task breakdown for implementing this request.

## Request

Implement Kanban Session Preview Modal with Full-Screen Expand (Issue #10)

## Overview
In desktop/web desktop Kanban board view, clicking a session card should open a preview modal instead of direct navigation, with ability to expand to full-screen session page.

## Feature Spec

### Core Interactions
- Click Kanban card → Open preview modal (90vw × 90vh)
- "Expand" button in modal → Animated transition to full session page
- ESC / Click overlay → Close preview modal

### Animation Flow
1. Open: Card position → Modal center, scale + fadeIn, 300ms ease-out
2. Expand: Modal → Full page, shared element transition
3. Close: Reverse animation, return to Kanban position

### Technical Specs
- Preview modal size: 90vw × 90vh
- Overlay: rgba(0,0,0,0.6)
- Duration: 300ms
- Easing: cubic-bezier(0.4, 0, 0.2, 1)

### Component Reuse Strategy
- Reuse existing SessionView component for preview content
- Reuse Modal component as container
- Add SessionPreviewModal component to encapsulate preview logic

## Acceptance Criteria
- Click Kanban card opens preview modal (not direct navigation)
- Modal size is 90% viewport (90vw × 90vh)
- One-click expand to full session page from modal
- Smooth animations for open/close/expand transitions
- Reuse existing SessionView component, no duplicate code
- ESC and overlay click close the modal
- Support both desktop and web desktop

## Related Files
- docs/KANBAN_UX_ANALYSIS.md
- src/components/KanbanBoard/

## Previous Planning Context
# Planning Progress

## Notes
<!-- User notes here are read by the planner on every run.
     Add steering like "ignore auth" or "prioritize performance". -->


---
## Run: 2026-02-14T07:44:03.007Z — docs/issues/20260214-pi-config-tui-refactor.md


You must follow this sequence strictly:
1) Understand the request
2) Review relevant code/docs/reference resources
3) Produce sequential implementation steps
4) Produce a parallel task graph

Return output in this exact section order and headings:
## 1. PRD Understanding Summary
## 2. Relevant Code/Docs/Resources Reviewed
## 3. Sequential Implementation Steps
## 4. Parallelized Task Graph

In section 4, include both:
- markdown task breakdown
- a `tasks-json` fenced block with task objects containing title, description, and dependsOn.