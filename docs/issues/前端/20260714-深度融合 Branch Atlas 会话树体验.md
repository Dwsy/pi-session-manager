---
id: "2026-07-14-深度融合-branch-atlas-会话树体验"
title: "深度融合 Branch Atlas 会话树体验"
status: "verification"
created: "2026-07-14"
updated: "2026-07-14"
category: "前端"
tags: ["session-tree", "branch-map", "timeline", "plugin"]
---

# Issue: 深度融合 Branch Atlas 会话树体验

## Goal

将 `~/Downloads/pi-branch-atlas-v1-source` 的产品级会话分支体验深度融合到 Pi Session Manager，以主项目真实会话数据、插件合同和主题系统为边界，统一左侧会话树、Branch Map 和路径追踪时间线。

## 背景/问题

Branch Atlas demo 专门用于增强本项目的会话树功能。当前主项目已有 embedded session sidebar、flow/session graph 插件以及 `timeline-pane` / `path-timeline-pane`，但三者的分支语义、选中状态和追踪体验尚未统一。本任务不是把 demo 作为独立页面嵌入，而是移植其产品交互并适配主项目既有架构。

## 验收标准 (Acceptance Criteria)

- [ ] WHEN 用户在会话查看器中打开左侧 embedded sidebar，系统 SHALL 使用 Branch Atlas 的完整会话树体验展示真实 Pi 会话分支。
- [ ] WHEN 用户折叠、搜索、选择或键盘导航树节点，系统 SHALL 保持 Branch Atlas 的交互语义，并与主项目当前会话选择和消息定位同步。
- [ ] WHERE 当前 flow/session graph 插件入口，系统 SHALL 使用完整 Branch Map 替换旧图视图，不保留两套竞争实现。
- [ ] WHEN Branch Map 中选择节点或分支，系统 SHALL 同步主项目当前会话、路径和消息焦点。
- [ ] WHERE `timeline-pane` 与 `path-timeline-pane`，系统 SHALL 使用 Branch Atlas tracking 体验替换现有路径追踪展示。
- [ ] WHEN 主题在 dark/light/base46 间切换，所有新增界面 SHALL 使用主项目语义 token 并保持可读性。
- [ ] IF 数据缺少可选 parent/branch 元信息，THEN 系统 SHALL 明确降级展示，不制造错误父子关系。
- [ ] WHEN 插件在浏览器宿主加载，系统 SHALL 遵守 PSM Plugin SDK 公共边界，不导入 host 私有模块。
- [ ] WHEN 运行目标测试、TypeScript 检查、插件构建和主应用构建，系统 SHALL 全部通过。

## 实施阶段

### Phase 1: 代码与产品调研
- [x] 定位主项目 embedded session sidebar、flow 插件和 timeline panes 的真实调用链。
- [x] 理解 Branch Atlas 会话树、Branch Map、tracking 的组件、状态、数据模型、样式和测试。
- [x] 建立 demo 数据模型到 PSM 真实 session/entry 数据的映射表。

### Phase 2: 融合设计确认
- [x] 明确 host 与 plugin 的职责边界。
- [x] 明确共享 branch projection、选中状态、消息定位和降级规则。
- [x] 输出文件级变更计划、风险和验证矩阵，并经用户确认。

### Phase 3: 左侧会话树
- [x] 移植会话树视觉与交互到 `.session-sidebar--embedded`。
- [x] 复用主项目真实数据、热键和会话操作，并统一 branch activation。
- [x] 补充树结构、选择、折叠、搜索和降级测试。

### Phase 4: Branch Map
- [x] 用 Branch Atlas BRANCH MAP 替换当前 flow/session graph 插件实现。
- [x] 适配 PSM Plugin SDK、真实 session entries 和宿主主题。
- [x] 补充布局、选择同步和插件加载测试。

### Phase 5: Tracking Timeline
- [x] 用 Branch Atlas `TimelinePane` 完整替换 `psm-trace` 主视图。
- [x] 融合 segment lineage、effective context、ending navigation 与 branch-aware viewer controller。
- [x] 补充路径计算、定位同步和空数据测试。

### Phase 6: 验证与交付
- [x] 运行目标 Vitest 测试（93 passed）。
- [x] 运行 `tsc --noEmit` 与 extension typecheck。
- [x] 通过主应用 production build，确认两个插件产物生成。
- [x] 在 dataset browser 中验证 embedded Branch Outline 布局、交互和控制台。
- [x] 完成最终 diff review，并修复 parentId 降级、重复 ID、live Tree/Timeline 同步、Canvas 主题重绘和残留 Flow chunk 配置。
- [ ] 全量 Vitest 的 4 个无关 suite 仍受 `@lobehub/fluent-emoji` ESM 收集错误阻塞。

