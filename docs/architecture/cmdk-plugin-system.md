# cmdk 插件系统架构设计

## 文档信息

- **创建日期**: 2026-01-31
- **作者**: Pi Agent
- **状态**: Draft
- **相关 Issue**: `docs/issues/20260131-Add cmdk global search with plugin architecture.md`

## 1. 概述

### 1.1 目标

为 Pi Session Manager 添加基于 cmdk 库的全局搜索功能，采用插件式架构设计，提供：

1. **全局访问**: 通过 `Cmd+K` / `Ctrl+K` 快捷键快速打开
2. **多源搜索**: 支持搜索用户消息、项目、会话等多种数据源
3. **可扩展性**: 插件式架构，方便添加新的搜索功能
4. **高性能**: 防抖、虚拟滚动、缓存等优化策略
5. **美观 UI**: 现代化设计，流畅动画，优秀的用户体验

### 1.2 设计原则

1. **关注点分离**: 插件系统、UI 组件、状态管理分离
2. **开放封闭原则**: 对扩展开放（新插件），对修改封闭（核心系统）
3. **单一职责**: 每个插件只负责一种搜索功能
4. **依赖倒置**: 核心系统依赖抽象接口，不依赖具体插件
5. **性能优先**: 所有设计决策优先考虑性能影响

### 1.3 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| cmdk | ^1.0.0 | 命令面板核心库 |
| React | ^18.3.1 | UI 框架 |
| TypeScript | ^5.6.3 | 类型系统 |
| @tanstack/react-virtual | ^3.10.8 | 虚拟滚动 |
| Tailwind CSS | ^3.4.0 | 样式系统 |
| i18next | ^25.8.0 | 国际化 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         App.tsx                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              CommandPalette (容器)                     │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │          CommandMenu (cmdk 主组件)              │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │  Input (搜索框)                           │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │  CommandList (结果列表)                   │  │  │  │
│  │  │  │    - CommandGroup (插件分组)              │  │  │  │
│  │  │  │    - CommandItem (结果项)                 │  │  │  │
│  │  │  │    - CommandEmpty (空状态)                │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   useCommandMenu Hook                        │
│  - 状态管理 (isOpen, query, results)                        │
│  - 搜索协调 (防抖、取消)                                     │
│  - 键盘导航                                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  useSearchPlugins Hook                       │
│  - 插件注册管理                                              │
│  - 并行搜索执行                                              │
│  - 结果合并排序                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    PluginRegistry                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Message   │  │   Project   │  │   Session   │         │
│  │   Search    │  │   Search    │  │   Search    │  ...    │
│  │   Plugin    │  │   Plugin    │  │   Plugin    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户操作 (Cmd+K)
    ↓
CommandPalette.open()
    ↓
useCommandMenu.open()
    ↓
用户输入查询
    ↓
useCommandMenu.setQuery(query)
    ↓
防抖 300ms
    ↓
useSearchPlugins.search(query)
    ↓
PluginRegistry.search(query, context)
    ↓
Promise.all([
  MessageSearchPlugin.search(query, context),
  ProjectSearchPlugin.search(query, context),
  SessionSearchPlugin.search(query, context)
])
    ↓
合并结果 + 排序 (score × priority)
    ↓
useCommandMenu.setResults(results)
    ↓
CommandMenu 渲染结果
    ↓
用户选择结果 (Enter)
    ↓
plugin.onSelect(result, context)
    ↓
执行导航/操作
    ↓
CommandPalette.close()
```

### 2.3 目录结构

```
src/
├── components/
│   ├── command/
│   │   ├── CommandMenu.tsx          # cmdk 主组件
│   │   ├── CommandPalette.tsx       # 命令面板容器
│   │   ├── CommandItem.tsx          # 结果项组件
│   │   ├── CommandEmpty.tsx         # 空状态组件
│   │   ├── CommandLoading.tsx       # 加载状态组件
│   │   └── index.ts                 # 导出
│   └── ...
├── hooks/
│   ├── useCommandMenu.ts            # cmdk 状态管理
│   ├── useSearchPlugins.ts          # 插件管理
│   └── useSearchCache.ts            # 搜索缓存
├── plugins/
│   ├── types.ts                     # 插件接口定义
│   ├── registry.ts                  # 插件注册表
│   ├── base/
│   │   └── BaseSearchPlugin.ts      # 插件基类
│   ├── message/
│   │   └── MessageSearchPlugin.ts   # 消息搜索插件
│   ├── project/
│   │   └── ProjectSearchPlugin.ts   # 项目搜索插件
│   ├── session/
│   │   └── SessionSearchPlugin.ts   # 会话搜索插件
│   └── index.ts                     # 导出
├── utils/
│   ├── search.ts                    # 搜索工具函数
│   └── highlight.ts                 # 高亮工具函数
└── styles/
    └── command.css                  # cmdk 自定义样式
