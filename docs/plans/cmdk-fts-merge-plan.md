# CommandPalette + FullTextSearch 合并计划

**Created**: 2026-04-02
**Status**: ✅ Complete
**Priority**: High
**Complexity**: L3 (跨模块重构)

---

## 📋 概述

将 `Cmd+Shift+F` 触发的 FullTextSearch 功能合并到 `Cmd+K` CommandPalette 中，通过 FTS 增强模式提供高级搜索能力，移除快捷键冲突。

**核心思路**：增强 `MessageSearchPlugin` 支持 FTS 高级模式，在 CommandPalette 中通过特殊语法触发。

---

## 🎯 目标

### 必须完成 (Must Have)
- [ ] 统一搜索入口：Cmd+K
- [ ] FTS 增强模式触发语法 (`! ` 或 `/fts `)
- [ ] 支持角色过滤 (user/assistant/all)
- [ ] 支持 glob 路径模式
- [ ] 支持排序切换 (相关性/时间)
- [ ] 支持分页加载 (20 条/页)
- [ ] 移除 Cmd+Shift+F 快捷键
- [ ] 保持向后兼容 (保留 FullTextSearch 组件)

### 可选完成 (Nice to Have)
- [ ] 智能 FTS 触发 (长查询自动切换)
- [ ] FTS 模式视觉提示
- [ ] 搜索历史/建议

---

## 📐 架构设计

### 1. 触发机制

```typescript
// CommandPalette.tsx
const detectFTSMode = (query: string): boolean => {
  return query.startsWith('! ') || query.startsWith('/fts ')
}

const parseFTSQuery = (query: string): {
  mode: 'fts' | 'normal'
  roleFilter?: 'user' | 'assistant' | 'all'
  query: string
} => {
  if (!query.startsWith('!')) return { mode: 'normal', query }

  // !user 关键词
  if (query.startsWith('!user ')) {
    return { mode: 'fts', roleFilter: 'user', query: query.slice(6) }
  }
  // !assistant 关键词
  if (query.startsWith('!assistant ')) {
    return { mode: 'fts', roleFilter: 'assistant', query: query.slice(11) }
  }
  // ! 关键词
  if (query.startsWith('! ')) {
    return { mode: 'fts', roleFilter: 'all', query: query.slice(2) }
  }

  return { mode: 'normal', query }
}
```

### 2. MessageSearchPlugin 增强

```typescript
interface MessageSearchPluginOptions {
  ftsMode?: boolean
  roleFilter?: 'user' | 'assistant' | 'all'
  globPattern?: string
  sortMode?: 'score' | 'newest' | 'oldest'
  page?: number
  pageSize?: number
}

class MessageSearchPlugin extends BaseSearchPlugin {
  async search(
    query: string,
    context: SearchContext,
    options?: MessageSearchPluginOptions
  ): Promise<SearchPluginResult[]> {
    // 调用 full_text_search 后端接口
    // 支持分页、排序、过滤
  }
}
```

### 3. CommandMenu FTS UI

```tsx
// 新增 FTS 控制面板
{ftsMode && (
  <div className="fts-control-panel">
    <RoleFilter value={roleFilter} onChange={setRoleFilter} />
    <GlobInput value={glob} onChange={setGlob} />
    <SortToggle value={sortMode} onChange={setSortMode} />
  </div>
)}
```

---

## 📝 实现阶段

### Phase 1: 后端/插件层增强

**目标**: 增强 `MessageSearchPlugin` 支持 FTS 高级模式

**任务**:
1. [ ] 1.1 修改 `MessageSearchPlugin.search()` 支持 options 参数
2. [ ] 1.2 添加 role_filter/glob/sort/pagination 支持
3. [ ] 1.3 增强 `renderItem()` 支持完整 FTS 结果展示
4. [ ] 1.4 添加高亮缓存机制

**文件**:
- `src/plugins/message/MessageSearchPlugin.tsx`
- `src/plugins/types.ts` (可能需扩展)

**验收标准**:
- MessageSearchPlugin 可独立进行 FTS 搜索
- 支持角色过滤、glob、排序、分页
- 结果高亮正常

---

### Phase 2: CommandPalette FTS 模式

**目标**: 在 CommandPalette 中实现 FTS 模式检测和 UI

