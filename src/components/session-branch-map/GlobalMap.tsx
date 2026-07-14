import { useMemo } from "react";
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
  const projection = useMemo(() => {
    const layout = buildTopologyLayout(model, settings.axis);
    return buildTopologyProjection(
      layout,
      settings,
      activeLeafUid,
      selectedUid,
    );
  }, [model, settings, activeLeafUid, selectedUid]);

  const summary = `${formatNumber(model.segments.length)} linear · ${formatNumber(model.forks.length)} forks · ${formatNumber(projection.events.length)} events`;

  return (
    <section
      className={`global-map-panel branch-map-panel ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Pi 分支地图"
    >
      <div className="global-map-head">
        <div className="global-map-title">
          <strong>BRANCH MAP</strong>
          <span>{summary}</span>
        </div>
        <div className="global-map-head-actions">
          <span
            className="map-semantic-chip"
            title="parentId 链不会被逐条解释为 UI 层级"
          >
            fork-only hierarchy
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenAtlas}
            title="打开可缩放 Branch Atlas"
          >
            <ExpandIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? "展开 Branch Map" : "收起 Branch Map"}
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
              线性段
            </span>
            <span>
              <i className="legend-line active" />
              活跃分支
            </span>
            <span>
              <i className="legend-node fork" />
              真实分叉
            </span>
            <span>
              <i className="legend-node event" />
              筛选事件
            </span>
            <span>
              <i className="legend-note label" />
              语义注记
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
