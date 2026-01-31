# Pi RPC 模式研究报告

## 目录

1. [概述](#概述)
2. [核心架构](#核心架构)
3. [协议设计](#协议设计)
4. [命令系统](#命令系统)
5. [事件系统](#事件系统)
6. [客户端实现](#客户端实现)
7. [使用场景](#使用场景)
8. [最佳实践](#最佳实践)

---

## 1. 概述

### 1.1 什么是 RPC 模式

Pi 的 RPC（Remote Procedure Call）模式是一种**无头（headless）操作模式**，允许通过 JSON 协议在 stdin/stdout 上与编码代理进行通信。这使得 pi 可以被嵌入到其他应用程序、IDE 或自定义 UI 中。

### 1.2 核心特性

- **JSON 协议**：基于 JSON Lines 格式的简单协议
- **双向通信**：命令通过 stdin 发送，响应和事件通过 stdout 返回
- **异步流式**：支持流式响应和实时事件推送
- **完整功能**：支持所有交互模式的功能（提示、工具调用、会话管理等）
- **跨语言**：任何能够启动子进程和处理 JSON 的语言都可以使用

### 1.3 启动方式

```bash
pi --mode rpc [options]
```

常用选项：
- `--provider <name>`: 设置 LLM 提供商（anthropic, openai, google 等）
- `--model <id>`: 设置模型 ID
- `--no-session`: 禁用会话持久化
- `--session-dir <path>`: 自定义会话存储目录

### 1.4 与 SDK 模式的对比

| 特性 | RPC 模式 | SDK 模式 |
|------|---------|---------|
| **使用方式** | 子进程 + JSON 协议 | 直接导入 TypeScript/Node.js 模块 |
| **语言支持** | 任何语言（Python, Go, Rust 等） | 仅 Node.js/TypeScript |
| **进程隔离** | 独立进程，完全隔离 | 同一进程，共享内存 |
| **性能开销** | 进程间通信开销 | 函数调用，几乎无开销 |
| **适用场景** | 跨语言集成、IDE 插件、独立服务 | Node.js 应用、深度定制 |
| **复杂度** | 需要管理子进程和 JSON 解析 | 直接使用 TypeScript API |

**推荐选择**：
- 如果你在构建 Node.js 应用 → 使用 `AgentSession` SDK
- 如果你需要跨语言集成 → 使用 RPC 模式

---

## 2. 核心架构

### 2.1 架构层次

```
┌─────────────────────────────────────────┐
│         客户端应用（任何语言）            │
│  (Python, Go, Rust, JavaScript, etc.)   │
└─────────────────┬───────────────────────┘
                  │
                  │ JSON Lines (stdin/stdout)
                  │
┌─────────────────▼───────────────────────┐
│           Pi RPC Mode                   │
│  ┌─────────────────────────────────┐   │
│  │   Command Parser & Router       │   │
│  └──────────────┬──────────────────┘   │
│                 │                       │
│  ┌──────────────▼──────────────────┐   │
│  │      AgentSession Core          │   │
│  │  - Message Management           │   │
│  │  - Tool Execution               │   │
│  │  - Model Interaction            │   │
│  │  - Event Streaming              │   │
│  └──────────────┬──────────────────┘   │
│                 │                       │
│  ┌──────────────▼──────────────────┐   │
│  │    LLM Provider (Anthropic,     │   │
│  │    OpenAI, Google, etc.)        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 2.2 通信流程

```
客户端                    Pi RPC 进程
  │                          │
  │  {"type": "prompt", ... }│
  ├─────────────────────────>│
  │                          │ 解析命令
  │                          │ 调用 AgentSession
  │                          │
  │  {"type": "response", ...}│
  │<─────────────────────────┤ 立即返回响应
  │                          │
  │  {"type": "agent_start"}  │
  │<─────────────────────────┤ 开始流式事件
  │                          │
  │  {"type": "message_update"}│
  │<─────────────────────────┤ 流式文本
  │                          │
  │  {"type": "tool_execution_start"}│
  │<─────────────────────────┤ 工具执行
  │                          │
  │  {"type": "agent_end"}    │
  │<─────────────────────────┤ 完成
  │                          │
```

### 2.3 核心组件

#### 2.3.1 RPC Mode (`rpc-mode.ts`)
- 命令解析和路由
- 请求/响应关联（通过 `id` 字段）
- 事件流管理
- 错误处理

#### 2.3.2 RPC Client (`rpc-client.ts`)
- TypeScript 客户端实现
- 子进程管理
- 类型安全的 API
- 事件监听和等待机制

#### 2.3.3 RPC Types (`rpc-types.ts`)
- 完整的 TypeScript 类型定义
- 命令和响应类型
- 事件类型
- 数据结构

---

## 3. 协议设计

### 3.1 协议概述

- **传输格式**：JSON Lines（每行一个 JSON 对象）
- **命令方向**：客户端 → Pi（通过 stdin）
- **响应方向**：Pi → 客户端（通过 stdout）
- **事件方向**：Pi → 客户端（通过 stdout）

### 3.2 消息类型

#### 3.2.1 命令（Command）
客户端发送到 Pi 的 JSON 对象，每行一个。

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

**字段说明**：
- `id`（可选）：请求 ID，用于关联请求和响应
- `type`（必需）：命令类型
- 其他字段：根据命令类型而定

#### 3.2.2 响应（Response）
Pi 对命令的响应，表示命令成功或失败。

```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true}
```

**字段说明**：
- `id`（可选）：与请求的 `id` 相同
- `type`：固定为 `"response"`
- `command`：响应的命令类型
- `success`：布尔值，表示成功或失败
- `data`（可选）：响应数据
- `error`（可选）：错误信息（当 `success: false` 时）

#### 3.2.3 事件（Event）
Pi 在代理操作期间流式发送的事件。

```json
{"type": "message_update", "message": {...}, "assistantMessageEvent": {...}}
```

**特点**：
- 事件**不包含** `id` 字段（只有响应包含）
- 异步流式发送
- 可能在响应之后持续发送

### 3.3 请求/响应关联

通过可选的 `id` 字段关联请求和响应：

```json
// 客户端发送
{"id": "req-123", "type": "get_state"}

// Pi 响应
{"id": "req-123", "type": "response", "command": "get_state", "success": true, "data": {...}}
```

**最佳实践**：
- 对于需要等待结果的命令，使用 `id` 字段
- 对于"发送即忘"的命令，可以省略 `id`
- 使用递增数字或 UUID 作为 `id`

### 3.4 错误处理

#### 3.4.1 命令失败

```json
{
  "id": "req-1",
  "type": "response",
  "command": "set_model",
  "success": false,
  "error": "Model not found: invalid/model"
}
```

#### 3.4.2 解析错误

```json
{
  "type": "response",
  "command": "parse",
  "success": false,
  "error": "Failed to parse command: Unexpected token..."
}
```

#### 3.4.3 扩展错误事件

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_call",
  "error": "Error message..."
}
```

### 3.5 流式行为

#### 3.5.1 立即响应 + 异步事件

```
客户端发送: {"type": "prompt", "message": "Hello"}
Pi 立即响应: {"type": "response", "command": "prompt", "success": true}
Pi 异步事件: {"type": "agent_start"}
Pi 异步事件: {"type": "message_update", ...}
Pi 异步事件: {"type": "agent_end", ...}
```

#### 3.5.2 流式中断

当代理正在流式处理时，必须指定 `streamingBehavior`：

```json
{
  "type": "prompt",
  "message": "New instruction",
  "streamingBehavior": "steer"  // 或 "followUp"
}
```

- `"steer"`：中断代理，在当前工具执行后传递消息，跳过剩余工具
- `"followUp"`：等待代理完成，仅在代理停止时传递消息

如果代理正在流式处理且未指定 `streamingBehavior`，命令将返回错误。

**例外**：扩展命令（如 `/mycommand`）即使在流式处理期间也会立即执行。

---


## 4. 命令系统

### 4.1 命令分类

Pi RPC 模式支持以下命令类别：

| 类别 | 命令 | 说明 |
|------|------|------|
| **提示** | `prompt`, `steer`, `follow_up`, `abort` | 发送消息和控制执行 |
| **状态** | `get_state`, `get_messages` | 查询会话状态 |
| **模型** | `set_model`, `cycle_model`, `get_available_models` | 模型管理 |
| **思考** | `set_thinking_level`, `cycle_thinking_level` | 推理级别控制 |
| **队列** | `set_steering_mode`, `set_follow_up_mode` | 消息队列行为 |
| **压缩** | `compact`, `set_auto_compaction` | 上下文压缩 |
| **重试** | `set_auto_retry`, `abort_retry` | 自动重试控制 |
| **Bash** | `bash`, `abort_bash` | Shell 命令执行 |
| **会话** | `get_session_stats`, `export_html`, `switch_session`, `fork`, `new_session`, `set_session_name` | 会话管理 |
| **命令** | `get_commands` | 获取可用命令列表 |

### 4.2 核心命令详解

#### 4.2.1 prompt - 发送提示

发送用户提示给代理，立即返回，事件异步流式传输。

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

**带图像**：
```json
{
  "type": "prompt",
  "message": "What's in this image?",
  "images": [{
    "type": "image",
    "source": {
      "type": "base64",
      "mediaType": "image/png",
      "data": "iVBORw0KGgo..."
    }
  }]
}
```

**流式中断**：
```json
{
  "type": "prompt",
  "message": "New instruction",
  "streamingBehavior": "steer"  // 或 "followUp"
}
```

**响应**：
```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true}
```

#### 4.2.2 steer - 中断引导

排队一个引导消息以中断代理的运行。在当前工具执行后传递，跳过剩余工具。

```json
{"type": "steer", "message": "Stop and do this instead"}
```

**特点**：
- 技能命令和提示模板会被展开
- 不允许扩展命令（使用 `prompt` 代替）
- 参见 `set_steering_mode` 控制传递行为

#### 4.2.3 follow_up - 后续消息

排队一个后续消息，在代理完成后处理。仅在代理没有更多工具调用或引导消息时传递。

```json
{"type": "follow_up", "message": "After you're done, also do this"}
```

**特点**：
- 技能命令和提示模板会被展开
- 不允许扩展命令（使用 `prompt` 代替）
- 参见 `set_follow_up_mode` 控制传递行为

#### 4.2.4 abort - 中止操作

中止当前代理操作。

```json
{"type": "abort"}
```

#### 4.2.5 get_state - 获取状态

获取当前会话状态。

```json
{"type": "get_state"}
```

**响应**：
```json
{
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "isCompacting": false,
    "steeringMode": "all",
    "followUpMode": "one-at-a-time",
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "sessionName": "my-feature-work",
    "autoCompactionEnabled": true,
    "messageCount": 5,
    "pendingMessageCount": 0
  }
}
```

#### 4.2.6 set_model - 设置模型

切换到特定模型。

```json
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
```

**响应**：包含完整的 Model 对象。

#### 4.2.7 bash - 执行 Shell 命令

执行 shell 命令并将输出添加到对话上下文。

```json
{"type": "bash", "command": "ls -la"}
```

**响应**：
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x ...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": false
  }
}
```

**如果输出被截断**：
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "truncated output...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": true,
    "fullOutputPath": "/tmp/pi-bash-abc123.log"
  }
}
```

**重要**：bash 结果如何到达 LLM：

1. `bash` 命令立即执行并返回 `BashResult`
2. 内部创建 `BashExecutionMessage` 并存储在代理的消息状态中
3. 此消息**不会**发出事件
4. 当发送下一个 `prompt` 命令时，所有消息（包括 `BashExecutionMessage`）在发送到 LLM 之前被转换
5. `BashExecutionMessage` 被转换为 `UserMessage`，格式如下：

```
Ran `ls -la`
```
total 48
drwxr-xr-x ...
```
```

这意味着：
- Bash 输出在**下一个提示**时包含在 LLM 上下文中，而不是立即包含
- 可以在提示之前执行多个 bash 命令；所有输出都将被包含
- 不会为 `BashExecutionMessage` 本身发出事件

#### 4.2.8 compact - 手动压缩

手动压缩对话上下文以减少令牌使用。

```json
{"type": "compact"}
```

**带自定义指令**：
```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

**响应**：
```json
{
  "type": "response",
  "command": "compact",
  "success": true,
  "data": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  }
}
```

#### 4.2.9 get_commands - 获取可用命令

获取可用命令（扩展命令、提示模板和技能）。这些可以通过 `prompt` 命令以 `/` 前缀调用。

```json
{"type": "get_commands"}
```

**响应**：
```json
{
  "type": "response",
  "command": "get_commands",
  "success": true,
  "data": {
    "commands": [
      {
        "name": "session-name",
        "description": "Set or clear session name",
        "source": "extension",
        "path": "/home/user/.pi/agent/extensions/session.ts"
      },
      {
        "name": "fix-tests",
        "description": "Fix failing tests",
        "source": "template",
        "location": "project",
        "path": "/home/user/myproject/.pi/agent/prompts/fix-tests.md"
      },
      {
        "name": "skill:brave-search",
        "description": "Web search via Brave API",
        "source": "skill",
        "location": "user",
        "path": "/home/user/.pi/agent/skills/brave-search/SKILL.md"
      }
    ]
  }
}
```

**命令字段**：
- `name`：命令名称（使用 `/name` 调用）
- `description`：人类可读描述（扩展命令可选）
- `source`：命令类型
  - `"extension"`：通过扩展中的 `pi.registerCommand()` 注册
  - `"template"`：从提示模板 `.md` 文件加载
  - `"skill"`：从技能目录加载（名称以 `skill:` 为前缀）
- `location`：加载位置（可选，扩展不存在）
  - `"user"`：用户级（`~/.pi/agent/`）
  - `"project"`：项目级（`./.pi/agent/`）
  - `"path"`：通过 CLI 或设置的显式路径
- `path`：命令源的绝对文件路径（可选）

**注意**：内置 TUI 命令（`/settings`、`/hotkeys` 等）不包括在内。它们仅在交互模式下处理，如果通过 `prompt` 发送将不会执行。

### 4.3 队列模式控制

#### 4.3.1 set_steering_mode - 设置引导模式

控制引导消息（来自 `steer`）的传递方式。

```json
{"type": "set_steering_mode", "mode": "one-at-a-time"}
```

**模式**：
- `"all"`：在下一个中断点传递所有引导消息
- `"one-at-a-time"`：每次中断传递一个引导消息（默认）

#### 4.3.2 set_follow_up_mode - 设置后续模式

控制后续消息（来自 `follow_up`）的传递方式。

```json
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

**模式**：
- `"all"`：代理完成时传递所有后续消息
- `"one-at-a-time"`：每次代理完成传递一个后续消息（默认）

---


## 5. 事件系统

### 5.1 事件类型概览

| 事件类型 | 说明 |
|---------|------|
| `agent_start` | 代理开始处理 |
| `agent_end` | 代理完成（包含所有生成的消息） |
| `turn_start` | 新回合开始 |
| `turn_end` | 回合完成（包含助手消息和工具结果） |
| `message_start` | 消息开始 |
| `message_update` | 流式更新（文本/思考/工具调用增量） |
| `message_end` | 消息完成 |
| `tool_execution_start` | 工具开始执行 |
| `tool_execution_update` | 工具执行进度（流式输出） |
| `tool_execution_end` | 工具完成 |
| `auto_compaction_start` | 自动压缩开始 |
| `auto_compaction_end` | 自动压缩完成 |
| `auto_retry_start` | 自动重试开始（瞬态错误后） |
| `auto_retry_end` | 自动重试完成（成功或最终失败） |
| `extension_error` | 扩展抛出错误 |

### 5.2 核心事件详解

#### 5.2.1 agent_start / agent_end

**agent_start**：代理开始处理提示时发出。

```json
{"type": "agent_start"}
```

**agent_end**：代理完成时发出。包含此次运行期间生成的所有消息。

```json
{
  "type": "agent_end",
  "messages": [...]
}
```

#### 5.2.2 turn_start / turn_end

一个回合包括一个助手响应以及任何结果工具调用和结果。

**turn_start**：
```json
{"type": "turn_start"}
```

**turn_end**：
```json
{
  "type": "turn_end",
  "message": {...},
  "toolResults": [...]
}
```

#### 5.2.3 message_start / message_end

消息开始和完成时发出。`message` 字段包含 `AgentMessage`。

**message_start**：
```json
{"type": "message_start", "message": {...}}
```

**message_end**：
```json
{"type": "message_end", "message": {...}}
```

#### 5.2.4 message_update（流式）

在助手消息流式传输期间发出。包含部分消息和流式增量事件。

```json
{
  "type": "message_update",
  "message": {...},
  "assistantMessageEvent": {
    "type": "text_delta",
    "contentIndex": 0,
    "delta": "Hello ",
    "partial": {...}
  }
}
```

**assistantMessageEvent 增量类型**：

| 类型 | 说明 |
|------|------|
| `start` | 消息生成开始 |
| `text_start` | 文本内容块开始 |
| `text_delta` | 文本内容块 |
| `text_end` | 文本内容块结束 |
| `thinking_start` | 思考块开始 |
| `thinking_delta` | 思考内容块 |
| `thinking_end` | 思考块结束 |
| `toolcall_start` | 工具调用开始 |
| `toolcall_delta` | 工具调用参数块 |
| `toolcall_end` | 工具调用结束（包含完整的 `toolCall` 对象） |
| `done` | 消息完成（原因：`"stop"`, `"length"`, `"toolUse"`） |
| `error` | 发生错误（原因：`"aborted"`, `"error"`） |

**流式文本响应示例**：
```json
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_start","contentIndex":0,"partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":" world","partial":{...}}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_end","contentIndex":0,"content":"Hello world","partial":{...}}}
```

#### 5.2.5 tool_execution_start / update / end

工具开始、流式进度和完成执行时发出。

**tool_execution_start**：
```json
{
  "type": "tool_execution_start",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"}
}
```

**tool_execution_update**：在执行期间，流式部分结果（例如，bash 输出到达时）。

```json
{
  "type": "tool_execution_update",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "args": {"command": "ls -la"},
  "partialResult": {
    "content": [{"type": "text", "text": "partial output so far..."}],
    "details": {"truncation": null, "fullOutputPath": null}
  }
}
```

**tool_execution_end**：完成时。

```json
{
  "type": "tool_execution_end",
  "toolCallId": "call_abc123",
  "toolName": "bash",
  "result": {
    "content": [{"type": "text", "text": "total 48\n..."}],
    "details": {...}
  },
  "isError": false
}
```

**关键点**：
- 使用 `toolCallId` 关联事件
- `tool_execution_update` 中的 `partialResult` 包含到目前为止的累积输出（不仅仅是增量）
- 客户端可以在每次更新时简单地替换显示

#### 5.2.6 auto_compaction_start / end

自动压缩运行时发出（当上下文接近满时）。

**auto_compaction_start**：
```json
{"type": "auto_compaction_start", "reason": "threshold"}
```

**reason 字段**：
- `"threshold"`：上下文变大
- `"overflow"`：上下文超出限制

**auto_compaction_end**：
```json
{
  "type": "auto_compaction_end",
  "result": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "details": {}
  },
  "aborted": false,
  "willRetry": false
}
```

**特殊情况**：
- 如果 `reason` 是 `"overflow"` 且压缩成功，`willRetry` 为 `true`，代理将自动重试提示
- 如果压缩被中止，`result` 为 `null`，`aborted` 为 `true`
- 如果压缩失败（例如，API 配额超出），`result` 为 `null`，`aborted` 为 `false`，`errorMessage` 包含错误描述

#### 5.2.7 auto_retry_start / end

瞬态错误（过载、速率限制、5xx）后触发自动重试时发出。

**auto_retry_start**：
```json
{
  "type": "auto_retry_start",
  "attempt": 1,
  "maxAttempts": 3,
  "delayMs": 2000,
  "errorMessage": "529 {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}"
}
```

**auto_retry_end**（成功）：
```json
{
  "type": "auto_retry_end",
  "success": true,
  "attempt": 2
}
```

**auto_retry_end**（最终失败）：
```json
{
  "type": "auto_retry_end",
  "success": false,
  "attempt": 3,
  "finalError": "529 overloaded_error: Overloaded"
}
```

#### 5.2.8 extension_error

扩展抛出错误时发出。

```json
{
  "type": "extension_error",
  "extensionPath": "/path/to/extension.ts",
  "event": "tool_call",
  "error": "Error message..."
}
```

### 5.3 事件流示例

完整的提示-响应-工具调用流程：

```json
// 1. 命令响应
{"type": "response", "command": "prompt", "success": true}

// 2. 代理开始
{"type": "agent_start"}

// 3. 回合开始
{"type": "turn_start"}

// 4. 消息开始
{"type": "message_start", "message": {...}}

// 5. 流式文本
{"type": "message_update", "assistantMessageEvent": {"type": "text_start", ...}}
{"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "I'll ", ...}}
{"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "help ", ...}}
{"type": "message_update", "assistantMessageEvent": {"type": "text_end", ...}}

// 6. 工具调用
{"type": "message_update", "assistantMessageEvent": {"type": "toolcall_start", ...}}
{"type": "message_update", "assistantMessageEvent": {"type": "toolcall_delta", ...}}
{"type": "message_update", "assistantMessageEvent": {"type": "toolcall_end", "toolCall": {...}}}

// 7. 消息完成
{"type": "message_update", "assistantMessageEvent": {"type": "done", "reason": "toolUse"}}
{"type": "message_end", "message": {...}}

// 8. 工具执行
{"type": "tool_execution_start", "toolCallId": "call_123", "toolName": "bash", ...}
{"type": "tool_execution_update", "toolCallId": "call_123", "partialResult": {...}}
{"type": "tool_execution_end", "toolCallId": "call_123", "result": {...}}

// 9. 回合结束
{"type": "turn_end", "message": {...}, "toolResults": [...]}

// 10. 代理结束
{"type": "agent_end", "messages": [...]}
```

---


## 6. 客户端实现

### 6.1 TypeScript/Node.js 客户端

Pi 提供了官方的 TypeScript 客户端实现：`RpcClient`。

#### 6.1.1 基本使用

```typescript
import { RpcClient } from "@mariozechner/pi-coding-agent";

const client = new RpcClient({
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  cwd: process.cwd(),
});

await client.start();

// 订阅事件
client.onEvent((event) => {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    if (delta.type === "text_delta") {
      process.stdout.write(delta.delta);
    }
  }
});

// 发送提示
await client.prompt("Hello, world!");

// 等待完成
await client.waitForIdle();

await client.stop();
```

#### 6.1.2 RpcClient API

**构造选项**：
```typescript
interface RpcClientOptions {
  cliPath?: string;        // CLI 入口点路径（默认：搜索 dist/cli.js）
  cwd?: string;            // 代理工作目录
  env?: Record<string, string>;  // 环境变量
  provider?: string;       // 使用的提供商
  model?: string;          // 使用的模型 ID
  args?: string[];         // 额外的 CLI 参数
}
```

**核心方法**：
```typescript
// 生命周期
await client.start();
await client.stop();

// 事件监听
const unsubscribe = client.onEvent((event) => { ... });
unsubscribe();  // 取消订阅

// 提示
await client.prompt(message, images?);
await client.steer(message);
await client.followUp(message);
await client.abort();

// 状态
const state = await client.getState();
const messages = await client.getMessages();
const stats = await client.getSessionStats();

// 模型
await client.setModel(provider, modelId);
await client.cycleModel();
const models = await client.getAvailableModels();

// 思考
await client.setThinkingLevel(level);
await client.cycleThinkingLevel();

// 工具
const result = await client.bash(command);
await client.abortBash();

// 压缩
const result = await client.compact(customInstructions?);
await client.setAutoCompaction(enabled);

// 会话
await client.newSession(parentSession?);
await client.switchSession(sessionPath);
await client.fork(entryId);
await client.setSessionName(name);
await client.exportHtml(outputPath?);

// 等待
await client.waitForIdle(timeout?);
const events = await client.collectEvents(timeout?);
const events = await client.promptAndWait(message, images?, timeout?);
```

#### 6.1.3 高级用法

**收集所有事件**：
```typescript
const events = await client.promptAndWait("Analyze this code", undefined, 60000);

// 处理事件
for (const event of events) {
  if (event.type === "tool_execution_end") {
    console.log(`Tool ${event.toolName} completed`);
  }
}
```

**错误处理**：
```typescript
try {
  await client.prompt("Hello");
  await client.waitForIdle();
} catch (error) {
  console.error("Agent error:", error);
  console.error("Stderr:", client.getStderr());
}
```

### 6.2 Python 客户端示例

```python
import subprocess
import json
import sys

class PiRpcClient:
    def __init__(self, provider="anthropic", model=None):
        args = ["pi", "--mode", "rpc", "--no-session"]
        if provider:
            args.extend(["--provider", provider])
        if model:
            args.extend(["--model", model])
        
        self.proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self.request_id = 0
    
    def send(self, cmd):
        """发送命令"""
        self.proc.stdin.write(json.dumps(cmd) + "\n")
        self.proc.stdin.flush()
    
    def read_line(self):
        """读取一行响应"""
        line = self.proc.stdout.readline()
        if not line:
            return None
        return json.loads(line)
    
    def prompt(self, message, images=None):
        """发送提示"""
        self.request_id += 1
        cmd = {
            "id": f"req-{self.request_id}",
            "type": "prompt",
            "message": message
        }
        if images:
            cmd["images"] = images
        self.send(cmd)
        
        # 读取响应
        response = self.read_line()
        if not response.get("success"):
            raise Exception(f"Prompt failed: {response.get('error')}")
        
        return self.request_id
    
    def stream_events(self):
        """流式读取事件"""
        while True:
            event = self.read_line()
            if not event:
                break
            yield event
            if event.get("type") == "agent_end":
                break
    
    def close(self):
        """关闭客户端"""
        self.proc.stdin.close()
        self.proc.wait()

# 使用示例
client = PiRpcClient()

# 发送提示
client.prompt("Hello, world!")

# 处理事件
for event in client.stream_events():
    if event.get("type") == "message_update":
        delta = event.get("assistantMessageEvent", {})
        if delta.get("type") == "text_delta":
            print(delta["delta"], end="", flush=True)
    
    if event.get("type") == "agent_end":
        print()
        break

client.close()
```

### 6.3 Go 客户端示例

```go
package main

import (
    "bufio"
    "encoding/json"
    "fmt"
    "os"
    "os/exec"
)

type RpcClient struct {
    cmd       *exec.Cmd
    stdin     io.WriteCloser
    stdout    io.ReadCloser
    scanner   *bufio.Scanner
    requestID int
}

func NewRpcClient(provider, model string) (*RpcClient, error) {
    args := []string{"--mode", "rpc", "--no-session"}
    if provider != "" {
        args = append(args, "--provider", provider)
    }
    if model != "" {
        args = append(args, "--model", model)
    }
    
    cmd := exec.Command("pi", args...)
    
    stdin, err := cmd.StdinPipe()
    if err != nil {
        return nil, err
    }
    
    stdout, err := cmd.StdoutPipe()
    if err != nil {
        return nil, err
    }
    
    if err := cmd.Start(); err != nil {
        return nil, err
    }
    
    return &RpcClient{
        cmd:     cmd,
        stdin:   stdin,
        stdout:  stdout,
        scanner: bufio.NewScanner(stdout),
    }, nil
}

func (c *RpcClient) Send(cmd map[string]interface{}) error {
    data, err := json.Marshal(cmd)
    if err != nil {
        return err
    }
    
    _, err = c.stdin.Write(append(data, '\n'))
    return err
}

func (c *RpcClient) ReadEvent() (map[string]interface{}, error) {
    if !c.scanner.Scan() {
        return nil, c.scanner.Err()
    }
    
    var event map[string]interface{}
    if err := json.Unmarshal(c.scanner.Bytes(), &event); err != nil {
        return nil, err
    }
    
    return event, nil
}

func (c *RpcClient) Prompt(message string) error {
    c.requestID++
    return c.Send(map[string]interface{}{
        "id":      fmt.Sprintf("req-%d", c.requestID),
        "type":    "prompt",
        "message": message,
    })
}

func (c *RpcClient) Close() error {
    c.stdin.Close()
    return c.cmd.Wait()
}

func main() {
    client, err := NewRpcClient("anthropic", "")
    if err != nil {
        panic(err)
    }
    defer client.Close()
    
    // 发送提示
    if err := client.Prompt("Hello, world!"); err != nil {
        panic(err)
    }
    
    // 处理事件
    for {
        event, err := client.ReadEvent()
        if err != nil {
            break
        }
        
        if event["type"] == "message_update" {
            if ame, ok := event["assistantMessageEvent"].(map[string]interface{}); ok {
                if ame["type"] == "text_delta" {
                    fmt.Print(ame["delta"])
                }
            }
        }
        
        if event["type"] == "agent_end" {
            fmt.Println()
            break
        }
    }
}
```

### 6.4 客户端最佳实践

#### 6.4.1 错误处理

```typescript
// 1. 检查响应成功
const response = await client.send({ type: "set_model", ... });
if (!response.success) {
  console.error("Command failed:", response.error);
}

// 2. 监听扩展错误
client.onEvent((event) => {
  if (event.type === "extension_error") {
    console.error("Extension error:", event.error);
  }
});

// 3. 捕获进程错误
client.onEvent((event) => {
  if (event.type === "message_update" && 
      event.assistantMessageEvent.type === "error") {
    console.error("Agent error:", event.assistantMessageEvent.reason);
  }
});
```

#### 6.4.2 超时处理

```typescript
// 使用超时
try {
  await client.promptAndWait("Long task", undefined, 30000);  // 30秒超时
} catch (error) {
  if (error.message.includes("timeout")) {
    await client.abort();
  }
}
```

#### 6.4.3 流式显示

```typescript
let currentText = "";

client.onEvent((event) => {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    
    switch (delta.type) {
      case "text_delta":
        currentText += delta.delta;
        process.stdout.write(delta.delta);
        break;
      
      case "text_end":
        console.log();  // 换行
        break;
      
      case "thinking_delta":
        // 可选：显示思考过程
        console.log(`[Thinking: ${delta.delta}]`);
        break;
    }
  }
});
```

#### 6.4.4 工具执行监控

```typescript
const toolExecutions = new Map();

client.onEvent((event) => {
  switch (event.type) {
    case "tool_execution_start":
      console.log(`🔧 ${event.toolName}: ${JSON.stringify(event.args)}`);
      toolExecutions.set(event.toolCallId, Date.now());
      break;
    
    case "tool_execution_update":
      // 显示进度
      const partial = event.partialResult.content[0]?.text || "";
      console.log(`   ${partial.slice(-50)}`);  // 最后50个字符
      break;
    
    case "tool_execution_end":
      const duration = Date.now() - toolExecutions.get(event.toolCallId);
      console.log(`✅ ${event.toolName} completed in ${duration}ms`);
      toolExecutions.delete(event.toolCallId);
      break;
  }
});
```

---


## 7. 使用场景

### 7.1 IDE 集成

**场景**：将 Pi 集成到 VSCode、IntelliJ、Vim 等编辑器中。

**实现方式**：
- 编辑器插件启动 Pi RPC 进程
- 通过命令面板或快捷键触发提示
- 在侧边栏或面板中显示流式响应
- 工具调用结果直接应用到编辑器

**示例**：VSCode 扩展
```typescript
import * as vscode from 'vscode';
import { RpcClient } from '@mariozechner/pi-coding-agent';

let client: RpcClient;

export function activate(context: vscode.ExtensionContext) {
  // 启动 RPC 客户端
  client = new RpcClient({
    cwd: vscode.workspace.rootPath,
  });
  await client.start();
  
  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('pi.ask', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Ask Pi',
      });
      
      if (input) {
        const panel = vscode.window.createWebviewPanel(
          'piResponse',
          'Pi Response',
          vscode.ViewColumn.Beside
        );
        
        let html = '';
        client.onEvent((event) => {
          if (event.type === 'message_update' && 
              event.assistantMessageEvent.type === 'text_delta') {
            html += event.assistantMessageEvent.delta;
            panel.webview.html = `<pre>${html}</pre>`;
          }
        });
        
        await client.prompt(input);
      }
    })
  );
}
```

### 7.2 CI/CD 自动化

**场景**：在 CI/CD 流程中使用 Pi 进行代码审查、测试生成、文档更新。

**实现方式**：
- CI 脚本启动 Pi RPC 进程
- 发送代码审查提示
- 收集结果并生成报告
- 自动提交修复或创建 PR

**示例**：GitHub Actions
```yaml
name: Pi Code Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install Pi
        run: npm install -g @mariozechner/pi-coding-agent
      
      - name: Run Pi Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          node review.js
```

```javascript
// review.js
const { RpcClient } = require('@mariozechner/pi-coding-agent');
const { execSync } = require('child_process');

async function main() {
  const client = new RpcClient();
  await client.start();
  
  // 获取 diff
  const diff = execSync('git diff origin/main...HEAD').toString();
  
  // 请求审查
  await client.prompt(`Review this code change:\n\n${diff}`);
  
  let review = '';
  client.onEvent((event) => {
    if (event.type === 'message_update' && 
        event.assistantMessageEvent.type === 'text_delta') {
      review += event.assistantMessageEvent.delta;
    }
  });
  
  await client.waitForIdle();
  
  // 输出审查结果
  console.log('## Code Review\n\n' + review);
  
  await client.stop();
}

main();
```

### 7.3 Web 应用集成

**场景**：在 Web 应用中提供 AI 编码助手功能。

**实现方式**：
- 后端服务启动 Pi RPC 进程池
- 前端通过 WebSocket 连接后端
- 后端转发 RPC 事件到 WebSocket
- 前端实时显示流式响应

**示例**：Express + WebSocket
```typescript
import express from 'express';
import { WebSocketServer } from 'ws';
import { RpcClient } from '@mariozechner/pi-coding-agent';

const app = express();
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', async (ws) => {
  const client = new RpcClient();
  await client.start();
  
  // 转发事件到 WebSocket
  client.onEvent((event) => {
    ws.send(JSON.stringify(event));
  });
  
  // 接收 WebSocket 消息
  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'prompt') {
      await client.prompt(message.message);
    } else if (message.type === 'abort') {
      await client.abort();
    }
  });
  
  ws.on('close', async () => {
    await client.stop();
  });
});

app.listen(3000);
```

### 7.4 批处理任务

**场景**：批量处理多个文件或任务。

**实现方式**：
- 启动单个 RPC 客户端
- 循环处理每个任务
- 使用 `newSession()` 在任务间重置上下文
- 收集所有结果

**示例**：批量代码审查
```typescript
import { RpcClient } from '@mariozechner/pi-coding-agent';
import { readdir, readFile, writeFile } from 'fs/promises';

async function reviewFiles(directory: string) {
  const client = new RpcClient();
  await client.start();
  
  const files = await readdir(directory);
  const results = [];
  
  for (const file of files) {
    if (!file.endsWith('.ts')) continue;
    
    // 新会话
    await client.newSession();
    
    const code = await readFile(`${directory}/${file}`, 'utf-8');
    await client.prompt(`Review this code:\n\n${code}`);
    
    let review = '';
    client.onEvent((event) => {
      if (event.type === 'message_update' && 
          event.assistantMessageEvent.type === 'text_delta') {
        review += event.assistantMessageEvent.delta;
      }
    });
    
    await client.waitForIdle();
    
    results.push({ file, review });
  }
  
  await client.stop();
  
  // 生成报告
  const report = results.map(r => 
    `## ${r.file}\n\n${r.review}\n\n---\n\n`
  ).join('');
  
  await writeFile('review-report.md', report);
}
```

### 7.5 交互式 CLI 工具

**场景**：构建自定义的交互式命令行工具。

**实现方式**：
- 使用 readline 或 inquirer 处理用户输入
- 启动 Pi RPC 客户端
- 实时显示流式响应
- 支持多轮对话

**示例**：交互式 REPL
```typescript
import { RpcClient } from '@mariozechner/pi-coding-agent';
import readline from 'readline';

async function main() {
  const client = new RpcClient();
  await client.start();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });
  
  client.onEvent((event) => {
    if (event.type === 'message_update') {
      const delta = event.assistantMessageEvent;
      if (delta.type === 'text_delta') {
        process.stdout.write(delta.delta);
      }
    } else if (event.type === 'agent_end') {
      console.log('\n');
      rl.prompt();
    }
  });
  
  rl.on('line', async (line) => {
    if (line === 'exit') {
      await client.stop();
      rl.close();
      return;
    }
    
    if (line === 'new') {
      await client.newSession();
      console.log('Started new session');
      rl.prompt();
      return;
    }
    
    await client.prompt(line);
  });
  
  console.log('Pi Interactive Shell (type "exit" to quit, "new" for new session)');
  rl.prompt();
}

