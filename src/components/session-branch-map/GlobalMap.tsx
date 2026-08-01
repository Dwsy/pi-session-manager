import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GlobalMapSettings, SessionModel } from "@/utils/session-branch";
import {
  buildTopologyLayout,
  buildTopologyProjection,
} from "@/utils/session-branch";
import { formatNumber } from "@/utils/session-branch";
import { CollapseIcon, ExpandIcon } from "./Icons";
import { GlobalMapCanvas } from "./GlobalMapCanvas";
import { GlobalMapToolbar } from "./GlobalMapToolbar";

interface GlobalMapProps {
  model: SessionModel;
  activeLeafUid: string;
  selectedUid: string;
  settings: GlobalMapSettings;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSettingsChange: (settings: GlobalMapSettings) => void;
  onSelectNode: (uid: string) => void;
  onActivateNode: (uid: string) => void;
  onOpenAtlas: () => void;
}

export function GlobalMap({
  model,
  activeLeafUid,
  selectedUid,
  settings,
  collapsed,
  onCollapsedChange,
  onSettingsChange,
  onSelectNode,
  onActivateNode,
  onOpenAtlas,
}: GlobalMapProps): React.ReactElement {
  const { t } = useTranslation();
  const projection = useMemo(() => {
    const layout = buildTopologyLayout(model, settings.axis);
    return buildTopologyProjection(
      layout,
      settings,
      activeLeafUid,
      selectedUid,
    );
  }, [model, settings, activeLeafUid, selectedUid]);

  const summary = t("components.branchMap.summary", {
    segments: formatNumber(model.segments.length),
    forks: formatNumber(model.forks.length),
    events: formatNumber(projection.events.length),
    defaultValue: "{{segments}} linear · {{forks}} forks · {{events}} events",
  });

  return (
    <section
      className={`global-map-panel branch-map-panel ${collapsed ? "is-collapsed" : ""}`}
      aria-label={t("components.branchMap.ariaLabel", "Pi branch map")}
    >
      <div className="global-map-head">
        <div className="global-map-title">
          <strong>{t("components.branchMap.title", "BRANCH MAP")}</strong>
          <span>{summary}</span>
        </div>
        <div className="global-map-head-actions">
          <span
            className="map-semantic-chip"
            title={t(
              "components.branchMap.forkOnlyHierarchyHelp",
              "The parentId chain is not rendered as a nested UI hierarchy",
            )}
          >
            {t(
              "components.branchMap.forkOnlyHierarchy",
              "fork-only hierarchy",
            )}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenAtlas}
            title={t(
              "components.branchMap.openAtlas",
              "Open zoomable Branch Atlas",
            )}
          >
            <ExpandIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onCollapsedChange(!collapsed)}
            title={
              collapsed
                ? t("components.branchMap.expand", "Expand Branch Map")
                : t("components.branchMap.collapse", "Collapse Branch Map")
            }
          >
            <CollapseIcon className={collapsed ? "is-rotated" : ""} />
          </button>
        </div>
      </div>
      {!collapsed ? (
        <>
          <GlobalMapToolbar
            model={model}
            settings={settings}
            onSettingsChange={onSettingsChange}
            compact
          />
          <GlobalMapCanvas
            model={model}
            activeLeafUid={activeLeafUid}
            selectedUid={selectedUid}
            settings={settings}
            mode="overview"
            onSelectNode={onSelectNode}
            onActivateNode={onActivateNode}
          />
          <div className="global-map-legend" aria-hidden="true">
            <span>
              <i className="legend-line rail" />
              {t("components.branchMap.legend.linear", "Linear segment")}
            </span>
            <span>
              <i className="legend-line active" />
              {t("components.branchMap.legend.active", "Active branch")}
            </span>
            <span>
              <i className="legend-node fork" />
              {t("components.branchMap.legend.fork", "Real fork")}
            </span>
            <span>
              <i className="legend-node event" />
              {t("components.branchMap.legend.event", "Filtered event")}
            </span>
            <span>
              <i className="legend-note label" />
              {t("components.branchMap.legend.note", "Semantic note")}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