## 关键决策

| 决策 | 理由 |
|------|------|
| 先调研和确认融合设计，再开始产品级移植 | 任务横跨宿主、插件和共享状态，直接复制会造成双重状态源和 SDK 越界 |
| 以主项目真实数据合同为准，demo 作为交互与视觉参考实现 | 遵守 Code First，避免把 fixture 假设带进生产数据 |
| 只保留一套 branch projection 语义 | 左树、Branch Map、tracking 必须对同一 parent/path 事实得出一致结果 |
| 保留并逐段兼容工作区现有未提交改动 | 当前目标文件已有用户改动，禁止覆盖或回退 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-07-14 | 全量 Vitest 有 4 个无关 suite 在收集阶段因 `@lobehub/fluent-emoji/es/FluentEmoji` directory import 失败 | 已确认本次 lockfile 只移除 `@xyflow/react`，未修改 fluent-emoji；记录为基线阻塞，聚焦 93 tests 与其余 536 tests 均通过 |
| 2026-07-14 | `npm uninstall --package-lock-only` 首次因现有 LobeHub React peer 冲突失败 | 使用 `--legacy-peer-deps` 仅计算孤儿包，再从 HEAD lockfile 做最小删除，避免 npm 重写无关 dev flags |
| 2026-07-14 | 审查发现缺失/重复 `parentId` 会生成虚假确定拓扑，live 视图也会丢失用户局部状态 | 缺失/歧义关系统一保留为根节点并给出 diagnostics；Tree 仅按 session/filter 重置；Timeline 随 active entry 重读；Canvas 监听主题属性重绘 |

## 相关资源

- [x] 主项目设计系统: `DESIGN.md`
- [x] 主项目前端架构: `agent-docs/02-frontend.md`
- [ ] 插件合同: `agent-docs/06-plugins.md`
- [x] Demo 源码: `~/Downloads/pi-branch-atlas-v1-source`

## 融合设计（已确认）

### 1. 统一领域核心

新增 app-internal 的纯 TypeScript branch domain cluster，供 host 会话树、`psm-session-graph` 和 `psm-trace` 三处共同使用：

```text
Normalized SessionEntry[]
  -> storage graph (parentId path)
  -> visual graph (BranchSegment / BranchFork)
  -> selectors (tree / map / timeline)
```

核心约束：

- `parentId` 只表达存储前驱关系；只有一个节点存在多个直接 children 时才产生视觉 fork。
- 每个 maximal single-child run 投影为一个 `BranchSegment`，线性对话不会逐行增加缩进。
- 原始 entries 保持 immutable；模型只派生 UID、segment、metrics、semantic notes 和 diagnostics。
- 缺父节点、自引用、cycle、重复 ID、preview 无 parentId 等情况显式降级，不制造虚假分支。
- JSONL 主路径、Pi Live registry、SQLite preview 三种输入共享一个 adapter，但保留 topology quality 标记。

建议文件边界：

```text
src/utils/session-branch/
  types.ts          # app-internal structural contracts
  buildModel.ts     # storage graph + segment/fork projection
  selectors.ts      # tree/path/context/timeline projections
  topology.ts       # Branch Map layout/projection
  adapter.ts        # SessionEntry -> normalized branch input
  *.test.ts
```

不把该领域模型加入公共 Plugin SDK；两个目标插件都是 first-party built-in，可按现有规则复用 app-internal 模块。

### 2. 左侧 embedded Session Tree

保留 `SessionViewerSidebar` 的 placement、resize、mobile、label loading 和 plugin boundary，只替换 `SessionTree` 内部的视觉投影与行渲染：

- 使用 segment header + entry row 两级虚拟列表。
- 完整移植 active lineage、branch code、fork anchor、sticky segment、过滤、AND 搜索和同 segment 前后文。
- 保留主项目现有 Arrow/Page/Home/End/Enter/Space/Escape 与 roving tabindex；demo 缺失的键盘能力不回退。
- collapsed key 从 entry ID 改为 `segment.uid`。
- active leaf、selected entry、focused row 保持三个独立状态。
- branch activation 统一更新 host `activeEntryId=leafId`，滚动目标仍使用 `targetId`。

### 3. Branch Map 替换 Flow 插件

在 `extensions/psm-session-graph` 内移除 React Flow 图实现，移植 demo 的 Canvas Branch Map：