```

---

## 3. 插件系统设计

### 3.1 核心接口

```typescript
// plugins/types.ts

/**
 * 搜索插件接口
 * 所有搜索插件必须实现此接口
 */
export interface SearchPlugin {
  // ========== 元数据 ==========
  
  /** 插件唯一标识 */
  id: string
  
  /** 插件显示名称 */
  name: string
  
  /** 插件图标组件 */
  icon: React.ComponentType<{ className?: string }>
  
  /** 插件描述 */
  description: string
  
  /** 搜索关键词（用于插件匹配） */
  keywords: string[]
  
  /** 优先级（0-100，越高越优先显示） */
  priority: number
  
  // ========== 核心方法 ==========
  
  /**
   * 执行搜索
   * @param query 搜索查询
   * @param context 搜索上下文
   * @returns 搜索结果数组
   */
  search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]>
  
  /**
   * 处理结果选中
   * @param result 选中的结果
   * @param context 搜索上下文
   */
  onSelect(
    result: SearchPluginResult,
    context: SearchContext
  ): void
  
  // ========== 可选方法 ==========
  
  /**
   * 自定义结果项渲染
   * @param result 搜索结果
   * @returns 自定义 React 节点
   */
  renderItem?(result: SearchPluginResult): React.ReactNode
  
  /**
   * 插件挂载时调用
   */
  onMount?(): void
  
  /**
   * 插件卸载时调用
   */
  onUnmount?(): void
  
  /**
   * 判断插件是否可用
   * @param context 搜索上下文
   * @returns 是否可用
   */
  isEnabled?(context: SearchContext): boolean
}

/**
 * 搜索上下文
 * 提供给插件的全局状态和方法
 */
export interface SearchContext {
  // ========== 数据 ==========
  
  /** 所有会话列表 */
  sessions: SessionInfo[]
  
  /** 当前选中的项目 */
  selectedProject: string | null
  
  /** 当前选中的会话 */
  selectedSession: SessionInfo | null
  
  // ========== 方法 ==========
  
  /** 设置选中的会话 */
  setSelectedSession: (session: SessionInfo | null) => void
  
  /** 设置选中的项目 */
  setSelectedProject: (project: string | null) => void
  
  /** 关闭命令面板 */
  closeCommandMenu: () => void
  
  // ========== 工具 ==========
  
  /** 国际化翻译函数 */
  t: (key: string, options?: any) => string
}

/**
 * 搜索结果
 */
export interface SearchPluginResult {
  /** 结果唯一标识 */
  id: string
  
  /** 所属插件 ID */
  pluginId: string
  
  /** 主标题 */
  title: string
  
  /** 副标题 */
  subtitle?: string
  
  /** 描述 */
  description?: string
  
  /** 图标 */
  icon?: React.ReactNode
  
  /** 元数据（插件自定义） */
  metadata?: Record<string, any>
  
  /** 匹配分数（0-1） */
  score: number
  
  /** 高亮范围 */
  highlights?: HighlightRange[]
}

/**
 * 高亮范围
 */
export interface HighlightRange {
  start: number
  end: number
  field: 'title' | 'subtitle' | 'description'
}
```


### 3.2 插件注册表

```typescript
// plugins/registry.ts

/**
 * 插件注册表
 * 管理所有搜索插件的注册、查询和执行
 */
export class PluginRegistry {
  private plugins: Map<string, SearchPlugin> = new Map()
  