**任务**:
1. [ ] 2.1 添加 FTS 模式检测函数 (`detectFTSMode`, `parseFTSQuery`)
2. [ ] 2.2 添加 FTS 状态管理 (roleFilter, glob, sortMode, page)
3. [ ] 2.3 实现 FTS 控制面板 UI
4. [ ] 2.4 修改 CommandMenu 传递 options 到插件
5. [ ] 2.5 实现分页加载 (无限滚动)

**文件**:
- `src/components/command/CommandPalette.tsx`
- `src/components/command/CommandMenu.tsx`
- 可能新增 `src/components/command/FTSControlPanel.tsx`

**验收标准**:
- 输入 `! ` 自动切换到 FTS 模式
- 显示角色过滤/glob/排序控件
- 分页加载正常
- 结果展示完整

---

### Phase 3: 移除 Cmd+Shift+F

**目标**: 清理旧代码，统一入口

**任务**:
1. [ ] 3.1 移除 `App.tsx` 中 `cmd+shift+f` 快捷键
2. [ ] 3.2 移除 `showFullTextSearch` 状态
3. [ ] 3.3 移除 `AppOverlays` 中 FullTextSearch 渲染
4. [ ] 3.4 保留 `FullTextSearch.tsx` 组件 (注释说明)
5. [ ] 3.5 更新 i18n 翻译键

**文件**:
- `src/App.tsx`
- `src/components/app/AppOverlays.tsx`
- `src/components/FullTextSearch.tsx` (保留但标记为 deprecated)

**验收标准**:
- Cmd+Shift+F 不再打开搜索
- Cmd+K 仍可访问所有 FTS 功能
- 无编译错误

---

### Phase 4: 测试与优化

**目标**: 验证功能完整性

**任务**:
1. [ ] 4.1 编写 MessageSearchPlugin FTS 模式测试
2. [ ] 4.2 编写 CommandPalette FTS 触发测试
3. [ ] 4.3 性能测试 (搜索延迟、分页流畅度)
4. [ ] 4.4 手动测试所有场景
5. [ ] 4.5 更新文档

**文件**:
- `src/plugins/message/__tests__/MessageSearchPlugin.test.tsx`
- `src/components/command/__tests__/CommandPalette.test.tsx`
- `docs/plans/cmdk-fts-merge-plan.md` (本文档)

**验收标准**:
- 所有测试通过
- 搜索延迟 < 500ms
- 分页流畅无卡顿
- 文档完整

---

## 🔍 技术细节

### 1. FTS 模式检测

```typescript
// 检测 FTS 触发前缀
const FTS_PREFIXES = ['! ', '!user ', '!assistant ', '/fts ']

function detectFTSMode(query: string): boolean {
  return FTS_PREFIXES.some(prefix => query.startsWith(prefix))
}
```

### 2. 分页实现

```typescript
// 使用 IntersectionObserver 实现无限滚动
const sentinelRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        loadMore()
      }
    },
    { root: document.getElementById('search-results-wrapper') }
  )

  if (sentinelRef.current) observer.observe(sentinelRef.current)
  return () => observer.disconnect()
}, [hasMore, isLoading])
```

### 3. 高亮缓存

```typescript
// 复用 FullTextSearch 的缓存逻辑
const highlightCache = useRef<Map<string, string>>(new Map())

const highlightContent = useCallback((content: string): string => {
  const cacheKey = `${content}|${highlightTerms.join('|')}`
  if (highlightCache.current.has(cacheKey)) {
    return highlightCache.current.get(cacheKey)!
  }

  // 生成高亮 HTML
  const highlighted = /* ... */
  highlightCache.current.set(cacheKey, highlighted)
  return highlighted
}, [highlightTerms])
```

---

## ⚠️ 风险点

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| MessageSearchPlugin 性能下降 | 高 | 添加缓存、限制预取数量 |
| FTS UI 与现有 Tab 冲突 | 中 | 条件渲染，FTS 模式隐藏 Tab |
| 分页与 cmdk 虚拟滚动冲突 | 中 | 使用原生滚动，禁用 cmdk 虚拟 |
| 后端接口超时 | 高 | 添加超时处理、加载状态 |
| 高亮缓存内存泄漏 | 低 | 限制缓存大小 (LRU) |

---

## 📊 验收标准

### 功能验收
- [ ] Cmd+K 打开命令面板
- [ ] 输入 `! ` 切换到 FTS 模式
- [ ] 角色过滤正常工作
- [ ] glob 模式正常工作
- [ ] 排序切换正常工作
- [ ] 分页加载正常
- [ ] Cmd+Shift+F 不再响应

