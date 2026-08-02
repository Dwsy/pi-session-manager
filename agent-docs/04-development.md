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
| New Tauri command | `commands/` + `app/mod.rs` |
| New HTTP/WS/plugin command | matching `dispatch/<capability>.rs` |
| Business logic | `domain/` |
| Session search behavior | `domain/session_search/` |
| Search storage/index | `data/search/` |
| Database | `data/sqlite/` |
| HTTP | `server/http/` |
| WS | `server/ws.rs` |
| Frontend component | `components/` |
| Frontend hook | `hooks/` |

## Principles

1. **Domain-first**: Business logic in `domain/`
2. **Thin commands**: `commands/` only validates params
3. **Capability adapters**: JSON payload conversion stays in `dispatch/<capability>.rs`
4. **Composition root**: GUI registration and lifecycle stay in `app/mod.rs`
5. **Feature gates**: Use `#[cfg(feature = "gui")]` for GUI-only behavior

## Release

`node scripts/release-version.mjs sync <version>` → sync package.json, Cargo.toml × 2, tauri.conf.json → git tag `v<x.y.z>`

### Update Channels

Release workflow now publishes updater manifests to the `update-manifests` branch using shared config from `src/runtime-data/update-channels.json`.

Rules:
- Stable tag: `vX.Y.Z` → updates both `stable/latest.json` and `beta/latest.json`
- Prerelease tag: `vX.Y.Z-beta.N`, `vX.Y.Z-alpha.N`, `vX.Y.Z-rc.N` → updates `beta/latest.json` only
- Desktop default updater endpoint points at `stable/latest.json`
- Manual channel switching in app overrides endpoints at runtime

Local reproduction:
```bash
node scripts/update-channel-manifests.mjs prepare release-metadata/latest.json channel-manifests v0.6.4
node scripts/update-channel-manifests.mjs prepare release-metadata/latest.json channel-manifests v0.7.0-beta.2
```

## Local Signing

Copy `.env.tauri-signing.local.example` to `.env.tauri-signing.local`, fill in your local key path/password, then run `npm run tauri:build:local-signed`.
