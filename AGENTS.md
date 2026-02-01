# Repository Guidelines

本文档为本仓库的贡献者指南，适用于前端（React/Vite/TypeScript）与后端（Tauri/Rust）开发。

## 项目结构与模块组织

- `src/`：前端源码（React 组件、i18n、样式等）
- `src-tauri/`：Tauri 后端与 Rust 逻辑（命令、导出、搜索等）
- `docs/`：设计/实现文档与说明
- `scripts/`：辅助脚本（测试或启动）
- `archive/`：历史设计或功能说明归档

## 构建、测试与开发命令

- `npm install`：安装依赖
- `npm run dev`：启动 Vite 前端开发服务器
- `npm run tauri:dev`：Tauri 开发模式（前端 + Rust）
- `npm run build`：构建前端产物到 `dist/`
- `npm run tauri:build`：构建桌面应用包（输出在 `src-tauri/target/release/bundle/`）
- `cd src-tauri && cargo check`：仅检查 Rust 编译
- `cd src-tauri && cargo test`：运行 Rust 测试

## 编码风格与命名约定

- TypeScript/React：函数式组件 + Hooks，保持组件小而聚焦
- Rust：遵循 Rust 命名规范，公共函数需文档注释
- 工具：Rust 使用 `rustfmt`/`clippy`，前端使用 ESLint + Prettier
- 错误处理：Rust 侧常用 `Result<T, String>`（详见 `CONTRIBUTING.md`）

## 测试指南

- Rust：`cd src-tauri && cargo test`
- TypeScript：`npm test`（当前测试可能尚未完善）
- 建议新增测试时对齐文件/功能命名，例如 `export_test` 等

## 提交与 PR 规范

- 提交信息：使用 Conventional Commits（如 `feat: ...`, `fix: ...`, `docs: ...`）
- PR 要求：描述变更、关联 Issue、列出测试结果与影响范围
- 提交流程：分支开发 → 完成测试 → 更新文档 → 提交 PR

## 配置与安全提示

- 本地配置文件：`~/.pi/agent/session-manager.json`
- Tauri 配置：`src-tauri/tauri.conf.json`
- 若涉及路径或系统命令，请在文档中明确示例与边界条件