main();
```

### 7.6 测试自动化

**场景**：自动化测试生成和修复。

**实现方式**：
- 分析代码库结构
- 生成测试用例
- 运行测试并收集失败信息
- 自动修复失败的测试

**示例**：测试生成器
```typescript
import { RpcClient } from '@mariozechner/pi-coding-agent';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function generateTests(sourceFile: string) {
  const client = new RpcClient();
  await client.start();
  
  // 读取源代码
  const result = await client.bash(`cat ${sourceFile}`);
  const code = result.output;
  
  // 生成测试
  await client.prompt(
    `Generate comprehensive unit tests for this code:\n\n${code}`
  );
  
  let tests = '';
  client.onEvent((event) => {
    if (event.type === 'message_update' && 
        event.assistantMessageEvent.type === 'text_delta') {
      tests += event.assistantMessageEvent.delta;
    }
  });
  
  await client.waitForIdle();
  
  // 提取代码块
  const match = tests.match(/```typescript\n([\s\S]+?)\n```/);
  if (match) {
    const testCode = match[1];
    const testFile = sourceFile.replace('.ts', '.test.ts');
    
    // 写入测试文件
    await client.bash(`cat > ${testFile} << 'EOF'\n${testCode}\nEOF`);
    
    // 运行测试
    try {
      await execAsync(`npm test ${testFile}`);
      console.log('✅ Tests passed!');
    } catch (error) {
      console.log('❌ Tests failed, attempting to fix...');
      
      // 修复测试
      await client.prompt(
        `These tests failed:\n\n${error.stdout}\n\nPlease fix them.`
      );
      
      await client.waitForIdle();
    }
  }
  
  await client.stop();
}
```

---


## 8. 最佳实践

### 8.1 性能优化

#### 8.1.1 进程复用

**问题**：频繁启动/停止 RPC 进程开销大。

**解决方案**：使用进程池或长期运行的进程。

```typescript
class RpcClientPool {
  private clients: RpcClient[] = [];
  private available: RpcClient[] = [];
  
