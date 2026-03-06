# Pi Session Manager — Agent 工作指南

本文档面向 **AI coding agents**，用于快速、准确理解本仓库的真实结构、构建方式、运行架构与开发约定。

> 说明：本文件基于当前仓库代码与配置整理（而非仅 README）。若文档与代码冲突，请以代码实现为准。

---

## 1. 项目概览

Pi Session Manager 是一个基于 **Tauri 2 + Rust + React/TypeScript** 的会话管理工具，目标是管理 `~/.pi/agent/sessions/` 下的 Pi 会话（JSONL）。

核心能力包括：
- 会话扫描、分页列表、筛选、重命名、删除、导出
- 全文搜索（SQLite FTS + Tantivy 相关实现）
- 标签、收藏、统计面板
- 内置终端（PTY）
- 多协议访问：Tauri IPC / WebSocket / HTTP
- 可在 GUI 模式与无头服务模式运行

仓库同时包含一个文档站（`website/`，Next.js + Fumadocs）。

---

## 2. 仓库结构（按职责）

```text
.
├── src/                    # 前端 React + TypeScript (Vite)
│   ├── components/         # UI 组件（含 app/, settings/, kanban/, dashboard/ 等）
│   ├── hooks/              # 业务 hooks（会话、设置、搜索、终端、UI 状态）
│   ├── contexts/           # Transport/Settings/SessionView Context
│   ├── plugins/            # 搜索插件系统
│   ├── i18n/               # 多语言资源（en-US, zh-CN, ja-JP, de-DE, fr-FR, es-ES）
│   ├── transport.ts        # IPC/WS/HTTP 统一传输层（运行时自动选择）
│   └── App.tsx             # 应用主容器
│
├── src-tauri/              # 主后端 crate（包名: pi-session-manager）
│   ├── src/main.rs         # GUI 入口；也支持 --cli/--headless 参数
│   ├── src/lib.rs          # 模块导出与命令注册
│   ├── src/dispatch.rs     # 协议无关命令分发（核心业务路由）
│   ├── src/http_adapter.rs # HTTP API + /ws + SSE + 静态资源服务
│   ├── src/ws_adapter.rs   # 独立 WebSocket 服务器（默认 52130）
│   ├── src/commands/       # Tauri 命令薄层（session/search/settings/tags/...）
│   ├── src/scanner.rs      # 会话扫描、缓存快照、增量重扫
│   ├── src/sqlite_cache.rs # SQLite 初始化、迁移、索引、缓存读写
│   ├── src/file_watcher.rs # 文件变更监听，推送 sessions-changed 事件
│   ├── src/terminal.rs     # PTY 终端会话管理
│   └── tests/              # Rust 集成测试
│
├── src-tauri-cli/          # 独立 CLI crate（包名: pi-session-cli）
│   └── src/main.rs         # 单端口 HTTP+WS+静态前端服务（/api, /ws, /health）
│
├── website/                # 文档站（Next.js + Fumadocs）
├── scripts/                # 构建与手工测试脚本
├── .github/workflows/      # CI / Release / Website 部署
└── docs/                   # 设计与历史实现文档（部分已过时）
```

---

## 3. 关键配置文件清单

### 根目录
- `package.json`：前端与 Tauri 脚本入口（`dev/build/tauri:*`）
- `Cargo.toml`（workspace）：成员为 `src-tauri` 和 `src-tauri-cli`
- `tsconfig.json`：TS 严格模式（`strict: true`，并排除了测试文件）
- `vite.config.ts`：Vite + PWA + dev proxy + chunk 拆分
- `tailwind.config.js`：基于 CSS 变量的主题色系统
- `postcss.config.js`：PostCSS 配置
- `pnpm-lock.yaml` + `package-lock.json`：同时存在 pnpm/npm 锁文件

### Tauri 主后端（`src-tauri/`）
- `Cargo.toml`：主 Rust 依赖、feature（`gui`/`cli`）与 bin 定义
- `tauri.conf.json`：Tauri 构建、打包、dist 目录、窗口与安全选项
- `capabilities/default.json`：Tauri 权限声明
- `build.rs`：仅在 `gui` feature 下运行 `tauri_build::build()`

### 独立 CLI（`src-tauri-cli/`）
- `Cargo.toml`：依赖 `pi-session-manager`（`default-features = false, features = ["cli"]`）

### CI/CD
- `.github/workflows/ci.yml`：跨平台检查（tsc/build/fmt/clippy/test）
- `.github/workflows/release.yml`：tag 触发桌面包 + CLI 产物发布
- `.github/workflows/website.yml`：文档站构建并发布 GitHub Pages

### 容器
- `Dockerfile.cli`：构建 `pi-session-cli` 的 musl 静态二进制镜像流程

---

## 4. 技术栈

### 前端
- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS
- i18next
- 主要 UI/交互库：`cmdk`, `@dnd-kit/*`, `@xyflow/react`, `recharts`, `@xterm/xterm`

