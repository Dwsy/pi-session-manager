import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightOpen, Plus, Terminal as TerminalIcon, X } from "lucide-react";

import SessionViewer from "@/components/SessionViewer";
import { useSettings } from "@/hooks/useSettings";
import { useDeferredPresence } from "@/hooks/useDeferredPresence";
import { PluginContributionBoundary, PluginContributionSlot, usePsmPluginSessionUi } from "@/plugins/runtime-host";
import type { PsmSessionToolbarItemRuntimeRegistration } from "@/plugins/runtime-host/types";

const RIGHT_PANEL_BUTTONS_PINNED_KEY = "pi-session-manager-right-panel-buttons-pinned";
const PANEL_ANIMATION_MS = 180;
const DOCK_DRAG_THRESHOLD_PX = 6;

interface SessionFeatureItem {
  id: string;
  title: string;
  description: string;
  active: boolean;
  onSelect: () => void;
  icon: ReactNode;
}

export interface AppSessionViewerPaneProps extends Pick<
  ComponentProps<typeof SessionViewer>,
  | "session"
  | "onExport"
  | "onConvert"
  | "onRename"
  | "onFork"
  | "onBack"
  | "onWebResume"
  | "onResumeSession"
  | "terminal"
  | "piPath"
  | "customCommand"
  | "resumeCommand"
  | "slots"
  | "initialEntryId"
> {
  terminalFeatureEnabled?: boolean;
  terminalFeatureOpen?: boolean;
  onToggleTerminalFeature?: () => void;
}

