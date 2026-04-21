# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  基于 Tauri + Rust + React 的 Pi 会话管理工具，支持桌面端、无头服务端，以及独立静态 Demo 页面。
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">English</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">数据集版</a>
</p>

## 核心功能

- 会话浏览：列表/项目/看板、收藏、标签、重命名、删除、导出。
- 全文检索：基于 SQLite FTS5 与规范化索引，支持精确短语搜索。
- 会话内消息搜索：命中高亮、结果分页跳转、可配置 `Cmd/Ctrl+F` 行为。
- 会话恢复：内置 PTY 终端，一键恢复 Pi 会话。
- **外部会话** — 扫描和管理来自其他编程 Agent（Claude、OpenCode 等）的会话，统一设置界面控制扫描开关和默认恢复目标。
- **数据集浏览器** — 从 HuggingFace 下载并浏览会话数据集，支持本地缓存、搜索、标签、收藏和统计分析。
- 多协议访问：Tauri IPC、WebSocket、HTTP、SSE。
- 完整 Demo 数据引擎 + 独立静态 Demo 页面构建模式。
- 内置多语言包：`en-US`、`zh-CN`、`ja-JP`、`de-DE`、`fr-FR`、`es-ES`。
- Pi Live 集成：实时同步 Pi agent 活动状态，支持模型切换和思考过程控制。
- 分析仪表盘：活动热力图、Token 趋势、子代理成本统计。

## 技术架构

```
Frontend: React + TypeScript + Vite
Backend: Rust + Tauri 2 + Axum + SQLite + FTS5

Protocols: Tauri IPC | WebSocket (/ws) | HTTP (/api) | SSE
```

### 四层设计

```
Commands (thin) <- Tauri IPC / HTTP / WS
Domain (business) <- model_config, session_list, stats, terminal
Data <- search (SQLite FTS5 normalized index) sqlite (cache)
Server (protocol) <- HTTP adapter, WebSocket adapter
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, TypeScript 5, Vite 5, Tailwind CSS, i18next, cmdk, @dnd-kit, @xyflow/react, recharts, @xterm/xterm |
| 后端 | Rust 2021, Tauri 2, Tokio, Axum, rusqlite, SQLite FTS5, notify, portable-pty |
| 协议 | Tauri IPC · WebSocket (/ws) · HTTP (/api) · SSE (/api/events) |

### 代码规模

| 模块 | 语言 | 规模 |
|------|------|------|
| 前端组件 | TypeScript/React | 155+ 组件 |
| 前端 Hooks | TypeScript | 40+ Hooks |
| 后端 | Rust | ~27K 行 |

## 界面预览

| 首页 | 会话页 |
|------|--------|
| ![首页](website/public/screenshots/home.png) | ![会话页](website/public/screenshots/session-page.png) |

| 会话树 | 看板 |
|--------|------|
| ![会话树](website/public/screenshots/session-tree.png) | ![看板](website/public/screenshots/kanban.png) |

## 快速开始

### 环境要求

- Node.js 20+
- Rust stable（建议通过 `rustup` 安装）
- Tauri 平台依赖（Xcode / WebView2 / WebKitGTK）

### 安装

```bash
git clone https://github.com/Dwsy/pi-session-manager.git
cd pi-session-manager
pnpm install
```

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 前端开发服务器 |
| `npm run tauri:dev` | 桌面端联调（前后端） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run build:demo` | 静态 Demo 到 `dist-demo/` |
| `npm run build:dataset` | 静态数据集版到 `dist-dataset/` |
| `npm run build:cli` | 构建独立 `pi-session-cli` 二进制 |
| `npm run tauri:build` | 桌面端生产打包 |

## 运行模式

| 模式 | 入口 | 网络行为 |
|------|------|---------|
| 桌面 GUI | `pi-session-manager` | GUI + 后端服务；统一单端口 HTTP + WS(`/ws`)，默认 `52131` |
| 主二进制无头模式 | `pi-session-manager --cli` / `--headless` | 单端口 HTTP + WS(`/ws`)，默认 `52131` |
| 独立 CLI crate | `pi-session-cli` | 单端口 HTTP + WS(`/ws`)（默认 `52131`）|
| 静态 Demo 页面 | `dist-demo/index.html` | 不依赖后端，强制 Demo 数据 |
| 静态数据集页面 | `dist-dataset/index.html` | 不依赖后端，浏览器数据集模式 |

