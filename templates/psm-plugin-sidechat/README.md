# Sidechat PSM Plugin Template

Template for commands that answer session questions through the host-managed
Pi Agent capability.

```bash
npm install
npm run build
npm install --prefix ~/.pi/pi-session-manager/extensions/npm .
```

The plugin declares `sessions:read`, `model:invoke`, and `agent:invoke`, builds
to browser-compatible ESM, and exposes `./dist/index.js` through
`psm.extensions`.
During local development, add this template directory through Settings -> PSM Plugins -> Dev Preview and use Rebuild after source edits.