function AppSessionViewerPane({
  session,
  onExport,
  onConvert,
  onRename,
  onFork,
  onBack,
  onWebResume,
  onResumeSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  initialEntryId,
  slots,
  terminalFeatureEnabled = false,
  terminalFeatureOpen = false,
  onToggleTerminalFeature,
}: AppSessionViewerPaneProps) {
  const { t } = useTranslation();
  const { getSessionSetting } = useSettings();
  const conversationModeEnabled = getSessionSetting("conversationModeEnabled") !== false;
  const { toolbarItems, panels, treeViews, mainViews = [] } = usePsmPluginSessionUi();
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [renderedPanelId, setRenderedPanelId] = useState<string | null>(null);
  const [activeMainViewId, setActiveMainViewId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [bottomFeatureTrayOpen, setBottomFeatureTrayOpen] = useState(false);
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});
  const [rightPanelButtonsPinned, setRightPanelButtonsPinned] = useState(() => {
    try {
      return localStorage.getItem(RIGHT_PANEL_BUTTONS_PINNED_KEY) === "toolbar";
    } catch {
      return false;
    }
  });
  const dockDragRef = useRef<{
    node: HTMLDivElement | null;
    mode: "floating" | "toolbar";
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    captured: boolean;
  } | null>(null);
  const dockDragFrameRef = useRef<number | null>(null);
  const suppressDockClickRef = useRef(false);

  const togglePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : id));
  }, []);

  const closePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleMainView = useCallback((id: string) => {
    setActiveMainViewId((prev) => (prev === id ? null : id));
  }, []);

  const closeMainView = useCallback((id: string) => {
    setActiveMainViewId((prev) => (prev === id ? null : prev));
  }, []);

  const setPanelWidth = useCallback((id: string, width: number) => {
    setPanelWidths((prev) => ({ ...prev, [id]: width }));
  }, []);

  const setRightPanelButtonsPinnedMode = useCallback((pinned: boolean) => {
    setRightPanelButtonsPinned(pinned);
    try {
      localStorage.setItem(RIGHT_PANEL_BUTTONS_PINNED_KEY, pinned ? "toolbar" : "floating");
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }, []);

  const scheduleDockTransform = useCallback((node: HTMLDivElement, x: number, y: number) => {
    if (dockDragFrameRef.current !== null) {
      window.cancelAnimationFrame(dockDragFrameRef.current);
    }
    dockDragFrameRef.current = window.requestAnimationFrame(() => {
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      dockDragFrameRef.current = null;
    });
  }, []);

  const resetDockTransform = useCallback((node: HTMLDivElement) => {
    if (dockDragFrameRef.current !== null) {
      window.cancelAnimationFrame(dockDragFrameRef.current);
      dockDragFrameRef.current = null;
    }
    node.style.transform = "";
  }, []);

  const isPointerInToolbarDropZone = useCallback((event: ReactPointerEvent) => {
    const toolbar = document.querySelector("[data-session-toolbar-right]");
    const rect = toolbar?.getBoundingClientRect();
    if (!rect) {
      return event.clientY <= 64;
    }
    const padding = 28;
    return (
      event.clientX >= rect.left - padding &&
      event.clientX <= rect.right + padding &&
      event.clientY >= rect.top - padding &&
      event.clientY <= rect.bottom + padding
    );
  }, []);

  const isPointerAtRightDock = useCallback((event: ReactPointerEvent) => (
    window.innerWidth - event.clientX <= 96
  ), []);

  const handleDockPointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    mode: "floating" | "toolbar",
  ) => {
    if (event.button !== 0) {
      return;
    }
    dockDragRef.current = {
      node: event.currentTarget,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      captured: false,
    };
  }, []);

  const handleDockPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.node) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(deltaX, deltaY) < DOCK_DRAG_THRESHOLD_PX) {
      return;
    }

    drag.dragging = true;
    suppressDockClickRef.current = true;
    drag.node.dataset.dragging = "true";
    if (!drag.captured) {
      drag.node.setPointerCapture?.(event.pointerId);
      drag.captured = true;
    }
    scheduleDockTransform(drag.node, deltaX, deltaY);
  }, [scheduleDockTransform]);

  const handleDockPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.node) {
      return;
    }

    const wasDragging = drag.dragging;
    if (drag.captured) {
      drag.node.releasePointerCapture?.(event.pointerId);
    }
    delete drag.node.dataset.dragging;
    resetDockTransform(drag.node);
    dockDragRef.current = null;

    if (!wasDragging) {
      return;
    }

    event.preventDefault();
    if (drag.mode === "floating" && isPointerInToolbarDropZone(event)) {
      setRightPanelButtonsPinnedMode(true);
    } else if (drag.mode === "toolbar" && isPointerAtRightDock(event)) {
      setRightPanelButtonsPinnedMode(false);
    }
  }, [isPointerAtRightDock, isPointerInToolbarDropZone, resetDockTransform, setRightPanelButtonsPinnedMode]);

  const handleDockClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressDockClickRef.current) {
      return;
    }
    suppressDockClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const rightPanels = useMemo(
    () => panels.filter((panel) => (panel.side ?? "right") === "right"),
    [panels],
  );
  const activePanel = useMemo(
    () => rightPanels.find((panel) => panel.id === activePanelId) ?? null,
    [activePanelId, rightPanels],
  );
  const renderedPanel = useMemo(
    () => activePanel ?? rightPanels.find((panel) => panel.id === renderedPanelId) ?? null,
    [activePanel, renderedPanelId, rightPanels],
  );
  const rightPanelPresent = useDeferredPresence(Boolean(activePanel), PANEL_ANIMATION_MS);
  const activeMainView = useMemo(
    () => mainViews.find((view) => view.id === activeMainViewId) ?? null,
    [activeMainViewId, mainViews],
  );
  const rightPanelIds = useMemo(
    () => new Set(rightPanels.map((panel) => panel.id)),
    [rightPanels],
  );
  const rightPanelToolbarItems = useMemo(
    () => toolbarItems.filter((item) => item.panelId && rightPanelIds.has(item.panelId)),
    [rightPanelIds, toolbarItems],
  );
  const toolbarSlotItems = useMemo(
    () => toolbarItems.filter((item) => !item.panelId || !rightPanelIds.has(item.panelId)),
    [rightPanelIds, toolbarItems],
  );
  const openPanelDescription = t("session.toolbar.openPanel", "Open panel");
  const terminalTitle = t("terminal.title", "Terminal");
  const terminalDescription = t("terminal.sessionDescription", "Session shell");
  const sessionFeatureItems = useMemo<SessionFeatureItem[]>(() => {
    const items = rightPanelToolbarItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: openPanelDescription,
      active: item.panelId ? activePanelId === item.panelId : false,
      onSelect: () => {
        if (item.panelId) {
          togglePanel(item.panelId);
        }
      },
      icon: <PanelRightOpen className="h-4 w-4" aria-hidden="true" />,
    }));
    if (terminalFeatureEnabled && onToggleTerminalFeature) {
      items.push({
        id: "builtin.terminal.feature",
        title: terminalTitle,
        description: terminalDescription,
        active: terminalFeatureOpen,
        onSelect: onToggleTerminalFeature,
        icon: <TerminalIcon className="h-4 w-4" aria-hidden="true" />,
      });
    }
    return items;
  }, [
    activePanelId,
    onToggleTerminalFeature,
    openPanelDescription,
    rightPanelToolbarItems,
    terminalDescription,
    terminalFeatureEnabled,
    terminalFeatureOpen,
    terminalTitle,
    togglePanel,
  ]);

  useEffect(() => {
    if (activePanelId) {
      setRenderedPanelId(activePanelId);
    }
  }, [activePanelId]);

  const renderToolbarItem = useCallback((item: PsmSessionToolbarItemRuntimeRegistration) => {
    const panelId = item.panelId;
    const mainViewId = item.mainViewId;
    return (
      <Fragment key={item.id}>
        <PluginContributionBoundary pluginId={item.pluginId} contributionId={item.id} title={item.title}>
          <PluginContributionSlot render={() => item.render({
            session,
            activeEntryId,
            panelOpen: panelId ? activePanelId === panelId : undefined,
            togglePanel: panelId ? () => togglePanel(panelId) : undefined,
            mainViewOpen: mainViewId ? activeMainViewId === mainViewId : undefined,
            toggleMainView: mainViewId ? () => toggleMainView(mainViewId) : undefined,
          })} />
        </PluginContributionBoundary>
      </Fragment>
    );
  }, [activeEntryId, activeMainViewId, activePanelId, session, toggleMainView, togglePanel]);

  const sessionToolbarSlot = useMemo(() => (
    <>
      {slots?.right}
      {toolbarSlotItems.map(renderToolbarItem)}
      {rightPanelButtonsPinned && sessionFeatureItems.length > 0 && (
        <div
          className="psm-session-right-panel-toolbar-dock"
          data-no-window-drag
          onPointerDown={(event) => handleDockPointerDown(event, "toolbar")}
          onPointerMove={handleDockPointerMove}
          onPointerUp={handleDockPointerUp}
          onClickCapture={handleDockClickCapture}
          title={t("session.toolbar.dragRightPanelButtons", "Drag to the right edge to unpin")}
          aria-label={t("session.toolbar.rightPanelButtons", "Right panel buttons")}
        >
          {sessionFeatureItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              className={`psm-session-feature-card psm-session-feature-card--toolbar ${item.active ? "psm-session-feature-card--active" : ""}`}
              aria-pressed={item.active}
              title={item.title}
            >
              {item.icon}
              <span className="sr-only">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  ), [
    handleDockClickCapture,
    handleDockPointerDown,
    handleDockPointerMove,
    handleDockPointerUp,
    renderToolbarItem,
    rightPanelButtonsPinned,
    sessionFeatureItems,
    slots?.right,
    t,
    toolbarSlotItems,
  ]);

  const floatingRightPanelButtons = useMemo(() => (!rightPanelButtonsPinned && sessionFeatureItems.length > 0 ? (
    <div
      className="psm-session-right-panel-floating-dock"
      data-no-window-drag
      onPointerDown={(event) => handleDockPointerDown(event, "floating")}
      onPointerMove={handleDockPointerMove}
      onPointerUp={handleDockPointerUp}
      onClickCapture={handleDockClickCapture}
      title={t("session.toolbar.dragRightPanelButtonsToToolbar", "Drag to the toolbar to pin")}
      aria-label={t("session.toolbar.rightPanelButtons", "Right panel buttons")}
    >
      {sessionFeatureItems.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onSelect}
          className={`psm-session-feature-card psm-session-feature-card--side ${item.active ? "psm-session-feature-card--active" : ""}`}
          aria-pressed={item.active}
        >
          {item.icon}
          <span className="psm-session-feature-card__title">{item.title}</span>
          <span className="psm-session-feature-card__description">{item.description}</span>
        </button>
      ))}
    </div>
  ) : null), [
    handleDockClickCapture,
    handleDockPointerDown,
    handleDockPointerMove,
    handleDockPointerUp,
    rightPanelButtonsPinned,
    sessionFeatureItems,
    t,
  ]);

  const bottomFeatureTray = useMemo(() => (sessionFeatureItems.length > 0 ? (
    <div className="psm-session-bottom-features" data-no-window-drag>
      <button
        type="button"
        className="psm-session-bottom-features__toggle"
        onClick={() => setBottomFeatureTrayOpen((value) => !value)}
        aria-expanded={bottomFeatureTrayOpen}
        aria-label={t("session.toolbar.sessionFeatures", "Session features")}
      >
        {bottomFeatureTrayOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {bottomFeatureTrayOpen && (
        <div className="psm-session-bottom-features__panel">
          <div className="psm-session-bottom-features__grid">
            {sessionFeatureItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onSelect();
                  setBottomFeatureTrayOpen(false);
                }}
                className={`psm-session-feature-card psm-session-feature-card--bottom ${item.active ? "psm-session-feature-card--active" : ""}`}
                aria-pressed={item.active}
              >
                {item.icon}
                <span className="psm-session-feature-card__title">{item.title}</span>
                <span className="psm-session-feature-card__description">{item.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null), [bottomFeatureTrayOpen, sessionFeatureItems, t]);

  const rightPanelSlot = useMemo(() => (rightPanelPresent && renderedPanel ? (
    <aside
      className={`psm-session-right-panel ${activePanel ? "psm-session-right-panel--open" : "psm-session-right-panel--closed"}`}
      style={{ width: panelWidths[renderedPanel.id] ?? 380 }}
      data-no-window-drag
      aria-hidden={!activePanel}
    >
      {rightPanels.length > 1 && (
        <div className="relative z-10 flex items-center gap-1 border-b border-border/70 bg-background/20 px-2 py-2" data-no-window-drag>
          {rightPanels.map((panel) => {
            const active = panel.id === renderedPanel.id;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => setActivePanelId(panel.id)}
                data-no-window-drag
                className={[
                  "inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "border-primary/30 bg-primary/12 text-foreground"
                    : "border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/25 hover:text-foreground",
                ].join(" ")}
              >
                {panel.title}
              </button>
            );
          })}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden" data-no-window-drag>
        <PluginContributionBoundary pluginId={renderedPanel.pluginId} contributionId={renderedPanel.id} title={renderedPanel.title}>
          <PluginContributionSlot render={() => renderedPanel.render({
            session,
            activeEntryId,
            panelOpen: Boolean(activePanel),
            closePanel: () => closePanel(renderedPanel.id),
            width: panelWidths[renderedPanel.id] ?? 380,
            onWidthChange: (width) => setPanelWidth(renderedPanel.id, width),
          })} />
        </PluginContributionBoundary>
      </div>
    </aside>
  ) : null), [
    activeEntryId,
    activePanel,
    closePanel,
    panelWidths,
    renderedPanel,
    rightPanelPresent,
    rightPanels,
    session,
    setPanelWidth,
  ]);

  const mainViewSlot = useMemo(() => (activeMainView ? (
    <PluginContributionBoundary pluginId={activeMainView.pluginId} contributionId={activeMainView.id} title={activeMainView.title}>
      <PluginContributionSlot render={() => activeMainView.render({
        session,
        activeEntryId,
        mainViewOpen: true,
        closeMainView: () => closeMainView(activeMainView.id),
      })} />
    </PluginContributionBoundary>
  ) : null), [activeEntryId, activeMainView, closeMainView, session]);
  const mergedSlots = useMemo(
    () => ({ ...slots, right: sessionToolbarSlot }),
    [sessionToolbarSlot, slots],
  );
  const layoutSlots = useMemo(
    () => ({
      right: <>{floatingRightPanelButtons}{rightPanelSlot}</>,
      bottom: bottomFeatureTray,
    }),
    [bottomFeatureTray, floatingRightPanelButtons, rightPanelSlot],
  );

  return (
    <SessionViewer
      session={session}
      onExport={onExport}
      onConvert={onConvert}
      onRename={onRename}
      onFork={onFork}
      onBack={onBack}
      onWebResume={onWebResume}
      onResumeSession={onResumeSession}
      terminal={terminal}
      piPath={piPath}
      customCommand={customCommand}
      resumeCommand={resumeCommand}
      initialEntryId={initialEntryId}
      previewVariant={conversationModeEnabled ? "conversation" : "none"}
      slots={mergedSlots}
      layoutSlots={layoutSlots}
      mainViewSlot={mainViewSlot}
      pluginTreeViews={treeViews}
      onActiveEntryIdChange={setActiveEntryId}
    />
  );
}

export default AppSessionViewerPane;
