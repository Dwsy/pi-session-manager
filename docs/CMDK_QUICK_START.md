# cmdk 快速开始指南

## 🚀 快速开始

本指南帮助你快速了解 cmdk 全局搜索功能的设计和实施步骤。

---

## 📖 5 分钟了解设计

### 核心概念

1. **命令面板**: 使用 `Cmd+K` 快速打开的全局搜索界面
2. **插件系统**: 可扩展的搜索功能架构
3. **高性能**: 防抖、虚拟滚动、缓存优化
4. **美观 UI**: 现代化设计，流畅动画

### 用户体验

```
用户按下 Cmd+K
    ↓
弹出命令面板（居中，半透明背景）
    ↓
输入 "auth"
    ↓
实时显示搜索结果（防抖 300ms）
    ├─ 💬 消息搜索: "auth implementation..."
    ├─ 📁 项目搜索: "/auth-service"
    └─ 📄 会话搜索: "auth session"
    ↓
按 ↑↓ 导航，Enter 选择
    ↓
打开对应的会话/项目
```

### 技术栈

- **cmdk**: 命令面板核心库
- **React + TypeScript**: UI 框架
- **Tailwind CSS**: 样式系统
- **@tanstack/react-virtual**: 虚拟滚动

---

## 📁 文件结构速览

```
src/
├── components/command/          # UI 组件
│   ├── CommandPalette.tsx       # 容器（快捷键、遮罩）
│   ├── CommandMenu.tsx          # 主组件（搜索框、结果列表）
│   ├── CommandItem.tsx          # 结果项
│   ├── CommandEmpty.tsx         # 空状态
│   └── CommandLoading.tsx       # 加载状态
│
├── hooks/                       # 状态管理
│   ├── useCommandMenu.ts        # 面板状态（open/close/query）
│   ├── useSearchPlugins.ts      # 插件管理（search/registry）
│   └── useSearchCache.ts        # 搜索缓存（LRU）
│
├── plugins/                     # 插件系统
│   ├── types.ts                 # 接口定义
│   ├── registry.ts              # 插件注册表
│   ├── base/
│   │   └── BaseSearchPlugin.ts  # 插件基类
│   ├── message/
│   │   └── MessageSearchPlugin.ts
│   ├── project/
│   │   └── ProjectSearchPlugin.ts
│   └── session/
│       └── SessionSearchPlugin.ts
│
└── utils/                       # 工具函数
    ├── highlight.ts             # 高亮匹配文本
    └── search.ts                # 搜索工具
```

---

## 🔌 插件系统速览

### 插件接口

```typescript
interface SearchPlugin {
  id: string                     // 唯一标识
  name: string                   // 显示名称
  icon: React.ComponentType      // 图标
  priority: number               // 优先级（0-100）
  
  // 核心方法
  search(query, context): Promise<SearchPluginResult[]>
  onSelect(result, context): void
}
```

### 内置插件

| 插件 | ID | 优先级 | 功能 |
|------|----|----|------|
| 💬 消息搜索 | message-search | 80 | 搜索用户消息和助手回复 |
| 📁 项目搜索 | project-search | 70 | 搜索项目路径 |
| 📄 会话搜索 | session-search | 60 | 搜索会话名称和元数据 |

### 创建自定义插件

```typescript
// 1. 继承基类
class MyPlugin extends BaseSearchPlugin {
  id = 'my-plugin'
  name = 'My Plugin'
  icon = MyIcon
  priority = 50
  
  // 2. 实现搜索
  async search(query: string, context: SearchContext) {
    // 你的搜索逻辑
    return [
      {
        id: 'result-1',
        pluginId: this.id,
        title: 'Result 1',
        score: 0.9
      }
    ]
  }
  
  // 3. 实现选中处理
  onSelect(result: SearchPluginResult, context: SearchContext) {
    // 你的处理逻辑
    console.log('Selected:', result)
  }
}

// 4. 注册插件
pluginRegistry.register(new MyPlugin())
```

---

## ⚡ 性能优化速览

### 搜索优化

```typescript
// 防抖 300ms
useEffect(() => {
  const timer = setTimeout(() => {
    search(query)
  }, 300)
  return () => clearTimeout(timer)
}, [query])

// 取消未完成的搜索
const abortController = new AbortController()
// ... 搜索逻辑
abortController.abort()

// 并行搜索
const results = await Promise.all([
  plugin1.search(query, context),
  plugin2.search(query, context),
  plugin3.search(query, context)
])
```

### 渲染优化

```typescript
// 虚拟滚动（超过 50 条）
const virtualizer = useVirtualizer({
  count: results.length,
  estimateSize: () => 60,
  enabled: results.length > 50
})

// React.memo
const CommandItem = React.memo(({ result }) => {
  // ...
})
```

### 缓存优化

```typescript
// LRU 缓存
const cache = new Map<string, CacheEntry>()

function get(query: string) {
  const entry = cache.get(query)
  if (entry && Date.now() - entry.timestamp < 5 * 60 * 1000) {
    return entry.results
  }
  return null
}

function set(query: string, results: SearchPluginResult[]) {
  if (cache.size >= 100) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
  cache.set(query, { results, timestamp: Date.now() })
}
```

---

## 🎨 UI 设计速览

### 布局

```tsx
<div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50">
  <div className="w-full max-w-2xl max-h-[60vh] bg-[#1a1b26] rounded-lg">
    <CommandMenu />
  </div>
</div>
```

### 颜色

