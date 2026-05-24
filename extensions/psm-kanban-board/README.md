# PSM Kanban Board

Built-in PSM browser plugin that registers the app-level Kanban board view and
the matching Kanban sidebar view.

The plugin owns Kanban workspace state and persists it with `ctx.psm.config`.
The host only provides generic app-surface data to registered app UI
contributions; workspace UI and filtering live inside this plugin boundary.

## Host Contract

- UI contribution: `ctx.ui.registerAppView(...)`
- UI contribution: `ctx.ui.registerAppSidebarView(...)`
- View id: `builtin.kanban-board.view`
- Sidebar view id: `builtin.kanban-board.sidebar`
- Route hint: `/kanban`
- Navigation metadata: `icon: 'columns3'`, `shortcut: 'Cmd+B'`
- Sidebar binding: `appViewId: 'builtin.kanban-board.view'`
- Permissions: `sessions:read`, `tags:read`, `tags:write`, `config:read`, `config:write`
