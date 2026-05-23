# Basic PSM Plugin Template

Minimal browser-compatible Pi Session Manager plugin.

```bash
npm install
npm run build
npm install --prefix ~/.pi/pi-session-manager/extensions/npm .
```

The package declares `psm.extensions` as `./dist/index.js` and uses `@pi-session-manager/plugin-sdk` for types.
