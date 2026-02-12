# 看板功能 UX 深度分析与 BBD 测试

> 「問題は見えないところにある」— 問題往往藏在看不见的地方

## 一、当前架构链路分析

### 1.1 视图模式切换逻辑

```
App.tsx 视图状态机
├── viewMode='list'
│   ├── 左侧: TagFilter + SessionList (所有会话)
│   └── 右侧: Dashboard (统计面板)
│
├── viewMode='project'
│   ├── 左侧: ProjectList (项目列表)
│   │   └── 点击项目 → SessionList (该项目会话)
│   └── 右侧: Dashboard
│
└── viewMode='kanban'
    ├── 左侧: TagFilter (标签筛选) ← 问题 A
    └── 右侧: KanbanBoard (按标签分组的看板)
```

### 1.2 问题诊断

#### 问题 A：看板模式左侧显示 TagFilter 很奇怪
- **现象**: 看板模式左侧仍然显示标签筛选器（待处理/进行中/已完成等）
- **困惑点**: 右侧看板本身就是按标签分组的列，左侧标签筛选的意义是什么？
- **用户认知冲突**: "我想按项目筛选，但左侧是标签"

#### 问题 B：看板模式无法按项目筛选
- **现象**: 看板显示所有项目的会话混在一起
- **用户期望**: "我想看某个特定项目的看板视图"
- **缺失功能**: 没有项目维度的筛选器

#### 问题 C：筛选逻辑不一致
- **list 模式**: TagFilter 筛选会话列表
- **kanban 模式**: TagFilter 筛选看板中显示的会话，但列标题仍然是所有标签
- **用户体验断裂**: 不同模式下 TagFilter 行为不一致

## 二、用户场景 BBD 测试用例

### 场景 1: 项目维度的看板视图
```gherkin
Feature: 看板模式下的项目筛选

  Scenario: 用户想查看特定项目的看板
    Given 用户在看板视图
    And 有多个项目存在（project-a, project-b）
    When 用户在左侧选择 project-a
    Then 看板只显示 project-a 的会话
    And 看板列仍然是按标签分组（待处理/进行中/已完成）

  Scenario: 用户想查看所有项目的看板
    Given 用户在看板视图
    When 用户不选择任何项目（"全部项目"）
    Then 看板显示所有项目的会话
    And 每个会话卡片显示其所属项目
```

### 场景 2: 看板左侧边栏的期望
```gherkin
Feature: 看板模式左侧边栏内容

  Scenario: 切换到看板模式
    Given 用户在列表视图
    When 用户切换到看板视图
    Then 左侧边栏显示项目列表
    And 不包含 TagFilter 组件

  Scenario: 在看板模式选择项目
    Given 用户在看板视图
    And 左侧显示项目列表
    When 用户点击某个项目
    Then 该项目被高亮选中
    And 看板内容更新为该项目会话
```

### 场景 3: 跨视图状态一致性
```gherkin
Feature: 项目选择在视图间保持一致

  Scenario: 从项目视图切换到看板视图
    Given 用户在项目视图
    And 已选择 project-a
    When 用户切换到看板视图
    Then 看板默认只显示 project-a 的会话
    And 左侧项目列表中 project-a 被选中

  Scenario: 从看板视图切换到列表视图
    Given 用户在看板视图
    And 已选择 project-a
    When 用户切换到列表视图
    Then 列表视图显示 project-a 的会话
```

## 三、改进方案设计

### 3.1 架构调整

```
改进后的看板模式
├── 左侧边栏
│   ├── 顶部工具栏
│   └── 项目筛选列表 (ProjectFilterList) ← 新增
│       ├── "全部项目" 选项
│       └── 各项目列表项（显示会话数量）
│
└── 右侧主区域
    └── KanbanBoard
        ├── 顶部标签筛选器 (TagFilterBar) ← 移至此处
        └── 看板列（按标签分组）
```

### 3.2 数据结构扩展

```typescript
// App.tsx 新增状态
const [kanbanProjectFilter, setKanbanProjectFilter] = useState<string | null>(null)

// KanbanBoard 接收项目筛选
interface KanbanBoardProps {
  // ... existing props
  projectFilter?: string | null  // null = 全部项目
}

// 过滤逻辑
const kanbanSessions = useMemo(() => {
  if (!kanbanProjectFilter) return sessions
  return sessions.filter(s => s.cwd === kanbanProjectFilter)
}, [sessions, kanbanProjectFilter])
```

### 3.3 组件调整

| 组件 | 当前行为 | 改进行为 |
|------|----------|----------|
| App.tsx (左侧) | kanban 模式显示 TagFilter | kanban 模式显示 ProjectFilterList |
| KanbanBoard.tsx | 接收所有 sessions | 接收 projectFilter，内部过滤 |
| TagFilter.tsx | 在左侧边栏 | 移至看板顶部作为 TagFilterBar |

## 四、实施计划

### Phase 1: 项目筛选器组件
- [ ] 创建 `ProjectFilterList` 组件
- [ ] 支持 "全部项目" 选项
- [ ] 显示各项目会话数量

### Phase 2: 看板模式左侧改造
- [ ] App.tsx 条件渲染：kanban 模式显示 ProjectFilterList
- [ ] 隐藏 kanban 模式下的 TagFilter

### Phase 3: 看板接收项目筛选
- [ ] KanbanBoard 接收 projectFilter prop
- [ ] 内部根据 projectFilter 过滤 sessions
- [ ] TagFilterBar 移至看板顶部

### Phase 4: 跨视图状态同步
- [ ] 项目选择在 viewMode 切换时保持一致
- [ ] 从 project 视图切换到 kanban 视图保留项目选择

## 五、验收标准

- [ ] 看板模式左侧显示项目列表，而非标签筛选
- [ ] 选择项目后看板只显示该项目的会话
- [ ] "全部项目" 选项显示所有项目的会话
- [ ] 会话卡片在看板中显示所属项目（当选择全部项目时）
- [ ] 从其他视图切换到看板视图保留项目选择状态
- [ ] 标签筛选器移至看板顶部，只影响看板内容

---

> 「整理は、未来の自分への贈り物」— 整理，是给未来自己的礼物
