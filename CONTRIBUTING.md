# Contributing to Pi Session Manager

Thank you for your interest in contributing to Pi Session Manager!

## Prerequisites

- Node.js 22+
- Rust stable and Cargo
- Tauri system dependencies for your platform
- pnpm 11.5.2 (the repository's only supported package manager)

## Setup

```bash
git clone <repository-url>
cd pi-session-manager
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
```

## Development and verification

```bash
pnpm run tauri:dev
pnpm run typecheck
pnpm run typecheck:extensions
pnpm run test
pnpm run verify
```

Rust checks run from the repository root:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo check --workspace
cargo test --workspace
```

## Repository layout

- `src/` — React and TypeScript application
- `extensions/` — production PSM extensions
- `packages/runtime-sdk/` — browser plugin SDK
- `src-tauri/src/` — shared Rust library, Tauri adapter, HTTP/WS server
- `src-tauri-cli/` — standalone CLI lifecycle and packaging adapter

## Pull requests

Use a focused branch and conventional commit message. Include exact verification commands and any unavailable platform smoke tests. Do not add a second lockfile or use `npx` in CI/configuration.
