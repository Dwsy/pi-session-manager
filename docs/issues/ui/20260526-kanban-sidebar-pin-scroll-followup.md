# 看板侧栏图钉与滚动问题后续

- Status: Fixed
- Date: 2026-05-26
- Area: `extensions/psm-kanban-board`
- Owner: TBD

## 背景

用户反馈：

1. 看板列间距稍大。
2. 左侧列表需要滚动功能。
3. 左侧列表 hover 后面应显示图钉。
4. 当前问题仍在：没有图钉。

本轮上下文较少，需沉淀为后续开发文档，避免下轮继续改错位置。

## 关键结论

图钉仍不显示的高概率原因：上次改动落在通用项目列表 `src/components/project/ProjectList.tsx`，但看板页面左侧侧栏不是这个组件，而是看板插件自己的 `extensions/psm-kanban-board/WorkspacePanel.tsx`。

也就是说：

```text
普通项目视图左侧列表
└── src/components/project/ProjectList.tsx
    └── 已改为 hover 显示 Pin 图标

看板页面左侧列表
└── extensions/psm-kanban-board/WorkspacePanel.tsx
    └── 仍是自建 project button 列表，没有 pin/favorite hover action
```

后续应优先修改 `WorkspacePanel.tsx`，不是继续改 `ProjectList.tsx`。

## 已有相关改动

### 看板列间距

文件：`extensions/psm-kanban-board/KanbanBoard.tsx`

已将桌面看板容器收紧：

```tsx
p-4 -> p-3
gap-3 -> gap-2
```

如仍觉得宽，可继续调为：

```tsx
p-2.5
gap-1.5
```

但建议先在 GUI 中截图确认，不要盲调。

### 滚动容器

已补部分 `min-h-0`：

- `extensions/psm-kanban-board/WorkspacePanel.tsx`
- `src/components/app/AppDesktopSidebarContent.tsx`
- `src/components/app/AppProjectListPane.tsx`

看板侧栏项目列表当前已有：

```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
```

若仍不能滚动，下一步应检查父容器 `AppPluginSidebarPane` / app sidebar slot 是否给了明确高度和 `min-h-0`。

## 当前看板侧栏结构

文件：`extensions/psm-kanban-board/WorkspacePanel.tsx`

主要结构：

```text
WorkspacePanel
├── workspace switcher
├── active filter chips
├── project search input
└── project list
    ├── All Projects button
    └── projects.map(project => button)
```

项目列表当前按钮：

```tsx
{projects.map((project) => (
  <button
    key={project.dir}
    onClick={() => selectProject(project.dir)}
    className="..."
  >
    <FolderOpen />
    <span>{project.dirName}</span>
    <span>{project.sessionCount}</span>
  </button>
))}
```

这里没有 hover action，也没有 `Pin` 图标。

## 推荐修复方案

### 目标

在看板左侧项目列表每个项目行末尾添加 hover 图钉按钮，用于将项目固化为当前 workspace 的 `projectFilter`。

这比单纯 favorite 更符合看板语义：

- 临时点项目：`workspaceStore.selectProject(project.dir)`
- 点击图钉：`workspaceStore.updateActiveWorkspaceConfig({ projectFilter: project.dir })`
- 取消图钉：`workspaceStore.updateActiveWorkspaceConfig({ projectFilter: null })`

### 行为设计

| 状态 | 行为 |
|---|---|
| 项目未固定 | hover 项目行右侧显示 `Pin` 图标 |
| 点击图钉 | 写入 active workspace `config.projectFilter` |
| 当前项目已固定 | 图钉常显，使用 primary/yellow 色 |
| 点击已固定图钉 | 清除 `projectFilter`，回到临时选择模式 |
| 点击项目行本体 | 仍保持现有临时选择，不写入 workspace config |

### UI 建议

在项目行中使用 `group`：

```tsx
<button className="group ...">
  <FolderOpen />
  <span className="flex-1 truncate">{project.dirName}</span>
  <span>{project.sessionCount}</span>
  <button className="opacity-0 group-hover:opacity-100 ...">
    <Pin />
  </button>
</button>
```

注意：不能把 `button` 嵌套在 `button` 中。应改成外层 `div`，项目选择和 pin 分别是两个 button：

```tsx
<div className="group flex ...">
  <button onClick={() => selectProject(project.dir)} className="flex flex-1 ...">
    ...
  </button>
  <button onClick={togglePinnedProject} className="...">
    <Pin />
  </button>
</div>
```

## 实施步骤

1. 修改 `WorkspacePanel.tsx` imports：加入 `Pin` 图标。
2. 为 All Projects 与项目行保持现有选择行为。
3. 将 `projects.map` 的外层从单个 `button` 改为 `div + button + pin button`。
4. 新增 helper：