  constructor(private size: number) {}
  
  async init() {
    for (let i = 0; i < this.size; i++) {
      const client = new RpcClient();
      await client.start();
      this.clients.push(client);
      this.available.push(client);
    }
  }
  
  async acquire(): Promise<RpcClient> {
    while (this.available.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.available.pop()!;
  }
  
  release(client: RpcClient) {
    // 重置会话
    client.newSession();
    this.available.push(client);
  }
  
  async destroy() {
    for (const client of this.clients) {
      await client.stop();
    }
  }
}
```

#### 8.1.2 会话管理

**问题**：长时间会话导致上下文过大。

**解决方案**：
- 定期使用 `newSession()` 重置上下文
- 启用自动压缩：`setAutoCompaction(true)`
- 手动压缩：`compact()`

```typescript
// 每 10 个提示后重置会话
let promptCount = 0;

async function prompt(client: RpcClient, message: string) {
  if (promptCount >= 10) {
    await client.newSession();
    promptCount = 0;
  }
  
  await client.prompt(message);
  promptCount++;
}
```

#### 8.1.3 批量操作

**问题**：逐个处理任务效率低。

**解决方案**：使用 bash 命令批量处理。

```typescript
// ❌ 低效
for (const file of files) {
  await client.bash(`cat ${file}`);
}

// ✅ 高效
const fileList = files.join(' ');
await client.bash(`cat ${fileList}`);
```

### 8.2 错误处理

#### 8.2.1 重试机制

```typescript
async function promptWithRetry(
  client: RpcClient,
  message: string,
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.prompt(message);
      await client.waitForIdle(60000);  // 60秒超时
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      console.log(`Retry ${i + 1}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

#### 8.2.2 优雅降级

```typescript
async function safePrompt(
  client: RpcClient,
  message: string
): Promise<string> {
  try {
    await client.prompt(message);
    
    let response = '';
    client.onEvent((event) => {
      if (event.type === 'message_update' && 
          event.assistantMessageEvent.type === 'text_delta') {
        response += event.assistantMessageEvent.delta;
      }
    });
    
    await client.waitForIdle();
    return response;
  } catch (error) {
    console.error('Agent failed:', error);
    return 'Sorry, I encountered an error. Please try again.';
  }
}
```

#### 8.2.3 进程监控

```typescript
class MonitoredRpcClient extends RpcClient {
  private heartbeatInterval?: NodeJS.Timeout;
  
  async start() {
    await super.start();
    
    // 心跳检测
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.getState();
      } catch (error) {
        console.error('Client unresponsive, restarting...');
        await this.restart();
      }
    }, 30000);  // 每30秒检查一次
  }
  
