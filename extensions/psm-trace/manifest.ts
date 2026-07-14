import type { PsmPluginManifest } from "@pi-session-manager/plugin-sdk";

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: "builtin.trace",
  name: "Active Path Timeline",
  version: "0.2.0",
  runtime: {
    sdk: "^0.1.0",
    host: ">=0.6.3",
  },
  permissions: ["sessions:read"],
};
