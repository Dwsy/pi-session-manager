# PSM Kanban Board

Built-in PSM browser plugin that registers the app-level Kanban board view and
the matching Kanban sidebar view.

The plugin owns Kanban workspace state and persists it with `ctx.psm.config`.
The host only provides generic app-surface data to registered app UI
contributions; workspace UI and filtering live inside this plugin boundary.

## Data Model

- **Status** is the workflow stage for a session and is single-value inside the Kanban plugin. Existing host `Tag` / `SessionTag` data remains the persistence compatibility layer, but legacy multi-tag assignments are resolved to one canonical status.
- **Labels** are independent GitHub-style metadata. A session may have multiple labels, and every label stores a name, hex color, and optional description in the plugin's own config store.
- Workspace config uses `filterStatusIds` and `statusOrder`. Version 1 `filterTagIds` / `columnOrder` fields are still accepted on read and migrated to the new names.

## Layout

- `board/` — board composition, columns, cards, drag-and-drop, context menu, and status model.
- `labels/` — label persistence, badges, and label management UI.
- `views/` — table, roadmap, and host session-column projections.
- `workspace/` — saved workspace state, editor, and sidebar panel.
- Root files are limited to plugin entry/manifest/view identifiers and this README.

## Host Contract

- UI contribution: `ctx.ui.registerAppView(...)`
- UI contribution: `ctx.ui.registerAppSidebarView(...)`
- View id: `builtin.kanban-board.view`
- Sidebar view id: `builtin.kanban-board.sidebar`
- Route hint: `/kanban`
- Navigation metadata: `icon: 'columns3'`, `shortcut: 'Cmd+B'`
- Sidebar binding: `appViewId: 'builtin.kanban-board.view'`
- Permissions: `sessions:read`, `tags:read`, `tags:write`, `config:read`, `config:write`
