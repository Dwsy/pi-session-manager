⎿ Pi Session Manager RPC 架构升级计划

    背景与目标

    基于对 pi-island-ref 的深入分析，当前项目采用纯文件扫描模式（笨办法），而 Pi Island 使用 Pi CLI RPC
    模式（优雅办法）。本计划旨在：

    1. 保留 SQLite + FTS5 搜索能力
    2. 引入 Pi CLI RPC 通信实现实时性
    3. 设计可扩展到对齐 Pi Island 功能的架构

    关键参考实现

    当前项目架构

    文件扫描模式（src-tauri/src/scanner.rs:20-93）:
    pub async fn scan_sessions_with_config(config: &Config) -> Result<Vec<SessionInfo>, String> {
        // 1. 遍历文件系统
        // 2. 根据 modified 时间判断是否需要重新解析
        // 3. 更新 SQLite 缓存
        // 4. 返回合并后的会话列表
    }

    SQLite 缓存（src-tauri/src/sqlite_cache.rs:28-111）:
    pub fn init_db_with_config(config: &Config) -> Result<Connection, String> {
        // sessions 表 + FTS5 虚拟表 + 触发器
        // 支持全文搜索和增量更新
    }

    文件监听（src-tauri/src/file_watcher.rs:11-56）:
    pub fn start_file_watcher(sessions_dir: PathBuf, app_handle: AppHandle) -> Result<(), String> {
        // notify 库 + 3秒防抖
        // 检测到变化后发送 sessions-changed 事件
    }

    前端轮询（src/components/SessionViewer.tsx:181-201）:
    const checkInterval = setInterval(async () => {
        const result = await invoke<[number, string]>('read_session_file_incremental', {
            path: session.path,
            fromLine: lineCount
        })
    }, 1000)  // 1秒轮询

    Pi Island 参考架构

    RPC 客户端（pi-island-ref/Sources/PiIsland/RPC/PiRPCClient.swift）:
    - Actor 隔离的 RPC 客户端
    - stdin/stdout JSON 协议
    - 异步事件流处理

    会话管理（pi-island-ref/Sources/PiIsland/RPC/SessionManager.swift）:
    - ManagedSession: @Observable 状态管理
    - Live vs Historical 会话区分
    - FSEvents 文件监听（100ms 延迟）

    事件类型（pi-island-ref/Sources/PiIsland/RPC/RPCTypes.swift）:
    enum RPCCommand {
        case prompt(message: String, images: [ImageData]?)
        case steer(message: String)
        case abort
        case getMessages
        case switchSession(sessionPath: String)
        // ...
    }

    struct RPCEvent {
        let type: String  // "response", "message_update"
        let assistantMessageEvent: AssistantMessageEvent?
    }

    详细分析结果

    前端状态管理分析

    状态流转机制（src/hooks/useSessions.ts:39-77）:
    // 智能差异检测 + 选择性更新
    const loadSessions = useCallback(async () => {
      const currentSelection = selectedSessionRef.current
      if (currentSelection) {
        const hasChanges = pathChanged || nameChanged ||
          matched.message_count !== currentSelection.message_count ||
          matched.modified !== currentSelection.modified

        if (!hasChanges) {
          // 无变化，保持当前选择稳定
        } else if (pathChanged || nameChanged) {
          setSelectedSession(matched)  // 替换整个对象
        } else {
          // 元数据变化，静默更新（使用 Object.assign 保持引用）
          setSelectedSession(prev => Object.assign(prev, matched))
        }
      }
    })

    实时更新双层级架构:
    1. 文件监听层: useFileWatcher (2s防抖) -> 触发会话列表刷新
    2. 轮询检查层: SessionViewer (1s轮询) -> 增量读取新消息

    增量更新实现（src/components/SessionViewer.tsx:411-449）:
    const loadIncremental = async () => {
      const result = await invoke<[number, string]>('read_session_file_incremental', {
        path: session.path,
        fromLine: lineCount  // 从已读取行数开始
      })
      const [newLineCount, newContent] = result
      // 追加而非替换
      setEntries(prev => [...prev, ...newEntries])
    }

    Pi CLI RPC 协议规范

    RPCCommand 枚举:
    enum RPCCommand {
        case prompt(message: String, images: [ImageData]?)
        case steer(message: String)
        case followUp(message: String)
        case abort
        case getState
        case getMessages
        case setModel(provider: String, modelId: String)
        case switchSession(sessionPath: String)
        case newSession(parentSession: String?)
        case compact(customInstructions: String?)
        case getSessionStats
        case getCommands
    }

    RPCEvent 事件类型:
    struct RPCEvent {
        let type: String  // "response", "agent_start", "agent_end", "message_update"
        let command: String?
        let success: Bool?
        let error: String?
        let assistantMessageEvent: AssistantMessageEvent?
    }

    struct AssistantMessageEvent {
        let type: String  // "text_delta", "thinking_delta", "toolcall_start", "done"
        let delta: String?       // 增量文本
        let content: String?
        let thinking: String?
        let toolCall: ToolCallData?
    }

    流式消息事件序列:
    agent_start -> message_start -> text_delta* -> done -> message_end -> agent_end

    核心差距分析

    ┌──────────┬───────────────┬───────────────────────┬──────────────────────┐
    │ 特性     │ 当前项目      │ Pi Island             │ 差距                 │
    ├──────────┼───────────────┼───────────────────────┼──────────────────────┤
    │ 通信方式 │ 文件IO + 轮询 │ stdin/stdout RPC      │ 延迟: 1s vs 毫秒级   │
    ├──────────┼───────────────┼───────────────────────┼──────────────────────┤
    │ 消息获取 │ 增量文件读取  │ 事件流推送            │ 被动拉取 vs 主动推送 │
    ├──────────┼───────────────┼───────────────────────┼──────────────────────┤
    │ 状态感知 │ 文件修改时间  │ RPCPhase 枚举         │ 无状态 vs 精确状态   │
    ├──────────┼───────────────┼───────────────────────┼──────────────────────┤
    │ 工具执行 │ 解析文件      │ tool_execution_* 事件 │ 无实时反馈           │
    ├──────────┼───────────────┼───────────────────────┼──────────────────────┤
    │ 发送消息 │ ❌ 不支持     │ ✅ prompt/steer 命令  │ 只读 vs 交互式       │
    └──────────┴───────────────┴───────────────────────┴──────────────────────┘

    混合架构设计方案

    架构图

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
    │  │  ┌──────────────────┐ │  ┌──────────────────────┐   │   │
    │  │  │   SQLite Cache   │◄┼──┤   File Watcher       │   │   │
    │  │  │   (搜索/历史)     │ │  │   (notify 3s防抖)     │   │   │
    │  │  └──────────────────┘ │  └──────────────────────┘   │   │
    │  │                        │                              │   │
    │  │  ┌──────────────────┐ │  ┌──────────────────────┐   │   │
    │  │  │   Pi RPC Client  │◄┼──┤   Pi CLI Process     │   │   │
    │  │  │   (实时模式)      │ │  │   (pi --mode rpc)    │   │   │
    │  │  └──────────────────┘ │  └──────────────────────┘   │   │
    │  └────────────────────────┼─────────────────────────────┘   │
    └───────────────────────────┼─────────────────────────────────┘
                                │
                             Events
                                │
    ┌───────────────────────────┼─────────────────────────────────┐
    │                      Pi CLI                                │
    │              (stdin/stdout JSON RPC)                        │
    └─────────────────────────────────────────────────────────────┘

    数据流设计

    场景1: 用户查看活跃会话（RPC 模式）
    SessionViewer 挂载
        ↓
    detectSessionActivity() -> 检查是否有 RPC 连接
        ↓
    如果有: 订阅 RPC 事件流
        ↓
    接收 text_delta 事件 -> 即时更新 UI
        ↓
    同时: 后台更新 SQLite（异步）

    场景2: 用户查看历史会话（文件模式）
    SessionViewer 挂载
        ↓
    无 RPC 连接或会话不活跃
        ↓
    使用现有 read_session_file 读取
        ↓
    setInterval 轮询增量更新（保持兼容）

    场景3: 搜索功能（始终使用 SQLite）
    SearchPanel 搜索
        ↓
    invoke('search_sessions_fts', { query })
        ↓
    SQLite FTS5 查询
        ↓
    返回结果（与 RPC 无关）

    待办事项

    Phase 1: RPC 基础模块

    ☐ 创建 src-tauri/src/pi_rpc/mod.rs 模块结构
    ☐ 定义 RPC 类型（Command/Event/AssistantMessageEvent）
    ☐ 实现 PiRPCClient（tokio::process + 异步读写）
    ☐ 实现事件分发器（Tauri Event 转发）

    Phase 2: Tauri 集成

    ☐ 添加 start_pi_rpc 命令
    ☐ 添加 send_prompt 命令
    ☐ 添加 switch_session_rpc 命令
    ☐ 在 lib.rs 中初始化 RPC 客户端

    Phase 3: 前端集成

    ☐ 创建 usePiRPC hook
    ☐ 修改 SessionViewer 支持双模式
    ☐ 添加 RPC 连接状态指示器
    ☐ 实现消息发送 UI

    Phase 4: 混合逻辑

    ☐ 实现会话活跃度检测
    ☐ 自动切换 RPC/文件模式
    ☐ 确保 SQLite 同步更新
    ☐ 错误处理和重连机制

    关键实现细节

    Rust PiRPCClient 设计

    pub struct PiRPCClient {
        process: Child,
        stdin: ChildStdin,
        event_tx: mpsc::Sender<RPCEvent>,
        state: Arc<RwLock<RPCState>>,
    }

    impl PiRPCClient {
        pub async fn new(pi_path: &str) -> Result<Self, String>
        pub async fn send_command(&mut self, command: RPCCommand) -> Result<(), String>
        async fn read_events(reader: BufReader<ChildStdout>, event_tx: mpsc::Sender<RPCEvent>)
    }

    前端 Hook 设计

    function usePiRPC(sessionPath?: string) {
      const [isConnected, setIsConnected] = useState(false)
      const [phase, setPhase] = useState<RPCPhase>('disconnected')
      const [streamingText, setStreamingText] = useState('')

      useEffect(() => {
        // 监听 Tauri Event
        const unlisten = listen<RPCEvent>('pi-rpc-event', handleEvent)
        return () => unlisten()
      }, [sessionPath])

      const sendPrompt = async (message: string) => {
        await invoke('send_prompt', { message })
      }

      return { isConnected, phase, streamingText, sendPrompt }
    }

    用户决策确认

    1. 实现范围: 完整 RPC 客户端（支持 prompt/steer/switchSession 等所有命令）
    2. 向后兼容: 自动检测（检测 Pi CLI RPC 支持，不支持则回退到文件模式）

    实施优先级

    P0: 核心 RPC 基础设施

    - RPC 客户端实现（client.rs）
    - 类型定义（types.rs）
    - 自动检测机制

    P1: 实时消息流

    - 事件监听和转发
    - SessionViewer RPC 模式集成
    - 增量消息更新

    P2: 交互功能

    - 发送消息（prompt/steer）
    - 会话切换
    - 模型切换

    P3: 高级功能

    - 工具执行可视化
    - 统计信息实时更新
    - 性能优化

    文件路径规划

    新增文件

    - src-tauri/src/pi_rpc/mod.rs - 模块入口
    - src-tauri/src/pi_rpc/types.rs - RPC 类型定义
    - src-tauri/src/pi_rpc/client.rs - RPC 客户端实现
    - src-tauri/src/pi_rpc/session_manager.rs - 会话管理
    - src-tauri/src/pi_rpc/detector.rs - RPC 能力检测
    - src/hooks/usePiRPC.ts - 前端 RPC hook
    - src/components/RPCStatusIndicator.tsx - RPC 状态指示器

    修改文件

    - src-tauri/src/lib.rs - 添加模块和命令
    - src-tauri/Cargo.toml - 添加依赖（tokio::process）
    - src/components/SessionViewer.tsx - 集成 RPC 模式
    - src/App.tsx - 添加 RPC 连接管理
    - src/hooks/useSessions.ts - 集成 RPC 会话刷新