### 后端
- Rust (edition 2021)
- Tauri 2
- Tokio
- Axum
- rusqlite（bundled SQLite）
- Tantivy
- notify / notify-debouncer
- portable-pty

### 协议层
- Tauri IPC
- WebSocket（独立 ws adapter + HTTP `/ws`）
- HTTP API（`/api` + `/v1/*`）
- SSE（`/api/events`, `/v1/events`）

---

## 5. 构建、运行与发布流程

## 5.1 本地开发

### 前端单独开发
```bash
npm install
npm run dev
```

### Tauri GUI 联调（前后端）
```bash
npm run tauri:dev
```

### 生产构建
```bash
npm run build
npm run tauri:build
```

### CLI 构建
```bash
npm run build:cli
# 实际执行 scripts/build-cli.mjs：先前端 build，再 cargo build -p pi-session-cli
```

> 注意：仓库脚本既有 npm 也有 pnpm；CI 使用 pnpm（`pnpm install --frozen-lockfile`）。

## 5.2 Rust 检查与测试

```bash
cargo fmt --all --check
cd src-tauri && cargo clippy -- -D warnings
cargo clippy -p pi-session-cli -- -D warnings
cd src-tauri && cargo test
```

## 5.3 发布（GitHub Actions）

- 推送 tag `v*` 触发 `release.yml`
- 产物：
  - 桌面端安装包（Tauri action 构建）
  - CLI 二进制压缩包 + sha256
- 最终由 workflow 自动生成 release notes 并发布

### 5.3.1 版本号同步规则（必须遵循）

