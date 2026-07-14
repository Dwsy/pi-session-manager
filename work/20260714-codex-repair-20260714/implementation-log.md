## 2026-07-14 — P0 baseline slice

- **Scope:** Auth/token/origin/Markdown/CI baseline plus selected P1 fixes.
- **Files:** `src-tauri/src/auth.rs`, `src-tauri/src/server/http/*`, `src-tauri-cli/src/main.rs`, `src/utils/markdown.ts`, `src/components/AuthGate.tsx`, `package.json`, `pnpm-lock.yaml`, CI and docs.
- **Behavior:** loopback no longer bypasses auth; fixed token is rotated; query token is ignored; default bind is loopback; Markdown is sanitized with DOMPurify; CI now exposes typecheck/test/verify scripts.
- **Verify:** `pnpm exec tsc --noEmit`; `pnpm exec tsc -p tsconfig.extensions.json --noEmit`; targeted Vitest; Rust auth tests; `cargo check` GUI/CLI; release version check.
- **Open:** full Vitest is currently blocked by four pre-existing suite evaluation failures caused by the installed `@lobehub/fluent-emoji` package exporting extensionless directory imports under the current Vite/Vitest ESM resolver. A local alias workaround was tested but intentionally removed from the final diff because it would mask the dependency/toolchain problem; 539 other tests pass.

Chronological deliverables. Add a dated section after every Do/Check slice.

## 2026-07-14 — folder created

- **Scope:** 修复 PSM_CODEX_REPAIR_PACKET 中的 P0 安全/CI 阻断与 P1 稳定性、文档、动效和可访问性问题，并以可复现验证证据准备 PR。
- **Files:** (none yet)
- **Behavior:** PDCA scaffold only
- **Verify:** n/a
- **Open:** complete P0 in task.md
