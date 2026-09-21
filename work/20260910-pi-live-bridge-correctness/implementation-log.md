# Implementation Log

Chronological deliverables. Add a dated section after every Do/Check slice.

## 2026-09-10 — folder created

- **Scope:** 初始 PDCA scaffold；随后用户明确协议基准改为 `@earendil-works/pi-*` latest（registry 0.85.1）。
- **Files:** PDCA / Workhub scaffold only
- **Behavior:** 建立真实调用链、验收边界与双 slice 审计计划。
- **Verify:** npm registry latest 查询；源码路径与 ExtensionAPI 定义核验。
- **Open:** 执行 bridge 与 PSM Pi Live 正确化。

## 2026-09-10 — Do: bridge / Earendil 0.85.1 alignment

- **Scope:** Pi bridge API、event forwarding、RPC command semantics、canonical session identity、Pi dependency line。
- **Files:** `package.json`, `pnpm-lock.yaml`, `extensions/pi-session-bridge/src/{index.ts,connection-manager.ts,connection-manager.test.ts}`，以及 bridge 相关类型/测试与 `extensions/README.md`。
- **Behavior:** 统一到 `@earendil-works/pi-*` 0.85.1；使用 `SessionManager.getSessionId()`；按 0.85.1 typed events 转发 `tool_call`/`tool_result`/`thinking_level_select`；`sendUserMessage` 启用 `expandPromptTemplates: true`；移除未公开 mid-session context fallback；校验 thinking level 与 busy prompt 行为。
- **Verify:** `pnpm exec vitest run extensions/pi-session-bridge/src` → 8 files / 33 tests passed；`pnpm typecheck:extensions` passed；`pnpm install --ignore-scripts` 可复现 lockfile。
- **Open:** none in this slice.

## 2026-09-10 — Do/Check: PSM live state and RPC correctness

- **Scope:** Rust registry + WS/HTTP realtime parity + frontend live reducer/state merge。
- **Files:** `src-tauri/src/pi_agent_registry.rs`, `src-tauri/src/server/{ws.rs,http/realtime.rs}`, `src/hooks/usePiLive.ts`, `src/hooks/__tests__/usePiLive.test.ts`。
- **Behavior:** RPC call id 全局唯一并严格 correlation；旧连接断开不会删除替代连接 session；WS/HTTP 同步 queue/state/event 语义；entry count 仅按完成条目增长，streaming 按 agent lifecycle；partial state update 不再以 undefined 擦除已知值，多 session 连接态不因单 session disconnect 错降。
- **Verify:** focused TS 3 files / 18 tests passed；Rust registry 3 tests passed；`pi_live_test` 7 tests passed；`cargo fmt --check`, `cargo check`, `pnpm build`, `git diff --check` 全通过；current stale ref scan clean。
- **Open:** 项目仍有既有 pnpm v11 override warning、macOS duplicate `__EMBED_INFO_PLIST` linker warning、Browserslist/chunk-size build warnings；均未阻塞本轮验收。
