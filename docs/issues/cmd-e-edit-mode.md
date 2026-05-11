# Issue #3: 实现 Cmd+E 编辑模式

**状态**: 📋 待实现
**优先级**: 中
**标签**: enhancement, keyboard-shortcut, ux
**创建时间**: 2026-05-11

---

## 📝 问题描述

在 `src/components/command/CommandPalette.tsx:118` 中，Cmd+E 快捷键已绑定但功能未实现：

```tsx
// Cmd+E → edit (placeholder for future)
if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
  e.preventDefault()
  // TODO: open session in edit mode
  return
}
```

用户按 Cmd+E 后没有任何反应。

## 🎯 期望行为

按 Cmd+E 后，在编辑模式下打开选中的会话。

### 用户体验流程

1. 用户打开 Command Palette (Cmd+K)
2. 搜索并选中一个会话
3. 按 Cmd+E
4. 关闭 Command Palette
5. 在会话编辑器中打开选中的会话

## 💡 实现建议

### 方案 A: 跳转到会话编辑器
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
  e.preventDefault()
  if (selectedResult) {
    // 关闭 Command Palette
    setIsOpen(false)
    // 跳转到会话编辑器
    navigate(`/session/${selectedResult.id}/edit`)
  }
  return
}
```

### 方案 B: 在新标签页打开
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
  e.preventDefault()
  if (selectedResult) {
    window.open(`/session/${selectedResult.id}/edit`, '_blank')
  }
  return
}
```

### 方案 C: 打开会话查看器（高亮编辑按钮）
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
  e.preventDefault()
  if (selectedResult) {
    setIsOpen(false)
    // 打开会话查看器，并设置编辑模式标志
    navigate(`/session/${selectedResult.id}`, { state: { editMode: true } })
  }
  return
}
```

## 📊 影响范围

- **文件**: `src/components/command/CommandPalette.tsx`
- **依赖**: 会话编辑器组件、路由配置
- **测试**: 需要添加快捷键测试

## ✅ 验收标准

- [ ] Cmd+E 快捷键正常工作
- [ ] 选中会话后按 Cmd+E 打开会话编辑器
- [ ] Command Palette 自动关闭
- [ ] 如果没有选中会话，快捷键无效果
- [ ] 添加单元测试验证快捷键行为
- [ ] 更新用户文档说明快捷键

## 🔗 相关文件

- `src/components/command/CommandPalette.tsx:118`
- `src/components/SessionViewer.tsx` (会话查看器)
- `src/App.tsx` (路由配置)

## 🔗 相关 Issue

- Issue #4: 实现 Cmd+D 删除确认 (相关快捷键)

---

**创建人**: MiMo Agent
**来源**: TODO 清理任务
