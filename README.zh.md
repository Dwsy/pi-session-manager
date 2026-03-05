<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  一个基于 Tauri + Rust + React 的 Pi 会话管理工具，支持桌面端、无头服务端，以及独立静态 Demo 页面。
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">中文文档</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a>
</p>

## 核心能力

- 会话浏览：列表/项目/看板、收藏、标签、重命名、删除、导出。
- 全文检索：SQLite FTS + Tantivy 路径。
- 会话恢复：内置 PTY 终端，一键恢复 Pi 会话。
- 多协议访问：Tauri IPC、WebSocket、HTTP、SSE。
- 完整 Demo 数据引擎 + 独立静态 Demo 页面构建模式。
- 内置多语言包：`en-US`、`zh-CN`、`ja-JP`、`de-DE`、`fr-FR`、`es-ES`。

## 运行模式

| 模式 | 入口 | 网络行为 |
| --- | --- | --- |
| 桌面 GUI | `pi-session-manager` | GUI + 后端服务；默认设置里 WS `52130`、HTTP `52131` |
| 主二进制无头模式 | `pi-session-manager --cli` / `--headless` | 单端口 HTTP + WS(`/ws`)，端口为 `http_port`（默认 `52131`） |
| 独立 CLI crate | `pi-session-cli` | 单端口 HTTP + WS(`/ws`)（默认 `52131`） |
| 静态 Demo 页面 | `dist-demo/index.html` | 不依赖后端，强制 Demo 数据 |

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
# 或 npm install
```

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 前端开发服务器 |
| `npm run dev:demo` | Demo 语境下的前端开发服务器 |
| `npm run build` | 生产前端构建到 `dist/` |
| `npm run build:demo` | 生成静态 Demo 到 `dist-demo/`（默认页即 Demo 模式） |
| `npm run tauri:dev` | 桌面端联调（前后端） |
| `npm run tauri:build` | 桌面端生产构建 |
| `npm run build:cli` | 构建独立 `pi-session-cli` 二进制 |

## 二进制运行

### 桌面 GUI

```bash
./pi-session-manager
```

### 主二进制无头服务

```bash
./pi-session-manager --cli
# 或
./pi-session-manager --headless

# 覆盖端口与地址
./pi-session-manager --cli -p 18080 -b 0.0.0.0
```

参数说明：

- `-p, --port <PORT>`：CLI 模式下的 HTTP+WS 共享端口
- `-b, --bind <ADDR>`：监听地址
- `--auth` / `--no-auth`：开启/关闭鉴权
- `--token <TOKEN>`：仅当前进程有效的运行时 token

### 独立 CLI 二进制

```bash
./pi-session-cli
./pi-session-cli -p 18080 -b 0.0.0.0
```

鉴权默认行为：

- 默认开启鉴权；
- 回环地址（localhost/127.0.0.1）免 token；
- 非回环来源必须携带有效 token。

## 服务端接口

- `POST /api`：命令入口
- `GET /ws`：WebSocket
- `GET /api/events` 与 `/v1/events`：SSE
- `GET /health`：健康检查
- `GET /`：嵌入式前端（服务模式）

## Demo 页面模式

### 开发预览

```bash
npm run dev
# 浏览器打开 http://localhost:1420/demo.html
```

### 静态 Demo 构建

```bash
npm run build:demo
# 输出：dist-demo/index.html
```

`dist-demo/index.html` 启动时会预置：

- `advanced.demoMode = true`
- `language.locale = en-US`

因此默认进入英文的丰富 Demo 数据视图，不依赖后端。

## 数据与配置路径

| 路径 | 说明 |
| --- | --- |
| `~/.pi/agent/sessions/` | 会话目录 |
| `~/.pi/agent/sessions/sessions.db` | SQLite 数据库（会话、设置、标签、收藏、鉴权 token） |
| `~/.pi/agent/session-manager-config.toml` | 扫描配置（`session_paths`、FTS、扫描间隔等） |
| `~/.pi/agent/skills/` | Pi Skills |
| `~/.pi/agent/prompts/` | Pi Prompts |
| `~/.pi/agent/settings.json` | Pi 配置 |
| `~/.config/pi-session-manager.json` | 独立 `pi-session-cli` 配置 |

## 开发检查

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

## 许可证

[MIT](LICENSE)
