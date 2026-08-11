---
id: "2026-08-11-升级 Pi Session Bridge 检索与上下文能力"
title: "升级 Pi Session Bridge 检索与上下文能力"
status: "in-progress"
created: "2026-08-11"
updated: "2026-08-11"
category: "插件"
tags: ["workhub", "pi-session-bridge", "search", "retrieval", "context"]
---

# Issue: 升级 Pi Session Bridge 检索与上下文能力

## Goal

在会话规模持续增长时，将 `extensions/pi-session-bridge` 从“FTS 命中后依赖全量会话目录/整会话读取”的薄封装，升级为**分页发现 + 索引检索 + 锚点窗口读取 + PSM 元数据 SSOT** 的分层检索桥；优先复用 PSM 现有 SQLite/FTS5、分页会话目录、插件记录和实时桥能力，不在 Pi 扩展内建立第二套索引或摘要数据库。

## 背景/问题

当前 Bridge 的主链路位于 `extensions/pi-session-bridge/src/tools.ts`：

1. `session_search` 已调用 PSM `full_text_search`，但只暴露部分参数，默认 `matchMode=any`，固定 `source_filter=content_only`。
2. `session_recall` 在 FTS 命中已经携带 `session_path + entry_id` 的情况下，仍通过 `scan_sessions()` 构造全量会话 Map，再对每个命中调用 `get_session_entries()` 解析整会话。
3. `session_context` 按 sessionId 解析同样依赖一次全量 `scan_sessions()`；模块级 `cachedSessions` 永不主动失效。
4. SDK 的 `sessions.readEntries(path, { limit })` 当前也是后端完整 `get_session_entries` 后再 `.slice()`，不能降低后端 I/O（`packages/runtime-sdk/src/client.ts`）。
5. `session_tag` 通过 `kanban-store.ts` 直接读写 `~/.pi/pi-session-manager/tags_config.json` 与 `session_mark.json`，绕过 PSM 已有 tag dispatch/数据库，存在并发与 schema 漂移风险；README 中“使用 PSM backend API”的描述与实现不一致。
6. Bridge 自有 `types.ts` 落后于后端 `SessionInfo` / `SessionEntry`：缺少 model(s)、parent_id、tool 元数据、usage 等可用于检索解释和上下文裁剪的字段。

### 规模基线（2026-08-11，本机只读聚合）

真实主库由 `src-tauri/src/data/sqlite/bootstrap.rs#get_primary_db_path()` 指向 `~/.pi/agent/sessions/sessions.db`。当前：

- SQLite 主库：约 988 MiB（1,036,337,152 bytes）
- 会话：7,843
- `message_entries`：600,784；已索引会话 7,825
- 会话文件总量：约 6.64 GB
- 单会话消息数：P50=33，P95=386，最大=4,345
- 单会话文件：P50≈209 KB，P95≈3.24 MB，最大≈166 MB
- 索引来源：assistant 546,021 / user 53,653 / label 1,110
- 当前 `plugin_records` 仅 12 条 `sidechat.thread`，尚无大规模 `session.intelligence` 覆盖

### 调用基线（本机 PSM HTTP `/api`，单次样本）

- `session_digest`：约 0.9 ms / 53 B
- `scan_sessions_paginated(limit=20)`：约 2.3 ms / 25 KB
- `scan_sessions`：约 70.7 ms / 6.61 MB
- `full_text_search(page_size=8, smart)`：约 80.2 ms / 7.1 KB
- P50 会话 `get_session_entries`：约 29.9 ms / 141 KB；256 KB chunk：约 3.8 ms / 225 KB
- P95 会话 `get_session_entries`：约 33.5 ms / 2.12 MB；256 KB chunk：约 3.1 ms / 263 KB
- `get_session_by_id`：约 6–15 ms / <1 KB

结论：检索本身已有索引支撑，主要放大项是**全量目录传输、整会话 materialize、永久缓存失效问题**。

## Current → Target

