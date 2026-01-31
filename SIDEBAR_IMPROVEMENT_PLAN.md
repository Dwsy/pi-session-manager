# 左侧边栏改进计划

## 问题分析

### 1. 树形结构显示问题
**原始 HTML 实现**:
```
├─ User: Hello
├─ Assistant: Response
│  └─ [1 tool call]
└─ User: Follow up
```

**当前实现**: 缺少树形连接线和视觉层次

### 2. 样式问题
- 字体大小: 原始 11px，当前可能不一致
- 行高: 原始 13px
- 缩进: 原始每层 3 个字符（`│  `）
- 连接符: `├─ `, `└─ `, `│`

### 3. 颜色方案
```css
--accent: #8abeb7;        /* 用户消息 */
--success: #b5bd68;       /* 助手消息 */
--muted: #808080;         /* 工具结果 */
--error: #cc6666;         /* 错误 */
--borderAccent: #00d7ff;  /* 压缩 */
--warning: #ffff00;       /* 分支摘要 */
--customMessageLabel: #9575cd; /* 自定义消息 */
```

## 改进方案

### Phase 1: 树形连接线实现

#### 1.1 扁平化树结构
需要计算每个节点的：
- `indent`: 缩进层级
- `showConnector`: 是否显示连接符
- `isLast`: 是否是最后一个子节点
- `gutters`: 垂直线位置数组

#### 1.2 构建前缀字符串
```typescript
function buildTreePrefix(flatNode) {
  const { indent, showConnector, isLast, gutters } = flatNode
  const connector = showConnector ? (isLast ? '└─ ' : '├─ ') : ''
  
  // 构建缩进 + 垂直线 + 连接符
  const prefixChars = []
  for (let i = 0; i < indent * 3; i++) {
    const level = Math.floor(i / 3)
    const posInLevel = i % 3
    
    if (gutters.includes(level)) {
      prefixChars.push(posInLevel === 0 ? '│' : ' ')
    } else if (connector && level === indent - 1) {
      if (posInLevel === 0) prefixChars.push(isLast ? '└' : '├')
      else if (posInLevel === 1) prefixChars.push('─')
      else prefixChars.push(' ')
    } else {
      prefixChars.push(' ')
    }
  }
  
  return prefixChars.join('')
}
```

### Phase 2: 样式优化

#### 2.1 CSS 变量对齐
```css
.tree-node {
  font-size: 11px;
  line-height: 13px;
  padding: 0 8px;
  white-space: nowrap;
  display: flex;
  align-items: baseline;
}

.tree-prefix {
  color: var(--muted);
  font-family: monospace;
  white-space: pre;
  flex-shrink: 0;
}

.tree-marker {
  color: var(--accent);
  flex-shrink: 0;
}

.tree-content {
  color: var(--text);
}
```

#### 2.2 角色颜色
```css
.tree-role-user { color: var(--accent); }
.tree-role-assistant { color: var(--success); }
.tree-role-tool { color: var(--muted); }
.tree-error { color: var(--error); }
.tree-compaction { color: var(--borderAccent); }
.tree-branch-summary { color: var(--warning); }
.tree-custom-message { color: var(--customMessageLabel); }
```

### Phase 3: 交互优化

#### 3.1 悬停效果
```css
.tree-node:hover {
  background: var(--selectedBg);
}

.tree-node.active {
  background: var(--selectedBg);
}

.tree-node.active .tree-content {
  font-weight: bold;
}
```

#### 3.2 活动路径高亮
```typescript
const activePathIds = useMemo(() => {
  if (!activeLeafId) return new Set<string>()
  
  const pathIds = new Set<string>()
  let currentId = activeLeafId
  
  while (currentId) {
    pathIds.add(currentId)
    const entry = entries.find(e => e.id === currentId)
    if (entry?.parentId) {
      currentId = entry.parentId
    } else {
      break
    }
  }
  
  return pathIds
}, [entries, activeLeafId])
```

## 实施步骤

### Step 1: 重构 flattenTree 函数
- [ ] 实现完整的树扁平化逻辑
- [ ] 计算 indent, showConnector, isLast, gutters
- [ ] 处理多根节点情况
- [ ] 优先显示包含活动节点的分支

### Step 2: 实现 buildTreePrefix 函数
- [ ] 生成树形连接线字符串
- [ ] 处理缩进和垂直线
- [ ] 处理连接符（├─ 和 └─）

### Step 3: 更新 TreeNode 组件
- [ ] 添加 tree-prefix 显示
- [ ] 添加 tree-marker（活动标记）
- [ ] 添加角色颜色类名
- [ ] 优化布局和对齐

### Step 4: 更新 CSS 样式
- [ ] 对齐字体大小和行高
- [ ] 添加角色颜色变量
- [ ] 优化悬停和活动状态
- [ ] 确保 monospace 字体

### Step 5: 测试和调优
- [ ] 测试多层嵌套
- [ ] 测试多根节点
- [ ] 测试搜索和过滤
- [ ] 测试活动路径高亮

## 预期效果

```
Session Start
├─ User: Hello
├─ Assistant: Hi there
│  └─ [1 tool call]
├─ User: How are you?
└─ Assistant: I'm doing well
   ├─ [tool: bash]
   └─ [tool: read]
```

## 参考代码位置

- 原始 HTML: `pi-session-*.html` (buildTree, flattenTree, buildTreePrefix)
- 当前实现: `src/components/SessionTree.tsx`
- 树节点: `src/components/TreeNode.tsx`
- 样式: `src/styles/session.css`

---

**优先级**: 🔴 高
**预计工作量**: 4-6 小时
**影响范围**: SessionTree, TreeNode, session.css
