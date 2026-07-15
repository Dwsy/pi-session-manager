---
id: "2026-07-15-重构 Landing Page 品牌叙事与视觉结构"
title: "重构 Landing Page 品牌叙事与视觉结构"
status: "in-progress"
created: "2026-07-15"
updated: "2026-07-15"
category: "前端"
tags: ["workhub", "landing-page", "brand", "frontend"]
---

# Issue: 重构 Landing Page 品牌叙事与视觉结构

## Goal

让 Landing Page 在首屏准确表达 PSM 是本地优先、跨 Agent 的会话工作台、知识层与观测层，并明确它不是 Codex 式 Agent GUI。

## 背景/问题

当前 Landing Page 仍采用通用 SaaS 模板叙事：居中 Hero、渐变光斑、八张等权功能卡和技术架构图。它能展示功能，但没有解释为什么 Coding Agent session 值得被长期管理，也没有建立 PSM 与 Agent GUI 的边界。

已确认的问题：

- Hero 强调“优雅管理”和功能数量，没有表达 session 是持久工程资产。
- 八张等权功能卡缺少层次，工作台、知识层、观测层三条价值线被打散。
- Architecture 区域过度强调技术栈，并将响应式 Web 表述为 iOS / Android。
- Hero 深色截图依赖外部 GitHub attachment，不适合静态站点的稳定交付。
- 所有区块在页面加载时立即播放动画，首屏外动画在用户看到之前已经结束。
- `transition-all`、持续 shimmer 和长 stagger 偏装饰性，不符合高频开发工具的克制感。
- Quick Start 中的 `curl` 示例指向 Releases 页面，不是可执行安装脚本。
- 网站 metadata 仍是泛化的“powerful session management tool”描述。

## 验收标准 (Acceptance Criteria)

- [ ] WHEN 用户进入首屏，页面 SHALL 在无需滚动时表达 local-first、session-first、not another Agent GUI。
- [ ] WHERE 英文与中文页面，系统 SHALL 保持相同的信息架构、语义层级和 CTA。
- [ ] WHEN 展示能力，页面 SHALL 以会话工作台、知识层、观测层组织内容，而不是平铺功能卡。
- [ ] WHEN 展示产品，页面 SHALL 使用仓库内本地截图资源，不依赖外部图片 URL。
- [ ] WHERE 桌面与移动端，页面 SHALL 保持可读层级、无横向溢出且 CTA 可触达。
- [ ] IF 用户启用 reduced motion，THEN 页面 SHALL 移除位移动画并保留必要的状态反馈。
- [ ] WHERE 文档站其他页面，Landing 专用样式 SHALL 不改变 Fumadocs 文档布局。
- [ ] WHEN 执行 `pnpm --dir website run types:check` 和 `pnpm --dir website run build`，两条命令 SHALL 成功退出。

## 实施阶段

### Phase 1: 规划和准备
- [x] 分析 README 中已确认的产品哲学
- [x] 审计 Landing Page 组件、文案、样式、资源和构建脚本
- [x] 确认视觉方向、首要 CTA 和改动边界

### Phase 2: 执行
- [x] 重构双语 Landing 文案与 metadata
- [x] 重组 Hero、边界声明、三层价值、运行方式、安装 CTA 和 Footer
- [x] 建立 Landing 专用视觉样式与响应式布局
- [x] 使用本地产品截图并删除误导或无效内容
- [x] 更新顶部导航锚点

### Phase 3: 验证
- [ ] 运行网站类型检查
- [ ] 运行网站生产构建
- [ ] 检查桌面与移动端页面
- [ ] 检查浅色、深色和 reduced-motion 状态
- [ ] 审查最终 diff 只包含任务直接需要的改动

### Phase 4: 交付
- [ ] 更新 Issue 状态与验证记录
- [ ] 汇总变更、验证证据和剩余风险

## 关键决策

| 决策 | 理由 |
|------|------|
| 采用 Session Observatory / 会话观测台作为视觉母题 | 用户已确认；同时承载工作台、知识层和观测层，避免通用 SaaS 卡片感 |
| Hero 首要 CTA 使用在线 Demo | 用户已确认；零安装即可理解产品，再承接下载与文档 |
| 重构覆盖正文、导航、双语文案、metadata 和 Landing 专用样式 | 用户已确认 Landing 全链路改造 |
| AI 摘要、语义搜索、Side Chat 只作为可选扩展呈现 | 保持 PSM 与 Agent GUI 的产品边界 |
| Landing 专用样式使用命名空间 | 避免影响 Fumadocs 文档页面 |
| 优先使用本地真实截图 | 真实展示产品，并保证静态部署可靠性 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| - | 暂无 | - |

## 相关资源

- [x] 设计系统: `DESIGN.md`
- [x] README 定位: `README.md`, `README.zh.md`
- [x] Landing 入口: `website/src/app/[lang]/(home)/page.tsx`
- [x] Landing 文案: `website/src/lib/landing-i18n.ts`
- [x] Landing 样式: `website/src/app/global.css`
- [x] 产品截图: `website/public/screenshots/`

## Notes

当前推荐的信息结构：Hero → 产品边界 → 三层价值 → 跨 Agent / 本地优先证据 → 运行方式 → 下载 CTA。技术栈和完整功能列表下沉到文档，不在 Landing 上与产品价值竞争。

---

## Status 更新日志

- **2026-07-15**: 状态变更 → planning，备注: 完成源码与视觉审计，等待用户确认设计方向。
- **2026-07-15**: 状态变更 → in-progress，备注: 用户确认 Session Observatory、Demo 主 CTA 与 Landing 全链路改造。
