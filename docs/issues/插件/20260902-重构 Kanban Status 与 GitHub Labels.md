---
id: "2026-09-02-重构 Kanban Status 与 GitHub Labels"
title: "重构 Kanban Status 与 GitHub Labels"
status: "done"
created: "2026-09-02"
updated: "2026-09-02"
category: "插件"
tags: ["workhub", "重构 Kanban Status 与 GitHub Labels"]
---

# Issue: 重构 Kanban Status 与 GitHub Labels

## Goal

将 Kanban 现有 Tag 列语义明确迁移为单值 Status，并新增与流程状态解耦的 GitHub 风格多值 Labels（名称、颜色、描述）。

## 背景/问题

当前 Kanban 同时使用全局 `Tag` / `SessionTag` 表示列状态与卡片标签，导致一个会话可落入多个“状态列”，上下文菜单里的标签开关也会直接改变列归属。Table 已将该字段展示为 Status，说明模型和 UI 语义已经分裂。需要在兼容现有持久化数据的前提下，将旧 Kanban Tag 视为 Status，并提供独立的 Labels 模型。

## 验收标准 (Acceptance Criteria)

- [x] WHEN Kanban 读取现有 Tag/SessionTag 数据，系统 SHALL 将其解释为 Status / StatusAssignment，并为每个会话只解析一个当前状态。
- [x] WHEN 用户拖拽或批量移动卡片，系统 SHALL 切换单一 Status，而不是叠加多个状态。
- [x] WHERE Kanban 卡片、表格与上下文菜单展示 Labels，系统 SHALL 使用独立的 Label 数据，而不是 Status。
- [x] WHEN 用户创建或编辑 Label，系统 SHALL 支持名称、颜色、描述三个 GitHub 风格字段。
- [x] WHEN 用户给会话增删 Label，系统 SHALL 支持多标签并持久化到 Kanban 插件配置。
- [x] IF 读取旧 workspace 配置，THEN 系统 SHALL 兼容 `filterTagIds` / `columnOrder` 并迁移为 Status 命名。
- [x] WHEN Pi bridge 使用 `/kanban` 或 LLM tools，系统 SHALL 以单值 Status 与多值 Labels 展示和修改同一份 Kanban 数据。

## 实施阶段

### Phase 1: 规划和准备
- [x] 分析需求和依赖
- [x] 设计兼容迁移方案
- [x] 确定实施计划

### Phase 2: 执行
- [x] 将 Kanban Tag/SessionTag 内部语义重命名为 Status/StatusAssignment，并强制单状态解析
- [x] 新增 Kanban Labels store 与 workspace v2 兼容迁移
- [x] 更新 Board/Card/Table/Roadmap/ContextMenu/Workspace UI，区分 Status 与 Labels
- [x] 增加 Label 管理入口（名称、颜色、描述）与会话标签切换

### Phase 3: 验证
- [x] 单元测试覆盖单状态解析、旧 workspace 迁移与 Label CRUD/assignment
- [x] Kanban 定向组件测试
- [x] TypeScript / build 验证

### Phase 4: 交付
- [x] 重组 `extensions/psm-kanban-board` 目录，按 board / labels / workspace 等职责分层
- [x] 更新 Issue Notes / 状态
- [x] 创建 Workhub PR 变更记录
- [x] 保持工作区变更可追溯
- [x] 同步修改 `pi-session-bridge` 的 Status / Labels 存储、TUI、tools、测试和 README

## 关键决策

| 决策 | 理由 |
|------|------|
| 旧全局 Tag 数据在 Kanban 内视为 Status | 保留现有数据库和 Plugin SDK 兼容性，不做破坏性后端迁移 |
| Labels 使用 Kanban 插件独立配置存储 | Labels 需要 `description` 且允许多选，不应继续污染 Status 归属 |
| 旧多 Tag 会话按最新有效 assignment 解析为单 Status | 满足 Status 单值约束，同时为旧数据提供确定性迁移规则 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-09-02 | `index.tsx` 批量 edit 片段命中两处，工具拒绝执行 | 重新读取入口文件并改用带上下文的精确替换 |
| 2026-09-02 | `KanbanColumn.tsx` 批量 edit 中卡片片段命中虚拟/普通渲染两处 | 拆成带父级上下文的精确替换，分别覆盖两种渲染路径 |
| 2026-09-02 | `KanbanBoard.tsx` Table/Roadmap 相同 prop 片段命中两处 | 分别按组件父节点精确替换 |
| 2026-09-02 | `KanbanCardDensity.test.tsx` 两次 `tags={[]}` 夹具命中重复 | 分别按 comfortable / compact rerender 上下文替换 |
| 2026-09-02 | `marked-katex-extension` 源码触发项目严格 `noUnusedLocals` 类型检查 | 移除中间包，改用 KaTeX + Marked 原生扩展接口 |

## 相关资源

- [x] 插件说明: `extensions/psm-kanban-board/README.md`
- [x] Workhub PR: `docs/pr/插件/20260902-重构 Kanban Status 与 GitHub Labels.md`

## Notes

2026-09-02 扫描确认：`kanbanBoardModel.ts` 用所有 Tag 构建列，`KanbanContextMenu.tsx` 又把同一批 Tag 当多选 Labels；`KanbanTableView.tsx` 已将该字段命名为 Status。采用兼容层拆分语义，不改动全局标签数据库契约。

2026-09-02 用户追加要求：当前插件根目录过度平铺，需要在本次重构中同步按职责拆分目录，后续新 Status / Labels 代码直接落在新模块结构。

2026-09-02 完成实现：根目录收敛为入口/manifest/viewIds/README，功能代码拆分至 `board/`、`labels/`、`views/`、`workspace/`。旧 host Tag API 仅作为 Status 持久化兼容层；Labels 使用独立插件配置存储。

2026-09-02 验证完成：Kanban 测试 8/8 files、27/27 tests 通过；`pnpm typecheck:extensions`、`pnpm build`、`git diff --check` 均通过。

2026-09-02 bridge 同步完成：`/kanban` 与 `session_status` / `session_label` 统一读取同一份 Status / Labels 文件；旧 `tags_config.json` / `session_mark.json` 继续作为 Status 兼容持久化层，旧多 Tag assignment 按最新有效 `assignedAt` 确定唯一 Status，设置新 Status 时只规范化当前会话并保留其他会话数据。Labels 独立存储，不把历史状态错误迁移成 Labels。

---

## Status 更新日志

- **2026-09-02 14:45**: 状态变更 → in_progress，备注: 已完成扫描与方案设计，开始实现。
- **2026-09-02 14:59**: 状态变更 → done，备注: Status/Labels 语义拆分、目录重构、测试与构建验证全部完成。
- **2026-09-02 15:05**: 状态变更 → in_progress，备注: 用户追加桥接器插件同步迁移，继续扩展同一 SSOT。
- **2026-09-02 15:23**: 状态变更 → done，备注: bridge Status/Labels、旧数据兼容迁移、尾部 UI/Markdown 补充任务均完成；相关 17 个测试文件 65 个测试、extension typecheck、生产 build、diff check 全部通过。