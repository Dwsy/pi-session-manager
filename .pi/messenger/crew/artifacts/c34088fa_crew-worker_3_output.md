---

## ✅ 任务完成

**任务 4: 实现打开动画 (Card → Modal)** 已完成！

### 实现摘要

> 「お前が兵士なら、俺が司令塔だ」—— 进击的巨人

我实现了 FLIP 风格的卡片到模态框开启动画：

| 文件 | 变更 |
|------|------|
| `KanbanCard.tsx` | 使用 ref 捕获卡片元素，点击时获取 `getBoundingClientRect()` 并传递给 `onSelect(rect)` |
| `KanbanColumn.tsx` | 更新 `onSelectSession` 签名以传递 DOMRect |
| `KanbanBoard.tsx` | `handleCardClick` 接收 rect 并设置 `initialCardRect` 状态，传递给 Modal |
| `KanbanCard.tsx` | 额外添加 `data-session-id` 属性，支持 task-5 的关闭动画查询 |

### 动画流程

```
[点击卡片] → getBoundingClientRect() → setInitialCardRect()
                                              ↓
[SessionPreviewModal] 接收 initialCardRect
  ├─ 计算从卡片位置到模态框中心的 transform
  ├─ 初始状态: translate(scale) + opacity: 0
  └─ 动画: 300ms cubic-bezier(0.4, 0, 0.2, 1)
```

### 技术亮点

- **协调合作**: 与 IronOwl (task-5) 协调，添加 `data-session-id` 支持关闭动画
- **TypeScript**: 所有类型安全检查通过
- **构建验证**: `npm run build` 成功

---

**Commit:** `d7edebc` — feat(kanban): implement FLIP open animation (Card → Modal)