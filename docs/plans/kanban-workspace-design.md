# Kanban Workspace Feature Design

## 1. Current Architecture Analysis

### Current Kanban Model
```
App.tsx
├── viewMode = 'kanban'
├── selectedProject (filter for project)
├── filterTagIds (filter for tags)
└── KanbanBoard
    ├── ProjectFilterList (left sidebar)
    ├── SearchFilterBar (top)
    └── KanbanColumns (grouped by tags)
```

### Limitations
1. **Single Context**: Only one global kanban view
2. **No Isolation**: Filters are global, no way to save different views
3. **No Multi-Tasking**: Cannot switch between different project contexts quickly
4. **No Persistence**: Filter state is lost on reload

## 2. Proposed Workspace Architecture

### Concept
A **Workspace** is a persistent, named configuration for a Kanban board.
Users can create multiple workspaces for different contexts (e.g., "Frontend Work", "Backend Refactor", "Bug Fixes").

```
WorkspaceManager
├── Workspace 1: "Frontend" (Project: ui-app, Tags: todo/in-progress)
├── Workspace 2: "Backend" (Project: api-server, Tags: feature/bugfix)
└── Workspace 3: "All Projects" (Global view)
```

### Data Structure
```typescript
interface KanbanWorkspace {
  id: string
  name: string
  icon?: string // Emoji or icon name
  color?: string
  config: {
    projectFilter: string | null // null = all projects
    filterTagIds: string[]
    sourceFilterSlugs: string[]
    columnOrder?: string[] // Custom column order
  }
  createdAt: string
  updatedAt: string
}
```

### UI Design
```
┌─────────────────────────────────────────────────────┐
│ Kanban Board                                    [+] │
├──────────────┬──────────────────────────────────────┤
│ Workspaces   │                                      │
│ ┌──────────┐ │   Column 1    Column 2    Column 3   │
│ │ Frontend │ │   ┌──────┐   ┌──────┐   ┌──────┐    │
│ │ Backend  │ │   │ Card │   │ Card │   │ Card │    │
│ │ All      │ │   └──────┘   └──────┘   └──────┘    │
│ └──────────┘ │                                      │
│              │                                      │
│ Filters      │                                      │
│ [x] Tag A    │                                      │
│ [x] Tag B    │                                      │
└──────────────┴──────────────────────────────────────┘
```

## 3. Implementation Plan

### Phase 1: Backend Data Layer
1. **New Command**: `get_workspaces`, `save_workspace`, `delete_workspace`
2. **Storage**: `workspaces.json` in config directory
3. **API**:
   ```rust
   pub async fn get_workspaces() -> Result<Vec<KanbanWorkspace>, String>
   pub async fn save_workspace(workspace: KanbanWorkspace) -> Result<(), String>
   pub async fn delete_workspace(id: String) -> Result<(), String>
   ```

### Phase 2: Frontend State Management
1. **Hook**: `useWorkspaces` for CRUD operations
2. **Context**: `WorkspaceContext` to share state
3. **State**:
   ```typescript
   const [workspaces, setWorkspaces] = useState<KanbanWorkspace[]>([])
   const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
   ```

### Phase 3: UI Components
1. **WorkspaceSwitcher**: Dropdown or list to select workspace
2. **WorkspaceEditor**: Modal to create/edit workspace
3. **Integration**: Update `App.tsx` to use workspace config

### Phase 4: Advanced Features
1. **Auto-Workspace**: Automatically create workspace from current project
2. **Workspace Templates**: Predefined workspace configs
3. **Export/Import**: Share workspace configurations

## 4. Technical Details

### Storage Location
```
~/.pi-session-manager/workspaces.json
```

### JSON Schema
```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "ws-123",
      "name": "Frontend",
      "icon": "🎨",
      "color": "#3b82f6",
      "config": {
        "projectFilter": "/Users/dev/frontend-app",
        "filterTagIds": ["tag-todo", "tag-in-progress"],
        "sourceFilterSlugs": ["pi"]
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Integration with Existing Tags
Workspaces leverage existing Tag infrastructure.
No changes to Tag data structure needed.

## 5. User Experience

### Creation Flow
1. User clicks "New Workspace" button
2. Enters name and optional icon/color
3. Sets filters (project, tags, sources)
4. Saves workspace

### Switching Flow
1. User clicks workspace in sidebar
2. Kanban board updates to show filtered view
3. Filter state persists across sessions

### Default Workspace
- "All Projects" workspace created automatically
- Cannot be deleted
- Shows all sessions without filters

## 6. Success Metrics
- Users can create and switch between workspaces
- Filter state persists across app restarts
- Performance remains smooth with 10+ workspaces
- No regression in existing Kanban functionality
