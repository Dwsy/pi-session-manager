# @pi-session-manager/plugin-sdk

Public TypeScript SDK for Pi Session Manager plugins.

This package exposes only the stable browser plugin contract:

- manifest and package validation helpers
- plugin host context and manifest types
- logic contribution APIs for commands/tools
- UI contribution APIs for session toolbar items and right panels
- capability client factory

It does not export the app transport, runtime host, Tauri APIs, or any desktop-private implementation.

```ts
import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'
```
