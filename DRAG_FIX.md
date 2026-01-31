# 拖拽宽度问题修复 ✅

## 问题描述

**用户反馈**: "每次拖拽宽度就变成最宽的了"

## 问题分析

### 原始代码问题

```typescript
const handleMouseMove = (e: MouseEvent) => {
  const newWidth = e.clientX  // ❌ 直接使用鼠标的 X 坐标
  if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
    setSidebarWidth(newWidth)
  }
}
```

**问题**:
- `e.clientX` 是鼠标相对于视口左边缘的绝对位置
- 如果侧边栏从左边开始，这个值理论上应该等于侧边栏宽度
- 但是在实际使用中，这会导致宽度跳变

**为什么会变成最宽**:
- 用户点击拖拽手柄时，`e.clientX` 可能已经接近或等于当前侧边栏宽度
- 如果用户稍微向右移动鼠标，`e.clientX` 就会增加
- 由于没有记录起始位置，每次移动都会导致宽度跳变

## 解决方案

### 正确的拖拽逻辑

```typescript
// 1. 添加 ref 记录起始状态
const startXRef = useRef(0)
const startWidthRef = useRef(0)

// 2. 在 mousedown 时记录起始位置和宽度
const handleMouseDown = useCallback((e: React.MouseEvent) => {
  e.preventDefault()
  setIsResizing(true)
  startXRef.current = e.clientX        // 记录起始 X 坐标
  startWidthRef.current = sidebarWidth  // 记录起始宽度
}, [sidebarWidth])

// 3. 在 mousemove 时计算偏移量
const handleMouseMove = (e: MouseEvent) => {
  const deltaX = e.clientX - startXRef.current  // 计算偏移量
  const newWidth = startWidthRef.current + deltaX  // 新宽度 = 起始宽度 + 偏移量
  
  if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
    setSidebarWidth(newWidth)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, newWidth.toString())
  }
}
```

### 关键改进

1. **记录起始状态**
   - `startXRef.current` - 记录鼠标按下时的 X 坐标
   - `startWidthRef.current` - 记录侧边栏的初始宽度

2. **计算偏移量**
   - `deltaX = e.clientX - startXRef.current`
   - 偏移量 = 当前鼠标位置 - 起始鼠标位置

3. **计算新宽度**
   - `newWidth = startWidthRef.current + deltaX`
   - 新宽度 = 起始宽度 + 偏移量

## 效果对比

### 修复前 ❌
- 点击拖拽手柄，宽度立即跳变
- 向右拖动，宽度变成最大值
- 向左拖动，宽度变成最小值
- 无法精确控制宽度

### 修复后 ✅
- 点击拖拽手柄，宽度不变
- 向右拖动，宽度平滑增加
- 向左拖动，宽度平滑减少
- 可以精确控制宽度

## 测试步骤

1. 打开应用，打开侧边栏
2. 将鼠标移到侧边栏右边缘
3. 看到拖拽手柄渐显
4. 按住鼠标左键
5. 向右拖动 - 宽度应该平滑增加
6. 向左拖动 - 宽度应该平滑减少
7. 释放鼠标 - 宽度保持
8. 刷新页面 - 宽度应该保持（localStorage）

## 技术细节

### 使用 useRef 而不是 useState

**为什么使用 useRef**:
```typescript
const startXRef = useRef(0)  // ✅ 不会触发重新渲染
const startWidthRef = useRef(0)
```

**而不是**:
```typescript
const [startX, setStartX] = useState(0)  // ❌ 会触发重新渲染
const [startWidth, setStartWidth] = useState(0)
```

**原因**:
- `useRef` 的值改变不会触发组件重新渲染
- 拖拽过程中不需要重新渲染
- 只需要在 `mousemove` 时读取这些值

### 依赖数组

```typescript
const handleMouseDown = useCallback((e: React.MouseEvent) => {
  // ...
}, [sidebarWidth])  // 依赖 sidebarWidth
```

**为什么需要依赖 sidebarWidth**:
- 每次 `sidebarWidth` 改变时，需要更新 `handleMouseDown`
- 确保 `startWidthRef.current` 总是最新的值

## 相关文件

- `src/components/SessionViewer.tsx` - 修复的文件
- `SIDEBAR_FIXES_COMPLETE.md` - 之前的修复文档
- `SIDEBAR_FINAL_SUMMARY.md` - 完整总结

## 下一步

1. 测试拖拽功能
2. 确认宽度保存正常
3. 检查边界情况（最小/最大宽度）

---

**修复完成**: 2026-01-31 17:00:00
**修复人员**: Pi Agent
**状态**: ✅ 完成，待测试
