---
id: "2026-01-31-Add cmdk global search with plugin architecture"
title: "Add cmdk Global Search with Plugin Architecture"
status: "todo"
created: "2026-01-31"
updated: "2026-01-31"
category: "feature"
tags: ["cmdk", "search", "plugin", "ui", "performance"]
---

# Issue: Add cmdk Global Search with Plugin Architecture

## Goal

实现基于 cmdk 库的全局搜索功能，支持插件式架构，提供美观、高性能的命令面板体验。

## 背景/问题

**当前问题：**
1. 现有 SearchPanel 组件功能单一，只支持内容搜索
2. 搜索功能不够直观，需要在特定视图下才能使用
3. 缺乏全局快捷键访问
4. 无法扩展其他搜索功能（如项目搜索、命令搜索等）

**用户需求：**
1. 全局快捷键（Cmd+K）快速访问搜索
2. 支持多种搜索范围：用户消息、项目、会话
3. 插件式架构，方便扩展其他搜索功能
4. 美观的 UI 设计，符合现代应用标准
5. 高性能，支持大量数据搜索

**技术目标：**
- 使用 cmdk 库（Command Menu）
- 设计可扩展的插件系统
- 优化搜索性能（防抖、虚拟滚动、缓存）
- 保持与现有架构的兼容性

## 验收标准 (Acceptance Criteria)

### 功能性
- [ ] WHEN 用户按下 `Cmd+K` (macOS) 或 `Ctrl+K` (Windows/Linux)，系统 SHALL 打开命令面板
- [ ] WHEN 用户输入搜索关键词，系统 SHALL 实时显示匹配结果（防抖 300ms）
- [ ] WHEN 用户选择搜索结果，系统 SHALL 导航到对应的会话/项目
- [ ] WHERE 搜索结果超过 50 条，系统 SHALL 使用虚拟滚动优化性能
- [ ] IF 用户按下 `Escape`，THEN 系统 SHALL 关闭命令面板

### 插件系统
- [ ] 系统 SHALL 支持注册自定义搜索插件
- [ ] 系统 SHALL 提供以下内置插件：
  - [ ] MessageSearchPlugin - 搜索用户消息内容
  - [ ] ProjectSearchPlugin - 搜索项目
  - [ ] SessionSearchPlugin - 搜索会话
- [ ] 每个插件 SHALL 支持自定义图标、描述、优先级
- [ ] 插件 SHALL 支持自定义结果渲染

### UI/UX
- [ ] 命令面板 SHALL 居中显示，带半透明背景遮罩
- [ ] 搜索框 SHALL 显示占位符和快捷键提示
- [ ] 搜索结果 SHALL 按插件分组显示
- [ ] 匹配文本 SHALL 高亮显示
- [ ] 系统 SHALL 显示加载状态和空状态
- [ ] 动画 SHALL 平滑自然（fade in/out, slide）

### 性能
- [ ] 搜索响应时间 SHALL < 300ms（1000 条数据）
- [ ] 首次渲染时间 SHALL < 100ms
- [ ] 内存占用 SHALL < 50MB（10000 条结果缓存）

### 国际化
- [ ] 所有文本 SHALL 支持中英文切换
- [ ] 快捷键提示 SHALL 根据操作系统显示（Cmd/Ctrl）

## 实施阶段

### Phase 1: 规划和准备 ✅
- [x] 分析现有代码结构
- [x] 设计插件系统架构
- [x] 确定技术方案和依赖
- [x] 制定实施计划

### Phase 2: 核心架构实现
- [ ] 安装 cmdk 依赖
- [ ] 创建插件系统基础设施
  - [ ] 定义 `SearchPlugin` 接口
  - [ ] 实现插件注册表 `PluginRegistry`
  - [ ] 创建 `useSearchPlugins` hook
- [ ] 创建 cmdk 核心组件
  - [ ] `CommandMenu.tsx` - 主组件
  - [ ] `CommandPalette.tsx` - 容器组件
  - [ ] `CommandItem.tsx` - 结果项组件
  - [ ] `CommandEmpty.tsx` - 空状态组件
- [ ] 实现 `useCommandMenu` hook（状态管理）

### Phase 3: 内置插件实现
- [ ] 实现 `MessageSearchPlugin`
  - [ ] 集成现有 `search_sessions` API
  - [ ] 实现结果格式化
  - [ ] 实现选中处理
- [ ] 实现 `ProjectSearchPlugin`
  - [ ] 基于 `sessions_by_project` 数据
  - [ ] 实现项目列表搜索
  - [ ] 实现项目导航
- [ ] 实现 `SessionSearchPlugin`
  - [ ] 基于 `SessionInfo` 数据
  - [ ] 支持按名称、路径、时间搜索
  - [ ] 实现会话导航

