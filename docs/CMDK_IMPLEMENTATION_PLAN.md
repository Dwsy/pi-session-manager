# cmdk 全局搜索实施计划

## 快速概览

**目标**: 为 Pi Session Manager 添加基于 cmdk 的全局搜索功能，支持插件式架构

**预计工期**: 3-5 天

**复杂度**: L3（复杂任务）

**相关文档**:
- Issue: `docs/issues/20260131-Add cmdk global search with plugin architecture.md`
- 架构设计: `docs/architecture/cmdk-plugin-system.md`

---

## 实施阶段

### ✅ Phase 1: 规划和准备（已完成）

- [x] 分析现有代码结构
- [x] 设计插件系统架构
- [x] 确定技术方案和依赖
- [x] 制定实施计划
- [x] 创建 Workhub Issue
- [x] 编写架构设计文档

**输出**:
- Issue 文档
- 架构设计文档
- 实施计划

---

### Phase 2: 核心架构实现（预计 1 天）

#### 2.1 安装依赖

```bash
pnpm add cmdk
```

#### 2.2 创建插件系统基础设施

**文件清单**:
- `src/plugins/types.ts` - 插件接口定义
- `src/plugins/registry.ts` - 插件注册表
- `src/plugins/base/BaseSearchPlugin.ts` - 插件基类
- `src/plugins/index.ts` - 导出

**关键接口**:
```typescript
interface SearchPlugin {
  id: string
  name: string
  icon: React.ComponentType
  search(query: string, context: SearchContext): Promise<SearchPluginResult[]>
  onSelect(result: SearchPluginResult, context: SearchContext): void
}
```

#### 2.3 创建 Hooks

**文件清单**:
- `src/hooks/useCommandMenu.ts` - 状态管理
- `src/hooks/useSearchPlugins.ts` - 插件管理
- `src/hooks/useSearchCache.ts` - 搜索缓存

**核心功能**:
- 防抖搜索（300ms）
- 搜索请求取消
- LRU 缓存（100 条，5 分钟 TTL）

#### 2.4 创建核心组件

**文件清单**:
- `src/components/command/CommandPalette.tsx` - 容器
- `src/components/command/CommandMenu.tsx` - 主组件
- `src/components/command/CommandItem.tsx` - 结果项
- `src/components/command/CommandEmpty.tsx` - 空状态
- `src/components/command/CommandLoading.tsx` - 加载状态
- `src/components/command/index.ts` - 导出

**验收标准**:
- [ ] 按 Cmd+K 打开命令面板
- [ ] 按 ESC 关闭命令面板
- [ ] 输入查询显示加载状态
- [ ] 空查询显示空状态

---

### Phase 3: 内置插件实现（预计 1 天）

#### 3.1 MessageSearchPlugin

**文件**: `src/plugins/message/MessageSearchPlugin.ts`

**功能**:
- 集成现有 `search_sessions` API
- 搜索用户消息和助手回复
- 高亮匹配文本
- 导航到对应会话

**验收标准**:
- [ ] 搜索消息内容
- [ ] 显示匹配片段
- [ ] 点击结果打开会话

#### 3.2 ProjectSearchPlugin

**文件**: `src/plugins/project/ProjectSearchPlugin.ts`

**功能**:
- 从 sessions 提取项目列表
- 模糊匹配项目路径
- 显示会话数量
- 切换到项目视图

**验收标准**:
- [ ] 搜索项目名称
- [ ] 显示会话数量
- [ ] 点击结果切换项目

#### 3.3 SessionSearchPlugin

**文件**: `src/plugins/session/SessionSearchPlugin.ts`

**功能**:
- 搜索会话名称、路径、第一条消息
- 显示会话元数据（消息数、修改时间）
- 导航到会话

**验收标准**:
- [ ] 搜索会话名称
- [ ] 搜索会话路径
- [ ] 点击结果打开会话

---

### Phase 4: UI/UX 优化（预计 0.5 天）

#### 4.1 样式设计

**文件**: `src/styles/command.css`

**设计要点**:
- 居中模态框（max-w-2xl）
- 半透明背景遮罩（bg-black/50）
- 暗色主题配色
- 平滑动画（fade + zoom）

**验收标准**:
- [ ] 面板居中显示
- [ ] 背景遮罩半透明
- [ ] 打开/关闭动画流畅
- [ ] 结果项 hover 效果

#### 4.2 高亮匹配文本

**文件**: `src/utils/highlight.ts`

**功能**:
- 计算高亮范围
- 渲染高亮标记
- 支持多个高亮区域

**验收标准**:
- [ ] 匹配文本高亮显示
- [ ] 高亮颜色清晰可见
- [ ] 支持多个匹配

#### 4.3 键盘导航

**功能**:
- ↑↓ 导航结果
- Enter 选择结果
- ESC 关闭面板
- Tab 切换插件（可选）

**验收标准**:
- [ ] 键盘导航流畅
- [ ] 选中项高亮显示
- [ ] 快捷键响应及时

---

### Phase 5: 性能优化（预计 0.5 天）

#### 5.1 虚拟滚动

**文件**: `src/components/command/CommandList.tsx`

**功能**:
- 使用 @tanstack/react-virtual
- 阈值：50 条结果
- 估计项高度：60px

**验收标准**:
- [ ] 超过 50 条结果使用虚拟滚动
- [ ] 滚动流畅（60fps）
- [ ] 内存占用合理

#### 5.2 搜索优化

