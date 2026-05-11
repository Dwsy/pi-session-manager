# Issue #4: 实现 Cmd+D 删除确认

**状态**: 📋 待实现
**优先级**: 中
**标签**: enhancement, keyboard-shortcut, ux
**创建时间**: 2026-05-11

---

## 📝 问题描述

在 `src/components/command/CommandPalette.tsx:125` 中，Cmd+D 快捷键已绑定但功能未实现：

```tsx
// Cmd+D → delete (placeholder for future)
if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
  e.preventDefault()
  // TODO: show delete confirmation
  return
}
```

用户按 Cmd+D 后没有任何反应。

## 🎯 期望行为

按 Cmd+D 后，显示删除确认对话框，确认后删除选中的会话。

### 用户体验流程

1. 用户打开 Command Palette (Cmd+K)
2. 搜索并选中一个会话
3. 按 Cmd+D
4. 显示删除确认对话框
5. 用户确认删除
6. 删除会话并关闭 Command Palette

## 💡 实现建议

### 方案 A: 复用现有的 DeleteSessionPopover
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
  e.preventDefault()
  if (selectedResult) {
    // 显示删除确认
    setDeleteTarget(selectedResult)
    setShowDeleteConfirm(true)
  }
  return
}
```

### 方案 B: 使用原生确认对话框
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
  e.preventDefault()
  if (selectedResult) {
    const confirmed = window.confirm(
      `确定要删除会话 "${selectedResult.title}" 吗？此操作不可撤销。`
    )
    if (confirmed) {
      deleteSession(selectedResult.id)
      setIsOpen(false)
    }
  }
  return
}
```

### 方案 C: 使用 Tauri 对话框插件
```tsx
import { confirm } from '@tauri-apps/plugin-dialog'

if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
  e.preventDefault()
  if (selectedResult) {
    const confirmed = await confirm(
      `确定要删除会话 "${selectedResult.title}" 吗？此操作不可撤销。`,
      { title: '删除会话', kind: 'warning' }
    )
    if (confirmed) {
      await deleteSession(selectedResult.id)
      setIsOpen(false)
    }
  }
  return
}
```

## 📊 影响范围

- **文件**: `src/components/command/CommandPalette.tsx`
- **依赖**: 删除会话 API、确认对话框组件
- **测试**: 需要添加快捷键测试和删除确认测试

## ✅ 验收标准

- [ ] Cmd+D 快捷键正常工作
- [ ] 选中会话后按 Cmd+D 显示删除确认
- [ ] 确认后删除会话
- [ ] 取消后不删除会话
- [ ] 如果没有选中会话，快捷键无效果
- [ ] 添加单元测试验证快捷键行为
- [ ] 更新用户文档说明快捷键

## 🔗 相关文件

- `src/components/command/CommandPalette.tsx:125`
- `src/components/dialogs/DeleteSessionPopover.tsx` (现有的删除确认)
- `src/browser-dataset/sessions.ts` (删除会话 API)

## 🔗 相关 Issue

- Issue #3: 实现 Cmd+E 编辑模式 (相关快捷键)

---

**创建人**: MiMo Agent
**来源**: TODO 清理任务
