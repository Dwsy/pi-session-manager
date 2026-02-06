# Pi Island 架构对比分析报告

## 1. 核心架构差异对比

### 1.1 通信模式对比

| 维度 | 当前项目 (Tauri) | Pi Island (Swift) | 分析 |
|------|------------------|-------------------|------|
| **与 Pi CLI 通信** | ❌ 无直接通信 | ✅ stdin/stdout JSON RPC | Pi Island 直接与 Pi CLI RPC 通信，实时获取消息流 |
| **数据获取方式** | 文件系统扫描 + SQLite 缓存 | RPC 实时流 + 文件监听 | Pi Island 是"推送"模式，我们是"拉取"模式 |
| **实时性** | ⚠️ 依赖文件监听（3-5秒延迟） | ✅ 毫秒级 RPC 事件流 | Pi Island 通过 RPC 事件实时接收消息增量 |
| **架构角色** | 只读管理器 | 交互式客户端 | Pi Island 可以发送消息、切换模型等 |

### 1.2 数据流架构图

**当前项目（笨办法）：**
```
Pi CLI 写文件 ──> 文件系统 ──> notify 监听(3s防抖) ──> Tauri 后端
                                                  ──> 全量扫描
                                                  ──> SQLite 查询
                                                  ──> 前端刷新
```

**Pi Island（优雅办法）：**
```
Pi CLI RPC stdout ──> JSON 事件流 ──> PiRPCClient (Actor)
                                     ├──> 实时消息追加
                                     ├──> 状态变更通知
                                     └──> SwiftUI @Observable 响应

FSEvents 文件监听 ──> 外部会话检测（仅用于历史会话）
```

## 2. Pi Island 的核心优势分析

### 2.1 RPC 通信协议

**命令类型：**
```swift
enum RPCCommand {
    case prompt(message: String, images: [ImageData]?, streamingBehavior: StreamingBehavior?)
    case steer(message: String)           // 中断式消息
    case followUp(message: String)        // 后续消息
    case abort
    case getState
    case getMessages
    case getAvailableModels
    case setModel(provider: String, modelId: String)
    case cycleModel
    case setThinkingLevel(level: ThinkingLevel)
    case compact(customInstructions: String?)
    case newSession(parentSession: String?)
    case switchSession(sessionPath: String)
    case getSessionStats
    case getCommands
}
```

**事件流类型：**
```swift
struct RPCEvent {
    let type: String  // "response", "agent_start", "agent_end", "message_update"
    let assistantMessageEvent: AssistantMessageEvent?
    // ...
}

struct AssistantMessageEvent {
    let type: String  // "text_start", "text_delta", "text_end", "thinking_*", "toolcall_*", "done"
    let delta: String?       // 增量文本
    let content: String?
    let thinking: String?    // 推理内容
    let toolCall: ToolCallData?
}
```

### 2.2 实时性实现机制

**Pi Island 的流式处理：**
```swift
private func handleMessageUpdate(_ delta: AssistantMessageEvent) {
    switch delta.type {
    case "text_delta":
        if let text = delta.delta {
            streamingText += text  // 增量追加，无需重新渲染整个列表
        }
    case "thinking_delta":
        if let text = delta.delta ?? delta.thinking {
            streamingThinking += text
        }
    case "toolcall_start":
        phase = .executing  // 状态切换
    case "done":
        finalizeStreamingMessage()  // 完成归档
    }
}
```

**对比我们的实现：**
```typescript
// 当前：轮询检查文件变化
const checkInterval = setInterval(async () => {
    const result = await invoke<[number, string]>('read_session_file_incremental', {
        path: session.path,
        fromLine: lineCount
    })
    // 解析新增内容并追加
}, 1000)  // 1秒轮询
```

**差距：**
- Pi Island: 事件驱动，毫秒级延迟
- 我们: 轮询 + 文件IO，秒级延迟

### 2.3 会话状态管理

**Pi Island 的 ManagedSession：**
```swift
@MainActor
@Observable
class ManagedSession: Identifiable, Equatable {
    var phase: RPCPhase = .disconnected  // .idle, .thinking, .executing, .streaming
    var streamingText = ""                // 当前流式文本
    var streamingThinking = ""            // 当前推理内容
    var messages: [RPCMessage] = []       // 完整消息历史
    var currentTool: RPCToolExecution?    // 当前执行的工具
    var isLive: Bool                      // 是否活跃 RPC 连接
}
```

**状态流转：**
```
idle ──prompt──> thinking ──toolcall_start──> executing ──done──> idle
```

## 3. 当前项目的改进机会

### 3.1 短期改进（保留 SQLite，提升实时性）

