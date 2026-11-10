import type { PsmPluginHostContext } from "@dwsy/plugin-sdk";
import { crossAgentToolRenderer } from "./renderer";

export { manifest } from "./manifest";
export { crossAgentToolRenderer } from "./renderer";

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(crossAgentToolRenderer);
}
