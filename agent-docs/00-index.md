# Index

## Core Principles

1. **Code First**: When docs conflict with code, follow the code
2. **Locate Before Modify**: Go to the corresponding directory
3. **Rust Tests First**: `cd src-tauri && cargo test`
4. **Version Sync**: `node scripts/release-version.mjs check`

## Quick Modify

| Scenario | Location |
|----------|----------|
| Frontend UI | `src/components/` |
| Frontend hooks | `src/hooks/` |
| Business logic | `src-tauri/src/domain/` |
| Data layer | `src-tauri/src/data/` |
| Protocol | `src-tauri/src/server/` |
| PSM plugin SDK / extensions | `agent-docs/06-plugins.md`, `docs/PSM_PLUGIN_SDK.md`, `docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md`, `extensions/README.md` |
| New command | `src-tauri/src/commands/` |

## Commands

| Command | Description |
|---------|------------|
| `npm run dev` | Frontend dev |
| `npm run tauri:dev` | GUI dev |
| `cargo clippy -- -D warnings` | Rust lint |
| `cargo test` | Rust tests |

## Docs

- [Architecture](01-architecture.md)
- [Frontend](02-frontend.md)
- [Backend](03-backend.md)
- [Development](04-development.md)
- [Config](05-config.md)
- [Plugin Authoring](06-plugins.md)
- [PSM Plugin SDK](../docs/PSM_PLUGIN_SDK.md)
- [PSM Plugin SDK Capability Audit](../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md)
- [Extensions Overview](../extensions/README.md)
