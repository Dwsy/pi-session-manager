<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager">
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  跨平台 Pi AI 会话管理工具 — 浏览、搜索、管理 <a href="https://github.com/badlogic/pi-mono">Pi</a> 编程会话
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Tauri-2.x-orange?style=flat-square" alt="Tauri 2">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">⬇️ 下载</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">📖 文档</a>
</p>

---

## 核心功能

- **多端支持** — 桌面应用 (macOS/Windows/Linux) + 移动端 Web + 无头服务器模式
- **会话浏览** — 列表/项目/看板视图，收藏，重命名，批量导出
- **全文搜索** — SQLite FTS5 驱动，支持角色过滤、路径匹配、相关性排序
- **会话查看** — 树形视图、工具调用折叠、思维链展示、流程图可视化
- **内建终端** — xterm.js + PTY 后端 (`Cmd/Ctrl+J`)
- **数据看板** — 活动热力图、项目分布、模型使用、Token 消耗统计
- **技能管理** — 扫描管理 `~/.pi/agent/skills` 和 prompts，系统提示词编辑
- **多协议 API** — Tauri IPC + WebSocket (`ws://:52130`) + HTTP (`http://:52131`)
- **CLI 模式** — 无头后端服务 (`--cli` / `--headless`)

---

## 下载

从 [**Releases**](../../releases) 获取最新版本：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Pi.Session.Manager_*_aarch64.dmg` |
| macOS (Intel) | `Pi.Session.Manager_*_x64.dmg` |
| Windows (x64) | `Pi.Session.Manager_*_x64-setup.exe` |
| Linux (deb) | `pi-session-manager_*_amd64.deb` |

> **前置要求**: 需安装 [Pi](https://github.com/badlogic/pi-mono) 以支持会话恢复和终端集成

---

## 快速开始

### 桌面应用

```bash
./pi-session-manager
```

### 服务器模式

```bash
./pi-session-manager --cli
# 访问 http://localhost:52131
```

### 从源码构建

```bash
git clone https://github.com/Dwsy/pi-session-manager.git
cd pi-session-manager

npm install
npm run tauri:dev        # 开发
npm run tauri:build      # 生产构建
```

**系统依赖**:
- **macOS**: `xcode-select --install`
- **Ubuntu/Debian**: `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`
- **Windows**: Visual Studio Build Tools + WebView2

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + K` | 命令面板 |
| `Cmd/Ctrl + J` | 切换终端 |
| `Cmd/Ctrl + F` | 会话内搜索 |
| `Cmd/Ctrl + Shift + F` | 全文搜索 |
| `Cmd/Ctrl + R` | 终端恢复会话 |
| `Cmd/Ctrl + E` | 导出并打开 |
| `Cmd/Ctrl + ,` | 设置 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18, TypeScript, Vite, Tailwind CSS, xterm.js, Recharts, React Flow |
| **后端** | Tauri 2, Rust, Tokio, Axum, SQLite, Tantivy, portable-pty |
| **通信** | Tauri IPC, WebSocket, HTTP |

---

## 配置路径

| 路径 | 说明 |
|------|------|
| `~/.pi/agent/sessions/` | Pi 会话目录 |
| `~/.pi/agent/session-manager.db` | SQLite 缓存 |
| `~/.pi/agent/session-manager-config.toml` | 配置文件 |

---

## 贡献

```bash
cd src-tauri && cargo fmt && cargo clippy
cd src-tauri && cargo test
```

提交 PR 请遵循 [Conventional Commits](https://www.conventionalcommits.org/)

---

## License

[MIT](LICENSE)
