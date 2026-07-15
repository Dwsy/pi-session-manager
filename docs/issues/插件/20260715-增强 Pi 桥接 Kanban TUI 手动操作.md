---
id: "2026-07-15-增强 Pi 桥接 Kanban TUI 手动操作"
title: "增强 Pi 桥接 Kanban TUI 手动操作"
status: "todo"
created: "2026-07-15"
updated: "2026-07-15"
category: "插件"
tags: ["workhub", "pi-session-bridge", "kanban", "tui"]
---

# Issue: 增强 Pi 桥接 Kanban TUI 手动操作

## Goal

在 `extensions/pi-session-bridge/` 内补齐无需 AI 参与的 Kanban TUI，让用户可通过键盘浏览、选择并操作会话卡片。

## 背景/问题

当前 `/psm` 只提供当前会话的标签开关和清空操作。它没有 Kanban 列/卡片视图，也没有明确的“从源列移动到目标列”交互；AI 工具 `session_tag` 反而拥有创建和修改标签的能力。用户要求把人工操作提升为一等入口。

真实存储链路为：

```text
/psm 或 session_tag
  -> kanban-store.ts
  -> ~/.pi/pi-session-manager/tags_config.json
  -> ~/.pi/pi-session-manager/session_mark.json
```

本任务实现代码限定在 `extensions/pi-session-bridge/`，不修改 PSM 主应用的 Kanban UI 或 Rust 后端。

## 验收标准 (Acceptance Criteria)

- [ ] WHEN 用户在 Pi TUI 执行 `/psm`，系统 SHALL 提供明确的 Kanban 人工入口。
- [ ] WHEN 用户浏览 Kanban，系统 SHALL 支持纯键盘选择列与会话卡片，并显示当前选择和按键提示。
- [ ] WHEN 用户移动卡片，系统 SHALL 使用 `moveSessionTag(sessionId, fromTagId, toTagId, position)` 的源列到目标列语义。
- [ ] WHEN 用户取消操作，系统 SHALL 不修改任何标签或会话状态。
- [ ] IF 当前模式不是 TUI，THEN 系统 SHALL 给出明确提示，不调用 TUI 自定义组件。
- [ ] WHERE AI 使用 `session_tag`，系统 SHALL 保留现有工具兼容性。
- [ ] WHERE 代码发生变更，系统 SHALL 仅修改 `extensions/pi-session-bridge/` 下直接相关文件。

## 实施阶段

### Phase 1: 规划和准备
- [x] 定位 `/psm`、`session_tag`、Kanban 存储与测试文件
- [x] 确认现有人工入口仅操作当前会话标签
- [ ] 确认 TUI 范围与卡片选择后的动作

### Phase 2: 执行
- [ ] 添加 Kanban TUI 组件或最小选择流程
- [ ] 将入口接入 `/psm`
- [ ] 复用现有 Kanban 存储契约，保持 AI 工具兼容
- [ ] 添加人工交互与移动语义测试

### Phase 3: 验证
- [ ] 运行扩展相关 Vitest
- [ ] 运行扩展 TypeScript 检查
- [ ] 运行扩展构建/加载检查
- [ ] 审查最终 diff 只涉及目标目录

## 关键决策

| 决策 | 理由 |
|------|------|
| 实现范围限定在 `extensions/pi-session-bridge/` | 用户明确指定目标目录，避免扩大主应用改动 |
| 复用 `kanban-store.ts` | 人工与 AI 操作必须共享同一数据源和语义 |
| 不以现有 `session_tag_changed` 事件作为正确性前提 | 当前 PSM 接收链路没有可靠消费该事件 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-07-15 | 旧 `PI_SESSION_BRIDGE_SOT.md` 描述为单文件扩展 | 以当前目录源码和 `package.json#pi.extensions` 为准 |

## 相关资源

- [x] Pi 扩展文档: `docs/extensions.md`
- [x] Pi TUI 文档: `docs/tui.md`
- [x] 扩展入口: `extensions/pi-session-bridge/src/index.ts`
- [x] 命令入口: `extensions/pi-session-bridge/src/commands.ts`
- [x] Kanban 存储: `extensions/pi-session-bridge/src/kanban-store.ts`
- [x] AI 标签工具: `extensions/pi-session-bridge/src/tools.ts`

## Notes

待用户确认：

1. TUI 是“当前会话状态选择器”，还是“所有会话的完整列/卡片浏览器”。
2. 选中卡片后的主要动作是移动状态、切换 Pi 会话、打开 PSM，还是这些动作的组合。
3. 是否纳入标签列创建；重命名、删除和排序默认不在本次最小范围内。

---

## Status 更新日志

- **2026-07-15**: 状态保持 todo，备注: 已完成源码调查，等待交互范围确认。
