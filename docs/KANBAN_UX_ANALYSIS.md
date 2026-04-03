# Kanban Feature UX Deep Analysis and BBD Tests

> 「問題は見えないところにある」— Problems often hide in unseen places

## 1. Current Architecture Link Analysis

### 1.1 View Mode Switching Logic

```
App.tsx View State Machine
├── viewMode='list'
│   ├── Left: TagFilter + SessionList (all sessions)
│   └── Right: Dashboard (statistics panel)
│
├── viewMode='project'
│   ├── Left: ProjectList (project list)
│   │   └── Click project → SessionList (sessions for that project)
│   └── Right: Dashboard
│
└── viewMode='kanban'
    ├── Left: TagFilter (tag filtering) ← Issue A
    └── Right: KanbanBoard (tag-grouped kanban)
```

### 1.2 Problem Diagnosis

#### Issue A: Left panel showing TagFilter in kanban mode is strange

- **Phenomenon**: Kanban mode still shows tag filter on the left (todo/in-progress/done, etc.)
- **Confusion**: The right kanban is already grouped by tags, what's the point of tag filtering on the left?
- **User cognitive conflict**: "I want to filter by project, but the left side shows tags"

#### Issue B: Kanban mode cannot filter by project

- **Phenomenon**: Kanban shows sessions from all projects mixed together
- **User expectation**: "I want to see the kanban view for a specific project"
- **Missing feature**: No project dimension filter

#### Issue C: Inconsistent filtering logic

- **list mode**: TagFilter filters the session list
- **kanban mode**: TagFilter filters sessions shown in kanban, but column headers still show all tags
- **User experience disconnect**: TagFilter behaves inconsistently across different modes

## 2. User Scenario BBD Test Cases

### Scenario 1: Project-based Kanban View

```gherkin
Feature: Project filtering in kanban mode

  Scenario: User wants to view kanban for a specific project
    Given User is in kanban view
    And Multiple projects exist (project-a, project-b)
    When User selects project-a on the left
    Then Kanban only shows sessions from project-a
    And Kanban columns are still grouped by tags (todo/in-progress/done)

  Scenario: User wants to view kanban for all projects
    Given User is in kanban view
    When User doesn't select any project ("All Projects")
    Then Kanban shows sessions from all projects
    And Each session card shows its project
```

### Scenario 2: Expected Left Sidebar in Kanban Mode

```gherkin
Feature: Left sidebar content in kanban mode

  Scenario: Switch to kanban mode
    Given User is in list view
    When User switches to kanban view
    Then Left sidebar shows project list
    And TagFilter component is not included

  Scenario: Select project in kanban mode
    Given User is in kanban view
    And Project list is shown on the left
    When User clicks a project
    Then The project is highlighted as selected
    And Kanban content updates to that project's sessions
```

### Scenario 3: Cross-view State Consistency

```gherkin
Feature: Project selection remains consistent across views

  Scenario: Switch from project view to kanban view
    Given User is in project view
    And project-a is selected
    When User switches to kanban view
    Then Kanban defaults to only showing project-a's sessions
    And project-a is selected in the project list on the left

  Scenario: Switch from kanban view to list view
    Given User is in kanban view
    And project-a is selected
    When User switches to list view
    Then List view shows project-a's sessions
```

## 3. Improvement Solution Design

### 3.1 Architecture Adjustment

```
Improved Kanban Mode
├── Left Sidebar
│   ├── Top Toolbar
│   └── Project Filter List (ProjectFilterList) ← New
│       ├── "All Projects" option
│       └── Project list items (show session counts)
│
└── Right Main Area
    └── KanbanBoard
        ├── Top Tag Filter (TagFilterBar) ← Moved here
        └── Kanban columns (grouped by tags)
```

### 3.2 Data Structure Extension

```typescript
// App.tsx new state
const [kanbanProjectFilter, setKanbanProjectFilter] = useState<string | null>(null)

// KanbanBoard receives project filter
interface KanbanBoardProps {
  // ... existing props
  projectFilter?: string | null
  // null = all projects
}

// Filtering logic
const kanbanSessions = useMemo(() => {
  if (!kanbanProjectFilter) return sessions
  return sessions.filter(s => s.cwd === kanbanProjectFilter)
}, [sessions, kanbanProjectFilter])
```

### 3.3 Component Adjustments

| Component | Current Behavior | Improved Behavior |
|-----------|-----------------|-------------------|
| App.tsx (left panel) | kanban mode shows TagFilter | kanban mode shows ProjectFilterList |
| KanbanBoard.tsx | Receives all sessions | Receives projectFilter, filters internally |
| TagFilter.tsx | In left sidebar | Moved to kanban top as TagFilterBar |

## 4. Implementation Plan

### Phase 1: Project Filter Component

- [ ] Create `ProjectFilterList` component
- [ ] Support "All Projects" option
- [ ] Show session counts for each project

### Phase 2: Kanban Mode Left Panel Transformation

- [ ] App.tsx conditional rendering: kanban mode shows ProjectFilterList
- [ ] Hide TagFilter in kanban mode

### Phase 3: Kanban Receives Project Filter

- [ ] KanbanBoard receives projectFilter prop
- [ ] Internal filtering based on projectFilter
- [ ] Move TagFilterBar to kanban top

### Phase 4: Cross-view State Synchronization

- [ ] Project selection persists when switching viewMode
- [ ] From project view to kanban view retains project selection
- [ ] From kanban view to list view retains project selection

## 5. Acceptance Criteria

- [ ] Kanban mode left panel shows project list instead of tag filter
- [ ] After selecting a project, kanban only shows that project's sessions
- [ ] "All Projects" option shows sessions from all projects
- [ ] Session cards in kanban show their project (when All Projects is selected)
- [ ] Switching from other views to kanban view retains project selection state
- [ ] Tag filter moved to kanban top, only affects kanban content

---

> 「整理は、未来の自分への贈り物」— Organization is a gift to your future self