- 保留插件目录和稳定 registration ID，避免 built-in discovery / 持久化入口失效。
- Map 直接消费共享 branch model，不再复制第二套 `buildTree/activePath`。
- 支持 overview、全屏 Atlas、sequence/time axis、scope/model/note filters、pan/zoom/hit cache、semantic callouts。
- 只绘制真实 fork connector；普通 parentId continuation 只形成 segment rail。
- 选中只更新 Map inspector；激活才通过 host `onNavigate(leafId,targetId)` 同步树和消息。
- 样式映射到 PSM semantic tokens、i18n 和 reduced-motion，不复制 demo 独立主题/app shell。

### 4. Trace 替换为 Path Timeline

将用户所称“追踪”映射到现有 `extensions/psm-trace` session main view；demo 的 `.timeline-pane.path-timeline-pane` 在主项目中并不存在，它是 demo 自己的中间 pane。

建议完整替换 `psm-trace` 当前 analytics timeline/path list UI：

- 保留 `psm-trace` 插件 ID、main-view registration 和 `sessions:read` 边界。
- 主体改为 Active Path Timeline：branch ending、segment lineage、累计 metrics、四种 timeline mode、compaction context、segment scope、虚拟 rows。
- previous/next ending、row activation 与左树/Branch Map 共用 active leaf。
- 需要给可选的 `PsmSessionViewerController` 增加 branch-aware navigation（`leafId + targetId`），否则 main view 无法同时表达“切换终点”和“定位目标 entry”。该能力由 host 拥有滚动与 active branch 生命周期。

### 5. 状态与导航合同

```text
active leaf      host SessionViewer.activeEntryId（单一权威）
selected node    当前 surface 的局部 UI 状态
focused row      当前 surface 的局部键盘状态
activate branch  navigateBranch(leafId, targetId)
reveal only      revealEntry(targetId)
```

- Tree / Map / Timeline 不直接查询或操作消息 DOM。
- Branch Map 继续使用 tree-view `onNavigate`。
- Trace main view 使用可选 viewer controller 的 branch navigation。
- 新数据到达时，只在当前 active leaf 仍是旧 tip 或 live-follow 开启时推进 leaf；用户查看历史分支时不抢焦点。

### 6. 分阶段验证

1. Domain invariants：roots/orphans/cycles/duplicate IDs/maximal runs/forks/active lineage/effective context/topology layout。
2. Session Tree：keyboard、selection vs activation、segment collapse/search/sticky、plugin boundary。
3. Branch Map：projection、真实 fork links、hit testing、navigation、theme/reduced motion。
4. Trace Timeline：四模式、compaction、segment scope、ending step、viewer navigation。
5. Contract/build：runtime host tests、SDK types/docs、`tsc --noEmit`、target Vitest、plugin build、main production build。

## 风险与回滚

| 风险 | 控制 |
|------|------|
| preview/live 数据没有完整 parentId | topology quality 标记；降级为线性/关系未知 |
| 三处各自重建 branch 语义而漂移 | 只保留一个纯领域 projector |
| active leaf 与 scroll target 混为一谈 | branch-aware `leafId + targetId` 合同 |
| Canvas 在大 session 上卡顿 | DPR cap、viewport culling、hit cache、projection memoization |
| 插件导入 host internals 破坏外部 SDK | 仅 first-party built-in 复用 app-internal domain；不宣称为外部 API |
| 一次性替换难回滚 | domain -> tree -> map -> trace 分阶段提交，保留稳定 plugin IDs |

回滚以阶段为单位：恢复对应 UI consumer，纯 domain core 可在无 consumer 时安全删除；不修改持久化 session 数据或数据库 schema。

## Notes

- 调研期间工作区由大量未提交改动变为提交 `9d18f385 feat(agent-usage): backend collector, SDK, and builtin plugin`。用户已确认以该 commit 作为新基线继续。
- 主项目当前没有 `.timeline-pane` / `.path-timeline-pane`；它们来自 Branch Atlas demo 的同一个 `TimelinePane`。
- 当前 Session Tree 已具备 demo 缺失的完整键盘树导航，融合时保留，不做视觉移植导致的可访问性回退。
- 当前 tree activation 只设置 scroll target，不更新 active leaf；深度融合必须修正，否则 Tree、Map、Timeline 无法共享 active lineage。

---

## Status 更新日志

- **2026-07-14**: 状态变更 -> planning，备注: 已完成双代码库调研并建立验收标准。
- **2026-07-14**: 基线更新 -> `9d18f385`，备注: 用户确认基于外部提交后的新 HEAD 继续。
- **2026-07-14**: 设计确认，备注: TimelinePane 替换 `psm-trace`；Branch Map 为唯一 graph 入口；双击/Enter 激活；Atlas 使用完整 Notes。
- **2026-07-14**: 状态变更 -> verification，备注: domain/tree/map/timeline 已落盘；typecheck、93 focused tests、production build 和 dataset browser tree review 通过。