**功能**:
- 防抖 300ms
- 取消未完成的搜索
- 并行执行插件搜索

**验收标准**:
- [ ] 搜索响应时间 < 300ms（1000 条数据）
- [ ] 取消搜索正常工作
- [ ] 并行搜索提升性能

#### 5.3 缓存优化

**功能**:
- LRU 缓存（100 条）
- 缓存时间：5 分钟
- 缓存键：`${pluginId}:${query}`

**验收标准**:
- [ ] 重复搜索命中缓存
- [ ] 缓存过期自动清理
- [ ] 内存占用 < 50MB

---

### Phase 6: 集成和测试（预计 1 天）

#### 6.1 集成到 App

**修改文件**: `src/App.tsx`

**步骤**:
1. 导入 CommandPalette
2. 注册内置插件
3. 传递搜索上下文

**代码示例**:
```typescript
import CommandPalette from './components/command/CommandPalette'
import { registerBuiltinPlugins } from './plugins'

function App() {
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

#### 6.2 国际化

**修改文件**:
- `src/i18n/locales/zh.json`
- `src/i18n/locales/en.json`

**新增翻译**:
- command.placeholder
- command.empty
- command.loading
- command.plugins.*

#### 6.3 测试

**测试清单**:
- [ ] 快捷键触发（Cmd+K / Ctrl+K）
- [ ] 搜索所有插件
- [ ] 结果选择和导航
- [ ] 键盘导航
- [ ] 国际化切换
- [ ] 性能测试（1000 条数据）
- [ ] 边界情况（空查询、无结果、错误处理）

---

### Phase 7: 文档和交付（预计 0.5 天）

#### 7.1 更新文档

**文件清单**:
- `README.md` - 添加 cmdk 功能说明
- `docs/PLUGIN_DEVELOPMENT.md` - 插件开发指南（新建）
- `docs/USAGE.md` - 使用指南（新建）

#### 7.2 创建 PR

**步骤**:
1. 创建 PR 文档
2. 关联 Issue
3. 列出变更明细
4. 添加测试结果

**命令**:
```bash
cd /Users/dengwenyu/Dev/AI/pi-session-manager
bun ~/.pi/agent/skills/workhub/lib.ts create pr "Add cmdk global search with plugin architecture"
```

#### 7.3 代码审查

**审查要点**:
- 代码质量
- 性能指标
- 类型安全
- 错误处理
- 文档完整性

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| cmdk | ^1.0.0 | 命令面板核心库 |
| React | ^18.3.1 | UI 框架 |
| TypeScript | ^5.6.3 | 类型系统 |
| @tanstack/react-virtual | ^3.10.8 | 虚拟滚动（已有） |
| Tailwind CSS | ^3.4.0 | 样式系统（已有） |
| i18next | ^25.8.0 | 国际化（已有） |

---

## 关键决策

| 决策 | 理由 |
|------|------|
| 使用 cmdk 库 | 成熟、专业、被广泛使用 |
| 插件式架构 | 可扩展、易维护、符合开放封闭原则 |
| 防抖 300ms | 平衡响应速度和性能 |
| 虚拟滚动阈值 50 | 基于性能测试的最佳实践 |
| LRU 缓存 | 提升重复搜索性能 |
| 并行搜索 | 提升整体响应速度 |
| 保留现有 SearchPanel | 提供两种搜索方式 |

---

## 风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 性能问题（大量数据） | 高 | 虚拟滚动 + 缓存 + 防抖 |
| 插件冲突 | 中 | 插件隔离 + 错误处理 |
| UI 不美观 | 中 | 参考 Vercel/Linear 设计 |
| 国际化遗漏 | 低 | 完整的翻译文件 |
| 快捷键冲突 | 低 | 使用标准快捷键（Cmd+K） |

---

## 验收标准总结

### 功能性
- [x] Cmd+K / Ctrl+K 打开命令面板
- [ ] 实时搜索（防抖 300ms）
- [ ] 搜索用户消息
- [ ] 搜索项目
- [ ] 搜索会话
- [ ] 选择结果导航
- [ ] ESC 关闭面板

### 性能
- [ ] 搜索响应时间 < 300ms（1000 条数据）
- [ ] 首次渲染时间 < 100ms
- [ ] 虚拟滚动流畅（60fps）
- [ ] 内存占用 < 50MB（10000 条缓存）

### UI/UX
- [ ] 面板居中显示
- [ ] 半透明背景遮罩
- [ ] 平滑动画
- [ ] 高亮匹配文本
- [ ] 键盘导航流畅
- [ ] 加载状态和空状态

### 国际化
- [ ] 中英文切换
- [ ] 所有文本已翻译
- [ ] 快捷键提示根据系统显示

---

## 下一步行动

1. **立即开始**: Phase 2（核心架构实现）
2. **安装依赖**: `pnpm add cmdk`
3. **创建目录结构**: `src/plugins/`, `src/components/command/`
4. **实现插件系统**: 从 `types.ts` 和 `registry.ts` 开始

**预计完成时间**: 2026-02-05

---

## 参考资源

- [cmdk 官方文档](https://cmdk.paco.me/)
- [Vercel 设计系统](https://vercel.com/design)
- [Linear 命令面板](https://linear.app/)
- [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
- [架构设计文档](./architecture/cmdk-plugin-system.md)
- [Issue 文档](./issues/20260131-Add%20cmdk%20global%20search%20with%20plugin%20architecture.md)