### Phase 4: UI/UX 优化
- [ ] 设计命令面板样式
  - [ ] 使用 Tailwind CSS
  - [ ] 参考 Vercel/Linear 设计
  - [ ] 支持暗色主题
- [ ] 实现动画效果
  - [ ] 打开/关闭动画
  - [ ] 结果列表动画
  - [ ] 加载状态动画
- [ ] 实现高亮匹配文本
- [ ] 实现键盘导航优化

### Phase 5: 性能优化
- [ ] 实现搜索防抖（300ms）
- [ ] 集成虚拟滚动（@tanstack/react-virtual）
- [ ] 实现结果缓存（LRU cache）
- [ ] 优化插件加载（懒加载）
- [ ] 实现搜索请求取消

### Phase 6: 集成和测试
- [ ] 集成到 App.tsx
- [ ] 添加全局快捷键（Cmd+K）
- [ ] 测试所有插件功能
- [ ] 测试性能指标
- [ ] 测试国际化
- [ ] 测试键盘导航
- [ ] 测试边界情况

### Phase 7: 文档和交付
- [ ] 更新 README.md
- [ ] 编写插件开发文档
- [ ] 添加使用示例
- [ ] 创建 PR
- [ ] 代码审查
- [ ] 合并主分支

## 架构设计

### 目录结构

```
src/
├── components/
│   ├── command/
│   │   ├── CommandMenu.tsx          # cmdk 主组件
│   │   ├── CommandPalette.tsx       # 命令面板容器
│   │   ├── CommandItem.tsx          # 命令项组件
│   │   ├── CommandEmpty.tsx         # 空状态组件
│   │   └── index.ts                 # 导出
│   └── ...
├── hooks/
│   ├── useCommandMenu.ts            # cmdk 状态管理
│   └── useSearchPlugins.ts          # 插件管理
├── plugins/
│   ├── types.ts                     # 插件接口定义
│   ├── registry.ts                  # 插件注册表
│   ├── MessageSearchPlugin.ts       # 消息搜索插件
│   ├── ProjectSearchPlugin.ts       # 项目搜索插件
│   ├── SessionSearchPlugin.ts       # 会话搜索插件
│   └── index.ts                     # 导出
└── styles/
    └── command.css                  # cmdk 自定义样式
```

### 插件系统接口

```typescript
// plugins/types.ts
export interface SearchPlugin {
  // 元数据
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  keywords: string[]
  priority: number
  
  // 搜索方法
  search(query: string, context: SearchContext): Promise<SearchPluginResult[]>
  
  // 选中处理
  onSelect(result: SearchPluginResult, context: SearchContext): void
  
  // 自定义渲染（可选）
  renderItem?(result: SearchPluginResult): React.ReactNode
  
  // 生命周期（可选）
  onMount?(): void
  onUnmount?(): void
}

export interface SearchContext {
  sessions: SessionInfo[]
  selectedProject: string | null
  selectedSession: SessionInfo | null
  setSelectedSession: (session: SessionInfo | null) => void
  setSelectedProject: (project: string | null) => void
}

export interface SearchPluginResult {
  id: string
  pluginId: string
  title: string
  subtitle?: string
  description?: string
  icon?: React.ReactNode
  metadata?: Record<string, any>
  score: number
}

// plugins/registry.ts
export class PluginRegistry {
  private plugins: Map<string, SearchPlugin>
  
  register(plugin: SearchPlugin): void
  unregister(pluginId: string): void
  get(pluginId: string): SearchPlugin | undefined
  getAll(): SearchPlugin[]
  search(query: string, context: SearchContext): Promise<SearchPluginResult[]>
}
```

### 核心组件接口

```typescript
// hooks/useCommandMenu.ts
export interface UseCommandMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  query: string
  setQuery: (query: string) => void
  results: SearchPluginResult[]
  isSearching: boolean
  selectedIndex: number
  setSelectedIndex: (index: number) => void
}

// hooks/useSearchPlugins.ts
export interface UseSearchPluginsReturn {
  registry: PluginRegistry
  search: (query: string) => Promise<SearchPluginResult[]>
  isSearching: boolean
  results: SearchPluginResult[]
}
```

### 数据流

```
用户输入 (Cmd+K)
    ↓
CommandPalette 打开
    ↓
用户输入查询
    ↓
useCommandMenu (防抖 300ms)
    ↓
useSearchPlugins.search()
    ↓
PluginRegistry.search()
    ↓
并行调用所有插件的 search()
    ↓
合并结果 + 排序（按 score 和 priority）
    ↓
CommandMenu 渲染结果
    ↓
用户选择结果
    ↓
plugin.onSelect() 处理
    ↓
CommandPalette 关闭
```

## 关键决策