  async restart() {
    clearInterval(this.heartbeatInterval);
    await this.stop();
    await this.start();
  }
  
  async stop() {
    clearInterval(this.heartbeatInterval);
    await super.stop();
  }
}
```

### 8.3 安全性

#### 8.3.1 输入验证

```typescript
function sanitizeInput(input: string): string {
  // 移除潜在危险字符
  return input
    .replace(/[`$]/g, '')  // 防止命令注入
    .slice(0, 10000);      // 限制长度
}

async function safePrompt(client: RpcClient, userInput: string) {
  const sanitized = sanitizeInput(userInput);
  await client.prompt(sanitized);
}
```

#### 8.3.2 工具限制

```typescript
// 使用只读工具
const client = new RpcClient({
  args: ['--tools', 'read'],  // 仅允许读取操作
});
```

#### 8.3.3 环境隔离

```typescript
// 在隔离的工作目录中运行
const client = new RpcClient({
  cwd: '/tmp/sandbox',
  env: {
    ...process.env,
    HOME: '/tmp/sandbox',  // 隔离 HOME 目录
  },
});
```

### 8.4 调试技巧

#### 8.4.1 日志记录

```typescript
client.onEvent((event) => {
  // 记录所有事件
  console.log(JSON.stringify(event, null, 2));
  
  // 或选择性记录
  if (event.type === 'tool_execution_start') {
    console.log(`[Tool] ${event.toolName}:`, event.args);
  }
});
```

#### 8.4.2 Stderr 检查

```typescript
try {
  await client.prompt("Hello");
  await client.waitForIdle();
} catch (error) {
  console.error('Error:', error);
  console.error('Stderr:', client.getStderr());
}
```

#### 8.4.3 事件追踪

```typescript
class EventTracker {
  private events: any[] = [];
  
  track(event: any) {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });
  }
  
  getTimeline() {
    return this.events.map((e, i) => {
      const prev = this.events[i - 1];
      const delta = prev ? e.timestamp - prev.timestamp : 0;
      return `[+${delta}ms] ${e.type}`;
    }).join('\n');
  }
  
  save(path: string) {
    fs.writeFileSync(path, JSON.stringify(this.events, null, 2));
  }
}

const tracker = new EventTracker();
client.onEvent((event) => tracker.track(event));
```

### 8.5 架构建议

#### 8.5.1 分层架构

```
┌─────────────────────────────────┐
│      应用层（业务逻辑）           │
├─────────────────────────────────┤
│      服务层（RPC 客户端封装）     │
├─────────────────────────────────┤
│      传输层（RPC 协议）           │
├─────────────────────────────────┤
│      Pi RPC 进程                 │
└─────────────────────────────────┘
```

**示例**：
```typescript
// 服务层
class PiService {
  private client: RpcClient;
  
  async codeReview(code: string): Promise<string> {
    await this.client.prompt(`Review: ${code}`);
    return await this.collectResponse();
  }
  
  async generateTests(code: string): Promise<string> {
    await this.client.prompt(`Generate tests: ${code}`);
    return await this.collectResponse();
  }
  
  private async collectResponse(): Promise<string> {
    let response = '';
    this.client.onEvent((event) => {
      if (event.type === 'message_update' && 
          event.assistantMessageEvent.type === 'text_delta') {
        response += event.assistantMessageEvent.delta;
      }
    });
    await this.client.waitForIdle();
    return response;
  }
}

// 应用层
const service = new PiService();
const review = await service.codeReview(myCode);
```

#### 8.5.2 事件驱动架构

```typescript
import { EventEmitter } from 'events';

class PiEventBus extends EventEmitter {
  constructor(private client: RpcClient) {
    super();
    this.setupListeners();
  }
  
  private setupListeners() {
    this.client.onEvent((event) => {
      // 转换为领域事件
      switch (event.type) {
        case 'message_update':
          if (event.assistantMessageEvent.type === 'text_delta') {
            this.emit('text', event.assistantMessageEvent.delta);
          }
          break;
        
        case 'tool_execution_end':
          this.emit('tool_complete', {
            name: event.toolName,
            result: event.result,
          });
          break;
        
        case 'agent_end':
          this.emit('complete', event.messages);
          break;
      }
    });
  }
}

// 使用
const bus = new PiEventBus(client);

bus.on('text', (text) => console.log(text));
bus.on('tool_complete', (data) => console.log('Tool:', data.name));
bus.on('complete', (messages) => console.log('Done!'));
```

#### 8.5.3 微服务集成

```typescript
// gRPC 服务定义
service PiService {
  rpc Prompt(PromptRequest) returns (stream PromptResponse);
  rpc GetState(Empty) returns (StateResponse);
}

// 实现
class PiGrpcService {
  private client: RpcClient;
  
  async Prompt(
    call: ServerWritableStream<PromptRequest, PromptResponse>
  ) {
    const { message } = call.request;
    
    this.client.onEvent((event) => {
      if (event.type === 'message_update') {
        call.write({
          type: 'delta',
          content: event.assistantMessageEvent.delta,
        });
      } else if (event.type === 'agent_end') {
        call.end();
      }
    });
    
    await this.client.prompt(message);
  }
}
```

---

## 9. 总结

### 9.1 核心优势

1. **跨语言支持**：任何能够启动子进程的语言都可以使用
2. **进程隔离**：独立进程，不影响主应用
3. **流式响应**：实时事件流，用户体验好
4. **完整功能**：支持所有 Pi 功能
5. **简单协议**：JSON Lines，易于实现和调试

### 9.2 适用场景

- ✅ IDE 插件和编辑器集成
- ✅ CI/CD 自动化
- ✅ Web 应用后端服务
- ✅ 批处理任务
- ✅ 跨语言项目
- ❌ Node.js 应用（推荐使用 SDK）
- ❌ 高性能要求（进程间通信有开销）

### 9.3 关键要点

1. **命令立即返回，事件异步流式**
2. **使用 `id` 字段关联请求和响应**
3. **流式中断需要指定 `streamingBehavior`**
4. **bash 结果在下一个 prompt 时包含在上下文中**
5. **工具执行通过 `toolCallId` 关联事件**
6. **定期重置会话以避免上下文过大**
7. **使用进程池提高性能**
8. **实现错误处理和重试机制**

### 9.4 进一步学习

- **官方文档**：`/docs/rpc.md`
- **类型定义**：`/dist/modes/rpc/rpc-types.d.ts`
- **客户端实现**：`/dist/modes/rpc/rpc-client.ts`
- **SDK 文档**：`/docs/sdk.md`（对比学习）

---

## 附录

### A. 完整命令列表

| 命令 | 说明 |
|------|------|
| `prompt` | 发送用户提示 |
| `steer` | 排队引导消息（中断） |
| `follow_up` | 排队后续消息 |
| `abort` | 中止当前操作 |
| `new_session` | 开始新会话 |
| `get_state` | 获取会话状态 |
| `get_messages` | 获取所有消息 |
| `set_model` | 设置模型 |
| `cycle_model` | 循环切换模型 |
| `get_available_models` | 获取可用模型列表 |
| `set_thinking_level` | 设置思考级别 |
| `cycle_thinking_level` | 循环切换思考级别 |
| `set_steering_mode` | 设置引导模式 |
| `set_follow_up_mode` | 设置后续模式 |
| `compact` | 手动压缩上下文 |
| `set_auto_compaction` | 设置自动压缩 |
| `set_auto_retry` | 设置自动重试 |
| `abort_retry` | 中止重试 |
| `bash` | 执行 shell 命令 |
| `abort_bash` | 中止 bash 命令 |
| `get_session_stats` | 获取会话统计 |
| `export_html` | 导出为 HTML |
| `switch_session` | 切换会话 |
| `fork` | 从消息分叉 |
| `get_fork_messages` | 获取可分叉消息 |
| `get_last_assistant_text` | 获取最后助手文本 |
| `set_session_name` | 设置会话名称 |
| `get_commands` | 获取可用命令 |

### B. 完整事件列表

| 事件 | 说明 |
|------|------|
| `agent_start` | 代理开始 |
| `agent_end` | 代理结束 |
| `turn_start` | 回合开始 |
| `turn_end` | 回合结束 |
| `message_start` | 消息开始 |
| `message_update` | 消息更新（流式） |
| `message_end` | 消息结束 |
| `tool_execution_start` | 工具执行开始 |
| `tool_execution_update` | 工具执行更新 |
| `tool_execution_end` | 工具执行结束 |
| `auto_compaction_start` | 自动压缩开始 |
| `auto_compaction_end` | 自动压缩结束 |
| `auto_retry_start` | 自动重试开始 |
| `auto_retry_end` | 自动重试结束 |
| `extension_error` | 扩展错误 |

### C. 思考级别

| 级别 | 说明 |
|------|------|
| `off` | 关闭思考 |
| `minimal` | 最小思考 |
| `low` | 低级思考 |
| `medium` | 中级思考 |
| `high` | 高级思考 |
| `xhigh` | 超高级思考（仅 OpenAI codex-max） |

### D. 停止原因

| 原因 | 说明 |
|------|------|
| `stop` | 正常停止 |
| `length` | 达到最大长度 |
| `toolUse` | 工具调用 |
| `error` | 错误 |
| `aborted` | 被中止 |

---

**文档版本**：1.0  
**最后更新**：2026-01-31  
**作者**：Pi Agent