```css
/* 暗色主题 */
--background: #1a1b26
--border: #2a2b36
--input: #252636
--selected: #2a2b36
--text: #c0caf5
--muted: #565f89
--highlight: #7aa2f7
```

### 动画

```css
/* 打开动画 */
.animate-in {
  animation: fadeIn 200ms ease-out, zoomIn 200ms ease-out;
}

/* 高亮 */
mark {
  background: rgba(122, 162, 247, 0.2);
  color: #7aa2f7;
}
```

---

## 🛠️ 实施步骤

### Phase 1: 准备（已完成 ✅）

- [x] 设计架构
- [x] 编写文档
- [x] 制定计划

### Phase 2: 核心架构（1 天）

```bash
# 1. 安装依赖
pnpm add cmdk

# 2. 创建目录
mkdir -p src/components/command
mkdir -p src/plugins/{base,message,project,session}
mkdir -p src/hooks

# 3. 创建文件
touch src/plugins/types.ts
touch src/plugins/registry.ts
touch src/hooks/useCommandMenu.ts
touch src/components/command/CommandPalette.tsx
```

### Phase 3: 内置插件（1 天）

```typescript
// 实现 MessageSearchPlugin
export class MessageSearchPlugin extends BaseSearchPlugin {
  // ...
}

// 实现 ProjectSearchPlugin
export class ProjectSearchPlugin extends BaseSearchPlugin {
  // ...
}

// 实现 SessionSearchPlugin
export class SessionSearchPlugin extends BaseSearchPlugin {
  // ...
}
```

### Phase 4: UI/UX（0.5 天）

```css
/* 创建 command.css */
[cmdk-root] { /* ... */ }
[cmdk-input] { /* ... */ }
[cmdk-list] { /* ... */ }
```

### Phase 5: 性能优化（0.5 天）

```typescript
// 实现虚拟滚动
const virtualizer = useVirtualizer({ /* ... */ })

// 实现缓存
const cache = useSearchCache()
```

### Phase 6: 集成测试（1 天）

```typescript
// App.tsx
import CommandPalette from './components/command/CommandPalette'
import { registerBuiltinPlugins } from './plugins'

function App() {
  useEffect(() => {
    registerBuiltinPlugins()
  }, [])
  
  return (
    <>
      {/* 现有组件 */}
      <CommandPalette />
    </>
  )
}
```

### Phase 7: 文档交付（0.5 天）

```bash
# 更新文档
vim README.md
vim docs/PLUGIN_DEVELOPMENT.md

# 创建 PR
bun ~/.pi/agent/skills/workhub/lib.ts create pr "Add cmdk global search"
```

---

## ✅ 验收清单

### 功能测试

- [ ] 按 Cmd+K 打开命令面板
- [ ] 输入查询显示结果
- [ ] 选择结果导航正确
- [ ] 按 ESC 关闭面板
- [ ] 键盘导航流畅

### 性能测试

- [ ] 搜索响应 < 300ms（1000 条数据）
- [ ] 首次渲染 < 100ms
- [ ] 虚拟滚动流畅（60fps）
- [ ] 内存占用 < 50MB

### UI 测试

- [ ] 面板居中显示
- [ ] 背景遮罩半透明
- [ ] 动画流畅
- [ ] 高亮匹配文本
- [ ] 响应式设计

### 国际化测试

- [ ] 中英文切换
- [ ] 所有文本已翻译

---

## 📚 相关文档

| 文档 | 描述 |
|------|------|
| [Issue](./issues/20260131-Add%20cmdk%20global%20search%20with%20plugin%20architecture.md) | 任务追踪 |
| [架构设计](./architecture/cmdk-plugin-system.md) | 详细架构设计 |
| [实施计划](./CMDK_IMPLEMENTATION_PLAN.md) | 分阶段实施计划 |
| [设计总结](./CMDK_DESIGN_SUMMARY.md) | 设计概览 |
| [架构图](./CMDK_ARCHITECTURE_DIAGRAM.md) | 可视化架构图 |

---

## 🎯 下一步

1. **开始实施**: Phase 2（核心架构）
2. **安装依赖**: `pnpm add cmdk`
3. **创建文件**: 按照文件结构创建
4. **实现插件**: 从 MessageSearchPlugin 开始

**预计完成**: 2026-02-05

---

## 💡 提示

### 开发技巧

1. **先实现核心，再优化**: 先让功能跑起来，再做性能优化
2. **测试驱动**: 每完成一个 Phase 就测试
3. **参考设计**: 参考 Vercel、Linear 的命令面板设计
4. **性能监控**: 使用 React DevTools Profiler 监控性能

### 常见问题

**Q: 如何调试插件？**
A: 在插件的 `search()` 方法中添加 `console.log`，查看搜索过程。

**Q: 如何优化搜索速度？**
A: 使用防抖、缓存、并行搜索，参考 Phase 5。

**Q: 如何自定义样式？**
A: 修改 `command.css` 和 Tailwind 类名。

**Q: 如何添加新插件？**
A: 继承 `BaseSearchPlugin`，实现 `search()` 和 `onSelect()`，然后注册。

---

## 🎉 总结

本设计提供了一个完整的、可扩展的 cmdk 全局搜索系统：

- ✅ 插件式架构，易于扩展
- ✅ 高性能优化
- ✅ 美观的 UI 设计
- ✅ 完善的文档

**开始实施吧！** 🚀

---

*快速开始指南 - 2026-01-31*