  /**
   * 注册插件
   * @param plugin 搜索插件
   * @throws 如果插件 ID 已存在
   */
  register(plugin: SearchPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id "${plugin.id}" already registered`)
    }
    
    this.plugins.set(plugin.id, plugin)
    plugin.onMount?.()
    
    console.log(`[PluginRegistry] Registered plugin: ${plugin.id}`)
  }
  
  /**
   * 注销插件
   * @param pluginId 插件 ID
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      plugin.onUnmount?.()
      this.plugins.delete(pluginId)
      console.log(`[PluginRegistry] Unregistered plugin: ${pluginId}`)
    }
  }
  
  /**
   * 获取插件
   * @param pluginId 插件 ID
   * @returns 插件实例或 undefined
   */
  get(pluginId: string): SearchPlugin | undefined {
    return this.plugins.get(pluginId)
  }
  
  /**
   * 获取所有插件
   * @returns 插件数组（按优先级排序）
   */
  getAll(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .sort((a, b) => b.priority - a.priority)
  }
  
  /**
   * 获取可用插件
   * @param context 搜索上下文
   * @returns 可用插件数组
   */
  getEnabled(context: SearchContext): SearchPlugin[] {
    return this.getAll().filter(plugin => 
      plugin.isEnabled ? plugin.isEnabled(context) : true
    )
  }
  
  /**
   * 执行搜索
   * @param query 搜索查询
   * @param context 搜索上下文
   * @returns 合并后的搜索结果
   */
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    if (!query.trim()) {
      return []
    }
    
    const enabledPlugins = this.getEnabled(context)
    
    // 并行执行所有插件的搜索
    const results = await Promise.all(
      enabledPlugins.map(async plugin => {
        try {
          const pluginResults = await plugin.search(query, context)
          return pluginResults.map(result => ({
            ...result,
            pluginId: plugin.id,
            // 综合分数 = 结果分数 × 插件优先级
            score: result.score * (plugin.priority / 100)
          }))
        } catch (error) {
          console.error(`[PluginRegistry] Plugin ${plugin.id} search failed:`, error)
          return []
        }
      })
    )
    
    // 合并并排序结果
    return results
      .flat()
      .sort((a, b) => b.score - a.score)
  }
}

// 全局单例
export const pluginRegistry = new PluginRegistry()
```

### 3.3 插件基类

```typescript
// plugins/base/BaseSearchPlugin.ts

/**
 * 搜索插件基类
 * 提供通用功能和默认实现
 */
export abstract class BaseSearchPlugin implements SearchPlugin {
  abstract id: string
  abstract name: string
  abstract icon: React.ComponentType<{ className?: string }>
  abstract description: string
  abstract keywords: string[]
  
  priority: number = 50 // 默认优先级
  
  /**
   * 抽象搜索方法，子类必须实现
   */
  abstract search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]>
  
  /**
   * 默认选中处理（可覆盖）
   */
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    console.log(`[${this.id}] Selected:`, result)
  }
  
  /**
   * 默认启用检查（可覆盖）
   */
  isEnabled(context: SearchContext): boolean {
    return true
  }
  
  /**
   * 工具方法：模糊匹配
   */
  protected fuzzyMatch(query: string, text: string): number {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    
    // 精确匹配
    if (lowerText === lowerQuery) return 1.0
    
    // 包含匹配
    if (lowerText.includes(lowerQuery)) {
      const position = lowerText.indexOf(lowerQuery)
      const positionScore = 1 - (position / lowerText.length)
      return 0.8 * positionScore
    }
    
    // 模糊匹配（字符顺序）
    let queryIndex = 0
    let textIndex = 0
    let matches = 0
    
    while (queryIndex < lowerQuery.length && textIndex < lowerText.length) {
      if (lowerQuery[queryIndex] === lowerText[textIndex]) {
        matches++
        queryIndex++
      }
      textIndex++
    }
    
    if (matches === lowerQuery.length) {
      return 0.5 * (matches / lowerText.length)
    }
    
    return 0
  }
  
  /**
   * 工具方法：计算高亮范围
   */
  protected calculateHighlights(
    query: string,
    text: string,
    field: 'title' | 'subtitle' | 'description'
  ): HighlightRange[] {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    const highlights: HighlightRange[] = []
    
    let index = lowerText.indexOf(lowerQuery)
    while (index !== -1) {
      highlights.push({
        start: index,
        end: index + query.length,
        field
      })
      index = lowerText.indexOf(lowerQuery, index + 1)
    }
    
    return highlights
  }
}
```

---

## 4. 核心组件设计

### 4.1 CommandPalette 容器

```typescript
// components/command/CommandPalette.tsx

import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useCommandMenu } from '@/hooks/useCommandMenu'
import CommandMenu from './CommandMenu'

export default function CommandPalette() {
  const { isOpen, close, open } = useCommandMenu()
  
  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        open()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])
  
  if (!isOpen) return null
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl max-h-[60vh] bg-[#1a1b26] border border-[#2a2b36] rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <CommandMenu />
      </div>
    </div>
  )
}
```

### 4.2 CommandMenu 主组件

```typescript
// components/command/CommandMenu.tsx

import { Command } from 'cmdk'
import { Search, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCommandMenu } from '@/hooks/useCommandMenu'
import { useSearchPlugins } from '@/hooks/useSearchPlugins'
import CommandItem from './CommandItem'
import CommandEmpty from './CommandEmpty'
import CommandLoading from './CommandLoading'

export default function CommandMenu() {
  const { t } = useTranslation()
  const {
    query,
    setQuery,
    results,
    isSearching,
    close
  } = useCommandMenu()
  
  const { registry } = useSearchPlugins()
  
  // 按插件分组结果
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.pluginId]) {
      acc[result.pluginId] = []
    }
    acc[result.pluginId].push(result)
    return acc
  }, {} as Record<string, SearchPluginResult[]>)
  
  return (
    <Command
      className="w-full"
      shouldFilter={false} // 我们自己处理过滤
    >
      {/* 搜索框 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2b36]">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('command.placeholder')}
          className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        )}
        <kbd className="px-2 py-1 text-xs text-muted-foreground bg-[#252636] rounded">
          ESC
        </kbd>
      </div>
      
      {/* 结果列表 */}
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        {isSearching && <CommandLoading />}
        
        {!isSearching && results.length === 0 && query && (
          <CommandEmpty query={query} />
        )}
        
        {!isSearching && Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
          const plugin = registry.get(pluginId)
          if (!plugin) return null
          
          return (
            <Command.Group
              key={pluginId}
              heading={plugin.name}
              className="mb-2"
            >
              {pluginResults.map(result => (
                <CommandItem
                  key={result.id}
                  result={result}
                  plugin={plugin}
                  onSelect={() => {
                    plugin.onSelect(result, context)
                    close()
                  }}
                />
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command>
  )
}
```


### 4.3 CommandItem 结果项

```typescript
// components/command/CommandItem.tsx

import { Command } from 'cmdk'
import { SearchPluginResult, SearchPlugin } from '@/plugins/types'
import { highlightText } from '@/utils/highlight'

interface CommandItemProps {
  result: SearchPluginResult
  plugin: SearchPlugin
  onSelect: () => void
}

export default function CommandItem({ result, plugin, onSelect }: CommandItemProps) {
  // 如果插件提供了自定义渲染，使用它
  if (plugin.renderItem) {
    return (
      <Command.Item
        value={result.id}
        onSelect={onSelect}
        className="px-3 py-2 rounded-md cursor-pointer hover:bg-[#2a2b36] data-[selected=true]:bg-[#2a2b36] transition-colors"
      >
        {plugin.renderItem(result)}
      </Command.Item>
    )
  }
  
  // 默认渲染
  return (
    <Command.Item
      value={result.id}
      onSelect={onSelect}
      className="px-3 py-2 rounded-md cursor-pointer hover:bg-[#2a2b36] data-[selected=true]:bg-[#2a2b36] transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* 图标 */}
        {result.icon && (
          <div className="flex-shrink-0 mt-0.5">
            {result.icon}
          </div>
        )}
        
        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <div className="text-sm font-medium text-foreground truncate">
            {highlightText(result.title, result.highlights, 'title')}
          </div>
          
          {/* 副标题 */}
          {result.subtitle && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {highlightText(result.subtitle, result.highlights, 'subtitle')}
            </div>
          )}
          
          {/* 描述 */}
          {result.description && (
            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {highlightText(result.description, result.highlights, 'description')}
            </div>
          )}
        </div>
        
        {/* 分数（开发模式） */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex-shrink-0 text-xs text-muted-foreground">
            {result.score.toFixed(2)}
          </div>
        )}
      </div>
    </Command.Item>
  )
}
```

### 4.4 CommandEmpty 空状态

```typescript
// components/command/CommandEmpty.tsx

import { Command } from 'cmdk'
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CommandEmptyProps {
  query: string
}

export default function CommandEmpty({ query }: CommandEmptyProps) {
  const { t } = useTranslation()
  
  return (
    <Command.Empty className="flex flex-col items-center justify-center py-12 text-center">
      <SearchX className="w-12 h-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">
        {t('command.empty')}
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        {t('command.emptyHint', { query })}
      </p>
    </Command.Empty>
  )
}
```

### 4.5 CommandLoading 加载状态

```typescript
// components/command/CommandLoading.tsx

import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function CommandLoading() {
  const { t } = useTranslation()
  
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mr-2" />
      <span className="text-sm text-muted-foreground">
        {t('command.loading')}
      </span>
    </div>
  )
}
```

---

## 5. Hooks 设计

### 5.1 useCommandMenu

```typescript
// hooks/useCommandMenu.ts

import { create } from 'zustand'
import { useCallback, useEffect, useRef } from 'react'
import { useSearchPlugins } from './useSearchPlugins'
import { SearchPluginResult } from '@/plugins/types'

interface CommandMenuState {
  isOpen: boolean
  query: string
  results: SearchPluginResult[]
  isSearching: boolean
  selectedIndex: number
}

interface CommandMenuActions {
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => void
  setResults: (results: SearchPluginResult[]) => void
  setIsSearching: (isSearching: boolean) => void
  setSelectedIndex: (index: number) => void
  reset: () => void
}

type CommandMenuStore = CommandMenuState & CommandMenuActions

const useCommandMenuStore = create<CommandMenuStore>((set) => ({
  // State
  isOpen: false,
  query: '',
  results: [],
  isSearching: false,
  selectedIndex: 0,
  
  // Actions
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [], selectedIndex: 0 }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  reset: () => set({
    isOpen: false,
    query: '',
    results: [],
    isSearching: false,
    selectedIndex: 0
  })
}))

export function useCommandMenu() {
  const store = useCommandMenuStore()
  const { search } = useSearchPlugins()
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()
  
  // 防抖搜索
  const debouncedSearch = useCallback(async (query: string) => {
    // 取消之前的搜索
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    if (!query.trim()) {
      store.setResults([])
      store.setIsSearching(false)
      return
    }
    
    store.setIsSearching(true)
    
    try {
      abortControllerRef.current = new AbortController()
      const results = await search(query)
      
      if (!abortControllerRef.current.signal.aborted) {
        store.setResults(results)
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[useCommandMenu] Search failed:', error)
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        store.setIsSearching(false)
      }
    }
  }, [search, store])
  
  // 监听查询变化
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      debouncedSearch(store.query)
    }, 300)
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [store.query, debouncedSearch])
  
  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])
  
  return store
}
```

### 5.2 useSearchPlugins

```typescript
// hooks/useSearchPlugins.ts

import { useCallback, useMemo } from 'react'
import { pluginRegistry } from '@/plugins/registry'
import { SearchPluginResult, SearchContext } from '@/plugins/types'
import { useSearchCache } from './useSearchCache'

export function useSearchPlugins() {
  const cache = useSearchCache()
  
  // 构建搜索上下文
  const context = useMemo<SearchContext>(() => ({
    sessions: [], // 从 App 传入
    selectedProject: null,
    selectedSession: null,
    setSelectedSession: () => {},
    setSelectedProject: () => {},
    closeCommandMenu: () => {},
    t: (key: string) => key
  }), [])
  
  // 执行搜索
  const search = useCallback(async (query: string): Promise<SearchPluginResult[]> => {
    // 检查缓存
    const cached = cache.get(query)
    if (cached) {
      console.log('[useSearchPlugins] Cache hit:', query)
      return cached
    }
    
    // 执行搜索
    console.log('[useSearchPlugins] Searching:', query)
    const results = await pluginRegistry.search(query, context)
    
    // 缓存结果
    cache.set(query, results)
    
    return results
  }, [context, cache])
  
  return {
    registry: pluginRegistry,
    search
  }
}
```

### 5.3 useSearchCache

```typescript
// hooks/useSearchCache.ts

import { useRef } from 'react'
import { SearchPluginResult } from '@/plugins/types'

interface CacheEntry {
  results: SearchPluginResult[]
  timestamp: number
}

const CACHE_SIZE = 100
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟

export function useSearchCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())
  
  const get = (query: string): SearchPluginResult[] | null => {
    const entry = cacheRef.current.get(query)
    
    if (!entry) return null
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cacheRef.current.delete(query)
      return null
    }
    
    return entry.results
  }
  
  const set = (query: string, results: SearchPluginResult[]): void => {
    // LRU: 如果缓存满了，删除最旧的
    if (cacheRef.current.size >= CACHE_SIZE) {
      const firstKey = cacheRef.current.keys().next().value
      cacheRef.current.delete(firstKey)
    }
    
    cacheRef.current.set(query, {
      results,
      timestamp: Date.now()
    })
  }
  
  const clear = (): void => {
    cacheRef.current.clear()
  }
  
  return { get, set, clear }
}
```

---

## 6. 内置插件实现

### 6.1 MessageSearchPlugin

```typescript
// plugins/message/MessageSearchPlugin.ts

import { MessageSquare } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import { SearchContext, SearchPluginResult } from '../types'
import { invoke } from '@tauri-apps/api/core'
import type { SearchResult } from '@/types'

export class MessageSearchPlugin extends BaseSearchPlugin {
  id = 'message-search'
  name = 'Message Search'
  icon = MessageSquare
  description = 'Search in user messages and assistant responses'
  keywords = ['message', 'content', 'text', 'conversation']
  priority = 80
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    try {
      // 调用 Tauri 后端搜索
      const results = await invoke<SearchResult[]>('search_sessions', {
        sessions: context.sessions,
        query,
        searchMode: 'content',
        roleFilter: 'all',
        includeTools: false
      })
      
      // 转换为插件结果格式
      return results.flatMap(result => 
        result.matches.map(match => ({
          id: `${result.session_id}-${match.entry_id}`,
          pluginId: this.id,
          title: match.snippet,
          subtitle: result.session_name || result.first_message,
          description: `${match.role} • ${new Date(match.timestamp).toLocaleString()}`,
          icon: <MessageSquare className="w-4 h-4 text-blue-400" />,
          metadata: {
            sessionId: result.session_id,
            sessionPath: result.session_path,
            entryId: match.entry_id,
            role: match.role
          },
          score: result.score,
          highlights: this.calculateHighlights(query, match.snippet, 'title')
        }))
      )
    } catch (error) {
      console.error('[MessageSearchPlugin] Search failed:', error)
      return []
    }
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // 导航到对应的会话
    const session = context.sessions.find(
      s => s.id === result.metadata?.sessionId
    )
    
    if (session) {
      context.setSelectedSession(session)
      context.closeCommandMenu()
    }
  }
}
```


### 6.2 ProjectSearchPlugin

```typescript
// plugins/project/ProjectSearchPlugin.ts

import { FolderOpen } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import { SearchContext, SearchPluginResult } from '../types'

export class ProjectSearchPlugin extends BaseSearchPlugin {
  id = 'project-search'
  name = 'Project Search'
  icon = FolderOpen
  description = 'Search in projects'
  keywords = ['project', 'folder', 'directory']
  priority = 70
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    // 从 sessions 中提取项目列表
    const projectMap = new Map<string, number>()
    
    context.sessions.forEach(session => {
      const project = session.cwd
      projectMap.set(project, (projectMap.get(project) || 0) + 1)
    })
    
    // 搜索匹配的项目
    const results: SearchPluginResult[] = []
    
    for (const [project, count] of projectMap.entries()) {
      const score = this.fuzzyMatch(query, project)
      
      if (score > 0) {
        results.push({
          id: `project-${project}`,
          pluginId: this.id,
          title: project.split('/').pop() || project,
          subtitle: project,
          description: `${count} sessions`,
          icon: <FolderOpen className="w-4 h-4 text-yellow-400" />,
          metadata: {
            project,
            sessionCount: count
          },
          score,
          highlights: this.calculateHighlights(query, project, 'subtitle')
        })
      }
    }
    
    return results.sort((a, b) => b.score - a.score)
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // 切换到项目视图
    const project = result.metadata?.project
    
    if (project) {
      context.setSelectedProject(project)
      context.closeCommandMenu()
    }
  }
}
```

### 6.3 SessionSearchPlugin

```typescript
// plugins/session/SessionSearchPlugin.ts

import { FileText } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import { SearchContext, SearchPluginResult } from '../types'
import { formatDistanceToNow } from 'date-fns'

export class SessionSearchPlugin extends BaseSearchPlugin {
  id = 'session-search'
  name = 'Session Search'
  icon = FileText
  description = 'Search in session names and metadata'
  keywords = ['session', 'file', 'conversation']
  priority = 60
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    const results: SearchPluginResult[] = []
    
    for (const session of context.sessions) {
      // 搜索会话名称
      const nameScore = session.name 
        ? this.fuzzyMatch(query, session.name)
        : 0
      
      // 搜索第一条消息
      const messageScore = this.fuzzyMatch(query, session.first_message)
      
      // 搜索路径
      const pathScore = this.fuzzyMatch(query, session.path) * 0.5
      
      // 综合分数
      const score = Math.max(nameScore, messageScore, pathScore)
      
      if (score > 0) {
        results.push({
          id: `session-${session.id}`,
          pluginId: this.id,
          title: session.name || session.first_message,
          subtitle: session.cwd,
          description: `${session.message_count} messages • ${formatDistanceToNow(new Date(session.modified))} ago`,
          icon: <FileText className="w-4 h-4 text-green-400" />,
          metadata: {
            session
          },
          score,
          highlights: [
            ...this.calculateHighlights(query, session.name || '', 'title'),
            ...this.calculateHighlights(query, session.first_message, 'title')
          ]
        })
      }
    }
    
    return results.sort((a, b) => b.score - a.score)
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // 打开会话
    const session = result.metadata?.session
    
    if (session) {
      context.setSelectedSession(session)
      context.closeCommandMenu()
    }
  }
}
```

---

## 7. 工具函数

### 7.1 高亮工具

```typescript
// utils/highlight.ts

import { HighlightRange } from '@/plugins/types'

/**
 * 高亮文本中的匹配部分
 */
export function highlightText(
  text: string,
  highlights: HighlightRange[] | undefined,
  field: 'title' | 'subtitle' | 'description'
): React.ReactNode {
  if (!highlights || highlights.length === 0) {
    return text
  }
  
  // 过滤当前字段的高亮
  const fieldHighlights = highlights
    .filter(h => h.field === field)
    .sort((a, b) => a.start - b.start)
  
  if (fieldHighlights.length === 0) {
    return text
  }
  
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  
  fieldHighlights.forEach((highlight, i) => {
    // 添加非高亮部分
    if (highlight.start > lastIndex) {
      parts.push(text.slice(lastIndex, highlight.start))
    }
    
    // 添加高亮部分
    parts.push(
      <mark
        key={i}
        className="bg-yellow-400/20 text-yellow-400 rounded px-0.5"
      >
        {text.slice(highlight.start, highlight.end)}
      </mark>
    )
    
    lastIndex = highlight.end
  })
  
  // 添加剩余部分
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  
  return <>{parts}</>
}
```

### 7.2 搜索工具

```typescript
// utils/search.ts

/**
 * 计算字符串相似度（Levenshtein 距离）
 */
export function calculateSimilarity(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  const distance = matrix[b.length][a.length]
  const maxLength = Math.max(a.length, b.length)
  
  return 1 - distance / maxLength
}

/**
 * 分词（简单实现）
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_./\\]+/)
    .filter(Boolean)
}

/**
 * 计算 TF-IDF 分数
 */
export function calculateTfIdf(
  query: string,
  document: string,
  corpus: string[]
): number {
  const queryTokens = tokenize(query)
  const docTokens = tokenize(document)
  
  let score = 0
  
  for (const token of queryTokens) {
    // TF: 词频
    const tf = docTokens.filter(t => t === token).length / docTokens.length
    
    // IDF: 逆文档频率
    const df = corpus.filter(doc => tokenize(doc).includes(token)).length
    const idf = Math.log(corpus.length / (df + 1))
    
    score += tf * idf
  }
  
  return score
}
```

---

## 8. 性能优化

### 8.1 虚拟滚动

```typescript
// components/command/CommandList.tsx

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { SearchPluginResult } from '@/plugins/types'
import CommandItem from './CommandItem'

interface CommandListProps {
  results: SearchPluginResult[]
  onSelect: (result: SearchPluginResult) => void
}

const VIRTUAL_THRESHOLD = 50

export default function CommandList({ results, onSelect }: CommandListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  
  // 只有超过阈值才使用虚拟滚动
  const useVirtual = results.length > VIRTUAL_THRESHOLD
  
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // 估计每项高度
    enabled: useVirtual
  })
  
  if (!useVirtual) {
    // 直接渲染
    return (
      <div ref={parentRef} className="max-h-[50vh] overflow-y-auto">
        {results.map(result => (
          <CommandItem
            key={result.id}
            result={result}
            onSelect={() => onSelect(result)}
          />
        ))}
      </div>
    )
  }
  
  // 虚拟滚动渲染
  return (
    <div ref={parentRef} className="max-h-[50vh] overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <CommandItem
              result={results[virtualItem.index]}
              onSelect={() => onSelect(results[virtualItem.index])}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 8.2 性能监控

```typescript
// utils/performance.ts

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private marks: Map<string, number> = new Map()
  
  /**
   * 开始计时
   */
  start(label: string): void {
    this.marks.set(label, performance.now())
  }
  
  /**
   * 结束计时并输出
   */
  end(label: string): number {
    const start = this.marks.get(label)
    if (!start) {
      console.warn(`[Performance] No start mark for "${label}"`)
      return 0
    }
    
    const duration = performance.now() - start
    console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`)
    
    this.marks.delete(label)
    return duration
  }
  
  /**
   * 测量函数执行时间
   */
  async measure<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.start(label)
    try {
      return await fn()
    } finally {
      this.end(label)
    }
  }
}

export const perfMonitor = new PerformanceMonitor()
```

---

## 9. 样式设计

### 9.1 自定义样式

```css
/* styles/command.css */

/* cmdk 覆盖样式 */
[cmdk-root] {
  @apply w-full;
}

[cmdk-input] {
  @apply flex-1 bg-transparent border-0 outline-none text-sm;
  @apply text-foreground placeholder:text-muted-foreground;
}

[cmdk-list] {
  @apply max-h-[50vh] overflow-y-auto p-2;
  @apply scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent;
}

[cmdk-group] {
  @apply mb-2;
}

[cmdk-group-heading] {
  @apply px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase;
}

[cmdk-item] {
  @apply px-3 py-2 rounded-md cursor-pointer;
  @apply transition-colors duration-150;
  @apply hover:bg-[#2a2b36];
}

[cmdk-item][data-selected="true"] {
  @apply bg-[#2a2b36];
}

[cmdk-empty] {
  @apply flex flex-col items-center justify-center py-12 text-center;
}

/* 动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes zoomIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-in {
  animation-fill-mode: both;
}

.fade-in {
  animation: fadeIn 200ms ease-out;
}

.zoom-in-95 {
  animation: zoomIn 200ms ease-out;
}

/* 高亮 */
mark {
  @apply bg-yellow-400/20 text-yellow-400 rounded px-0.5;
}

/* 滚动条 */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thin::-webkit-scrollbar-thumb {
  @apply bg-muted rounded-full;
}

.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  @apply bg-muted-foreground/50;
}
```

---

## 10. 国际化

### 10.1 中文翻译

```json
// src/i18n/locales/zh.json (新增部分)
{
  "command": {
    "placeholder": "搜索会话、项目、消息...",
    "empty": "未找到结果",
    "emptyHint": "尝试使用不同的关键词搜索",
    "loading": "搜索中...",
    "shortcuts": {
      "open": "打开命令面板",
      "close": "关闭",
      "navigate": "导航",
      "select": "选择"
    },
    "plugins": {
      "messageSearch": "消息搜索",
      "projectSearch": "项目搜索",
      "sessionSearch": "会话搜索"
    },
    "hints": {
      "cmdK": "按 {{key}} 打开",
      "escape": "按 ESC 关闭",
      "arrows": "使用 ↑↓ 导航",
      "enter": "按 Enter 选择"
    }
  }
}
```

### 10.2 英文翻译

```json
// src/i18n/locales/en.json (新增部分)
{
  "command": {
    "placeholder": "Search sessions, projects, messages...",
    "empty": "No results found",
    "emptyHint": "Try searching with different keywords",
    "loading": "Searching...",
    "shortcuts": {
      "open": "Open command palette",
      "close": "Close",
      "navigate": "Navigate",
      "select": "Select"
    },
    "plugins": {
      "messageSearch": "Message Search",
      "projectSearch": "Project Search",
      "sessionSearch": "Session Search"
    },
    "hints": {
      "cmdK": "Press {{key}} to open",
      "escape": "Press ESC to close",
      "arrows": "Use ↑↓ to navigate",
      "enter": "Press Enter to select"
    }
  }
}
```

---

## 11. 集成步骤

### 11.1 安装依赖

```bash
npm install cmdk
# 或
pnpm add cmdk
```

### 11.2 注册插件

```typescript
// src/plugins/index.ts

import { pluginRegistry } from './registry'
import { MessageSearchPlugin } from './message/MessageSearchPlugin'
import { ProjectSearchPlugin } from './project/ProjectSearchPlugin'
import { SessionSearchPlugin } from './session/SessionSearchPlugin'

// 注册内置插件
export function registerBuiltinPlugins() {
  pluginRegistry.register(new MessageSearchPlugin())
  pluginRegistry.register(new ProjectSearchPlugin())
  pluginRegistry.register(new SessionSearchPlugin())
}
```

### 11.3 集成到 App

```typescript
// src/App.tsx

import { useEffect } from 'react'
import CommandPalette from './components/command/CommandPalette'
import { registerBuiltinPlugins } from './plugins'

function App() {
  // 注册插件
  useEffect(() => {
    registerBuiltinPlugins()
  }, [])
  
  return (
    <>
      {/* 现有组件 */}
      <div>...</div>
      
      {/* 命令面板 */}
      <CommandPalette />
    </>
  )
}
```

---

## 12. 测试策略

### 12.1 单元测试

- 插件系统测试
  - 插件注册/注销
  - 搜索执行
  - 结果合并排序
- 工具函数测试
  - 模糊匹配
  - 高亮计算
  - 相似度计算

### 12.2 集成测试

- 端到端搜索流程
- 快捷键触发
- 结果选择和导航
- 性能基准测试

### 12.3 性能测试

- 搜索响应时间（1000 条数据 < 300ms）
- 首次渲染时间（< 100ms）
- 内存占用（10000 条缓存 < 50MB）
- 虚拟滚动性能（60fps）

---

## 13. 未来扩展

### 13.1 命令插件

支持执行操作的命令插件：
- 导出会话
- 删除会话
- 切换主题
- 打开设置

### 13.2 AI 搜索

集成语义搜索：
- 使用 embedding 模型
- 向量相似度搜索
- 自然语言查询

### 13.3 搜索历史

记录搜索历史：
- 最近搜索
- 热门搜索
- 搜索建议

### 13.4 自定义插件

支持用户自定义插件：
- 插件 API 文档
- 插件市场
- 插件配置界面

---

## 14. 总结

本架构设计提供了一个完整的、可扩展的 cmdk 全局搜索系统：

**核心优势：**
1. ✅ 插件式架构，易于扩展
2. ✅ 高性能优化（防抖、虚拟滚动、缓存）
3. ✅ 美观的 UI 设计
4. ✅ 完善的类型系统
5. ✅ 国际化支持
6. ✅ 良好的用户体验

**技术亮点：**
- 使用 cmdk 库提供专业的命令面板体验
- 插件系统基于接口设计，符合 SOLID 原则
- 性能优化策略全面（防抖、虚拟滚动、LRU 缓存）
- 组件设计模块化，职责清晰
- 完善的错误处理和边界情况考虑

**实施建议：**
1. 按照 Phase 2-7 逐步实施
2. 每个 Phase 完成后进行测试
3. 持续监控性能指标
4. 收集用户反馈并迭代优化