### CLI 参数

- `-p, --port <PORT>`：HTTP+WS 共享端口（默认 52131）
- `-b, --bind <ADDR>`：监听地址
- `--auth / --no-auth`：开启/关闭鉴权
- `--token <TOKEN>`：运行时 token

## 服务端接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api` | POST | 命令入口 |
| `/ws` | GET | WebSocket |
| `/api/events` | GET | SSE 事件 |
| `/health` | GET | 健康检查 |
| `/` | GET | 嵌入式前端 |

## 数据与配置路径

> 文档中的 `~/.pi/...` 表示“当前用户家目录下的 .pi”。macOS / Linux / Windows 都在运行时按用户 home 目录展开，不是硬编码绝对路径。

| 路径 | 说明 |
|------|------|
| `~/.pi/agent/sessions/` | 会话目录 |
| `~/.pi/agent/sessions/sessions.db` | SQLite 数据库，仅保存会话，不再存运行时配置 |
| `~/.pi/pi-session-manager/config.json` | 统一外部配置（server/session/app/ui） |
| `~/.pi/pi-session-manager/tags_config.json` | 标签定义 |
| `~/.pi/pi-session-manager/session_mark.json` | 会话与标签绑定关系 |
| `~/.pi/pi-session-manager/favorites.json` | 收藏 |
| `~/.pi/pi-session-manager/auth_tokens.json` | 鉴权 Token |
| `~/.pi/pi-session-manager/history/config-versions/` | 配置历史快照（JSON 文件） |
| `~/.pi/pi-session-manager/backups/` | 导入导出备份 |
| `~/.pi/agent/models.json` | Pi 模型配置 |
| `~/.pi/agent/settings.json` | Pi 配置 |

## 扩展系统

### Pi 插件

```
extensions/pi-session-bridge/index.ts
```

### 工具渲染插件

```
src/plugins/tools-render/
├── builtins/    # bash, edit, read, write, generic
└── extensions/  # subagent, ...
```

### 搜索插件

```
src/plugins/
├── message/     # 消息内搜索
├── project/     # 项目搜索
└── session/     # 会话搜索
```

## 键盘快捷键

### 会话视图

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + Shift + C` | 复制恢复命令到剪贴板 |
| `Cmd/Ctrl + F` | 会话内搜索（或切换侧边栏，可配置） |
| `Cmd/Ctrl + Shift + F` | 切换侧边栏（或打开搜索，可配置） |
| `Cmd/Ctrl + T` | 切换思考显示 |
| `Cmd/Ctrl + O` | 切换工具展开 |
| `Cmd/Ctrl + G` | 下一个搜索结果（搜索模式下） |
| `Cmd/Ctrl + Shift + G` | 上一个搜索结果（搜索模式下） |
| `Cmd/Ctrl + R` | 恢复会话 |
| `Cmd/Ctrl + E` | 导出会话 |
| `Esc` | 关闭搜索 |

## 开发指南

### 开发检查

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

### 添加新命令

1. **业务逻辑** -> `src-tauri/src/domain/`
2. **命令层** -> `src-tauri/src/commands/`
3. **路由注册** -> `src-tauri/src/dispatch.rs`
4. **Tauri 注册** -> `src-tauri/src/lib.rs`

详细教程请参阅 [agent-docs/03-backend.md](agent-docs/03-backend.md)。

## 文档索引

| 文档 | 说明 |
|------|------|
| [AGENTS.md](AGENTS.md) | Agent 开发指南 |
| [agent-docs/01-architecture.md](agent-docs/01-architecture.md) | 四层架构设计 |
| [agent-docs/02-frontend.md](agent-docs/02-frontend.md) | 前端组件索引 |
| [agent-docs/03-backend.md](agent-docs/03-backend.md) | 后端模块 + 命令教程 |
| [agent-docs/04-development.md](agent-docs/04-development.md) | 构建与发布 |
| [agent-docs/05-config.md](agent-docs/05-config.md) | 配置与安全 |
| [DESIGN.md](DESIGN.md) | 设计系统 |

## 许可证

MIT
