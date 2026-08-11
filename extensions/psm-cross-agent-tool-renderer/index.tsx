import type { PsmPluginHostContext } from "@pi-session-manager/plugin-sdk";
import { crossAgentToolRenderer } from "./renderer";

export { manifest } from "./manifest";
export { crossAgentToolRenderer } from "./renderer";

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(crossAgentToolRenderer);
}
