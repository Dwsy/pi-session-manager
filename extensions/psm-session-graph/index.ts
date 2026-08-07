import { createElement } from "react";
import type { PsmPluginHostContext } from "@pi-session-manager/plugin-sdk";

import SessionGraphView from "./SessionGraphView";
import { manifest } from "./manifest";

export { manifest };

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionTreeView({
    id: "builtin.session-graph.flow",
    title: "Branch Map",
    icon: "Map",
    render: (props) => createElement(SessionGraphView, {
      client: ctx.psm,
      session: props.session,
      entries: props.entries,
      activeEntryId: props.activeEntryId ?? undefined,
      onNavigate: props.onNavigate,
      labelsByTargetId: props.labelsByTargetId,
    }),
  });
}
