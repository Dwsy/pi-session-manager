<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager">
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  跨平台桌面、移动端和 Web 应用，用于浏览、搜索和管理
  <a href="https://github.com/badlogic/pi-mono">Pi</a> AI 编码会话。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20iOS%20%7C%20Android-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-2.x-orange?style=flat-square" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square" alt="React 18">
  <img src="https://img.shields.io/badge/Rust-stable-orange?style=flat-square" alt="Rust">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://dwsy.github.io/pi-session-manager/cn/">📖 中文文档</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a> ·
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">⬇️ 下载</a>
</p>

<p align="center">
  <img width="1800" alt="screenshot-dark" src="https://github.com/user-attachments/assets/4cb92d95-f50e-48d2-8c5e-4bb814d45b8f" />
</p>
<p align="center">
  <img width="1800" alt="screenshot-light" src="https://github.com/user-attachments/assets/87630b70-84a1-4417-9b66-b35124ebdcea" />
</p>

---

## 功能特性

- **多平台支持** — 原生桌面端 (macOS/Windows/Linux)、响应式移动端网页、无头服务器模式
- **会话浏览器** — 列表/项目/目录/看板视图、收藏、重命名、批量导出
- **看板系统** — 拖拽会话到标签列、右键菜单、项目过滤
- **层级标签** — 父子标签树、自动规则、排序
- **全文搜索** — SQLite FTS5 + Tantivy、角色/工具过滤、片段高亮、插件系统
- **会话查看器** — 树形视图、可折叠工具调用/思考块、流程可视化 (React Flow)
- **内置终端** — 集成 xterm.js 终端，支持 PTY 后端 (`Cmd/Ctrl+J`)
- **导出功能** — HTML / Markdown / JSON，一键浏览器打开
- **数据仪表板** — 活动热图、项目分布、模型使用统计、Token 成本、成就
- **技能与提示词** — 扫描管理 `~/.pi/agent/skills` 和提示词、系统提示词编辑器
- **模型测试器** — 批量测试已配置模型的连接性
- **多路径扫描** — 支持配置多个会话目录
- **Web 访问** — 通过 HTTP 提供嵌入式前端，可从任何浏览器或移动设备访问
- **主题** — 深色/浅色/系统，通过 CSS 自定义属性完全可定制
- **国际化** — 英文和简体中文
- **多协议 API** — Tauri IPC + WebSocket (`ws://:52130`) + HTTP (`http://:52131`)
- **CLI 模式** — 通过 `--cli` / `--headless` 运行无头后端服务
- **移动端优化** — 触摸友好的 UI，手机端底部导航栏

---

## 架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        客户端                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │    桌面端     │  │    移动端     │  │       网页浏览器          │  │
│  │  (Tauri App) │  │  (PWA/Web)   │  │  (Chrome/Safari/Firefox) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼───────────────────────┼────────────────┘
          │                 │                       │
          └─────────────────┼───────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                    前端 (React 18 / TypeScript / Vite)              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  99+ 组件 · 19 个 Hooks · 插件系统 · i18n · xterm.js         │   │
│  │  React Flow · Recharts · dnd-kit · cmdk · 虚拟滚动          │   │
│  └─────────────────────────────────────────────────────────────┘   │
├───────────────────────────┬───────────────────┬─────────────────────┤
│       Tauri IPC           │    WebSocket      │  HTTP + 嵌入式 UI   │
│       (桌面端)             │   ws://:52130     │  http://:52131      │
└───────────────────────────┴───────────────────┴─────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│                    Rust 后端 (Tauri 2)                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  扫描器 · SQLite 缓存 · FTS5 · Tantivy · 文件监听           │   │
│  │  PTY 终端 · 认证 · 导出 · 配置 · 统计 · 标签               │   │
│  │  WebSocket/HTTP 适配器 · 增量更新                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

