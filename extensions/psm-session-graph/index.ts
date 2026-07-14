import { createElement } from "react";
import type {
  PsmPluginHostContext,
  PsmSessionTreeViewRenderProps,
} from "@pi-session-manager/plugin-sdk";

import SessionGraphView from "./SessionGraphView";
import { manifest } from "./manifest";

export { manifest };

function renderBranchMap(props: PsmSessionTreeViewRenderProps) {
  return createElement(SessionGraphView, {
    entries: props.entries,
    activeEntryId: props.activeEntryId ?? undefined,
    onNavigate: props.onNavigate,
    labelsByTargetId: props.labelsByTargetId,
  });
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionTreeView({
    id: "builtin.session-graph.flow",
    title: "Branch Map",
    icon: "Map",
    render: renderBranchMap,
  });
}