| 决策 | 理由 |
|------|------|
| 使用 cmdk 库 | 成熟的命令面板库，被 Vercel、Linear 等使用，提供完善的键盘导航和无障碍支持 |
| 插件式架构 | 提供可扩展性，方便未来添加新的搜索功能（如命令搜索、文件搜索等） |
| 防抖 300ms | 平衡响应速度和性能，避免频繁触发搜索 |
| 虚拟滚动阈值 50 条 | 基于性能测试，50 条以下直接渲染，超过则使用虚拟滚动 |
| LRU 缓存 | 缓存最近搜索结果，提升重复搜索性能 |
| 并行搜索 | 所有插件并行执行搜索，提升整体响应速度 |
| 保留现有 SearchPanel | 不移除现有搜索功能，提供两种搜索方式供用户选择 |

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| cmdk | ^1.0.0 | 命令面板核心库 |
| @tanstack/react-virtual | ^3.10.8 | 虚拟滚动（已有） |
| lucide-react | ^0.454.0 | 图标库（已有） |
| Tailwind CSS | ^3.4.0 | 样式（已有） |
| i18next | ^25.8.0 | 国际化（已有） |

## 性能优化策略

### 1. 搜索优化
- **防抖**：300ms 延迟，避免频繁搜索
- **取消请求**：使用 AbortController 取消未完成的搜索
- **并行搜索**：所有插件并行执行，使用 Promise.all()

### 2. 渲染优化
- **虚拟滚动**：超过 50 条结果使用 @tanstack/react-virtual
- **懒加载**：插件按需加载
- **React.memo**：优化组件重渲染

### 3. 缓存策略
- **LRU Cache**：缓存最近 100 次搜索结果
- **缓存键**：`${pluginId}:${query}`
- **缓存时间**：5 分钟

### 4. 内存优化
- **结果限制**：每个插件最多返回 100 条结果
- **清理机制**：关闭面板时清理缓存

## UI 设计规范

### 布局
- **面板宽度**：640px (max-w-2xl)
- **面板高度**：最大 60vh
- **位置**：垂直居中，距顶部 20vh
- **背景遮罩**：rgba(0, 0, 0, 0.5)

### 颜色（暗色主题）
- **背景**：#1a1b26
- **边框**：#2a2b36
- **输入框**：#252636
- **选中项**：#2a2b36
- **文本**：#c0caf5
- **次要文本**：#565f89
- **高亮**：#7aa2f7

### 动画
- **打开/关闭**：fade + scale (200ms ease-out)
- **结果列表**：fade + slide-up (150ms ease-out)
- **加载状态**：spin (1s linear infinite)

### 间距
- **输入框 padding**：12px 16px
- **结果项 padding**：12px 16px
- **结果项间距**：2px
- **分组间距**：8px

## 国际化文案

### 中文
```json
{
  "command": {
    "placeholder": "搜索会话、项目、消息...",
    "empty": "未找到结果",
    "loading": "搜索中...",
    "shortcuts": {
      "open": "打开命令面板",
      "close": "关闭",
      "navigate": "导航",
      "select": "选择"
    },
    "plugins": {
      "messages": "消息搜索",
      "projects": "项目搜索",
      "sessions": "会话搜索"
    }
  }
}
```

### 英文
```json
{
  "command": {
    "placeholder": "Search sessions, projects, messages...",
    "empty": "No results found",
    "loading": "Searching...",
    "shortcuts": {
      "open": "Open command palette",
      "close": "Close",
      "navigate": "Navigate",
      "select": "Select"
    },
    "plugins": {
      "messages": "Message Search",
      "projects": "Project Search",
      "sessions": "Session Search"
    }
  }
}
```

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| - | - | - |

## 相关资源

- [ ] cmdk 官方文档: https://cmdk.paco.me/
- [ ] Vercel 设计系统: https://vercel.com/design
- [ ] Linear 命令面板: https://linear.app/
- [ ] @tanstack/react-virtual: https://tanstack.com/virtual/latest
- [ ] 相关 Issue: 无
- [ ] 参考实现: https://github.com/pacocoursey/cmdk

## Notes

### 设计灵感
- **Vercel**: 简洁、现代、高性能
- **Linear**: 流畅动画、优秀的键盘导航
- **Raycast**: 插件系统、扩展性

### 待确认事项
- [ ] 是否需要支持命令搜索（如"导出会话"、"切换主题"等）？
- [ ] 是否需要支持最近搜索历史？
- [ ] 是否需要支持搜索建议？
- [ ] 是否需要支持快捷键自定义？

### 未来扩展
- 命令插件（执行操作，如导出、删除等）
- 文件搜索插件（搜索会话文件）
- 标签搜索插件（如果未来支持标签）
- AI 搜索插件（语义搜索）
- 搜索历史记录
- 搜索建议和自动完成

---

## Status 更新日志

- **2026-01-31 15:18**: 创建 Issue，状态: todo
- **2026-01-31 15:30**: 完成 Phase 1（规划和准备），更新详细设计方案
