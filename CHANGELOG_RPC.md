# Changelog - RPC 功能

## [Unreleased] - RPC 基础架构

### Added
- 实现 Pi CLI RPC 通信模块
  - `PiRPCClient` - 管理 Pi CLI 进程的 RPC 客户端
  - `RPCCommand` - 完整的 RPC 命令枚举
  - `RPCEvent` - RPC 事件类型定义
  - 自动检测 Pi CLI RPC 支持
  - 自动回退到文件模式

- 前端 RPC Hook
  - `usePiRPC()` - 完整的 RPC 连接管理
  - 流式消息状态跟踪
  - 工具执行状态显示
  - 连接状态管理

- SessionViewer RPC 集成
  - 自动启动 RPC 连接
  - RPC 模式指示器 UI
  - 自动禁用文件轮询（RPC 模式下）

- Tauri 命令
  - `detect_pi_rpc_support` - 检测 RPC 支持
  - `start_pi_rpc` - 启动 RPC 连接
  - `stop_pi_rpc` - 停止 RPC 连接
  - `get_rpc_status` - 获取连接状态
  - `send_prompt` - 发送消息
  - `send_steer` - 发送干预
  - `send_abort` - 中止执行
  - `switch_session_rpc` - 切换会话

### Technical Details
- 新增文件:
  - `src-tauri/src/pi_rpc/mod.rs`
  - `src-tauri/src/pi_rpc/types.rs`
  - `src-tauri/src/pi_rpc/client.rs`
  - `src-tauri/src/pi_rpc/detector.rs`
  - `src-tauri/src/commands/rpc.rs`
  - `src/hooks/usePiRPC.ts`

- 修改文件:
  - `src-tauri/Cargo.toml` - 添加 log 依赖
  - `src-tauri/src/lib.rs` - 集成 RPC 模块
  - `src-tauri/src/commands/mod.rs` - 导出 RPC 命令
  - `src/components/SessionViewer.tsx` - 集成 RPC 模式

## [Planned] - 实时消息流

### To Add
- RPC 消息解析和显示
- 流式消息 UI 优化
- 消息同步机制

## [Planned] - 交互功能

### To Add
- 消息发送 UI
- 干预和后续消息
- 模型切换 UI

## [Planned] - 工具可视化

### To Add
- 工具执行状态显示
- Bash 命令可视化
- 文件操作显示

## Migration Guide

### For Developers
1. 确保 Pi CLI 支持 `--mode rpc` 参数
2. 检查 `src-tauri/Cargo.toml` 包含 log 依赖
3. 运行 `cargo check` 验证编译

### For Users
1. 更新 Pi CLI 到最新版本
2. 启动应用后自动检测 RPC 支持
3. 在 SessionViewer 中查看 RPC 状态指示器

## Known Issues
- RPC 消息尚未实时显示（需要 Phase 1 完成）
- 工具执行状态尚未可视化（需要 Phase 3 完成）
- 消息发送 UI 尚未实现（需要 Phase 2 完成）

## References
- 架构文档: `docs/architecture/RPC_IMPLEMENTATION_SUMMARY.md`
- 路线图: `docs/architecture/RPC_ROADMAP.md`
- 下一步: `docs/architecture/RPC_NEXT_STEPS.md`
