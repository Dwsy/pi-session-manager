# PSM Cache Usage Path Plugin

Local-path PSM plugin example for testing the `customPaths` loader.

Entry file to add in Settings -> PSM Plugins:

```text
/Users/dengwenyu/Dev/AI/pi-session-manager/extensions/psm-cache-usage-path/dist/index.mjs
```

What it does:

- adds a `Cache` toolbar button in the session viewer
- opens a right-side panel with cache hit trends, recent turns, and branch-vs-tree totals
- adds local insights for model switches, hit-rate drops, cache write spikes, and recorded cost coverage
- uses the same cache-hit formula as `pi-cache-graph`
- uses the viewer-selected `Active branch` when available; otherwise falls back to newest-message lineage
- includes plugin i18n resources (`en-US`, `zh-CN`)
- registers command `cache-usage.inspect`
- registers tool `session_cache_usage`

Formula:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

Reference project:

```text
/Users/dengwenyu/.pi/agent/npm/node_modules/pi-cache-graph
```