- 当前版本号来源以 `package.json` 为唯一前端注入来源（`vite.config.ts` 通过 `npm_package_version` 注入 `__APP_VERSION__`）。
- 发布前必须保证以下文件版本一致：
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri-cli/Cargo.toml`
  - （若使用 npm）`package-lock.json`
- `git tag` 必须与上述版本一致（建议使用 `vX.Y.Z`）。
- 给 agent/LLM 的发布提醒：**push new tag 前，先同步修改以上版本号；push new tag 后不要再改版本号**，否则会出现更新提示版本不一致。

## 5.4 文档站部署

- `website.yml` 在 `website/**` 变更时触发
- Next.js 构建结果发布到 GitHub Pages

---

## 6. 运行时架构（重要）

## 6.1 前端传输层自动选择

`src/transport.ts` 的选择逻辑：
1. 若检测到 `window.__TAURI__` → 使用 **TauriTransport**（IPC）
2. 否则按配置/环境选择：
   - `HttpTransport`（移动端或强制 http）
   - `WebSocketTransport`（默认浏览器远程模式）

支持通过 query/localStorage/env 配置 `wsUrl/httpBaseUrl/token/transport`。

## 6.2 后端命令路由

核心思想：**协议适配层 + 共享业务 dispatch**
- 共享业务：`src-tauri/src/dispatch.rs`
- GUI 特有命令覆盖：`src-tauri/src/ws_adapter.rs::dispatch(...)`
- HTTP `/api` 与 WS 请求最终都进入同一套命令语义

## 6.3 会话数据流

- `scanner.rs`：扫描 JSONL，会维护内存快照缓存（`SCAN_CACHE`）
- `file_watcher.rs`：监听会话目录变化，触发增量重扫并广播 `sessions-changed`
- `write_buffer.rs` + 定时 flush：减少数据库写压力
- `sqlite_cache.rs`：
  - 建表、索引、schema migration（当前 `LATEST_SCHEMA_VERSION = 3`）
  - 损坏恢复（备份后重建）

## 6.4 网络服务端口（代码默认）

### GUI 主程序 (`src-tauri/src/main.rs` + settings)
- WS：`52130`
- HTTP：`52131`
- `bind_addr` 默认 `127.0.0.1`

### 独立 CLI crate (`src-tauri-cli/src/main.rs`)
- 单端口服务（默认 `52131`）
- 同端口提供 `/api`、`/ws`、静态前端

---

## 7. 配置与数据路径（按代码）

## 7.1 会话与数据库
- 会话目录：`~/.pi/agent/sessions/`
- SQLite DB：`~/.pi/agent/sessions/sessions.db`
  - `sqlite_cache.rs` 与 `auth.rs` 都指向该路径

## 7.2 扫描配置
- 文件：`~/.pi/agent/session-manager-config.toml`
- 来源：`src-tauri/src/config.rs`
- 关键字段：
  - `realtime_cutoff_days`
  - `scan_interval_seconds`
  - `enable_fts5`
  - `preload_count`
  - `auto_cleanup_days`
  - `session_paths`
  - `metrics_enabled`
  - `metrics_port`

## 7.3 应用设置
- 存储在 SQLite `settings` 表（`settings_store.rs`）
- 兼容迁移来源：`$XDG_CONFIG_HOME/pi-session-manager/settings.json`（旧路径）

## 7.4 CLI 配置（独立 CLI）
- 文件：`dirs::config_dir()/pi-session-manager.json`
- 字段示例：`http_port`, `bind_addr`, `auth_enabled`

## 7.5 Pi 生态相关路径
- `~/.pi/agent/skills/`
- `~/.pi/agent/prompts/`
- `~/.pi/agent/settings.json`

> 提示：README 中出现过 `session-manager.db` 等历史路径；当前实现以 `sessions/sessions.db` 为准。

---

## 8. 代码组织与模块划分

### 前端分层
- `components/`：UI 组件（含大模块子目录）
- `hooks/`：业务状态与副作用封装
- `contexts/`：跨组件状态注入（Transport/Settings/SessionView）
- `plugins/`：搜索插件机制
- `utils/`：纯工具函数
- `transport.ts`：协议抽象层（关键基础设施）

### 后端分层
- `commands/*`：命令层（参数与返回值边界）
- `dispatch.rs`：通用命令分发（协议无关）
- 业务模块：`scanner`, `search`, `export`, `stats`, `session_parser`...
- 基础设施：`sqlite_cache`, `file_watcher`, `terminal`, `http_adapter`, `ws_adapter`

---

## 9. 测试策略（现状）

## 9.1 Rust 测试是主力
`src-tauri/tests/` 含大量集成测试，例如：
- `search_test.rs`
- `full_text_search_integration_test.rs`
- `export_test.rs`
- `migration_test.rs`
- `write_buffer_eviction_test.rs`
- `subagent_cost_test.rs`

CI 会执行 `cd src-tauri && cargo test`。

## 9.2 前端测试状态
- 存在 Vitest 风格测试文件（如 `src/components/__tests__/FullTextSearch.test.tsx`）
- 但根 `package.json` 未声明 vitest / testing-library 依赖，也无 `npm test` 脚本
- `tsconfig.json` 明确排除 `*.test.*` 与 `__tests__`

结论：前端自动化测试当前不是稳定 CI 路径；以 Rust 测试 + 手动验证为主。

## 9.3 手工测试脚本
`scripts/` 下有多个场景脚本（export/search/sidebar/toolcall 等），更多偏开发辅助与回归验证。

---

## 10. 开发约定（基于现有规范与代码风格）

## 10.1 TypeScript / React
- `strict: true`，避免 `any`
- 以函数组件 + hooks 为主
- 类型与运行逻辑分离，常见 `import type`
- 传输调用统一走 `transport.ts`（而不是散落直连）

## 10.2 Rust
- 公开能力通常返回 `Result<T, String>`
- 命令层尽量薄，业务逻辑下沉到功能模块
- 命名遵循 snake_case / PascalCase / SCREAMING_SNAKE_CASE

## 10.3 提交规范
- 使用 Conventional Commits（CI/文档均按此约定）

## 10.4 注释语言
- 代码中已有中英混合历史注释。
- 新增代码建议优先使用 **English 注释**，以保持跨语言可维护性。

---

## 11. 安全注意事项（必须了解）

1. **认证行为依赖绑定地址与配置**
   - 认证只对非 loopback IP 生效（`auth::is_auth_required`）
   - 若服务绑定 `0.0.0.0`，请务必确认 token 策略

2. **HTTP CORS 当前较宽松**
   - API 返回 `access-control-allow-origin: *`

3. **`/metrics` 暴露指标**
   - `http_adapter` 直接暴露 `/metrics`，无额外鉴权逻辑

4. **Tauri CSP 为 null**
   - `tauri.conf.json` 中 `app.security.csp = null`

5. **文件系统访问范围较大**
   - 功能涉及读取 `~/.pi/agent/*` 目录、会话文件、配置文件

6. **压缩与远程参数支持**
   - 支持 gzip（含 `PSM_FORCE_GZIP=1`）与 query 参数控制，调试时注意链路一致性

---

## 12. 已知差异与维护建议

以下是当前仓库中可见的“文档/实现不一致”点，改动前请先判断以哪个为准：

- README 的部分配置路径描述与代码不一致（DB 路径历史变更）
- README 对 i18n 语言描述少于实际语言包数量
- 仓库存在两套 CLI 入口实现（`src-tauri/src/main-cli.rs` 与 `src-tauri-cli/src/main.rs`），发布流程当前以 `src-tauri-cli` crate 为主
- 前端测试文件存在但未形成完整可执行测试管线

建议：当你修改这些行为时，同步更新 `README*`、`docs/` 与本文件。

---

## 13. Agent 实操建议（最小变更优先）

- 先判断改动属于：前端 UI、命令层、核心业务、协议适配、数据存储中的哪一层
- 优先在对应层做“最小侵入”修改，不跨层重写
- 涉及 Rust 逻辑时，优先补/改 `src-tauri/tests` 测试
- 涉及协议或路径变更时，检查以下联动：
  - `transport.ts`
  - `http_adapter.rs` / `ws_adapter.rs` / `dispatch.rs`
  - `README.md` / `README.zh.md` / `AGENTS.md`
