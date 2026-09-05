import { useMemo } from "react";
import { Check, CircleDot, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PsmSessionContextMenuActionRenderProps } from "@pi-session-manager/plugin-sdk";

import { useOptionalAppPluginSurfaceData } from "@/components/app/AppPluginSurfaceData";
import TagBadge from "@/components/tags/TagBadge";
import { getSessionStatusId } from "../board/kanbanBoardModel";
import KanbanLabelBadge from "../labels/KanbanLabelBadge";
import {
  labelsForSession,
  type KanbanLabelsStore,
} from "../labels/kanbanLabelsStore";
import { useKanbanLabelsSnapshot } from "../labels/kanbanLabelsStore";

interface KanbanSessionMetadataMenuProps
  extends PsmSessionContextMenuActionRenderProps {
  labelsStore: KanbanLabelsStore;
}

export default function KanbanSessionMetadataMenu({
  session,
  labelsStore,
}: KanbanSessionMetadataMenuProps) {
  const { t } = useTranslation();
  const surface = useOptionalAppPluginSurfaceData();
  const labelsSnapshot = useKanbanLabelsSnapshot(labelsStore);

  const currentStatusId = useMemo(
    () =>
      surface
        ? getSessionStatusId(surface.tags, surface.sessionTags, session.id)
        : null,
    [session.id, surface],
  );
  const assignedLabels = useMemo(
    () =>
      labelsForSession(
        labelsSnapshot.labels,
        labelsSnapshot.assignments,
        session.id,
      ),
    [labelsSnapshot.assignments, labelsSnapshot.labels, session.id],
  );

  if (!surface) return null;

  return (
    <>
      <div className="session-context-menu__label" role="presentation">
        <span className="inline-flex items-center gap-1">
          <CircleDot className="h-3 w-3" />
          {t("plugins.kanbanBoard.status", "Status")}
        </span>
      </div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={currentStatusId === null}
        className="session-context-menu__item"
        onClick={() => {
          const current = currentStatusId;
          if (!current) return;
          surface.onClearSessionStatus(session.id, current);
        }}
      >
        <span className="session-context-menu__text text-muted-foreground">
          {t("plugins.kanbanBoard.noStatus", "No status")}
        </span>
        {currentStatusId === null ? (
          <Check className="session-context-menu__check text-primary" />
        ) : null}
      </button>
      {surface.tags.map((status) => (
        <button
          key={status.id}
          type="button"
          role="menuitemradio"
          aria-checked={currentStatusId === status.id}
          className="session-context-menu__item"
          onClick={() => {
            if (currentStatusId === status.id) return;
            surface.onMoveSession(session.id, currentStatusId, status.id, 0);
          }}
        >
          <span className="session-context-menu__text inline-flex items-center gap-2">
            <TagBadge tag={status} compact />
            <span className="truncate">{status.name}</span>
          </span>
          {currentStatusId === status.id ? (
            <Check className="session-context-menu__check text-primary" />
          ) : null}
        </button>
      ))}

      <div className="session-context-menu__separator" role="separator" />
      <div className="session-context-menu__label" role="presentation">
        <span className="inline-flex items-center gap-1">
          <Tag className="h-3 w-3" />
          {t("plugins.kanbanBoard.labels", "Labels")}
        </span>
      </div>
      {labelsSnapshot.labels.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {t("plugins.kanbanBoard.labelsEmpty", "No labels")}
        </div>
      ) : (
        labelsSnapshot.labels.map((label) => {
          const assigned = assignedLabels.some((item) => item.id === label.id);
          return (
            <button
              key={label.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={assigned}
              className="session-context-menu__item"
              title={label.description || label.name}
              onClick={() =>
                void labelsStore.toggleLabel(session.id, label.id, !assigned)
              }
            >
              <span className="session-context-menu__text">
                <KanbanLabelBadge label={label} compact />
              </span>
              {assigned ? (
                <Check className="session-context-menu__check text-primary" />
              ) : null}
            </button>
          );
        })
      )}
    </>
  );
}
