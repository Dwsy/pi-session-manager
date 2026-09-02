---
id: "2026-09-02-重构 Kanban Status 与 GitHub Labels"
title: "重构 Kanban Status 与 GitHub Labels"
status: "ready"
created: "2026-09-02"
updated: "2026-09-02"
category: "插件"
tags: ["workhub", "pr", "重构 Kanban Status 与 GitHub Labels"]
---

# 重构 Kanban Status 与 GitHub Labels

将 Kanban 原先混用的 Tag 语义拆成单值工作流 **Status** 与独立多值 **Labels**，并同步重组插件目录结构。

## 背景与目的 (Why)

旧实现同时把 host `Tag` / `SessionTag` 当作看板列状态和卡片标签，因此同一会话可能出现在多个状态列，上下文菜单中的标签切换也会改变流程列。与此同时，插件文件长期平铺在根目录，Status / Labels 新功能会进一步放大维护成本。

## 变更内容概述 (What)

- 将现有 host Tag 持久化通道在 Kanban 内重新定义为 Status，并将旧多 Tag assignment 规范化为一个确定的当前状态。
- 拖拽、批量移动和上下文菜单统一改为单值 Status 切换，并清理遗留的额外状态 assignment。
- 新增独立 GitHub 风格 Labels：支持名称、十六进制颜色、描述和一会话多标签。
- Labels 通过插件 `ctx.psm.config` 独立持久化，不污染 Status 数据。
- Table、Roadmap、Card、Context Menu 和 host session column 分别展示单值 Status 与多值 Labels。
- Workspace 配置升级为 v2，使用 `filterStatusIds` / `statusOrder`，兼容读取旧 `filterTagIds` / `columnOrder`。
- `psm-kanban-board` 重组为 `board/`、`labels/`、`views/`、`workspace/`，根目录只保留入口与清单类文件。
- README 与多语言文案同步更新。
- `pi-session-bridge` 同步迁移为单值 `session_status` + 多值 `session_label`；`/kanban` TUI、LLM tools 与 PSM Kanban 共用同一份文件数据，并保留 legacy wire event 名以兼容已有 bridge 消费端。

## 关联 Issue

- **Issue:** `docs/issues/插件/20260902-重构 Kanban Status 与 GitHub Labels.md`

## 测试与验证结果 (Test Result)

- [x] Kanban + bridge + 尾部回归测试：17/17 files、65/65 tests 通过
- [x] `pnpm typecheck:extensions`
- [x] `pnpm build`
- [x] `git diff --check`

## 风险与影响评估 (Risk Assessment)

- host `Tag` / `SessionTag` API 与数据库未做破坏性迁移，仍作为 Kanban Status 的兼容持久化层。
- 旧会话若存在多个 Tag assignment，Kanban 按最新有效 `assignedAt` 解析为唯一 Status；时间相同时以后出现的 assignment 为准。
- Labels 为插件本地数据，不会自动导入旧 Tag；这是刻意的语义隔离，避免把历史流程状态错误迁移为 Labels。
- Workspace v1 字段在读取时兼容并规范化到 v2，因此无需用户手动迁移配置。

## 回滚方案 (Rollback Plan)

回滚本次工作区改动即可恢复旧 Kanban UI。由于没有修改 host Tag 数据库结构，Status 兼容层可直接退回旧 Tag 行为；新增 Labels 数据只存在插件配置中，旧代码会忽略它。

## 变更类型

- [x] ✨ New Feature
- [x] 📝 Documentation
- [x] 🚀 Refactoring
- [x] 🧪 Testing

## 文件变更列表

| 范围 | 变更类型 | 描述 |
|------|---------|------|
| `extensions/psm-kanban-board/board/` | 重构/修改 | Status 单值模型、Board/Card/Column/DnD/上下文菜单 |
| `extensions/psm-kanban-board/labels/` | 新增 | Labels store、Badge、管理 UI |
| `extensions/psm-kanban-board/views/` | 重构/修改 | Table、Roadmap、host column 的 Status/Labels 展示 |
| `extensions/psm-kanban-board/workspace/` | 重构/修改 | workspace v2 与旧字段兼容迁移 |
| `extensions/psm-kanban-board/__tests__/` | 修改/新增 | Status、Labels、workspace 与交互测试 |
| `extensions/psm-kanban-board/README.md` | 文档 | 数据模型和目录职责 |
| `extensions/psm-kanban-board/manifest.ts` | 修改 | Status / Labels 多语言文案 |
| `extensions/pi-session-bridge/src/` | 修改 | Status/Labels file store、`/kanban` TUI、LLM tools、兼容事件与测试 |
| `extensions/pi-session-bridge/README.md` | 文档 | bridge Status/Labels SSOT 与迁移策略 |

## 破坏性变更

- [x] 否。host Tag API/数据库契约保持不变，workspace 旧字段保留读取兼容。

## 性能影响

- [x] 无显著影响。Status 规范化与 Labels 查询均在当前 Kanban 数据规模内使用内存映射/集合处理。

## 依赖变更

- [x] 否，没有引入新依赖。

## 安全考虑

- [x] 无新增权限或外部数据通道；Labels 复用插件现有 config 权限。

## 文档变更

- [x] 已更新 `extensions/psm-kanban-board/README.md` 与 Workhub Issue/PR 记录。

## 代码审查检查清单

### 功能性
- [x] 代码实现了 Status / Labels 语义拆分
- [x] 旧多状态与 workspace v1 边界情况已处理
- [x] Labels CRUD/assignment 持久化已覆盖

### 代码质量
- [x] 插件目录按职责分层
- [x] 新模型/回调命名明确区分 Status 与 Labels
- [x] 旧语义标识扫描无遗留（兼容适配字段除外）

### 测试
- [x] 有对应单元与组件测试
- [x] 覆盖关键迁移与交互路径
- [x] 当前验证全部通过

## 审查日志

- **2026-09-02 14:59**: 自检完成。
  - Kanban 测试 27/27 通过。
  - extension typecheck 与完整应用 build 通过。
  - Status 菜单补充 `aria-label`，确保 compact badge 下仍有可访问名称。
- **2026-09-02 15:23**: bridge 同步与最终回归完成。
  - `/kanban`、`session_status`、`session_label` 共用 Status / Labels SSOT。
  - legacy 多 Tag assignment → 单 Status 的确定性兼容迁移已加入回归测试。
  - 相关 17 个测试文件 65 个测试、extension typecheck、完整 build、`git diff --check` 全通过。

## 最终状态

- **代码状态:** 已在工作区实现并验证，尚未 git commit / push
- **部署状态:** 未部署
