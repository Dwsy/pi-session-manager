---
id: "2026-02-14-extract-dispatch-bridge-cli"
title: "Extract dispatch.rs — CLI 桥接共享业务逻辑"
status: "merged"
created: "2026-02-14"
updated: "2026-02-14"
category: "refactoring"
tags: ["cli", "dispatch", "rust", "feature-flags", "refactoring"]
---

# Extract dispatch.rs — CLI 桥接共享业务逻辑

> 从 `ws_adapter.rs` 提取纯业务逻辑 dispatch 函数，使 CLI 和 GUI 共享同一套命令路由，消除代码重复。

## 背景与目的 (Why)

`src-tauri-cli` 原先独立实现 HTTP/WS 服务，仅支持 `ping` 和 `scan_sessions` 两个命令。主项目 `ws_adapter.rs` 中有 58 个命令的完整 dispatch 逻辑，但与 Tauri `AppState` 耦合，CLI 无法复用。

目标：让 CLI 单二进制（内嵌前端）支持全部 58 个命令，且不重复实现业务逻辑。

## 变更内容概述 (What)

1. 提取 `dispatch.rs` — 纯业务逻辑命令路由（零 Tauri 依赖）
2. `#[cfg(feature = "gui")]` 门控 — 隔离 Tauri 专属模块
3. CLI 桥接 — `src-tauri-cli` 依赖 `pi-session-manager` crate 的 `cli` feature
4. GUI 保持不变 — `ws_adapter.rs` 先处理 GUI-only 命令，其余委托 `dispatch.rs`

## 关联 Issue

- 无独立 Issue（属于 CLI 功能建设的一部分）

## 测试与验证结果 (Test Result)

- [x] GUI lib 编译通过 (`cargo check --lib --features gui`)
- [x] GUI binary 编译通过 (`cargo check --bin pi-session-manager --features gui`)
- [x] CLI lib 编译通过 (`cargo check --lib --no-default-features --features cli`)
- [x] CLI binary 编译通过 (`cargo build --release` in src-tauri-cli)
- [x] CLI 运行时验证：`/health` 返回 ok，`scan_sessions` 返回 2664 会话，`get_all_tags` 返回 5 标签
- [x] 前端内嵌验证：`http://127.0.0.1:52131/` 返回 index.html (200 OK)

## 变更类型

- [x] 🚀 Refactoring
- [x] ✨ New Feature (CLI 全命令支持)

## 文件变更列表

| 文件 | 变更类型 | 描述 |
|------|---------|------|
| `src-tauri/src/dispatch.rs` | 新增 | 纯业务逻辑 dispatch，58 命令路由，含 extract 辅助函数 |
| `src-tauri/src/lib.rs` | 修改 | `pub mod dispatch`；`http_adapter`/`app_state`/`file_watcher`/`terminal`/`ws_adapter` 加 `#[cfg(feature = "gui")]`；`run()` 加 `#[cfg(feature = "gui")]` |
| `src-tauri/src/ws_adapter.rs` | 修改 | 删除内联 extract 函数和 450 行 dispatch 逻辑，改为 GUI-only override + 委托 `crate::dispatch::dispatch()` |
| `src-tauri/src/commands/settings.rs` | 修改 | 提取 `save_session_paths_core()` 纯逻辑函数；修复重复 `use tracing::warn` |
| `src-tauri/src/commands/mod.rs` | 修改 | `terminal` 模块和 `toggle_devtools` 加 `#[cfg(feature = "gui")]` |
| `src-tauri/src/commands/*.rs` | 修改 | `#[tauri::command]` → `#[cfg_attr(feature = "gui", tauri::command)]` |
| `src-tauri-cli/Cargo.toml` | 修改 | 添加 `pi-session-manager` 依赖 (path, cli feature) |
| `src-tauri-cli/src/main.rs` | 重写 | WS/HTTP 处理器调用 `pi_session_manager::dispatch::dispatch()`，内嵌前端 |

## 详细变更说明

### 1. dispatch.rs 提取

从 `ws_adapter.rs` 的 450 行 inline dispatch 中提取为独立模块。包含：
- `extract_string` / `extract_optional_string` / `extract_usize` 辅助函数
- `pub async fn dispatch(command, payload) -> Result<Value, String>` 纯函数
- GUI-only 命令（terminal_*、open_session_*）返回明确错误信息
- `save_session_paths` 在 dispatch.rs 中调用 `save_session_paths_core`（不重启 file watcher）

### 2. Feature Flag 架构

```
src-tauri features:
├── gui (default) — 包含 tauri, app_state, ws_adapter, http_adapter, terminal, file_watcher
└── cli           — 仅纯业务模块 + dispatch.rs

ws_adapter.rs dispatch 流程:
  GUI-only commands (terminal, save_session_paths with watcher)
    → 直接处理
  其余 58 命令
    → crate::dispatch::dispatch()

CLI dispatch 流程:
  所有命令 → pi_session_manager::dispatch::dispatch()
```

### 3. CLI 桥接

`src-tauri-cli` 不再自行实现任何业务逻辑，仅负责：
- 加载配置 (`~/.config/pi-session-manager.json`)
- 启动 WS/HTTP 服务器
- 内嵌前端 (rust-embed)
- 将请求转发给 `pi_session_manager::dispatch::dispatch()`

## 破坏性变更

- [x] 否

GUI 模式行为完全不变。CLI 模式从 2 命令扩展到 58 命令，向后兼容。

## 性能影响

- [x] 无影响

dispatch 函数签名和调用路径不变，仅代码组织调整。

## 依赖变更

- [x] 是
  - `src-tauri-cli` 新增 `pi-session-manager = { path = "../src-tauri", features = ["cli"] }` — 复用主 crate 业务逻辑

## 最终状态

- **合并时间:** 2026-02-14
- **CLI 二进制大小:** 14MB (含内嵌前端)
- **命令覆盖:** 58/58 (GUI-only 命令返回明确错误)