三种协议共享同一个命令路由器 —— `dispatch()`。添加新命令只需在 Rust 中添加一个 `match` 分支；WebSocket 和 HTTP 自动继承。

HTTP 服务器通过 `rust-embed` 嵌入前端，因此打包后的二进制文件在 `http://localhost:52131` 提供完整的 UI —— 无需外部 `dist/` 目录。前端自动检测运行环境并在以下模式间切换：
- **Tauri IPC** — 桌面应用运行时 (window.__TAURI__ 可用)
- **WebSocket/HTTP** — 浏览器或移动端运行时

---

## 下载

从 [**Releases**](../../releases) 获取最新构建：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Pi.Session.Manager_*_aarch64.dmg` |
| macOS (Intel) | `Pi.Session.Manager_*_x64.dmg` |
| Windows (x64) | `Pi.Session.Manager_*_x64-setup.exe` / `.msi` |
| Linux (deb) | `pi-session-manager_*_amd64.deb` |
| Linux (AppImage) | `pi-session-manager_*_amd64.AppImage` |
| Linux (rpm) | `pi-session-manager_*_x86_64.rpm` |

### 前置要求

需要安装 [Pi](https://github.com/badlogic/pi-mono) 才能恢复会话和终端集成。

---

## 从源码构建

### 环境要求

- **Node.js** >= 20
- **Rust** stable (通过 [rustup](https://rustup.rs/) 安装)
- 平台依赖：

<details>
<summary><b>macOS</b></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><b>Ubuntu / Debian</b></summary>

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```
</details>

<details>
<summary><b>Fedora</b></summary>

```bash
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf
```
</details>

<details>
<summary><b>Windows</b></summary>

- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — C++ 桌面工作负载
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (Windows 11 预装)
</details>

### 构建步骤

```bash
git clone https://github.com/anthropics/pi-session-manager.git
cd pi-session-manager

npm install              # 安装前端依赖
npm run tauri:dev        # 开发模式 (热重载)
npm run tauri:build      # 生产构建
```

构建产物位于 `src-tauri/target/release/bundle/`。

---

## 使用方法

### 桌面端 (GUI 模式)

默认模式，完整的原生集成：

```bash
./pi-session-manager
```

### 服务器 (CLI / 无头模式)

作为后端服务运行，暴露 WebSocket + HTTP API，可从网络上任何设备访问：

```bash
./pi-session-manager --cli
# 或
./pi-session-manager --headless
```

然后在任何浏览器中打开 `http://localhost:52131`，或连接移动应用。

### Web / 移动端访问

应用运行时 (GUI 或 CLI 模式) 在任何浏览器中打开 `http://localhost:52131`。前端功能：
- 自动检测移动设备并显示触摸优化界面
- 手机端使用底部导航栏
- 支持平板响应式布局
- 可作为 PWA (添加到主屏幕)

### API 示例

```bash
# HTTP
curl -s -X POST http://127.0.0.1:52131/api \
  -H "Content-Type: application/json" \
  -d '{"command":"scan_sessions","payload":{}}' | jq

# WebSocket
wscat -c ws://127.0.0.1:52130
> {"command":"scan_sessions","payload":{}}
```

---

## 键盘快捷键

### 全局

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + K` | 命令面板 / 全局搜索 |
| `Cmd/Ctrl + J` | 切换终端面板 |
| `Cmd/Ctrl + P` | 切换到项目视图 |
| `Cmd/Ctrl + R` | 在终端中恢复会话 |
| `Cmd/Ctrl + E` | 导出并在浏览器中打开 |
| `Cmd/Ctrl + ,` | 设置 |
| `Esc` | 关闭对话框 / 清除选择 |

### 会话查看器

| 快捷键 | 操作 |
|--------|------|
| `Cmd/Ctrl + F` | 侧边栏搜索 |
| `Cmd/Ctrl + T` | 切换思考块 |
| `Cmd/Ctrl + O` | 切换工具调用展开 |

---

## 项目结构

```
src/                        # 前端 (React + TypeScript)
  components/               #   UI 组件 (99+ 文件)
    kanban/                 #   看板 (拖拽、右键菜单)
    dashboard/              #   分析图表 (11 个组件)
    settings/sections/      #   设置面板 (10+ 个部分)
    command/                #   命令面板 (基于 cmdk)
  hooks/                    #   React Hooks (19 个)
  plugins/                  #   搜索插件系统 (会话、消息、项目)
  contexts/                 #   React Contexts (传输、设置、会话视图)
  i18n/                     #   国际化 (en-US, zh-CN)
  transport.ts              #   多协议传输层
  utils/                    #   工具函数

