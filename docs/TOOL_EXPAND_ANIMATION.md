# 工具展开/收起动画实现

## 概述

为所有工具调用块添加了流畅的展开/收起动画，提升用户体验。

## 动画特性

### CSS 动画类

```css
.tool-expand-content {
  max-height: 0;
  opacity: 0;
  transform: translateY(-8px);
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s ease,
              transform 0.25s ease;
}

.tool-expand-content.expanded {
  max-height: 2000px;
  opacity: 1;
  transform: translateY(0);
}
```

### 动画效果

| 属性 | 展开 | 收起 | 时长 |
|------|------|------|------|
| **max-height** | 0 → 2000px | 2000px → 0 | 300ms |
| **opacity** | 0 → 1 | 1 → 0 | 250ms |
| **transform** | -8px → 0 | 0 → -8px | 250ms |

### 缓动函数

- `cubic-bezier(0.4, 0, 0.2, 1)` - 标准 Material Design 缓动
- 提供自然流畅的加减速效果

## 适用组件

所有工具执行组件已更新支持动画：

- ✅ `GenericToolCall` - 通用工具
- ✅ `BashExecution` - Bash 命令
- ✅ `ReadExecution` - 文件读取
- ✅ `WriteExecution` - 文件写入
- ✅ `EditExecution` - 文件编辑

## 使用方式

组件内部自动处理动画状态，无需额外配置：

```tsx
<div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
  {/* 内容 */}
</div>
```

## 性能优化

- 使用 `will-change` 提示浏览器优化
- `max-height` 使用足够大的值避免内容截断
- 动画仅影响 `opacity` 和 `transform`，触发 GPU 加速

## 设计灵感

> 「**重要的不是速度，而是节奏。**」—— *火影忍者*

动画不是越快越好，而是要有合适的节奏感。300ms 的展开时间既能让人感知到变化，又不会显得拖沓。

## 测试建议

1. 点击工具头部，观察展开动画是否流畅
2. 快速切换展开/收起，检查动画是否连贯
3. 在不同内容长度下测试动画效果
4. 检查移动端性能表现
