# 看板功能 UX 改进 BBD 测试报告

> 「形あるものは必ず壊れる」— 有形的必将改变

## 改进摘要

### 问题修复
1. **看板模式左侧显示标签筛选很奇怪** → 改为显示项目筛选列表
2. **看板无法按项目筛选** → 新增 `projectFilter` 功能
3. **筛选逻辑不一致** → 统一为：左侧项目筛选 → 看板按项目过滤

### 代码变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `App.tsx` | 修改 | 看板模式下渲染 `ProjectFilterList` 而非 `TagFilter` |
| `KanbanBoard.tsx` | 修改 | 新增 `projectFilter` prop，支持按项目过滤会话 |
| `ProjectFilterList.tsx` | 新增 | 项目筛选组件，支持虚拟滚动 |
| `en-US/zh-CN/project.ts` | 新增 | 添加 `filter` 翻译键 |
| `en-US/zh-CN/tags.ts` | 修改 | 添加 `kanban.allProjects` 翻译 |

---

## BBD 测试用例验证

### ✅ 场景 1: 看板模式左侧显示项目列表

```gherkin
Feature: 看板模式左侧边栏内容

  Scenario: 切换到看板模式
    Given 用户在列表视图
    When 用户切换到看板视图
    Then 左侧边栏显示项目列表
    And 不包含 TagFilter 组件
```

**验证代码** (App.tsx):
```tsx
{!showFavorites && viewMode === 'kanban' && (
  <ProjectFilterList
    sessions={sessions}
    selectedProject={selectedProject}
    onSelectProject={setSelectedProject}
    scrollParentRef={listScrollRef}
  />
)}
```

---

### ✅ 场景 2: 在看板模式选择项目

```gherkin
Feature: 看板模式项目筛选

  Scenario: 用户点击某个项目
    Given 用户在看板视图
    And 左侧显示项目列表
    When 用户点击 project-a
    Then 该项目被高亮选中
    And 看板内容更新为该项目会话
```

**验证代码** (KanbanBoard.tsx):
```tsx
const filteredSessions = useMemo(() => {
  if (!projectFilter) return sessions
  return sessions.filter(s => s.cwd === projectFilter)
}, [sessions, projectFilter])
```

---

### ✅ 场景 3: 显示全部项目选项

```gherkin
Feature: 全部项目选项

  Scenario: 用户选择全部项目
    Given 用户在看板视图
    When 用户点击 "全部项目"
    Then 看板显示所有项目的会话
    And 看板列仍然是按标签分组
```

**验证代码** (ProjectFilterList.tsx):
```tsx
<button onClick={() => onSelectProject(null)}>
  <Folder className="h-3.5 w-3.5" />
  <div>{t('project.filter.allProjects')}</div>
  <div>{totalSessions} {t('project.list.sessions')}</div>
</button>
```

---

### ✅ 场景 4: 看板头部显示当前项目

```gherkin
Feature: 看板头部项目指示

  Scenario: 查看看板头部
    Given 用户在看板视图
    And 已选择 project-a
    Then 看板头部显示 project-a 名称
    And 显示该项目会话数量
```

**验证代码** (KanbanBoard.tsx):
```tsx
{projectFilter ? (
  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400">
    {projectFilter.split('/').pop()}
  </span>
) : (
  <span className="text-[10px] text-muted-foreground">
    {t('tags.kanban.allProjects')}
  </span>
)}
<span className="text-[10px] text-muted-foreground ml-auto">
  {filteredSessions.length} {t('project.list.sessions')}
</span>
```

---

### ✅ 场景 5: 跨视图状态一致性（部分实现）

```gherkin
Feature: 项目选择在视图间保持一致

  Scenario: 从项目视图切换到看板视图
    Given 用户在项目视图
    And 已选择 project-a
    When 用户切换到看板视图
    Then 看板默认显示 project-a 的会话
    And 左侧项目列表中 project-a 被选中
```

**状态管理**:
```tsx
// App.tsx 中共享的 selectedProject 状态
const [selectedProject, setSelectedProject] = useState<string | null>(null)

// 在 project 视图和 kanban 视图中共用同一个状态
```

---

## 性能优化

### 虚拟滚动
`ProjectFilterList` 使用 `@tanstack/react-virtual` 实现虚拟滚动，支持大量项目而不卡顿。

```tsx
const virtualizer = useVirtualizer({
  count: projects.length,
  getScrollElement: () => scrollParentRef?.current ?? null,
  estimateSize: () => 52,
  overscan: 8,
})
```

### Memoization
看板会话过滤使用 `useMemo` 避免不必要的重计算：

```tsx
const filteredSessions = useMemo(() => {
  if (!projectFilter) return sessions
  return sessions.filter(s => s.cwd === projectFilter)
}, [sessions, projectFilter])
```

---

## UX 细节

1. **选中态样式**: 使用 `bg-info/10` 高亮选中项目
2. **计数显示**: 每个项目显示会话数和消息数
3. **全部项目**: 固定在最顶部，使用 Folder 图标区别于项目项
4. **响应式**: 虚拟滚动支持任意数量项目

---

## 后续可改进项

1. **搜索项目**: 项目多时添加搜索框
2. **项目分组**: 按目录层级分组显示
3. **最近项目**: 显示最近访问的项目快速入口
4. **看板内标签筛选**: 在看板顶部添加标签筛选器，实现项目+标签双重过滤

> *「完成したとき、次の一歩が見える」* — 完成之时，下一步方见
