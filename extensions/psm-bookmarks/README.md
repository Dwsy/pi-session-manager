# psm-bookmarks

Text-selection bookmarks for session transcripts. Built on the public PSM
Plugin SDK: the host exposes selection and highlight contracts, this plugin
owns anchoring data, UI, search, and AI organization.

> **Disabled by default** (`defaultEnabled: false`). Enable it in
> Settings → PSM Plugins → Bookmarks.

## What it does

- **划选收藏 / Bookmark**: select text inside one transcript message -> the
  floating selection menu saves a bookmark anchored by a W3C text quote
  (`exact` + `prefix`/`suffix`).
- **收藏并批注 / Bookmark with note**: same as above, then opens the session
  bookmarks panel with the note editor focused.
- **高亮回显 / Highlight restore**: re-anchors saved quotes into the rendered
  transcript on every session open; hover shows the note, click opens a
  read-mode popover (edit/add-note on demand, never auto-focused). Anchors that
  no longer match degrade silently.
- **会话面板 / Session panel**: per-session bookmark list with jump-to-entry
  (`viewer.revealEntry`), inline note editing, and explicit confirm/cancel
  deletion (dismissible with Escape).
- **书签聚合 / Bookmark Explorer** (`#/bookmarks`): cross-session recent list
  with **By session / By project / All** grouping, newest/oldest sort,
  debounced full-text search, inline note editing and deletion, per-session
  jump. See [Limits](#limits) — this is **not** an unbounded full list.
- **项目侧栏 / Project sidebar**: bookmark counts per project; click to filter
  the explorer (replaces the empty session list inside app views).
- **AI 整理 / AI organize**: theme organization of the visible bookmarks via
  host-managed `ctx.psm.agent` sessions.

## Data

| Record type | Scope | Content |
| --- | --- | --- |
| `bookmark.text-quote` | `session` | `{ anchor: { entryId, entryRole?, textQuote }, quote, note?, colorHue?, sessionName?, projectPath?, createdAt, updatedAt }` |
| `bookmark.registry` | `global` | Capped (2000) recent-bookmark index powering the explorer: recent list, grouping, project sidebar |

Deletion tombstones the record (`payload.deleted = true`); every read path
filters tombstones because the public records client has no delete.

Two selections of the same words are distinct bookmarks when their
`prefix`/`suffix` context differs; only a fully identical text quote is treated
as a repeat (double-click guard). All registry read-modify-write operations are
serialized so overlapping saves cannot lose entries.

## Limits

Be honest about what the explorer shows:

| Limit | Value | Behavior when hit |
| --- | --- | --- |
| Explorer registry | 2000 entries | Older entries drop out of the list; their records are still stored. A visible notice and host warning are emitted. |
| Session read | 1000 records | Visible notice + host warning. |
| Search results | 500 | Visible notice + host warning; refine the query. |

Mutations emit a typed change signal (`save` / `note` / `remove`) so open views
refresh silently instead of blanking the list. Errors and truncation are
dismissible strips — they never replace the bookmark list. Opening a session
that is no longer in the host's current session list reports a visible notice
instead of silently doing nothing.

## Permissions

`sessions:read`, `records:read`, `records:write`, `agent:invoke`,
`model:invoke` (AI organize only; failures degrade to a visible error).

## Development

Bundled as a `builtin` plugin (loaded from source through
`import.meta.glob('extensions/psm-*/index.tsx')`). Tests:

```bash
pnpm exec vitest run extensions/psm-bookmarks
```
