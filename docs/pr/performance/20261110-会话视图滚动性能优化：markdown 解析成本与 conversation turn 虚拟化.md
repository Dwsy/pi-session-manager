---
id: "2026-11-10-会话视图滚动性能优化：markdown 解析成本与 conversation turn 虚拟化"
title: "会话视图滚动性能优化：markdown 解析成本与 conversation turn 虚拟化"
status: "draft"
created: "2026-11-10"
updated: "2026-11-10"
category: "performance"
tags: ["workhub", "pr", "会话视图滚动性能优化：markdown 解析成本与 conversation turn 虚拟化"]
---

# 会话视图滚动性能优化：markdown 解析成本与 conversation turn 虚拟化

> 大会话（实测 12MB / 5594 条目）滚动卡顿、内容加载跟不上。两条主线：markdown 解析成本离开滚动路径；默认 conversation 视图按 turn 虚拟化。

## 背景与目的 (Why)

- 用户反馈会话视图一多滚动就卡、加载来不及；macOS 内置 WKWebView 明显卡顿，Chrome 正常。
- 实测样本：`~/.pi/agent/sessions/...01a1c2f7...jsonl`，12MB / 5594 条目 / 2896 个 turn。
- 根因：
  1. 默认视图是 `conversation` 变体（`ConversationPreviewMessages`），`turns.map(...)` 全量挂载，无虚拟化（历史测量：60 帧快速滚动平均 23.1ms、最差 250.2ms）。
  2. markdown 解析缓存上限过小（120 条 / 源 ≤8KB），恰好把最贵的块（50KB 日志块 ~90ms、大代码块）排除在外，每次滚动重挂载都重新解析；Shiki 语法表首次使用要编译 0.1–0.7s（js 634ms / cpp 247ms），正好落在滚动帧里。

## 变更内容概述 (What)

1. `perf(markdown): keep parse cost off the scroll path`（commit `9d65e437`）
   - 解析缓存扩容：600 条 / 24MB / 源 ≤256KB / HTML ≤1MB / TTL 30min，大块可被缓存。
   - Shiki 高亮上限 20K 字符，超大代码块降级为纯文本（同时削减 token span DOM）。
   - Shiki 语法表按 idle 切片预热，编译成本移出滚动路径。
2. `perf(session-view): virtualize the conversation turn list`（commit `4703aa1d`）
   - conversation 视图按 turn 虚拟化（`@tanstack/react-virtual`，overscan 3）。
   - 折叠状态提升到行外（滚动卸载不丢）；折叠切换在 `useLayoutEffect` 同步重测已挂载行（修复上一次虚拟化尝试被回滚的“展开错位”）；行间距用 padding 不用 margin（虚拟化测量看不到 margin）。
   - 顶/底滚动、条目定位、live 跟随在 conversation 模式走 turn 虚拟化。

## 关联 Issue

- **Issues:** 无独立 issue（用户直接需求）；参考已回滚的历史尝试：session `019f5f21`（conversation 虚拟化因展开错位被回滚）。

## 测试与验证结果 (Test Result)

- [x] 单元测试通过：`npx vitest run` **186 文件 / 1033 用例全绿**（基线 185/1026，新增 markdown 缓存/高亮上限 5 例、虚拟窗口与折叠状态保持 2 例）。
- [x] 类型检查与构建：`npx tsc --noEmit` 通过；`npx vite build` 通过。
- [x] 真实数据 WebKit 实测（Safari + React Profiler + 真实 12MB 会话，800px/帧快速滚动）：
  - 冷滚动 commit 平均 **4.9ms** / p95 **15ms** / 最差 152ms；暖滚动平均 **3.1ms** / p95 **7ms**。
  - DOM 节点从全量数万降到 **~1.8k**（视口 + overscan）。
  - 折叠展开后行重叠数 **0**（错位修复验证通过）。
- [ ] 手动回归测试通过（待用户在 app 内体验大会话滚动确认）。

## 风险与影响评估 (Risk Assessment)

- 会话主视图 DOM 结构从平铺变为虚拟行，滚动标记（scroll markers）对未挂载 turn 取不到位置（与既有扁平虚拟视图行为一致，功能默认受特性开关控制）。
- 超大代码块（>20K 字符）不再语法高亮，纯文本展示（可读性优先于着色）。
- 折叠状态提升为组件级状态，会话切换时由既有 sessionPath effect 重置。

## 回滚方案 (Rollback Plan)

两个 commit 独立可回滚：`git revert 4703aa1d`（虚拟化）或 `git revert 9d65e437`（markdown 缓存/高亮上限），互不依赖。

---

## 变更类型

- [x] ⚡ Performance

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `src/utils/markdown.ts` | 修改 | 缓存扩容、大代码块跳过高亮、语法表 idle 预热 |
| `src/utils/markdown.test.ts` | 新增 | 缓存命中与高亮上限回归测试 |
| `src/components/session-viewer/ConversationPreviewMessages.tsx` | 修改 | turn 级虚拟化、折叠状态提升、同步重测 |
| `src/components/session-viewer/ConversationPreviewMessages.test.tsx` | 修改 | 虚拟窗口渲染、折叠状态跨挂载保持 |
| `src/components/session-viewer/SessionViewerMessages.tsx` | 修改 | conversation 模式滚动命令路由 |
| `src/hooks/useSessionViewerVirtualScroll.ts` | 修改 | 导出高度估算、支持外部接管滚动命令 |

## 测试命令

```bash
npx vitest run                          # 全量前端测试
npx vitest run src/components/session-viewer/ src/utils/markdown.test.ts
npx tsc --noEmit
npx vite build
```

## 破坏性变更

**是否有破坏性变更？**

- [x] 否

## 性能影响

**是否有性能影响？**

- [x] 提升 - WebKit 冷滚动 commit 平均 23.1ms（历史全量挂载测量）→ 4.9ms；DOM 从数万节点降至 ~1.8k；markdown 大块从每次挂载重解析（~90ms/块）变为缓存命中（~2ms）。

## 依赖变更

**是否引入新的依赖？**

- [x] 否（复用已有 `@tanstack/react-virtual`）

## 文档变更

**是否需要更新文档？**

- [x] 是 - 本 PR 记录。
