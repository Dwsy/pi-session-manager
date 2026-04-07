# Pi Session Manager — Agent Guide

> Documentation split into progressive modules. See `agent-docs/` directory.

---

## Quick Navigation (What → Where)

| Task | Read |
|------|------|
| **Session operations** (scan, list, filter, delete) | [Architecture](agent-docs/01-architecture.md) + [Backend](agent-docs/03-backend.md) |
| **Add new Rust command** | [Backend](agent-docs/03-backend.md) → "How to Add a New Command" |
| **Modify business logic** | [Backend](agent-docs/03-backend.md) → Domain section |
| **Modify data layer** | [Backend](agent-docs/03-backend.md) → Data section |
| **HTTP/WS protocol** | [Architecture](agent-docs/01-architecture.md) → "Protocol Entry Points" |
| **Frontend component** | [Frontend](agent-docs/02-frontend.md) → Components section |
| **Frontend hook** | [Frontend](agent-docs/02-frontend.md) → Hooks section |
| **UI styling / visual design** | [DESIGN.md](DESIGN.md) → Color tokens, component patterns, motion |
| **Dark/light theme** | [DESIGN.md](DESIGN.md) → Color System → Dark Mode / Light Mode |
| **Dashboard / Kanban / Settings UI** | [DESIGN.md](DESIGN.md) → Dashboard & Charts / Overlay Components |
| **Add new UI component** | [DESIGN.md](DESIGN.md) → Component Patterns + [Frontend](agent-docs/02-frontend.md) |
| **Search functionality** | [Backend](agent-docs/03-backend.md) → Data/search/ |
| **Settings/config** | [Config](agent-docs/05-config.md) |
| **Build & test** | [Development](agent-docs/04-development.md) |
| **Release** | [Development](agent-docs/04-development.md) → Release section |

---

## File Index

| File | Content |
|------|---------|
| [00-index.md](agent-docs/00-index.md) | Entry point, core principles |
| [01-architecture.md](agent-docs/01-architecture.md) | 4-layer architecture, protocol routing, dispatch |
| [02-frontend.md](agent-docs/02-frontend.md) | Components, hooks, plugins, utils |
| [03-backend.md](agent-docs/03-backend.md) | Commands, Domain, Data, Server, **add command tutorial** |
| [04-development.md](agent-docs/04-development.md) | Build, test, modify guide |
| [05-config.md](agent-docs/05-config.md) | Paths, security, tech stack |
| [DESIGN.md](DESIGN.md) | Design system: colors, typography, components, motion, themes |

---

## Core Principles

1. **Code First**: When docs conflict with code, follow the code
2. **Design First (UI)**: Before adding/changing any UI, read [DESIGN.md](DESIGN.md) for color tokens, spacing, and component patterns — follow existing design system, don't invent new styles
3. **Locate Before Modify**: Go to the corresponding directory
4. **Rust Tests First**: `cd src-tauri && cargo test`
5. **Version Sync**: `node scripts/release-version.mjs check`

---

## Quick Reference

| Scenario | Command/Path |
|----------|-------------|
| Frontend dev | `npm run dev` |
| GUI dev | `npm run tauri:dev` |
| Rust lint | `cargo clippy -- -D warnings` |
| Rust test | `cargo test` |
| Frontend UI | `src/components/` |
| Frontend styling | [DESIGN.md](DESIGN.md) + `src/styles/` |
| Frontend hooks | `src/hooks/` |
| Business logic | `src-tauri/src/domain/` |
| Data layer | `src-tauri/src/data/` |
| Protocol | `src-tauri/src/server/` |
| New command | `src-tauri/src/commands/` + `dispatch.rs` |

---

## Architecture Overview

```
Frontend: React + TypeScript + Vite
Backend: Rust + Tauri 2 + Axum + SQLite + Tantivy

Protocols: Tauri IPC | WebSocket (/ws) | HTTP (/api) | SSE
```

**Key insight**: HTTP and WS requests converge at `dispatch()`. Add command once, available via both.

---

## Known Issues

- README path descriptions may be outdated
- Frontend tests not integrated into CI
- Dual CLI entry (`main.rs` vs `src-tauri-cli/`), current release uses src-tauri-cli
