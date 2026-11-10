# Project Icons (built-in)

Replaces the generic folder icon in the project list (sidebar, Explorer table,
Explorer header, project filter) with the project's ecosystem brand mark —
favicon-style SVG logos, not emoji. Detection is based on the common marker
files at each project directory's top level.

| Directory contains | Rendered as |
| --- | --- |
| `src-tauri/Cargo.toml` / `tauri.conf.json` | ⚡ Tauri mark |
| `Cargo.toml` | Rust mark |
| `package.json` + `next` | Next.js mark |
| `package.json` + `react` | React mark |
| `package.json` (other) | Node.js mark |
| `go.mod` / `pyproject.toml` / `pom.xml` / … | Go / Python / Java marks |
| nothing recognizable | unchanged (host default folder icon) |

The label and the secondary path line are untouched: this plugin only swaps the
icon. Machine-generated directory names stay owned by
[`psm-project-identity`](../psm-project-identity/) (its providers run first).

## Markers and kinds

| Kind | Markers (directory top level) |
| --- | --- |
| `tauri` | `tauri.conf.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| `rust` | `Cargo.toml` |
| `go` | `go.mod` |
| `python` | `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile` |
| `java` | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| `dotnet` | `*.csproj`, `*.sln`, `*.fsproj` |
| `php` | `composer.json` |
| `ruby` | `Gemfile` |
| `c-cpp` | `CMakeLists.txt` |
| `nextjs`, `react`, `vue`, `svelte`, `angular`, `node` | `package.json` (refined by its dependency keys) |

Marker precedence is ordered (`tauri` > `rust` > … > node family), so a Tauri
app with both `package.json` and `src-tauri/Cargo.toml` reads as Tauri.

## Scan whitelist (auto-authorized)

Marker scanning runs in the backend (`plugin_project_detect`, permission
`projects:read`), not in the plugin. The backend only scans directories in its
auto-authorized whitelist: every distinct project root PSM already knows (the
session `cwd` values). Requests for other paths come back `authorized: false`
and are never read; there is no per-directory user approval to click through.
Only the existence of the fixed marker catalog is checked — no recursion and no
file content leaves the backend (except `package.json` dependency names, used
solely to refine the node-family kind).

## Icons

`iconTable.ts` is vendored glyph geometry generated from
[`simple-icons`](https://github.com/simple-icons/simple-icons) (CC0-1.0):
brand path plus brand hex color, rendered as a white glyph on a brand-color
disc in a `data:image/svg+xml` URL (the host `url` avatar channel). Regenerate
with `scripts/generate-icon-table.mjs` (see the script header) when a kind is
added; the plugin ships no icon dependency at runtime.

## Behavior notes

- Detection runs once during activation and is cached, because
  `resolve` must stay synchronous and side-effect free (same trade-off as
  `psm-project-identity`). Projects created after activation show the default
  folder icon until the plugin reloads.
- Unknown kinds and unrecognized directories return `null`, so the host keeps
  its default folder icon; a detection failure just logs a warning.