**方案：混合架构**

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ SessionList  │  │ SessionViewer│  │   SearchPanel   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
│         └─────────────────┼────────────────────┘            │
│                           │                                 │
│                    ┌──────▼──────┐                          │
│                    │  State Mgr  │                          │
│                    └──────┬──────┘                          │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      Tauri 后端                              │
│  ┌────────────────────────┼─────────────────────────────┐   │
│  │                        │                              │   │
│  │  ┌──────────────────┐ │  ┌──────────────────────┐   │   │
│  │  │   SQLite Cache   │◄┼──┤   File Watcher       │   │   │
│  │  │   (搜索/历史)     │ │  │   (notify 3s防抖)     │   │   │
│  │  └──────────────────┘ │  └──────────────────────┘   │   │
│  │                        │                              │   │
│  │  ┌──────────────────┐ │  ┌──────────────────────┐   │   │
│  │  │   Pi RPC Client  │◄┼──┤   Pi CLI Process     │   │   │
│  │  │   (可选实时模式)  │ │  │   (pi --mode rpc)    │   │   │
│  │  └──────────────────┘ │  └──────────────────────┘   │   │
│  │                        │                              │   │
│  └────────────────────────┼─────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
                         Events
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      Pi CLI                                │
│              (stdin/stdout JSON RPC)                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 中期改进（Rust PiRPCClient）

**新增模块：`src-tauri/src/pi_rpc/`**

```rust
// pi_rpc/mod.rs
pub mod client;
pub mod types;
pub mod session_manager;

pub use client::PiRPCClient;
pub use types::*;
```

```rust
// pi_rpc/client.rs
use tokio::process::{Command, Child, ChildStdin, ChildStdout};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, RwLock};
use serde_json::{json, Value};

pub struct PiRPCClient {
    process: Child,
    stdin: ChildStdin,
    event_tx: mpsc::Sender<RPCEvent>,
    state: Arc<RwLock<RPCState>>,
}

impl PiRPCClient {
    pub async fn new(pi_path: &str) -> Result<Self, String> {
        let mut process = Command::new(pi_path)
            .arg("--mode")
            .arg("rpc")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start pi: {}", e))?;

        let stdin = process.stdin.take().ok_or("Failed to get stdin")?;
        let stdout = process.stdout.take().ok_or("Failed to get stdout")?;

        let (event_tx, event_rx) = mpsc::channel(100);

        // 启动事件读取任务
        tokio::spawn(Self::read_events(BufReader::new(stdout), event_tx.clone()));

        Ok(Self {
            process,
            stdin,
            event_tx,
            state: Arc::new(RwLock::new(RPCState::default())),
        })
    }

    async fn read_events(
        mut reader: BufReader<ChildStdout>,
        event_tx: mpsc::Sender<RPCEvent>,
    ) {
        let mut line = String::new();
        while let Ok(n) = reader.read_line(&mut line).await {
            if n == 0 { break; }

            if let Ok(event) = serde_json::from_str::<RPCEvent>(&line) {
                let _ = event_tx.send(event).await;
            }
            line.clear();
        }
    }

    pub async fn send_command(&mut self, command: RPCCommand) -> Result<(), String> {
        let json = serde_json::to_string(&command)
            .map_err(|e| format!("Failed to serialize: {}", e))?;

        self.stdin
            .write_all(format!("{}\n", json).as_bytes())
            .await
            .map_err(|e| format!("Failed to write: {}", e))?;

        self.stdin.flush().await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }
}
```

### 3.3 Tauri 命令集成

```rust
// commands.rs
use crate::pi_rpc::PiRPCClient;
use std::sync::Arc;
use tokio::sync::Mutex;

// 全局 RPC 客户端状态
lazy_static! {
    static ref RPC_CLIENT: Arc<Mutex<Option<PiRPCClient>>> = Arc::new(Mutex::new(None));
}

/// 启动 Pi RPC 连接（可选）
#[tauri::command]
pub async fn start_pi_rpc(pi_path: String) -> Result<(), String> {
    let client = PiRPCClient::new(&pi_path).await?;
    let mut guard = RPC_CLIENT.lock().await;
    *guard = Some(client);
    Ok(())
}

/// 发送 prompt 到活跃会话
#[tauri::command]
pub async fn send_prompt(message: String) -> Result<(), String> {
    let mut guard = RPC_CLIENT.lock().await;
    if let Some(client) = guard.as_mut() {
        client.send_command(RPCCommand::Prompt { message, images: None }).await
    } else {
        Err("RPC not connected".to_string())
    }
}

/// 订阅 RPC 事件（前端通过 Tauri Event 接收）
pub fn setup_event_forwarding(app_handle: AppHandle, mut event_rx: mpsc::Receiver<RPCEvent>) {
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let _ = app_handle.emit("pi-rpc-event", event);
        }
    });
}
```

### 3.4 前端实时订阅

