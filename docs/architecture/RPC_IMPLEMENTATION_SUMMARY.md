# Pi CLI RPC 实现总结

## 已实现功能

### 1. Rust 后端 RPC 模块 (`src-tauri/src/pi_rpc/`)

#### 类型定义 (`types.rs`)
- ✅ `RPCCommand` 枚举 - 所有 RPC 命令类型
- ✅ `RPCEvent` 结构体 - RPC 事件类型
- ✅ `AssistantMessageEvent` - 流式消息事件
- ✅ `RPCPhase` 枚举 - 连接阶段
- ✅ `RPCMessage`, `RPCModel`, `RPCSessionStats` 等辅助类型

#### RPC 客户端 (`client.rs`)
- ✅ `PiRPCClient` 结构体 - 管理 Pi CLI 进程
- ✅ 异步命令发送 (`send_command`)
- ✅ 事件流读取 (`read_events`)
- ✅ 自动状态管理
- ✅ 优雅关闭 (`shutdown`)

#### 能力检测 (`detector.rs`)
- ✅ `detect_rpc_support()` - 检测 Pi CLI 是否支持 RPC
- ✅ `find_pi_path()` - 自动查找 Pi CLI 路径
- ✅ 超时处理和错误处理

#### Tauri 命令 (`commands/rpc.rs`)
- ✅ `detect_pi_rpc_support` - 检测 RPC 支持
- ✅ `start_pi_rpc` - 启动 RPC 连接
- ✅ `stop_pi_rpc` - 停止 RPC 连接
- ✅ `get_rpc_status` - 获取连接状态
- ✅ `send_prompt` - 发送消息
- ✅ `send_steer` - 发送干预
- ✅ `send_abort` - 中止执行
- ✅ `switch_session_rpc` - 切换会话
- ✅ `get_rpc_messages` - 获取消息
- ✅ `get_rpc_available_models` - 获取可用模型
- ✅ `set_rpc_model` - 设置模型
- ✅ `new_rpc_session` - 创建新会话

### 2. 前端 RPC Hook (`src/hooks/usePiRPC.ts`)

- ✅ `usePiRPC()` hook - 完整的 RPC 连接管理
- ✅ 事件监听和处理
- ✅ 流式消息状态 (`streamingText`, `streamingThinking`)
- ✅ 工具执行状态 (`currentTool`)
- ✅ 连接状态管理 (`isConnected`, `phase`)
- ✅ 自动重连和清理

### 3. SessionViewer RPC 集成

- ✅ 自动检测 RPC 支持
- ✅ 自动启动 RPC 连接
- ✅ RPC 模式指示器 UI
- ✅ 自动切换会话
- ✅ RPC 模式下禁用文件轮询

## 架构特点

### 混合架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SessionViewer                                       │  │
│  │  ┌──────────────┐  ┌──────────────────────────────┐  │  │
│  │  │  File Mode   │  │  RPC Mode (可选)             │  │  │
│  │  │  (轮询 1s)   │  │  (实时事件流)                 │  │  │
│  │  └──────────────┘  └──────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      Tauri 后端                              │
│  ┌────────────────────────┼─────────────────────────────┐   │
│  │  ┌──────────────────┐  │  ┌──────────────────────┐   │   │
│  │  │   SQLite Cache   │  │  │   Pi RPC Client      │   │   │
│  │  │   (搜索/历史)     │  │  │   (实时通信)          │   │   │
│  │  └──────────────────┘  │  └──────────────────────┘   │   │
│  └────────────────────────┼─────────────────────────────┘   │
└───────────────────────────┼───────────────────────────────┘
```

### 关键设计决策

1. **自动检测**: 自动检测 Pi CLI 是否支持 RPC，不支持则回退到文件模式
2. **向后兼容**: 所有现有功能保持不变，RPC 作为可选增强
3. **SQLite 保留**: 搜索和历史功能继续使用 SQLite，RPC 仅用于实时通信
4. **双模式切换**: 用户可以手动切换 RPC/文件模式

## 使用方式

### 前端使用 RPC Hook

```typescript
import { usePiRPC } from '../hooks/usePiRPC'

function MyComponent() {
  const {
    isConnected,
    phase,
    streamingText,
    sendPrompt,
    switchSession,
    detectSupport,
  } = usePiRPC()

  // 检测 RPC 支持
  useEffect(() => {
    detectSupport().then(supported => {
      if (supported) {
        // 启动 RPC 连接
        startRPC()
      }
    })
  }, [])

  // 发送消息
  const handleSend = async (message: string) => {
    await sendPrompt(message)
  }

  return (
    <div>
      {isConnected && <span>RPC Connected ({phase})</span>}
      <div>{streamingText}</div>
    </div>
  )
}
```

### Tauri 命令调用

```typescript
// 检测 RPC 支持
const supported = await invoke<boolean>('detect_pi_rpc_support', { piPath: '/usr/local/bin/pi' })

// 启动 RPC 连接
const status = await invoke<RPCConnectionStatus>('start_pi_rpc', { piPath: '/usr/local/bin/pi' })

// 发送消息
await invoke('send_prompt', { message: 'Hello!' })

// 切换会话
await invoke('switch_session_rpc', { sessionPath: '/path/to/session.jsonl' })
```

## 文件变更列表

### 新增文件
- `src-tauri/src/pi_rpc/mod.rs` - RPC 模块入口
- `src-tauri/src/pi_rpc/types.rs` - RPC 类型定义
- `src-tauri/src/pi_rpc/client.rs` - RPC 客户端实现
- `src-tauri/src/pi_rpc/detector.rs` - RPC 能力检测
- `src-tauri/src/commands/rpc.rs` - RPC Tauri 命令
- `src/hooks/usePiRPC.ts` - 前端 RPC hook

### 修改文件
- `src-tauri/Cargo.toml` - 添加 log 依赖
- `src-tauri/src/lib.rs` - 集成 RPC 模块和命令
- `src-tauri/src/commands/mod.rs` - 导出 RPC 命令
- `src/components/SessionViewer.tsx` - 集成 RPC 模式

## 后续优化建议

### P1: 实时消息显示
- 在 SessionViewer 中显示 RPC 流式消息
- 区分 RPC 消息和文件解析消息
- 处理消息合并逻辑

### P2: 交互功能
- 添加消息发送 UI
- 实现 steer（干预）功能
- 支持模型切换

### P3: 工具执行可视化
- 实时显示工具执行状态
- 显示工具参数和结果
- 支持中止工具执行

### P4: 性能优化
- 事件批处理
- 减少不必要的重渲染
- 优化大消息列表性能

## 测试建议

1. **单元测试**: 测试 RPC 类型序列化/反序列化
2. **集成测试**: 测试与 Pi CLI 的通信
3. **UI 测试**: 测试 RPC 模式切换和状态显示
4. **性能测试**: 测试大消息流的处理能力

## 已知限制

1. 需要 Pi CLI 支持 `--mode rpc` 参数
2. RPC 模式下无法查看历史消息（需要文件模式补充）
3. 目前只实现了基础命令，高级功能待扩展
