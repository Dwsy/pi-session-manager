# Plan: rename-nag 插件 — 智能会话命名提醒

## 目标

从 `pi-session-bridge` 中拆分 `session_rename` 工具为独立插件，并增加智能提醒：当 agent 与用户的会话满足特定条件但未调用 rename 时，通过隐藏系统提示词催促 agent 命名。

## 触发条件

| 条件 | 逻辑 |
|------|------|
| 第 3 次会话 | SQLite `sessions` 表中同 `cwd` 的会话数 >= 3，且当前会话未被 rename |
| 第 2 次会话 + 轮次 > 5 | 同 `cwd` 会话数 == 2，当前会话 assistant 消息数 > 5，且未调用过 rename |

**"未 rename" 判定**: 当前会话 `name` 为 NULL 或匹配默认时间戳格式 `YYYY-MM-DDTHH-MM-SS`.

## 架构

```
extensions/rename-nag/
  index.ts        <- 主逻辑（~120 行）
  package.json    <- pi 扩展元数据
```

### 事件流

```
session_start
  ├─ 查询 SQLite: 同 cwd 的历史会话数
  ├─ 检查当前会话 name 是否为默认格式
  ├─ 设置 shouldNag = 条件满足
  └─ 重置 turnCount = 0, renameCalled = false

before_agent_start (每次用户消息)
  ├─ turnCount++ (计数本轮之前的 assistant 响应数)
  ├─ if shouldNag && !renameCalled && turnCount > 0:
  │   └─ return { message: { customType: "rename-nag", content: "...", display: false } }
  └─ else: return {} (不修改)

tool_call (session_rename)
  └─ renameCalled = true (关闭提醒)
```

### 关键 API

| API | 用途 |
|-----|------|
| `pi.registerTool()` | 注册 session_rename 工具 |
| `pi.on("session_start")` | 初始化：查 SQLite、判断条件 |
| `pi.on("before_agent_start")` | 注入隐藏消息 (display: false) |
| `pi.on("tool_call")` | 检测 rename 调用，关闭提醒 |
| `pi.getSessionName()` | 读取当前会话名 |
| `pi.setSessionName()` | 执行 rename |
| `better-sqlite3` | 查询 sessions.db |

### 隐藏消息内容

通过 `before_agent_start` 返回 `message` 注入，`display: false` 用户不可见，agent 可见：

```typescript
return {
  message: {
    customType: "rename-nag",
    content: "[Reminder] This session hasn't been named yet. You have a session_rename tool available. Consider calling session_rename with a descriptive name based on the work done so far.",
    display: false,
  },
};
```

不修改 systemPrompt，不污染系统指令。

## 需要修改的文件

### 1. 新建 `extensions/rename-nag/index.ts` (~120 行)

核心逻辑：
- `isDefaultName(name)`: 检测未命名状态
- `querySessionCount(cwd, dbPath)`: SQLite 查询同 cwd 会话数
- `export default function(pi)`: 注册 tool + 3 个事件 handler

### 2. 新建 `extensions/rename-nag/package.json`

```json
{
  "name": "rename-nag",
  "version": "0.1.0",
  "description": "Smart session rename reminder for Pi agents",
  "type": "module",
  "keywords": ["pi-package"],
  "engines": { "node": ">=21.0.0" },
  "pi": { "extensions": ["./index.ts"] }
}
```

### 3. 修改 `extensions/pi-session-bridge/index.ts`

**删除** `session_rename` 工具注册（第 1225-1252 行）：
```diff
- registerBridgeTool({
-   name: "session_rename",
-   ...
- });
```

**删除** `session_rename` 从 `ToolToggles` 类型和默认值：
- `extensions/pi-session-bridge/src/types.ts`: 移除 `session_rename: boolean` 和默认值

### 4. 修改 `extensions/pi-session-bridge/src/types.ts`

```diff
  export interface ToolToggles {
    session_search: boolean;
    session_tag: boolean;
    session_context: boolean;
    session_recall: boolean;
-   session_rename: boolean;
  }
  export const DEFAULT_TOOL_TOGGLES: ToolToggles = {
    session_search: true,
    session_tag: true,
    session_context: true,
    session_recall: true,
-   session_rename: true,
  };
```

## 实现步骤

1. **创建 `extensions/rename-nag/`** — index.ts + package.json
2. **从 pi-session-bridge 移除 session_rename** — index.ts + types.ts
3. **验证**:
   - `pi -e extensions/rename-nag/index.ts` 加载无报错
   - session_rename 工具可用
   - 第 3 次会话未命名时，systemPrompt 包含提醒
   - 调用 rename 后提醒消失

## 数据流示意

```
Session 1 (cwd=/project): agent works, no rename
Session 2 (cwd=/project): agent works, turns > 5, no rename
  -> before_agent_start: inject hidden message { display: false }
Session 3 (cwd=/project): agent works, no rename
  -> before_agent_start: inject hidden message { display: false }

Session N: agent calls session_rename("Fix auth")
  -> renameCalled = true
  -> before_agent_start: no reminder (already renamed)
```

## 不做的事情

- 不修改 Rust 后端
- 不修改前端 UI
- 不添加新的 Tauri 命令
- 不添加配置开关（保持简单，后续可加）
