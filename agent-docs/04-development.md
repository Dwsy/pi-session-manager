# Development

## Build

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev |
| `npm run tauri:dev` | Tauri GUI |
| `npm run build && npm run tauri:build` | Production |
| `npm run tauri:build:local-signed` | Production build using local signing env file |
| `npm run build:cli` | CLI standalone |

## Rust

```bash
cargo fmt --all --check          # Format
cd src-tauri && cargo clippy -- -D warnings  # Lint
cargo test                       # Tests
```

## Quick Modify

| Scenario | Location |
|----------|----------|
| New command | `commands/` + `lib.rs` |
| Business logic | `domain/` |
| Database | `data/sqlite/` |
| Search | `data/search/` |
| HTTP | `server/http/` |
| WS | `server/ws.rs` |
| Frontend component | `components/` |
| Frontend hook | `hooks/` |

## Principles

1. **Domain-first**: Business logic in `domain/`
2. **Thin commands**: `commands/` only validates params
3. **Protocol agnostic**: `dispatch.rs`
4. **Feature gates**: `#[cfg(feature = "gui")]`

## Release

`node scripts/release-version.mjs sync <version>` → sync package.json, Cargo.toml × 2, tauri.conf.json → git tag `v<x.y.z>`

## Local Signing

Copy `.env.tauri-signing.local.example` to `.env.tauri-signing.local`, fill in your local key path/password, then run `npm run tauri:build:local-signed`.
