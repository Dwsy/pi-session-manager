# 多 Agent 会话导入与 Resume 能力迭代计划（融合 `casr` + `magpie`）

- **日期**: 2026-11-27
- **目标仓库**: `/Users/dengwenyu/Dev/AI/pi-session-manager`
- **参考来源**:
  - `~/Dev/AI/magpie/internal/sessions/`（多 Agent 会话发现、增量解析、原生 Resume 与跨 Agent Carry 实战实现）
  - 上游 [`cross_agent_session_resumer`](https://github.com/Dicklesworthstone/cross_agent_session_resumer)（当前 vendored `0.3.0`，上游 `0.5.0`）与 [`franken_agent_detection`](https://github.com/Dicklesworthstone/franken_agent_detection)（上游 `0.4.1`）

---

## 1. 目标与架构原则

1. **职责清晰、可追溯**：
   - `crates/casr`：负责跨格式标准读写与转换流水线。
   - `domain/casr_min`：负责快速路径分类、`Omp`（`casr` 无此 provider）以及 `Antigravity`（权威实现，融合 `magpie` `agy.go` / `antigravity_app.go`）。
   - `domain/session_bridge/resume.rs`（新增）：单一收口所有 Agent 的**原生 Resume 命令解析**、**CLI 安装探测**与**零转换 Carry 规则**，消除前端硬编码与各 provider 零散过时命令。
   - `domain/session_bridge/api.rs`：增加按 `(source_path, target_slug, file_size, mtime)` 的**转换幂等缓存**，防止重复点击在目标目录生成重复会话文件。
2. **明确区分“原工具恢复”与“跨 Agent 转换恢复”**：
   - 终端直开 / 复制恢复命令默认优先走原 Agent 的原生 Resume（不写入任何转换文件）。
   - 仅当用户选择其他目标 Agent 时，才触发 `convert_session_format`（或 Pi -> OMP 零转换 `omp --fork`）。
3. **无兼容垫片、不过度拆分**：
   - 修正过时/错误命令（OpenCode、Factory/Droid、Antigravity、OMP、Codex）直接一步到位。

---

## 2. 分阶段实施清单

### Step 1：落盘迭代计划（本文档）
- 产出 `docs/plans/2026-11-27-multi-agent-session-resume-plan.md`，确保后续每项改动都有明确依据与验收点。

### Step 2：Antigravity 对接正确化
对照 `magpie/internal/sessions/agy.go` 与 `antigravity_app.go`，修复 `src-tauri/src/domain/casr_min/providers/antigravity.rs`、`src-tauri/src/core/scanner.rs` 与 `src/utils/session.ts`：
1. **完整发现根目录与客户端形态区分**：
   - 区分 `AntigravityKind::Cli`（`~/.gemini/antigravity-cli`）、`AntigravityKind::Desktop`（`~/.gemini/antigravity`）与 `AntigravityKind::Insiders`（`~/.gemini/antigravity-insiders`），同时保留 `CASS_ANTIGRAVITY_DATA_ROOT` / `ANTIGRAVITY_HOME` 覆盖。
   - 仅 `Cli` 支持终端原生 Resume（`agy --conversation <id>`）；`Desktop` / `Insiders` 明确标注为只读（无终端恢复命令，可通过转换到 Pi/Claude/Codex 接力）。
2. **转录文件发现与去重**：
   - 支持 `brain/<uuid>/.system_generated/logs/transcript_full.jsonl`（agy 1.3.5+/1.4.7+ 与 Desktop App 主文件）以及旧版 `transcript.jsonl`。
   - 排除 `chunks/transcript/*.jsonl` 分片文件，防止同一会话被重复扫描为多条记录。
   - 若同一 `logs/` 目录下同时存在 `transcript_full.jsonl` 与 `transcript.jsonl`，只保留 `transcript_full.jsonl`。
3. **完善 `conversation_summaries.db` 读取**：
   - 读取 `title`、`preview`、`workspace_uris`（兼容缺少 `preview` 列的旧库）。
   - 标题优先级：`title` > `preview` > 首条用户消息截断。
4. **修复消息与工具调用解析**：
   - `PLANNER_RESPONSE` 保留 `tool_calls` 字段（此前被丢弃且无正文时整条被过滤）。
   - `GENERIC` (`source == "MODEL"`) 映射为 `Tool` 角色的 `tool_results`（工具执行输出），而非伪造 `ToolCall { name: "generic" }`。
5. **移除硬编码模型参数**：
   - 同步修正 `casr_min` 与 `crates/casr` 中的 Antigravity resume 命令为 `agy --conversation <id>`，移除硬编码的 `--model "Gemini 3.1 Pro (High)"`。

### Step 3：融合 `magpie` 与 `casr`，统一原生 Resume 与转换幂等缓存
1. **新增 `src-tauri/src/domain/session_bridge/resume.rs`**（并暴露 Tauri + HTTP/WS dispatch 命令 `get_session_resume_info`）：
   - **OpenCode**：修正为 `opencode --session <id>`（替代原 `"opencode"`）。
   - **Factory (Droid)**：修正为 `droid --resume <id>`（替代原 `"factory --resume <id>"`）。
   - **Codex**：读取 `state_*.sqlite` / `session_meta` 中的 `model_provider`，并与当前 `CODEX_HOME/config.toml` 对比；若 provider 不一致且该 provider 在 `config.toml` 或内置列表中存在，自动生成 `codex resume -c model_provider=<was> <id>`（参考 `magpie/internal/sessions/codex_resume.go`）。同时支持 `CODEX_HOME` 环境变量。
   - **OMP**：支持 `~/.omp/profiles/<name>/agent/sessions` 与 `$XDG_DATA_HOME/omp/sessions` 发现，恢复命令按路径自动带上 `--profile <name> --resume <id>`；支持 **Pi -> OMP 零转换接力**（`omp --fork '<path>'`）。
   - **Claude Code**：支持 `CLAUDE_CONFIG_DIR` 发现。
   - **Antigravity / Grok / Gemini / Kiro / Vibe / OpenClaw / ClawdBot / Aider / Amp / ChatGPT / Cline / Cursor**：统一输出准确原生恢复命令及 `can_native_resume` / `cli_installed` 状态，拒绝非法 session ID（防止 shell 注入）。
2. **转换幂等缓存**（`domain/session_bridge/api.rs`）：
   - 以 `(source_path, target_slug, file_size, modified_ns)` 缓存非 dry-run、非 force 的转换结果；目标文件仍在磁盘上时直接复用，避免重复点击生成冗余会话。
3. **同步修正 `crates/casr` 中明确过时的 `resume_command`**（OpenCode、Factory、Antigravity），保证 `convert_session_format` 返回的 `resume_command` 与原生 Resume 一致。

### Step 4：前端接入与交互对齐
1. `src/utils/session.ts`：补全 `getSessionSourceSlug` 对 `antigravity` / `antigravity-insiders` / `transcript_full.jsonl` / `omp` profiles 的识别。
2. `src/utils/sessionResume.ts` & `src/App.tsx`：
   - 接入后端 `get_session_resume_info`。
   - `openSessionInTerminalDirect` 与 `buildCopyResumeCommand` 优先使用原工具原生 Resume（而非强行当 `pi --session` 启动或触发转换写入）。
   - 当 `target === sourceSlug` 时直接走原生 Resume（不触发 `convert_session_format`）。
   - 当 `sourceSlug === "pi" && target === "omp"` 时优先走零转换 `omp --fork`。
3. `src/components/dialogs/ResumeSessionDialog.tsx`：
   - 若当前会话支持原生恢复，即使 `canConvertTarget` 为 `false`（如 Antigravity CLI），也允许用户选择在原工具中直接恢复。

### Step 5：验证与文档同步
1. Rust：`cd src-tauri && cargo test`（新增覆盖 Antigravity、Codex `model_provider`、OMP profile、OpenCode/Droid resume、转换幂等缓存的单元测试）。
2. Frontend：`pnpm vitest run` 与 TypeScript 类型检查。
3. 更新 `docs/SESSION_CONVERSION_COMPATIBILITY.md` 记录新的架构分层与各 Agent Resume 行为。

---

## 3. 第二阶段迭代（本次已完成）：升级 `casr v0.5.0` 与 `sessions.db` 瘦身
1. **升级 `src-tauri/crates/casr` 至上游 `v0.5.0`**（不重复造轮子，直接复用上游能力）：
   - 对齐 `src-tauri/Cargo.toml` 的 `rusqlite` 至 `0.43`（`bundled`），获得上游 OpenCode 1.x/2.x（`session_v2`/`session_message`）读取与只读 WAL 保护、Codex `state*.sqlite` 注册与 compaction 历史重置、Claude Code `custom-title`/`ai-title`/`away_summary` 等能力。
   - 仅保留最小上游未合并补丁（Claude Code `{type:"message"}` 包装与纯 `tool_result` 角色归类、Codex 旧版 `event_msg/tool_call`），并同步 `casr_min/providers/opencode.rs` 支持 `session_v2` 列表读取与 1.x/2.x 写入拒绝。
2. **精简 `sessions.db`（对齐 Pi，完整保留用户/助手全文检索，不存储工具调用）**：
   - `message_index.rs`：仅索引 `content_type == "text"`（以及开启配置时的 `thinking`），不存储 `toolCall`/`toolResult`/`system`，跳过无正文且无标签的纯工具调用空行（消除此前占 55.7% 的空 assistant 行），完整保留所有用户与助手消息文本不做截断，保证 `message_fts` 全文检索完整性。
   - `casr_min/adapters.rs`：外部 Agent 的 `toolCall` 项 `text` 置为 `None`（对齐 Pi），避免工具名污染 `first_message`/`last_message` 与 `message_entries`；补齐 `SessionInfo.model` 透传。
   - `data/sqlite/migrations.rs`（`LATEST_SCHEMA_VERSION = 20`）：新增 `migration_20`，仅清理历史纯工具调用空行并重建优化 `message_fts`，不删除也不截断任何用户/助手消息。

## 4. 后续可继续演进
- 引入 `franken-agent-detection`（`v0.4.1`）扩展只读扫描源（Codex `.jsonl.zst`、Cursor CLI、Cline CLI 3.x、Kimi、Qwen 等）。
