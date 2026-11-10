# Project Identity (built-in)

Takes over project labels and avatars through the host's
`ctx.ui.registerProjectIdentityProvider` extension point, so long machine-generated
workspace directories stay readable in the sidebar, Explorer table, Explorer header
and project filter list.

| Directory | Rendered as |
| --- | --- |
| `agent-da66bdca-…` (agent `zero`) | pink cloud avatar, `zero`, `OpenBot agent` |
| `agent-…` with an `avatarUrl` | that image |
| `agent-…` without `avatarSeed` | first letter on the stored hue |
| `agent-da66bdca-…` (no metadata) | 🤖 `Bot da66bdca` |
| `openbot-profile-RHUB5T` | 🧩 `Profile RHUB5T` |
| `bw-platform` | unchanged (`bw-platform`, keeps its path line) |

When the plugin rewrites a machine directory name it also sets `hidePath: true`, so the
`agent-da66bdca-…` / `openbot-profile-…` line disappears from the row (hover still shows
the full path). Ordinary projects keep their path line.

## Providers

| Priority | Provider | Source |
| --- | --- | --- |
| 10 | `builtin.project-identity.openbot-agents` | `ctx.psm.openbot.listAgents()` (`openbot:read`) |
| 100 | `builtin.project-identity.generated-directories` | directory name pattern |

- Agent metadata is read once during activation, so `resolve` stays synchronous.
  A missing database, a schema change or a denied permission only logs a warning and
  drops the agent provider; the directory fallback still applies.
- Matching uses the exact workspace path first, then the directory id, so a moved or
  renamed agent workspace still resolves.
- Only complete `agent-<uuid>` and `openbot-profile-<id>` names are rewritten by the
  fallback; anything else returns `null` so the host keeps its default label and
  folder icon.
- Avatars prefer an `https:` `avatarUrl`, then a locally drawn `avatarSeed` face, then the
  first letter of the name on the stored hue.

## Generated avatars (bloub)

OpenBot stores no avatar image for a generated bot: it stores `avatarSeed`
(`first-bot:avatar:0:7`) plus `avatarHue`, and draws the face with
[`@norbert_bodziony/bloub`](https://github.com/NorbertBodziony/bloub) (MIT). PSM
reproduces that drawing instead of approximating it:

- `bloubTable.ts` is generated geometry (body paths, eye paths, eye transforms, hue hexes)
  from `bloub@0.4.1`; regenerate with `scripts/generate-bloub-table.mjs`.
- `bloubAvatar.ts` mirrors OpenBot's `bloubAvatarProfile()` — the same FNV-1a
  `stableIndex`, the same `goutte` shape replacement, the same hue palette — and assembles
  a static SVG, returned as a `data:image/svg+xml;base64,` URL so the host renders it in a
  plain `<img>`.
- Verified against the library itself: all 8 shapes × 16 expressions produce identical
  body paths, eye paths and eye transforms, and sampled renders are pixel identical.
- No Solid runtime and no third-party dependency ships at runtime.

## Data source

`openbot:read` maps to the `plugin_openbot_agents_list` backend command, which opens
OpenBot's local `openbot.db` read-only (`~/Library/Application Support/OpenBot` on
macOS, `%APPDATA%\OpenBot` on Windows, `~/.config/OpenBot` on Linux) and reads
`projection_agents.agent_json`. Use `PSM_OPENBOT_DB` to point it at another database.
Nothing is written, and unreadable rows are skipped.

Adding real names to another bot runtime only needs one more provider with a lower
`priority` value; providers resolve in ascending priority, in `id` order on ties.
