import { useMemo } from "react";

import {
  PluginContributionBoundary,
  PluginContributionSlot,
  usePsmPluginSessionUi,
} from "@/plugins/runtime-host";
import type { SessionInfo } from "@/types";

const CODE_REVIEW_TOOLBAR_ID = "builtin.code-review.toolbar";

interface SessionPreviewCodeReviewHostProps {
  session: SessionInfo;
}

/**
 * Mounts code-review plugin toolbar (incl. ToolCallReviewModal + bus listener)
 * outside AppSessionViewerPane so preview modals can open review UI.
 */
export default function SessionPreviewCodeReviewHost({
  session,
}: SessionPreviewCodeReviewHostProps) {
  const { toolbarItems } = usePsmPluginSessionUi();
  const codeReviewItem = useMemo(
    () => toolbarItems.find((item) => item.id === CODE_REVIEW_TOOLBAR_ID),
    [toolbarItems],
  );

  if (!codeReviewItem) {
    return null;
  }

  return (
    <span className="inline-flex items-center no-drag" data-session-preview-code-review-host>
      <PluginContributionBoundary
        pluginId={codeReviewItem.pluginId}
        contributionId={codeReviewItem.id}
        title={codeReviewItem.title}
      >
        <PluginContributionSlot
          render={() =>
            codeReviewItem.render({
              session: {
                path: session.path,
                id: session.id,
                name: session.name,
                cwd: session.cwd,
              },
            })
          }
        />
      </PluginContributionBoundary>
    </span>
  );
}