# Pi Session Manager Extensions

Pi agent 扩展集合，为 `pi` CLI 提供会话管理能力。

所有扩展遵循 [pi-package](https://github.com/mariozechner/pi-coding-agent) 规范，放在 `~/.pi/agent/extensions/` 下自动加载。

---

## 插件总览

| 插件 | 用途 | 依赖 |
|------|------|------|
| [pi-session-bridge](./pi-session-bridge/) | 会话同步、搜索、标签、上下文召回 | better-sqlite3 |
| [resume-x](./resume-x/) | 增强版会话恢复，SQLite 快速路径 | better-sqlite3 |
| [rename-nag](./rename-nag/) | 智能会话命名提醒 | better-sqlite3 |

三个插件共享同一个 SQLite 数据库 (`~/.pi/agent/sessions/sessions.db`)，各自独立加载，互不干扰。

---

## pi-session-bridge

**桥接 Pi agent 与 Pi Session Manager 的核心插件。**

功能：
- **Live Mode** — WebSocket 实时同步会话事件到 PSM
- **Search** — 通过 PSM HTTP API 全文搜索历史会话
- **Tags** — SQLite 驱动的会话标签系统
- **Context Recall** — 从历史会话中召回相关上下文
- **Config** — `/psm-config` 命令管理桥接配置

```bash
# 安装
pi install npm:Dwsy/psm-bridge

# Live 模式
/psm-live on
/psm-live off

# 搜索
/session_search query="rust async traits"

# 标签
/state          # 查看当前标签
/state-set wip  # 设置标签
/flow start     # 快速流转

# 上下文召回
/session_recall query="how to fix the bug"
```

### 工具

| Tool | 说明 |
|------|------|
| `session_search` | 全文搜索历史会话 |
| `session_recall` | 搜索 + 召回上下文 |
| `session_context` | 获取指定会话的消息 |
| `session_tag` | 标签管理 (list/set/remove) |

### 命令

| Command | 说明 |
|---------|------|
| `/psm` | 桥接状态 |
| `/psm-live on/off` | 切换实时模式 |
| `/psm-connect` / `/psm-disconnect` | 手动连接/断开 |
| `/state` `/state-set` `/state-list` `/state-clear` | 标签管理 |
| `/flow <action>` | 快速流转 |
| `/open-in-psm` | 在 PSM 中打开当前会话 |
| `/psm-config` | 配置管理 |

### 状态指示

```
[psm]         — 已连接
[retry N]     — 重连中 (第 N 次)
[timeout]     — 连接断开
[psm: off]    — 实时模式关闭
```

---

## resume-x

**增强版会话恢复，绕过磁盘扫描直接查 SQLite。**

功能：
- SQLite 快速路径（无需扫描磁盘文件）
- 按 cwd 过滤当前项目的会话
- 详情面板：模型、token 用量、费用
- 消息预览：按 ← 浏览对话历史，→ 返回
- Kanban 标签展示

```bash
# 使用
/resume-x
```

### 特性

| 特性 | 说明 |
|------|------|
| 快速加载 | 直接查 SQLite，跳过磁盘扫描 |
| cwd 过滤 | 只显示当前项目目录的会话 |
| 详情面板 | 模型名、input/output tokens、费用 |
| 消息预览 | ← → 浏览完整对话 |
| Kanban 标签 | 显示会话的看板标签 |

---

## rename-nag

**智能会话命名提醒 — 让 agent 主动为会话取名。**

功能：
- 注册 `session_rename` 工具（从 bridge 迁移）
- 追踪会话历史和对话轮次
- 满足条件时注入隐藏消息 (`display: false`) 提醒 agent 命名
- agent 调用 rename 后自动关闭提醒

### 触发条件

| 轮次 | 条件 | 提醒内容 |
|------|------|----------|
| 首次 | 工具调用 > 6 + 未命名 | 完整提醒：说明可用工具 + 命名建议 |
| 后续 | 每 40 次工具调用 (40, 80, 120...) + 已命名 | 提醒检查名称是否仍匹配当前话题，转向则更新 |

**"未命名"判定**：会话名为 NULL 或匹配默认时间戳格式 `YYYY-MM-DDTHH-MM-SS`。

### 工作原理

```
session_start (含 resume)
  → 扫描已有 entries 统计 toolCall 数量
  → 若已命名或已 > 6 则标记 firstNagSent

tool_call (任意工具)
  → toolCallCount++

before_agent_start (每次用户消息)
  ├─ 未命名 + toolCallCount > 6 且首次 → 完整提醒
  └─ 已命名 + toolCallCount 是 40 的倍数 → 提醒检查话题是否转向
```

### 工具

| Tool | 说明 |
|------|------|
| `session_rename` | 重命名当前会话 |

---

## 开发

### 安装到本地

```bash
# 符号链接到 pi 扩展目录
ln -sf $(pwd)/extensions/pi-session-bridge ~/.pi/agent/extensions/pi-session-bridge
ln -sf $(pwd)/extensions/resume-x ~/.pi/agent/extensions/resume-x
ln -sf $(pwd)/extensions/rename-nag ~/.pi/agent/extensions/rename-nag
```

### 临时测试

```bash
pi -e extensions/rename-nag/index.ts
```

### 依赖

所有插件依赖 `better-sqlite3` (^12.9.0)，解析自项目根目录的 `node_modules`。

`@mariozechner/pi-coding-agent` 和 `@mariozechner/pi-tui` 由 pi 运行时注入，无需声明。
