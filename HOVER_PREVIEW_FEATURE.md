# 折叠内容悬浮预览功能

## 功能描述

为所有折叠的内容添加悬浮预览功能：
- 鼠标悬停在折叠提示上
- 等待 500ms 后自动显示完整内容
- 显示在浮动面板中
- 支持滚动查看长内容

## 实现方案

### 1. 创建 HoverPreview 组件

创建了一个通用的悬浮预览组件 `src/components/HoverPreview.tsx`：

**核心功能：**
- 延迟显示（默认 500ms）
- 智能定位（自动避免超出屏幕）
- Portal 渲染（避免被父容器裁剪）
- 平滑动画（淡入效果）
- 支持鼠标移入预览框（保持显示）

**使用方式：**
```tsx
<HoverPreview
  content={<div>触发元素</div>}
  previewContent={<div>预览内容</div>}
  delay={500}
  maxWidth={600}
  maxHeight={400}
/>
```

### 2. 添加样式

在 `src/index.css` 中添加了悬浮预览的样式：

```css
.hover-preview {
  background: #2a2b36;
  border: 1px solid rgba(138, 190, 183, 0.3);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  animation: fadeIn 0.2s ease-out;
}

.hover-preview-content {
  padding: 12px;
  overflow: auto;
  max-height: inherit;
  font-family: monospace;
  font-size: 11px;
  color: #d4d4d8;
}
```

### 3. 集成到各个组件

#### ExpandableOutput 组件
- 折叠的输出内容
- 悬停显示完整输出

#### ReadExecution 组件
- 折叠的文件内容
- 悬停显示完整文件内容
- 支持代码高亮

#### WriteExecution 组件
- 折叠的写入内容
- 悬停显示完整写入内容
- 支持代码高亮

#### EditExecution 组件
- 折叠的 diff 内容
- 悬停显示完整 diff
- 保留颜色高亮

#### GenericToolCall 组件
- 折叠的参数和输出
- 悬停显示完整内容

## 功能特性

### 1. 延迟显示
- 默认延迟 500ms
- 避免误触发
- 鼠标移开立即隐藏

### 2. 智能定位
```typescript
// 计算预览框的位置
let x = rect.left
let y = rect.bottom + 8

// 如果右侧空间不足，向左对齐
if (x + maxWidth > window.innerWidth) {
  x = window.innerWidth - maxWidth - 16
}

// 如果下方空间不足，显示在上方
if (y + maxHeight > window.innerHeight) {
  y = rect.top - maxHeight - 8
}
```

### 3. Portal 渲染
```typescript
createPortal(
  <div className="hover-preview">
    {previewContent}
  </div>,
  document.body
)
```

使用 Portal 将预览框渲染到 body 下，避免被父容器的 overflow 裁剪。

### 4. 平滑动画
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 5. 滚动支持
- 预览框内容可滚动
- 自定义滚动条样式
- 最大高度限制（默认 400px）

## 使用场景

### 1. 工具输出预览
```
bash: npm run build
[输出前 20 行]
... (50 more lines) ← 悬停显示完整输出
```

### 2. 文件内容预览
```
read: App.tsx
[文件前 20 行]
... (100 more lines) ← 悬停显示完整文件
```

### 3. Diff 预览
```
edit: utils.ts
[diff 前 20 行]
... (30 more lines) ← 悬停显示完整 diff
```

### 4. 参数预览
```
Arguments
{
  "path": "...",
  ...
}
... (10 more lines) ← 悬停显示完整参数
```

## 视觉效果

### 悬停前
```
┌─────────────────────────────────┐
│ bash: npm run build             │
├─────────────────────────────────┤
│ > build                         │
│ > tsc && vite build             │
│ ...                             │
│ ... (50 more lines) ← 鼠标悬停  │
└─────────────────────────────────┘
```

### 悬停后（500ms）
```
┌─────────────────────────────────┐
│ bash: npm run build             │
├─────────────────────────────────┤
│ > build                         │
│ > tsc && vite build             │
│ ...                             │
│ ... (50 more lines)             │
└─────────────────────────────────┘
        ↓
┌─────────────────────────────────┐ ← 浮动预览框
│ > build                         │
│ > tsc && vite build             │
│ src/App.tsx                     │
│ src/components/...              │
│ ...                             │
│ [滚动条]                        │
│ Build complete!                 │
└─────────────────────────────────┘
```

## 技术实现

### 1. 延迟逻辑
```typescript
const handleMouseEnter = (e: React.MouseEvent) => {
  // 计算位置
  setPosition({ x, y })
  
  // 延迟显示
  timeoutRef.current = setTimeout(() => {
    setIsVisible(true)
  }, delay)
}

const handleMouseLeave = () => {
  // 清除定时器
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current)
  }
  setIsVisible(false)
}
```

### 2. 位置计算
```typescript
const rect = element.getBoundingClientRect()
let x = rect.left
let y = rect.bottom + 8

// 边界检查
if (x + maxWidth > window.innerWidth) {
  x = window.innerWidth - maxWidth - 16
}

if (y + maxHeight > window.innerHeight) {
  y = rect.top - maxHeight - 8
}
```

### 3. 清理逻辑
```typescript
useEffect(() => {
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }
}, [])
```

## 修改的文件

1. **src/components/HoverPreview.tsx** - 新建悬浮预览组件
2. **src/index.css** - 添加悬浮预览样式
3. **src/components/ExpandableOutput.tsx** - 集成悬浮预览
4. **src/components/ReadExecution.tsx** - 集成悬浮预览
5. **src/components/WriteExecution.tsx** - 集成悬浮预览
6. **src/components/EditExecution.tsx** - 集成悬浮预览
7. **src/components/GenericToolCall.tsx** - 集成悬浮预览

## 配置选项

### HoverPreview 组件参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| content | ReactNode | - | 触发元素 |
| previewContent | ReactNode | - | 预览内容 |
| delay | number | 500 | 延迟时间（毫秒）|
| maxWidth | number | 600 | 最大宽度（像素）|
| maxHeight | number | 400 | 最大高度（像素）|

## 测试建议

1. **基本功能测试**:
   - 测试悬停触发
   - 测试延迟显示（500ms）
   - 测试鼠标移开隐藏
   - 测试鼠标移入预览框

2. **位置测试**:
   - 测试默认位置（下方）
   - 测试右侧空间不足（向左）
   - 测试下方空间不足（上方）
   - 测试边界情况

3. **内容测试**:
   - 测试短内容
   - 测试长内容（滚动）
   - 测试代码高亮
   - 测试 diff 颜色

4. **性能测试**:
   - 测试多个预览框
   - 测试快速移动鼠标
   - 测试大量内容

5. **交互测试**:
   - 测试点击展开
   - 测试预览框内滚动
   - 测试预览框外点击

## 未来改进

1. **自定义延迟**:
   - 支持不同组件使用不同延迟
   - 支持用户配置延迟时间

2. **更多定位选项**:
   - 支持左侧显示
   - 支持右侧显示
   - 支持自定义偏移

3. **动画增强**:
   - 支持不同的动画效果
   - 支持自定义动画时长

4. **键盘支持**:
   - 支持 Esc 关闭预览
   - 支持方向键滚动

5. **主题支持**:
   - 支持明暗主题
   - 支持自定义颜色

6. **性能优化**:
   - 虚拟滚动（大量内容）
   - 延迟渲染（仅在显示时渲染）
   - 缓存预览内容

## 相关文档

- HoverPreview 组件 API 文档
- 工具调用显示优化文档
- 代码块功能增强文档
