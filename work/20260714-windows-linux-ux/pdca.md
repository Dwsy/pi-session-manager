# PDCA Loop

<!-- pdca:gen -->
> **status:** in_progress  ·  **phase:** D2  ·  **pdca:** act
> **validation:** pending  ·  **open decisions:** D2
> **next:** 等待 PR #42 CI，若 CI 发现回归则按检查结果修复
<!-- /pdca:gen -->

## Cycle 1

| Stage | Intent | Current Evidence |
| --- | --- | --- |
| Plan | Frame objective, constraints, acceptance, and decision criteria. | ZIP 任务书、仓库规则和五个目标调用链已读取；主工作区保持不变。 |
| Do | Execute the smallest tracer path that can produce evidence. | 待执行窗口/单实例首个 vertical slice。 |
| Check | Compare evidence against acceptance and risks. | D1 选择拆分切片；插件 API 已用本地 registry 源码核对。 |
| Act | Close, continue, or pivot based on decision D2. | 待完成实现与验证后决定继续或交付。 |

## Operating Rule

Do not move linearly by habit. At each decision phase, choose an option and record rationale in `state.json.decision_points` through the state update script.

## Markdown Sync (agents)

After each Do/Check slice: update `implementation-log.md`, this table's evidence column, and run `update-pdca-state.mjs`. It refreshes generated status strips automatically; use `bun run render` only to adopt an older folder or recover after an interrupted write. Generated regions are derived from `state.json` and must never be hand-edited.
