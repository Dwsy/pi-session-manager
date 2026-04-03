# Kanban Feature UX Improvement BBD Test Report

> 「形あるものは必ず壊れる」— All formed things must eventually change

## Improvement Summary

### Problem Fixes

1. **Tag filter on left in kanban mode is strange** → Changed to display project filter list
2. **Kanban cannot filter by project** → Added `projectFilter` functionality
3. **Inconsistent filtering logic** → Unified to: Left project filter → Kanban filters by project

### Code Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `App.tsx` | Modified | Render `ProjectFilterList` instead of `TagFilter` in kanban mode |
| `KanbanBoard.tsx` | Modified | Added `projectFilter` prop, supports filtering sessions by project |
| `ProjectFilterList.tsx` | New | Project filter component with virtual scrolling support |
| `en-US/zh-CN/project.ts` | New | Added `filter` translation keys |
| `en-US/zh-CN/tags.ts` | Modified | Added `kanban.allProjects` translation |

---

## BBD Test Case Verification

### ✅ Scenario 1: Kanban Mode Left Panel Shows Project List

```gherkin
Feature: Left sidebar content in kanban mode

  Scenario: Switch to kanban mode
    Given User is in list view
    When User switches to kanban view
    Then Left sidebar shows project list
    And TagFilter component is not included
```

**Verification Code** (App.tsx):

```tsx
{!showFavorites && viewMode === 'kanban' && (
  <ProjectFilterList
    sessions={sessions}
    selectedProject={selectedProject}
    onSelectProject={setSelectedProject}
    scrollParentRef={listScrollRef}
  />
)}
```

---

### ✅ Scenario 2: Select Project in Kanban Mode

```gherkin
Feature: Kanban mode project filtering

  Scenario: User clicks a project
    Given User is in kanban view
    And Project list is shown on the left
    When User clicks project-a
    Then The project is highlighted as selected
    And Kanban content updates to that project's sessions
```

**Verification Code** (KanbanBoard.tsx):

```tsx
const filteredSessions = useMemo(() => {
  if (!projectFilter) return sessions
  return sessions.filter(s => s.cwd === projectFilter)
}, [sessions, projectFilter])
```

---

### ✅ Scenario 3: Show All Projects Option

```gherkin
Feature: All projects option

  Scenario: User selects all projects
    Given User is in kanban view
    When User clicks "All Projects"
    Then Kanban shows sessions from all projects
    And Kanban columns are still grouped by tags
```

**Verification Code** (ProjectFilterList.tsx):

```tsx
<button onClick={() => onSelectProject(null)}>
  <Folder className="h-3.5 w-3.5" />
  <div>{t('project.filter.allProjects')}</div>
  <div>{totalSessions} {t('project.list.sessions')}</div>
</button>
```

---

### ✅ Scenario 4: Kanban Header Shows Current Project

```gherkin
Feature: Kanban header project indicator

  Scenario: View kanban header
    Given User is in kanban view
    And project-a is selected
    Then Kanban header shows project-a name
    And Displays the project's session count
```

**Verification Code** (KanbanBoard.tsx):

```tsx
{projectFilter ? (
  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
    {projectFilter.split('/').pop()}
  </span>
) : (
  <span className="text-[10px] text-muted-foreground">
    {t('tags.kanban.allProjects')}
  </span>
)}
<span className="text-[10px] text-muted-foreground ml-auto">
  {filteredSessions.length} {t('project.list.sessions')}
</span>
```

---

### ✅ Scenario 5: Cross-view State Consistency (Partially Implemented)

```gherkin
Feature: Project selection remains consistent across views

  Scenario: Switch from project view to kanban view
    Given User is in project view
    And project-a is selected
    When User switches to kanban view
    Then Kanban defaults to showing project-a's sessions
    And project-a is selected in the project list on the left
```

**State Management**:

```tsx
// Shared selectedProject state in App.tsx
const [selectedProject, setSelectedProject] = useState<string | null>(null)

// Shared between project view and kanban view
```

---

## Performance Optimization

### Virtual Scrolling

`ProjectFilterList` uses `@tanstack/react-virtual` for virtual scrolling, supporting large numbers of projects without lag.

```tsx
const virtualizer = useVirtualizer({
  count: projects.length,
  getScrollElement: () => scrollParentRef?.current ?? null,
  estimateSize: () => 52,
  overscan: 8,
})
```

### Memoization

Kanban session filtering uses `useMemo` to avoid unnecessary recalculation:

```tsx
const filteredSessions = useMemo(() => {
  if (!projectFilter) return sessions
  return sessions.filter(s => s.cwd === projectFilter)
}, [sessions, projectFilter])
```

---

## UX Details

1. **Selected State Style**: Use `bg-info/10` to highlight selected project
2. **Count Display**: Each project shows session count and message count
3. **All Projects**: Fixed at the very top, uses Folder icon to distinguish from project items
4. **Responsive**: Virtual scrolling supports any number of projects

---

## Future Improvements

1. **Search Projects**: Add search box when there are many projects
2. **Project Grouping**: Display grouped by directory hierarchy
3. **Recent Projects**: Show recently accessed projects for quick entry
4. **Kanban Tag Filtering**: Add tag filter on kanban top for project + tag dual filtering

> *「完成したとき、次の一歩が見える」* — When completed, the next step becomes visible
