# Records PSM Plugin Template

Template for plugins that declare and write `plugin_records` data.

```bash
npm install
npm run build
npm install --prefix ~/.pi/pi-session-manager/extensions/npm .
```

The plugin declares record metadata in its manifest and builds a browser-compatible ESM bundle exposed by `psm.extensions`.