src-tauri/                  # 后端 (Rust + Tauri 2)
  src/
    main.rs                 #   入口: CLI 参数、窗口、适配器启动
    main-cli.rs             #   CLI 专用入口
    lib.rs                  #   模块声明、命令注册
    ws_adapter.rs           #   WebSocket 服务器 + dispatch() 路由
    http_adapter.rs         #   HTTP 服务器、嵌入式前端 (rust-embed)
    app_state.rs            #   SharedAppState (Arc)
    scanner.rs              #   会话文件扫描器 (多路径、增量)
    scanner_scheduler.rs    #   后台扫描调度
    terminal.rs             #   PTY 会话管理器 (portable-pty)
    sqlite_cache.rs         #   双层缓存 (FS + SQLite)
    tantivy_search.rs       #   全文搜索索引
    file_watcher.rs         #   文件系统监听 (增量更新)
    write_buffer.rs         #   异步写入批处理
    commands/               #   Tauri IPC 命令处理器 (12 模块, ~2160 行)
      session.rs            #   会话操作
      tags.rs               #   标签管理
      skills.rs             #   技能和提示词扫描
      settings.rs           #   设置持久化
      terminal.rs           #   终端命令
      search.rs             #   搜索命令
      cache.rs              #   缓存管理
      favorites.rs          #   收藏系统
      models.rs             #   模型测试
      auth_cmds.rs          #   认证
  tests/                    #   集成测试
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18, TypeScript, Vite, Tailwind CSS, i18next, xterm.js, cmdk, Recharts, React Flow, dnd-kit, @tanstack/react-virtual |
| **后端** | Tauri 2, Rust, Tokio, Axum, SQLite (rusqlite), Tantivy, portable-pty, rust-embed, notify |
| **通信** | Tauri IPC, WebSocket (tokio-tungstenite), HTTP (Axum) |
| **构建** | Cargo, PNPM, GitHub Actions |

---

## 配置

| 路径 | 说明 |
|------|------|
| `~/.pi/agent/sessions/` | 默认 Pi 会话目录 |
| `~/.pi/agent/session-manager.db` | SQLite 缓存、设置、标签、收藏 |
| `~/.pi/agent/session-manager-config.toml` | 扫描配置 (截止日期、FTS5、路径等) |
| `~/.pi/agent/skills/` | Pi 技能目录 |
| `~/.pi/agent/prompts/` | Pi 提示词目录 |
| `~/.pi/agent/settings.json` | Pi 代理设置 |

### 配置文件示例

```toml
# ~/.pi/agent/session-manager-config.toml
realtime_cutoff_days = 2      # 内存中保留的天数
scan_interval_seconds = 30    # 后台扫描间隔
enable_fts5 = true            # 启用全文搜索
preload_count = 20            # 预加载最近会话数
auto_cleanup_days = 90        # 自动清理旧会话 (可选)
session_paths = []            # 额外的会话目录
```

---

## 贡献指南

1. Fork 并创建功能分支
2. `cd src-tauri && cargo fmt && cargo clippy`
3. 运行测试: `cd src-tauri && cargo test`
4. 使用 [Conventional Commits](https://www.conventionalcommits.org/) 提交 PR

---

## 许可证

[MIT](LICENSE)