| 维度 | Current | Target |
|---|---|---|
| 会话发现 | `scan_sessions()` + 永久本地缓存 | `scan_sessions_paginated`；必要时用 `session_digest`/事件失效 |
| ID 解析 | 全量列表 find | `get_session_by_id` / `get_session_by_path` |
| 消息检索 | FTS5，但 Bridge 参数子集 | bounded top-K；`smart/any/all/phrase` 可选，`smart` 先保持 opt-in；支持 role/project/time/tool-result evidence |
| Recall | FTS → 全量 sessions → 整会话 entries → find anchor | FTS → Top-N → `anchorEntryId` 窗口读取 |
| Context | 最近 tail，但整会话读取 | bounded tail/window；默认只返回 dialogue，可选 tool/raw |
| Tag | 直接写 PSM JSON 文件 | PSM tag dispatch/API，PSM 为 SSOT |
| Intelligence | 未使用 | 可选消费现有 `plugin_records` / `session.intelligence`，不在 Bridge 内生成第二套摘要 |
| Live | 只转发事件/RPC | 可维护当前会话小尾部，避免索引刷新前的“当前态空窗” |

## Target Architecture

```text
Pi Agent
  └─ pi-session-bridge tools
      ├─ session_search ───────> PSM full_text_search ─> message_fts/message_entries
      ├─ session_list ─────────> scan_sessions_paginated ─> scanner/list cache
      ├─ session_context ──────> get_session_entry_window (new)
      ├─ session_recall ───────> search Top-N + anchored windows
      └─ session_tag ──────────> PSM tag commands

Optional enrichment:
  plugin_records(search) ─> session.intelligence summaries/topics/status

Live current-session tail:
  Pi events ─> connection-manager small bounded buffer ─> session_context(current)
```

原则：**Bridge 只做编排、预算和展示，不复制 PSM 的索引、会话缓存或摘要存储。**

## 验收标准 (Acceptance Criteria)

对抗式 Review 后将“smart 默认、深 page、live tail 必须本轮完成”等假设移出主验收，最终 Gate 0–3 验收如下：

- [x] `session_list` 使用分页接口；10k fixture 只返回请求页并剥离 bulk message text。
- [x] `session_search` 返回完整 `sessionId`、`sessionPath`、`entryId`，同时保留短 ID 仅用于展示。
- [x] `smart` 可显式选择，但默认仍为 `any`；Bridge 对模型暴露 bounded top-K，而不把截断 `total_hits` 当稳定深分页契约。
- [x] `session_recall` 直接使用 FTS hit 的 `session_path + entry_id`，不再 `scan_sessions()` 解析命中。
- [x] 已知完整 sessionId 走数据库精确 lookup；旧短 ID 只通过 bounded prefix lookup 兼容，歧义时报错。
- [x] `get_session_entry_window` 支持 bounded `before/after`、`includeTools`、总字符预算、`anchorFound/stale/truncated`。
- [x] Pi JSONL 的 tail/anchor window 采用流式读取 + ring buffer；anchor 不存在时不返回不相关上下文。
- [x] Bridge 所有活跃及兼容 tag 路径均经 PSM API/dispatch；扩展源码不直接写 tag JSON 文件。
- [x] tag mutation 主动失效 PSM paginated-list cache。
- [x] Bridge 协议/能力握手和 HTTP command deadline 已实现，版本/能力不匹配 fail-fast。
- [x] search transport 支持 server-side message content cap；Bridge 再执行 excerpt/output 双层预算。
- [x] `toolResult` 作为 `tool_result` source 进入 FTS，单条索引文本上限 16 KiB；schema v20 扩大 CHECK 约束并保留旧索引行。
- [x] `types.ts`、README、Bridge/Rust tests 与最终契约一致。

## 实施阶段

> 以下是研究阶段的原始 Phase 划分。对抗式 Review 后，实际实现以 GitHub Issue #48 的 Gate 0–3 为准；其中“默认 smart”“深 page”“live tail”“intelligence”“entry locator/keyset pagination”均不作为本轮完成前置条件。

### Phase 0: 契约与正确性（Bridge-only，低风险）

