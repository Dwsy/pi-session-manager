# Configuration Import/Export Feature

## Current behavior

`pi-session-manager` import/export now packages only the app's own unified config:

- `~/.pi/pi-session-manager/config.json`

It does **not** bundle Pi's own files such as:

- `~/.pi/agent/models.json`
- `~/.pi/agent/settings.json`

Those belong to Pi itself, not to `pi-session-manager`.

## Bundle contents

```text
pi-config-export-<timestamp>.zip
├── metadata.json
└── config.json
```

## Backup location

```text
~/.pi/pi-session-manager/backups/config-bundles/import-*/
```

## Notes

- Runtime config source of truth for PSM is `~/.pi/pi-session-manager/config.json`
- Session/cache/tag/favorite/auth data remain in SQLite
- Config history snapshots remain separate from runtime config