```ts
const togglePinnedProject = (project: string) => {
  const pinnedProject = activeWorkspace.config.projectFilter
  void workspaceStore.updateActiveWorkspaceConfig({
    projectFilter: pinnedProject === project ? null : project,
  })
  workspaceStore.selectProject(null)
  data.onClearSelectedSession()
}
```

5. 已固定项目的图钉常显；未固定项目 hover 显示。
6. 不要修改全局 `ProjectList.tsx` 作为主修复点，除非用户明确说普通项目列表也要改。

## 验收标准

- 在看板页面左侧项目列表 hover 项目行，右侧能看到图钉。
- 点击图钉后，该项目成为当前 workspace 的固定 `projectFilter`。
- 固定项目图钉常显。
- 再点图钉可取消固定。
- 项目列表内容多时可滚动。
- 不出现嵌套 button 的 React/HTML 警告。
- 不影响点击项目行临时过滤。

## 建议测试

新增测试文件：

```text
extensions/psm-kanban-board/__tests__/WorkspacePanelPinProject.test.tsx
```

测试点：

1. 渲染 WorkspacePanel，项目行存在 pin button。
2. 点击 pin button 调用 `workspaceStore.updateActiveWorkspaceConfig({ projectFilter })`。
3. 已固定项目的 pin button 常显或有 active aria/title。
4. 点击项目行本体只调用 `selectProject`，不调用 `updateActiveWorkspaceConfig`。

相关验证命令：

```bash
pnpm exec vitest run extensions/psm-kanban-board/__tests__/WorkspacePanelPinProject.test.tsx
pnpm exec tsc --noEmit --pretty false
```

## 相关文件

- `extensions/psm-kanban-board/WorkspacePanel.tsx` — 主修复目标
- `extensions/psm-kanban-board/workspaceStore.ts` — 已有 `projectFilter` 持久化能力
- `extensions/psm-kanban-board/index.tsx` — Kanban view 使用 `activeWorkspace.config.projectFilter ?? selectedProject`
- `src/components/project/ProjectList.tsx` — 上次误改/次要目标；普通项目列表使用
- `src/components/app/AppDesktopSidebarContent.tsx` — 通用侧栏内容容器
- `src/components/app/AppProjectListPane.tsx` — 移动/项目列表 pane 容器

## 风险

- 嵌套 button 是最大风险，必须用 `div` 包一行，两个 button 分开。
- `projectFilter` 与 `selectedProject` 同时存在时，当前逻辑优先 `projectFilter`；点击图钉后应清空临时选择，避免状态理解混乱。
- 如果用户期望的是“收藏项目”而非“固定 workspace projectFilter”，需确认语义。但从看板上下文看，固定到当前 workspace 更合理。

## 修复记录

已在 `WorkspacePanel.tsx` 修复：

- 引入 `Pin` 图标。
- 将项目行从单个 `button` 改为 `div + select button + pin button`，避免嵌套 button。
- 未固定项目：右侧数量正常显示，hover 时同位替换为操作按钮。
- 已固定项目：操作按钮常显，图钉使用 active 色。
- 点击图钉写入 `activeWorkspace.config.projectFilter`。
- 新增归档按钮：使用现有 `builtin-archive` 标签批量归档该项目当前会话。
- 点击项目行本体仍只做临时 `selectedProject`，不持久化。
- 侧栏根容器与列表容器保留 `min-h-0 + overflow-y-auto`，支持滚动。

新增测试：

```text
extensions/psm-kanban-board/__tests__/WorkspacePanelPinProject.test.tsx
```

覆盖：

- 项目行存在 `Pin project <name>` 图钉按钮。
- 点击图钉持久化当前 workspace 的 `projectFilter`。
- 项目行存在 `Archive project <name>` 归档按钮。
- 点击归档按钮为项目会话添加 `builtin-archive` 标签。
- 点击项目行本体只更新临时 `selectedProject`，不写入 workspace config。

## 当前验证记录

```bash
pnpm exec vitest run extensions/psm-kanban-board/__tests__/WorkspacePanelPinProject.test.tsx
# PASS (3) FAIL (0)

pnpm exec vitest run extensions/psm-kanban-board/__tests__/WorkspacePanelPinProject.test.tsx extensions/psm-kanban-board/__tests__/workspaceStore.test.ts extensions/psm-kanban-board/__tests__/KanbanBoardBulkSelection.test.tsx extensions/psm-kanban-board/__tests__/KanbanBulkToolbar.test.tsx extensions/psm-kanban-board/__tests__/KanbanCardDensity.test.tsx extensions/psm-kanban-board/__tests__/kanbanBoardModel.test.ts extensions/psm-kanban-board/__tests__/KanbanContextMenuDelete.test.tsx
# PASS (15) FAIL (0)

pnpm exec tsc --noEmit --pretty false
# TypeScript: No errors found
```