- [x] 审计现有 Bridge/PSM 搜索、会话、tag、SDK、只读 HTTP 和插件记录能力。
- [x] 记录本机规模/调用基线，确认主要瓶颈不是 FTS，而是全量目录与整会话读取。
- [x] `psm-client.ts` 增加 paginated list、精确 ID lookup、entry window、PSM tag commands、capability handshake 与 HTTP deadline。
- [x] `session_search` 增加 `smart` opt-in、tool-result evidence 与 bounded server payload；默认仍保持 `any`，不暴露误导性深 page。
- [x] 删除 `cachedSessions` 热路径依赖；已知 hit 的 `session_path` 直接使用。
- [x] `session_tag`、`/psm` panel、兼容 `kanban-store` 全部改用 PSM API，不再直接文件写入。
- [x] 对齐 Bridge `types.ts` 与新增稳定契约。

### Phase 1: 分页会话发现（Bridge-only）

- [x] 新增 `session_list`：offset/limit/search/project/tag/source/sort；默认 limit 20，上限 50。
- [x] 返回轻量 session metadata 与完整 ID/path，PSM pagination strip bulk user/assistant text。
- [x] Bridge 不再复制会话目录缓存；tag mutation 主动失效 PSM derived list cache。

### Phase 2A: 锚点窗口读取（后端，无 DB migration）

新增稳定命令（命名可在实现时确定，例如 `get_session_entry_window`）：

```text
{ sessionId|path, anchorEntryId?, before=3, after=3, mode='dialogue', maxChars? }
  -> { session, anchor, entries, truncated }
```

- [x] Pi JSONL 第一版直接流式扫描：anchor 前 ring buffer，命中后只读取 bounded `after`；响应/峰值 materialization 有界。
- [x] 外部 provider 保留 canonical transform/fallback，不假设所有来源可 byte-seek；因此 Phase 2A 只承诺 bounded memory/payload，不承诺 O(window) latency。
- [x] `session_context` 改为 bounded tail/window；默认 dialogue，可按需包含 toolResult/tool metadata。
- [x] `session_recall` 改为 `FTS Top-N → anchored window`，Top-N 默认 3、上限 5，并限制并发/总输出。

### Phase 2B: 大会话 O(window) 定位（可选 DB migration）

当前 `message_entries` 没有可靠 entry ordinal；`session_info_entries` 也只存 name history，不能作为消息顺序索引。

- [ ] 评估给 `message_entries` 增加 `entry_ordinal`（或独立 entry locator 表），索引 `(session_path, entry_ordinal)` 与 `(session_path, entry_id)`。
- [ ] FTS hit 返回 ordinal，窗口查询直接按 ordinal 范围取行，避免从文件头扫描到 anchor。
- [ ] 设计 migration/backfill 与 scanner 增量更新，确保 100MB+ 会话 recall 延迟稳定。
- [ ] 只有 Phase 2A 指标显示线性扫描仍成为瓶颈时才进入 2B，避免提前扩 schema。

### Phase 3: Intelligence / Hybrid Retrieval（可选）

- [ ] 复用 `psm-session-summary` 写入的 `session.intelligence` plugin records，支持按 summary/topics/status/unresolved_tasks 做粗粒度检索。
- [ ] Bridge 只消费记录；不要在 Pi extension 内再启动“AI query expansion / summary generation”子代理。Pi 本身已经是决策代理，避免 agent-inside-agent 重复成本。
- [ ] 若需要 hybrid，优先“intelligence 缩小候选 + message FTS 取证”，并保留原始 entry evidence。

### Phase 4: Live current-context

- [ ] `connection-manager` 基于已有 message/tool events 维护小型 ring buffer（按条目与字符双限额）。
- [ ] `session_context` 对当前 session 可优先合并 live tail；历史部分仍来自 PSM。
- [ ] 明确 live 数据是未持久化/可能未索引状态，避免与 FTS 结果重复。

### Phase 5: 验证与交付

- [x] Bridge 单测覆盖 full ID/path、分页、PSM tag API、recall 去除 scan、stale anchor、预算/truncation、capability/timeout。
- [x] 后端单测覆盖 bounded window、missing anchor、10k pagination、cache invalidation、unicode search cap、toolResult index、schema v20 migration。
- [x] 已记录 `scan_sessions` vs paginated、整 session entries vs chunk/window 的本机基线；不在生产主库上额外跑 schema v20 迁移 benchmark。
- [x] 更新 `extensions/pi-session-bridge/README.md`。
- [ ] Git 分支提交/推送并回写 GitHub Issue #48（收尾步骤）。