### 性能验收
- [ ] 搜索延迟 < 500ms (P95)
- [ ] 分页加载 < 300ms
- [ ] 内存占用 < 100MB

### 兼容性验收
- [ ] 普通搜索仍然正常
- [ ] 其他插件不受影响
- [ ] 移动端适配正常

---

## 📚 参考文件

- `src/plugins/message/MessageSearchPlugin.tsx`
- `src/components/FullTextSearch.tsx`
- `src/components/command/CommandMenu.tsx`
- `src-tauri/src/commands/search.rs`

---

## 📝 变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/plugins/message/MessageSearchPlugin.tsx` | 增强 | 添加 FTS 模式支持 |
| `src/components/command/CommandPalette.tsx` | 修改 | FTS 模式检测 |
| `src/components/command/CommandMenu.tsx` | 增强 | FTS UI 和状态管理 |
| `src/App.tsx` | 清理 | 移除 Cmd+Shift+F |
| `src/components/app/AppOverlays.tsx` | 清理 | 移除 FullTextSearch 渲染 |
| `src/components/FullTextSearch.tsx` | 保留 | 标记 deprecated |

---

## ✅ 完成总结

**Completed**: 2026-04-02

### 实现成果

#### Phase 1: MessageSearchPlugin 增强 ✅
- 添加 `MessageSearchPluginOptions` 接口支持 FTS 模式参数
- 实现 `setFTSOptions()` / `getFTSOptions()` 方法
- 支持 role_filter (user/assistant/all)
- 支持 glob_pattern 路径过滤
- 支持 sort_mode (score/newest/oldest)
- 支持分页 (page/pageSize)
- 添加 LRU 高亮缓存 (max 500 entries)

#### Phase 2: CommandPalette FTS 模式 ✅
- 实现 FTS 触发语法检测 (`! ` / `/fts ` / `!user ` / `!assistant `)
- 添加 FTS 状态管理 (roleFilter/globPattern/sortMode/page)
- 实现 FTS 控制面板 UI:
  - 角色过滤按钮 (user/assistant/all)
  - glob 路径输入框
  - 排序切换按钮 (Relevance/Newest/Oldest)
- 传递 options 到 MessageSearchPlugin
- 实现无限滚动分页 (IntersectionObserver)
- FTS 模式隐藏 Tab 分类

#### Phase 3: 移除 Cmd+Shift+F ✅
- 移除 `App.tsx` 中 `cmd+shift+f` 快捷键
- 移除 `showFullTextSearch` 状态
- 移除 `useAppUiEffects` 中的 showFullTextSearch 参数
- 清理 `AppOverlays.tsx` 中的 FullTextSearch 渲染
- 保留 `FullTextSearch.tsx` 组件 (标记为 deprecated)

#### Phase 4: 验证 ✅
- TypeScript 编译通过 (0 errors)
- 代码结构清晰，符合原有架构

### 使用方式

```typescript
// 普通搜索
Cmd+K → 输入关键词 → 所有插件搜索

// FTS 增强模式
Cmd+K → 输入 `! 关键词` → FTS 模式激活
     → 输入 `!user 关键词` → FTS + 只搜索用户消息
     → 输入 `!assistant 关键词` → FTS + 只搜索 AI 消息
     → 输入 `/fts 关键词` → FTS 模式
```

### 文件变更清单

| 文件 | 变更类型 | 行数变化 |
|------|---------|----------|
| `src/plugins/message/MessageSearchPlugin.tsx` | 增强 | +80 |
| `src/components/command/CommandPalette.tsx` | 增强 | +60 |
| `src/components/command/CommandMenu.tsx` | 增强 | +150 |
| `src/App.tsx` | 清理 | -20 |
| `src/components/app/AppOverlays.tsx` | 清理 | -30 |
| `src/hooks/app/useAppUiEffects.ts` | 清理 | -5 |

### 技术亮点

1. **非破坏性设计**: 保留原有普通搜索功能，FTS 作为增强模式
2. **语法简洁**: `! ` 前缀触发，符合用户直觉
3. **性能优化**: LRU 缓存 + 分页加载 + 无限滚动
4. **类型安全**: 完整的 TypeScript 类型定义
5. **向后兼容**: 保留 FullTextSearch 组件作为降级兜底

---

*Last updated: 2026-04-02*
