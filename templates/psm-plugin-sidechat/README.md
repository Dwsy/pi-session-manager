# Sidechat PSM Plugin Template

Template for commands that call the PSM sidechat capability.

```bash
npm install
npm run build
npm install --prefix ~/.pi/pi-session-manager/extensions/npm .
```

The plugin declares `sidechat:ask`, builds to browser-compatible ESM, and exposes `./dist/index.js` through `psm.extensions`.