## 关键决策

| 决策 | 理由 |
|---|---|
| 不在 Bridge 内建立搜索索引 | PSM 已有 content-synced FTS5、超时、候选窗口、CJK smart、分页和 per-session 去重 |
| 不把 `/v1/sessions` 直接当扩展的性能解法 | 当前该 endpoint 内部仍 `scan_sessions()` 后过滤，语义稳定但不够 scale-optimal |
| `scan_sessions_paginated` 作为近期目录发现 SSOT | 20 条实测约 25 KB vs 全量约 6.6 MB；cache miss 仍是内存 filter/sort，50k/100k 后按 SLO 决定是否升级 DB-native cursor/keyset |
| Recall 以 FTS hit 为锚点 | hit 已提供 session_path + entry_id，无需再扫描全量目录 |
| 先做 streaming anchor window，再考虑 ordinal migration | 先消除大对象 materialize，指标仍不足时再付 schema/backfill 成本 |
| Tags 全部走 PSM | 避免直接 JSON 文件写入造成并发、迁移和 schema 双写问题 |
| Intelligence 是可选第二层，不取代 raw evidence | 摘要用于缩小候选，最终回答仍应可追溯到原始 entry |
| 不复制 semantic-search 的 AI expansion agent | Bridge 已运行在 Pi Agent 内；复用 smart FTS 与工具规划即可，避免二次模型调用 |

## 风险与回滚

- 新 window API 若外部 provider 不能高效随机访问，Phase 2A 仍可能是 O(file) 时间，但内存/响应体受控；回滚到旧 `get_session_entries` 只需保留兼容路径。
- 持久 entry locator / ordinal 会显著增加一次性 backfill 成本；必须独立 feature/migration，不能作为本轮前置条件。
- schema v20 会事务性重建 `message_entries` CHECK 约束以允许 `toolResult/tool_result`，现有约 60 万索引行会被保留；本轮未在生产主库上测量一次性迁移耗时，应为升级说明保留磁盘/启动时间余量。
- tag 已切换到后端 dispatch；Bridge active path 与兼容 facade 均禁止 fallback 直接写文件。
- Intelligence 覆盖率当前接近 0，不应作为基础搜索必需依赖。

## 相关资源

- `extensions/pi-session-bridge/src/tools.ts`
- `extensions/pi-session-bridge/src/psm-client.ts`
- `extensions/pi-session-bridge/src/kanban-store.ts`
- `src-tauri/src/domain/session_search/mod.rs`
- `src-tauri/src/data/sqlite/message_index.rs`
- `src-tauri/src/domain/session_list/mod.rs`
- `src-tauri/src/commands/session_file.rs`
- `src-tauri/src/server/http/mod.rs`
- `packages/runtime-sdk/src/client.ts`
- `extensions/psm-semantic-search/agentSearch.ts`
- `extensions/psm-session-summary/agentSummary.ts`

## Notes

- GitHub tracking: https://github.com/Dwsy/pi-session-manager/issues/48
- 2026-08-11 按对抗式 Review 后的 Gate 0–3 实现；50k/100k DB-native keyset pagination、persistent entry locator、intelligence/live-tail 以基准/产品需求作为独立后续决策。
- 最终验证：Rust `cargo test --lib` 193/193、`cargo check --all-targets`、TypeScript `tsc --noEmit`、Bridge Vitest 29/29、`git diff --check` 全部通过。
- PSM 的 FTS5 已经是足够强的“基础数据层”；升级重点应放在 retrieval orchestration 与 bounded context materialization。
- Phil Karlton 的经典说法“计算机科学里最难的事之一是缓存失效”在这里非常贴切：Bridge 当前永久 `cachedSessions` 正是应该优先消除的复杂度。

---

## Status 更新日志

- **2026-08-11**: 完成架构/代码/数据规模研究，形成分阶段升级方案。
- **2026-08-11**: 状态变更 → `in-progress`，GitHub Issue #48 已创建并开始开发。
- **2026-08-11**: Gate 0–3 实现完成并通过完整受影响测试；等待 Git push / GitHub 跟踪收尾。
