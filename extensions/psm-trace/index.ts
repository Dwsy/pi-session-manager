import { createElement } from "react";
import type { PsmPluginHostContext } from "@pi-session-manager/plugin-sdk";

import { manifest } from "./manifest";
import TraceToolbarButton from "./TraceToolbarButton";
import TraceView from "./TraceView";
import type { TraceSessionReference } from "./sessionEntries";

export { manifest };

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerSessionToolbarItem({
    id: "builtin.trace.toolbar",
    title: "Trace",
    mainViewId: "builtin.trace.main",
    render: (props) =>
      createElement(TraceToolbarButton, {
        i18n: ctx.i18n,
        open: Boolean(props.mainViewOpen),
        onToggle: props.toggleMainView ?? (() => {}),
      }),
  });

  ctx.ui.registerSessionMainView({
    id: "builtin.trace.main",
    title: "Trace",
    render: (props) =>
      createElement(TraceView, {
        client: ctx.psm,
        session: props.session as TraceSessionReference,
        activeEntryId: props.activeEntryId,
        viewer: props.viewer,
        onClose: props.closeMainView ?? (() => {}),
      }),
  });
}