```typescript
// hooks/usePiRPC.ts
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface RPCEvent {
    type: string;
    assistantMessageEvent?: {
        type: 'text_delta' | 'thinking_delta' | 'toolcall_start' | 'done';
        delta?: string;
        thinking?: string;
    };
}

export function usePiRPC() {
    const [isConnected, setIsConnected] = useState(false);
    const [streamingText, setStreamingText] = useState('');

    useEffect(() => {
        let unlisten: UnlistenFn | null = null;

        const setup = async () => {
            // 启动 RPC 连接
            await invoke('start_pi_rpc', { piPath: 'pi' });

            // 监听事件
            unlisten = await listen<RPCEvent>('pi-rpc-event', (event) => {
                handleRPCEvent(event.payload);
            });

            setIsConnected(true);
        };

        setup();

        return () => {
            unlisten?.();
        };
    }, []);

    const handleRPCEvent = (event: RPCEvent) => {
        switch (event.assistantMessageEvent?.type) {
            case 'text_delta':
                setStreamingText(prev => prev + (event.assistantMessageEvent?.delta || ''));
                break;
            case 'done':
                // 完成，归档消息
                break;
        }
    };

    const sendPrompt = async (message: string) => {
        await invoke('send_prompt', { message });
    };

    return { isConnected, streamingText, sendPrompt };
}
```

## 4. 保留 SQLite 搜索的混合方案

### 4.1 双模式架构

```rust
// 会话数据来源枚举
pub enum SessionSource {
    // 来自 RPC 实时连接的活跃会话
    Live { client: PiRPCClient },
    // 来自 SQLite 缓存的历史会话
    Cached { info: SessionInfo },
}

pub struct UnifiedSessionManager {
    // 活跃 RPC 会话（最多1个，当前连接的）
    live_session: Option<LiveSession>,
    // SQLite 缓存的所有会话（用于搜索/浏览）
    sqlite: Connection,
    // 文件监听器（检测外部变更）
    file_watcher: FileWatcher,
}
```

### 4.2 数据同步策略

**场景 1：用户通过我们的 UI 发送消息**
```
前端 send_prompt ──> Tauri ──> Pi RPC ──> Pi CLI
                                    │
                                    └──> 写文件
                                    └──> 返回事件流
                                          │
前端实时更新 <── Tauri Event <───────────┘
└──> 同时更新 SQLite（后台异步）
```

**场景 2：外部 Pi CLI 修改文件**
```
外部 Pi CLI ──> 写文件 ──> notify 监听 ──> Tauri
                                          │
                                          ├──> 增量解析文件
                                          ├──> 更新 SQLite
                                          └──> 通知前端刷新
```

**场景 3：搜索功能**
```
前端搜索 ──> Tauri ──> SQLite FTS5 查询 ──> 返回结果
（始终使用 SQLite，与 RPC 状态无关）
```

## 5. 实施路线图

### Phase 1: 基础 RPC 客户端（2-3 天）
- [ ] 创建 `pi_rpc` 模块
- [ ] 实现基本的 stdin/stdout JSON 通信
- [ ] 添加 Tauri 命令封装
- [ ] 前端事件订阅 hook

### Phase 2: 混合模式集成（3-4 天）
- [ ] 修改 `SessionViewer` 支持双模式
- [ ] 自动检测会话是否活跃（RPC 可用）
- [ ] 活跃会话使用 RPC 实时流
- [ ] 非活跃会话使用现有文件读取

### Phase 3: 增强功能（可选）
- [ ] 发送消息功能
- [ ] 模型切换
- [ ] 工具调用可视化
- [ ] 会话恢复（resume）

### Phase 4: 性能优化
- [ ] SQLite 增量更新（只更新变更字段）
- [ ] 前端虚拟列表优化
- [ ] 事件批处理

## 6. 关键设计决策

### 6.1 是否必须实现 RPC？

**不是必须的，但强烈推荐。**

| 方案 | 实时性 | 复杂度 | 功能扩展 |
|------|--------|--------|----------|
| 仅文件监听 | ⭐⭐ | 低 | 只读 |
| 混合模式 | ⭐⭐⭐⭐ | 中 | 只读 + 可选发送 |
| 纯 RPC | ⭐⭐⭐⭐⭐ | 高 | 完整客户端 |

### 6.2 SQLite 是否保留？

**必须保留。**

SQLite 提供：
- 全文搜索（FTS5）
- 历史会话快速加载
- 统计信息聚合
- 跨会话查询

RPC 不提供持久化存储，只提供实时通信。

### 6.3 向后兼容性

- 现有功能完全保留
- RPC 功能作为可选增强
- 用户可配置启用/禁用 RPC 模式

## 7. 总结

Pi Island 的核心优势在于：

1. **事件驱动架构**：通过 RPC 事件流实现毫秒级实时性
2. **Actor 隔离**：Swift Actor 确保线程安全
3. **细粒度响应**：@Observable 实现精准 UI 更新
4. **无轮询**：完全事件驱动，无资源浪费

我们的改进方向：

1. **短期**：实现基础 RPC 客户端，提升实时性
2. **中期**：混合架构，保留 SQLite 搜索
3. **长期**：逐步增强交互功能，向完整客户端演进

这种混合架构既保留了 SQLite 的强大搜索能力，又获得了 RPC 的实时性，是最适合当前技术栈的演进路径。
