# 侧边栏美化方案

## 问题分析

### 1. 拖拽手柄太丑 🔴
- 竖线太粗、太明显
- 颜色太突兀
- 悬停效果不够优雅

### 2. 间距问题 🔴
- 节点之间间距可能不够
- 搜索框和过滤器间距需要调整
- 整体留白不够

### 3. 颜色对比度 🔴
- 背景色可能太暗
- 文字颜色对比度不够
- 高亮颜色不够柔和

### 4. 缺少细节打磨 🔴
- 没有微妙的阴影
- 没有圆角
- 过渡动画不够流畅

## 美化方案

### 1. 优化拖拽手柄

**改进前**:
```css
.sidebar-resize-handle-inner {
  width: 2px;
  height: 40px;
  background: #666666;
}
```

**改进后**:
```css
.sidebar-resize-handle {
  width: 4px;  /* 更窄 */
  background: transparent;
}

.sidebar-resize-handle-inner {
  width: 1px;  /* 更细 */
  height: 32px;  /* 更短 */
  background: rgba(138, 190, 183, 0.2);  /* 更透明 */
  opacity: 0;  /* 默认隐藏 */
  transition: all 0.2s ease;
}

.sidebar-resize-handle:hover .sidebar-resize-handle-inner {
  opacity: 1;
  background: rgba(138, 190, 183, 0.6);
  height: 48px;
}
```

### 2. 优化间距和留白

```css
.sidebar-controls {
  padding: 12px;  /* 增加内边距 */
}

.sidebar-filters {
  padding: 8px 12px 12px 12px;  /* 调整间距 */
  gap: 6px;  /* 增加按钮间距 */
}

.tree-node {
  padding: 2px 12px;  /* 增加垂直间距 */
  margin: 1px 0;  /* 添加节点间距 */
}

.tree-container {
  padding: 8px 0;  /* 增加容器内边距 */
}
```

### 3. 优化颜色方案

```css
/* 更柔和的背景色 */
.session-sidebar {
  background: #2a2b36;  /* 稍微亮一点 */
}

/* 更好的对比度 */
.tree-content {
  color: #d4d4d8;  /* 更亮的文字 */
}

/* 更柔和的高亮 */
.tree-node:hover {
  background: rgba(138, 190, 183, 0.08);  /* 更透明 */
}

.tree-node.active {
  background: rgba(138, 190, 183, 0.12);
}

/* 更柔和的边框 */
.session-sidebar {
  border-right: 1px solid rgba(138, 190, 183, 0.15);
}
```

### 4. 添加细节打磨

```css
/* 圆角 */
.sidebar-search {
  border-radius: 6px;  /* 更圆润 */
}

.filter-btn {
  border-radius: 4px;
}

/* 微妙的阴影 */
.sidebar-search:focus {
  box-shadow: 0 0 0 2px rgba(138, 190, 183, 0.2);
}

/* 更流畅的过渡 */
.tree-node {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 更好的滚动条 */
.tree-container::-webkit-scrollbar {
  width: 8px;
}

.tree-container::-webkit-scrollbar-track {
  background: transparent;
}

.tree-container::-webkit-scrollbar-thumb {
  background: rgba(138, 190, 183, 0.2);
  border-radius: 4px;
}

.tree-container::-webkit-scrollbar-thumb:hover {
  background: rgba(138, 190, 183, 0.4);
}
```

### 5. 优化字体渲染

```css
.tree-node {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  letter-spacing: 0.01em;  /* 微调字间距 */
}

.tree-prefix {
  opacity: 0.6;  /* 降低连接线的视觉权重 */
}
```

## 实施优先级

### 高优先级 🔴
1. 优化拖拽手柄（默认隐藏，悬停显示）
2. 调整间距和留白
3. 优化颜色对比度

### 中优先级 🟡
4. 添加圆角和阴影
5. 优化过渡动画
6. 美化滚动条

### 低优先级 🟢
7. 字体渲染优化
8. 微调细节

## 参考设计

### VS Code 侧边栏
- 简洁的拖拽手柄
- 柔和的颜色过渡
- 精致的间距

### GitHub 文件树
- 清晰的层次结构
- 优雅的悬停效果
- 流畅的动画

### Notion 侧边栏
- 微妙的阴影
- 圆润的圆角
- 舒适的留白

---

**优先级**: 🔴 高
**预计工作量**: 2-3 小时
**影响范围**: session.css
