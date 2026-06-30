import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightOpen, Terminal as TerminalIcon, Pin } from "lucide-react";

import SessionViewer from "@/components/SessionViewer";
import { SortablePinnedPanels, type SessionFeatureItem } from "@/components/session-viewer/SessionViewerPinnedPanels";
import { useSettings } from "@/hooks/useSettings";
import { useDeferredPresence } from "@/hooks/useDeferredPresence";
import { PluginContributionBoundary, PluginContributionSlot, usePsmPluginSessionUi } from "@/plugins/runtime-host";
import type { PsmSessionToolbarItemRuntimeRegistration } from "@/plugins/runtime-host/types";
import type { PsmSessionViewerController } from "@pi-session-manager/plugin-sdk";

const PANEL_ANIMATION_MS = 180;
const SESSION_PANEL_ITEM_LIMIT = 5;
const RIGHT_FEATURE_PANEL_WIDTH_KEY = "__right_feature_picker__";
const RIGHT_PANEL_MIN_WIDTH = 280;
const RIGHT_PANEL_MAX_WIDTH = 720;
const PINNED_RIGHT_PANELS_KEY = "psm:session:pinnedRightPanels" as const;

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
  const [activeBottomPanelId, setActiveBottomPanelId] = useState<string | null>(null);
  const [renderedBottomPanelId, setRenderedBottomPanelId] = useState<string | null>(null);
  const [activeMainViewId, setActiveMainViewId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [viewerController, setViewerController] = useState<PsmSessionViewerController | null>(null);
  const [rightFeaturePickerOpen, setRightFeaturePickerOpen] = useState(false);
  const [bottomFeatureTrayOpen, setBottomFeatureTrayOpen] = useState(false);
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});
  const [pinnedRightPanelIds, setPinnedRightPanelIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(PINNED_RIGHT_PANELS_KEY);
    if (!saved) {
      return [];
    }
    try {
      const parsed = JSON.parse(saved) as unknown;
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const rightPanelResizeRef = useRef<{
    panelId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const togglePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : id));
  }, []);

  const closePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleBottomPanel = useCallback((id: string) => {
    setActiveBottomPanelId((prev) => (prev === id ? null : id));
    setActivePanelId(null);
    setRightFeaturePickerOpen(false);
    setBottomFeatureTrayOpen(false);
  }, []);

  const closeBottomPanel = useCallback((id: string) => {
    setActiveBottomPanelId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleMainView = useCallback((id: string) => {
    setActiveMainViewId((prev) => (prev === id ? null : id));
  }, []);

  const closeMainView = useCallback((id: string) => {
    setActiveMainViewId((prev) => (prev === id ? null : prev));
  }, []);

  const setPanelWidth = useCallback((id: string, width: number) => {
    const nextWidth = Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width));
    setPanelWidths((prev) => ({ ...prev, [id]: nextWidth }));
  }, []);

  const handleRightPanelResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    panelId: string,
    width: number,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    rightPanelResizeRef.current = {
      panelId,
      startX: event.clientX,
      startWidth: width,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const resize = rightPanelResizeRef.current;
      if (!resize) {
        return;
      }
      setPanelWidth(resize.panelId, resize.startWidth + resize.startX - moveEvent.clientX);
    };

    const handlePointerUp = () => {
      rightPanelResizeRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [setPanelWidth]);

  const toggleRightFeaturePanel = useCallback(() => {
    // If picker is open, close it (don't touch panel state)
    if (rightFeaturePickerOpen) {
      setRightFeaturePickerOpen(false);
      return;
    }
    // If a panel is open, close it (and ensure picker is closed)
    if (activePanelId) {
      setActivePanelId(null);
      setRightFeaturePickerOpen(false);
      return;
    }
    // Otherwise open the picker (both were closed)
    setRightFeaturePickerOpen(true);
    setBottomFeatureTrayOpen(false);
    setActiveBottomPanelId(null);
  }, [activePanelId, rightFeaturePickerOpen]);

  // Listen for global shortcut to toggle right panel
  useEffect(() => {
    const handleToggleRightPanel = () => {
      toggleRightFeaturePanel();
    };
    window.addEventListener("psm:toggle-right-panel", handleToggleRightPanel);
    return () => window.removeEventListener("psm:toggle-right-panel", handleToggleRightPanel);
  }, [toggleRightFeaturePanel]);

  const toggleBottomFeatureTray = useCallback(() => {
    // If bottom panel is open, just close it
    if (activeBottomPanelId) {
      setActiveBottomPanelId(null);
      setBottomFeatureTrayOpen(false);
      return;
    }
    // Otherwise toggle the tray
    setBottomFeatureTrayOpen((prev) => {
      const next = !prev;
      if (next) {
        setRightFeaturePickerOpen(false);
        setActivePanelId(null);
      }
      return next;
    });
  }, [activeBottomPanelId]);

  const rightPanels = useMemo(
    () => panels.filter((panel) => (panel.side ?? "right") === "right").slice(0, SESSION_PANEL_ITEM_LIMIT),
    [panels],
  );
  const bottomPanels = useMemo(
    () => panels.filter((panel) => panel.side === "bottom").slice(0, SESSION_PANEL_ITEM_LIMIT),
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
  const activeBottomPanel = useMemo(
    () => bottomPanels.find((panel) => panel.id === activeBottomPanelId) ?? null,
    [activeBottomPanelId, bottomPanels],
  );
  const renderedBottomPanel = useMemo(
    () => activeBottomPanel ?? bottomPanels.find((panel) => panel.id === renderedBottomPanelId) ?? null,
    [activeBottomPanel, renderedBottomPanelId, bottomPanels],
  );
  const rightPanelPresent = useDeferredPresence(Boolean(activePanel), PANEL_ANIMATION_MS);
  const bottomPanelPresent = useDeferredPresence(Boolean(activeBottomPanel), PANEL_ANIMATION_MS);
  const activeMainView = useMemo(
    () => mainViews.find((view) => view.id === activeMainViewId) ?? null,
    [activeMainViewId, mainViews],
  );
  const rightPanelIds = useMemo(
    () => new Set(rightPanels.map((panel) => panel.id)),
    [rightPanels],
  );
  const bottomPanelIds = useMemo(
    () => new Set(bottomPanels.map((panel) => panel.id)),
    [bottomPanels],
  );
  const rightPanelToolbarItems = useMemo(
    () => toolbarItems.filter((item) => item.panelId && rightPanelIds.has(item.panelId)).slice(0, SESSION_PANEL_ITEM_LIMIT),
    [rightPanelIds, toolbarItems],
  );
  const bottomPanelToolbarItems = useMemo(
    () => toolbarItems.filter((item) => item.panelId && bottomPanelIds.has(item.panelId)).slice(0, SESSION_PANEL_ITEM_LIMIT),
    [bottomPanelIds, toolbarItems],
  );
  const toolbarSlotItems = useMemo(
    () => toolbarItems.filter((item) => !item.panelId || (!rightPanelIds.has(item.panelId) && !bottomPanelIds.has(item.panelId))),
    [bottomPanelIds, rightPanelIds, toolbarItems],
  );
  const openPanelDescription = t("session.toolbar.openPanel", "Open panel");
  const terminalTitle = t("terminal.title", "Terminal");
  const terminalDescription = t("terminal.sessionDescription", "Session shell");
  // Pin/unpin handlers for right panel items
  const pinRightPanel = useCallback((panelId: string) => {
    setPinnedRightPanelIds((prev) => (prev.includes(panelId) ? prev : [...prev, panelId]));
  }, []);

  const unpinRightPanel = useCallback((panelId: string) => {
    setPinnedRightPanelIds((prev) => prev.filter((id) => id !== panelId));
    setActivePanelId((prev) => (prev === panelId ? null : prev));
  }, []);

  const validPinnedRightPanelIds = useMemo(() => {
    const availablePanelIds = new Set(rightPanelToolbarItems.map((item) => item.panelId).filter(Boolean));
    return pinnedRightPanelIds.filter((id, index) => availablePanelIds.has(id) && pinnedRightPanelIds.indexOf(id) === index);
  }, [pinnedRightPanelIds, rightPanelToolbarItems]);

  useEffect(() => {
    if (validPinnedRightPanelIds.length !== pinnedRightPanelIds.length
      || validPinnedRightPanelIds.some((id, index) => id !== pinnedRightPanelIds[index])) {
      setPinnedRightPanelIds(validPinnedRightPanelIds);
    }
  }, [pinnedRightPanelIds, validPinnedRightPanelIds]);

  // Save pinned panels when changed
  useEffect(() => {
    localStorage.setItem(PINNED_RIGHT_PANELS_KEY, JSON.stringify(validPinnedRightPanelIds));
  }, [validPinnedRightPanelIds]);

  // Split into pinned and unpinned items
  const { pinnedRightItems, unpinnedRightItems } = useMemo(() => {
    const itemsByPanelId = new Map(rightPanelToolbarItems.map((item) => [item.panelId, item]));
    const pinned = validPinnedRightPanelIds
      .map((panelId) => itemsByPanelId.get(panelId))
      .filter((item): item is PsmSessionToolbarItemRuntimeRegistration => Boolean(item));
    const pinnedPanelIds = new Set(validPinnedRightPanelIds);
    const unpinned = rightPanelToolbarItems.filter((item) => !item.panelId || !pinnedPanelIds.has(item.panelId));
    return { pinnedRightItems: pinned, unpinnedRightItems: unpinned };
  }, [rightPanelToolbarItems, validPinnedRightPanelIds]);

  const rightFeatureItems = useMemo<SessionFeatureItem[]>(() => unpinnedRightItems.map((item) => ({
    id: item.id,
    panelId: item.panelId,
    title: item.title,
    description: openPanelDescription,
    active: item.panelId ? activePanelId === item.panelId : false,
    onSelect: () => {
      if (item.panelId) {
        togglePanel(item.panelId);
      }
    },
    icon: <PanelRightOpen className="h-4 w-4" aria-hidden="true" />,
  })), [activePanelId, openPanelDescription, unpinnedRightItems, togglePanel]);
  const bottomFeatureItems = useMemo<SessionFeatureItem[]>(() => {
    const items: SessionFeatureItem[] = bottomPanelToolbarItems.map((item) => ({
      id: item.id,
      panelId: item.panelId,
      title: item.title,
      description: openPanelDescription,
      active: item.panelId ? activeBottomPanelId === item.panelId : false,
      onSelect: () => {
        if (item.panelId) {
          toggleBottomPanel(item.panelId);
        }
      },
      icon: <TerminalIcon className="h-4 w-4" aria-hidden="true" />,
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
    return items.slice(0, SESSION_PANEL_ITEM_LIMIT);
  }, [
    activeBottomPanelId,
    bottomPanelToolbarItems,
    onToggleTerminalFeature,
    openPanelDescription,
    terminalDescription,
    terminalFeatureEnabled,
    terminalFeatureOpen,
    terminalTitle,
    toggleBottomPanel,
  ]);

  useEffect(() => {
    if (activePanelId) {
      setRenderedPanelId(activePanelId);
      setActiveBottomPanelId(null);
      setRightFeaturePickerOpen(false);
      setBottomFeatureTrayOpen(false);
    }
  }, [activePanelId]);

  useEffect(() => {
    if (activeBottomPanelId) {
      setRenderedBottomPanelId(activeBottomPanelId);
      setActivePanelId(null);
      setRightFeaturePickerOpen(false);
      setBottomFeatureTrayOpen(false);
    }
  }, [activeBottomPanelId]);

  useEffect(() => {
    if (terminalFeatureOpen) {
      setRightFeaturePickerOpen(false);
      setBottomFeatureTrayOpen(false);
    }
  }, [terminalFeatureOpen]);

  const renderToolbarItem = useCallback((item: PsmSessionToolbarItemRuntimeRegistration) => {
    const panelId = item.panelId;
    const mainViewId = item.mainViewId;
    const isRightPanelItem = panelId ? rightPanelIds.has(panelId) : false;
    const isBottomPanelItem = panelId ? bottomPanelIds.has(panelId) : false;
    return (
      <Fragment key={item.id}>
        <PluginContributionBoundary pluginId={item.pluginId} contributionId={item.id} title={item.title}>
          <PluginContributionSlot render={() => item.render({
            session,
            activeEntryId,
            panelOpen: panelId
              ? isBottomPanelItem
                ? activeBottomPanelId === panelId
                : activePanelId === panelId
              : undefined,
            togglePanel: panelId
              ? () => {
                if (isBottomPanelItem) {
                  toggleBottomPanel(panelId);
                } else if (isRightPanelItem) {
                  togglePanel(panelId);
                }
              }
              : undefined,
            mainViewOpen: mainViewId ? activeMainViewId === mainViewId : undefined,
            toggleMainView: mainViewId ? () => toggleMainView(mainViewId) : undefined,
            viewer: viewerController ?? undefined,
          })} />
        </PluginContributionBoundary>
      </Fragment>
    );
  }, [
    activeBottomPanelId,
    activeEntryId,
    activeMainViewId,
    activePanelId,
    bottomPanelIds,
    rightPanelIds,
    session,
    toggleBottomPanel,
    toggleMainView,
    togglePanel,
    viewerController,
  ]);

  const featureToggleClass = "p-1.5 text-xs rounded border border-border/70 bg-secondary hover:bg-secondary-hover active:bg-secondary-hover transition-colors";
  const featureToggleActiveClass = "border-primary/35 bg-primary/12 text-foreground";
  const featureToggleInactiveClass = "text-muted-foreground";
  const rightFeatureToggleLabel = t("session.toolbar.rightPanelButtons", "Right panel buttons");
  const bottomFeatureToggleLabel = t("session.toolbar.sessionFeatures", "Session features");
  const pinToToolbarLabel = t("session.toolbar.pinToToolbar", "Pin to toolbar");
  const unpinFromToolbarLabel = t("session.toolbar.unpinFromToolbar", "Unpin from toolbar");
  const dragPinnedPanelLabel = t("session.toolbar.dragPinnedPanel", "Drag to reorder");

  const sessionToolbarSlot = useMemo(() => {
    const singleBottomItem = bottomFeatureItems.length === 1 ? bottomFeatureItems[0] : null;
    return (
      <>
        {slots?.right}
        {toolbarSlotItems.map(renderToolbarItem)}
        {singleBottomItem && (
          <button
            type="button"
            className={`${featureToggleClass} ${singleBottomItem.active ? featureToggleActiveClass : featureToggleInactiveClass}`}
            onClick={singleBottomItem.onSelect}
            aria-pressed={singleBottomItem.active}
            aria-label={singleBottomItem.title}
            title={singleBottomItem.title}
          >
            {singleBottomItem.icon}
          </button>
        )}
        {bottomFeatureItems.length > 1 && (
          <button
            type="button"
            className={`${featureToggleClass} ${bottomFeatureTrayOpen ? featureToggleActiveClass : featureToggleInactiveClass}`}
            onClick={toggleBottomFeatureTray}
            aria-expanded={bottomFeatureTrayOpen}
            aria-label={bottomFeatureToggleLabel}
            title={bottomFeatureToggleLabel}
          >
            <TerminalIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <SortablePinnedPanels
          items={pinnedRightItems}
          activePanelId={activePanelId}
          onUnpin={unpinRightPanel}
          onReorder={setPinnedRightPanelIds}
          renderItem={renderToolbarItem}
          unpinLabel={unpinFromToolbarLabel}
          dragLabel={dragPinnedPanelLabel}
        />
        {rightFeatureItems.length > 0 && (
          <button
            type="button"
            className={`${featureToggleClass} ${rightFeaturePickerOpen ? featureToggleActiveClass : featureToggleInactiveClass}`}
            onClick={toggleRightFeaturePanel}
            aria-expanded={rightFeaturePickerOpen}
            aria-label={rightFeatureToggleLabel}
            title={rightFeatureToggleLabel}
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </>
    );
  }, [
    bottomFeatureItems,
    bottomFeatureToggleLabel,
    bottomFeatureTrayOpen,
    dragPinnedPanelLabel,
    pinnedRightItems,
    renderToolbarItem,
    rightFeatureItems.length,
    rightFeaturePickerOpen,
    rightFeatureToggleLabel,
    slots?.right,
    toggleBottomFeatureTray,
    toggleRightFeaturePanel,
    unpinFromToolbarLabel,
    activePanelId,
    toolbarSlotItems,
  ]);

  const rightFeaturePanelWidth = panelWidths[RIGHT_FEATURE_PANEL_WIDTH_KEY] ?? 430;
  const rightFeaturePanel = useMemo(() => (rightFeaturePickerOpen && rightFeatureItems.length > 0 ? (
    <aside className="psm-session-right-feature-panel" style={{ width: rightFeaturePanelWidth }} data-no-window-drag>
      <div
        className="psm-session-right-panel__resize-handle"
        data-no-window-drag
        onPointerDown={(event) => handleRightPanelResizePointerDown(event, RIGHT_FEATURE_PANEL_WIDTH_KEY, rightFeaturePanelWidth)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("session.toolbar.resizeRightPanel", "Resize right panel")}
      />
      <div className="psm-session-right-feature-panel__grid">
        {rightFeatureItems.map((item) => (
          <div
            key={item.id}
            className={`psm-session-feature-card-wrapper relative ${item.active ? "psm-session-feature-card--active" : ""}`}
          >
            <button
              type="button"
              onClick={() => {
                const isClosingCurrentPanel = item.panelId && activePanelId === item.panelId;
                item.onSelect();
                // Close picker when closing current panel
                if (isClosingCurrentPanel) {
                  setRightFeaturePickerOpen(false);
                }
              }}
              className={`psm-session-feature-card psm-session-feature-card--side ${item.active ? "psm-session-feature-card--active" : ""}`}
              aria-pressed={item.active}
              aria-label={item.title}
            >
              {item.icon}
              <span className="psm-session-feature-card__title">{item.title}</span>
              <span className="psm-session-feature-card__description">{item.description}</span>
            </button>
            {/* Pin button - always visible on hover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (item.panelId) {
                  pinRightPanel(item.panelId);
                }
              }}
              className="psm-session-feature-card__pin-button"
              aria-label={`${pinToToolbarLabel}: ${item.title}`}
              title={`${pinToToolbarLabel}: ${item.title}`}
            >
              <Pin className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  ) : null), [activePanelId, handleRightPanelResizePointerDown, pinRightPanel, pinToToolbarLabel, rightFeatureItems, rightFeaturePanelWidth, rightFeaturePickerOpen, t]);

  const bottomFeatureTray = useMemo(() => (bottomFeatureTrayOpen && bottomFeatureItems.length > 1 ? (
    <div className="psm-session-bottom-features" data-no-window-drag>
      <div className="psm-session-bottom-features__panel">
        <div className="psm-session-bottom-features__grid">
          {bottomFeatureItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                item.onSelect();
                setBottomFeatureTrayOpen(false);
                setRightFeaturePickerOpen(false);
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
    </div>
  ) : null), [bottomFeatureItems, bottomFeatureTrayOpen]);

  const rightPanelSlot = useMemo(() => (rightPanelPresent && renderedPanel ? (
    <aside
      className={`psm-session-right-panel ${activePanel ? "psm-session-right-panel--open" : "psm-session-right-panel--closed"}`}
      style={{ width: panelWidths[renderedPanel.id] ?? 380 }}
      data-no-window-drag
      aria-hidden={!activePanel}
    >
      <div
        className="psm-session-right-panel__resize-handle"
        data-no-window-drag
        onPointerDown={(event) => handleRightPanelResizePointerDown(event, renderedPanel.id, panelWidths[renderedPanel.id] ?? 380)}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("session.toolbar.resizeRightPanel", "Resize right panel")}
      />
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
            viewer: viewerController ?? undefined,
          })} />
        </PluginContributionBoundary>
      </div>
    </aside>
  ) : null), [
    activeEntryId,
    activePanel,
    closePanel,
    handleRightPanelResizePointerDown,
    panelWidths,
    renderedPanel,
    rightPanelPresent,
    rightPanels,
    session,
    setPanelWidth,
    t,
    viewerController,
  ]);

  const bottomPanelSlot = useMemo(() => (bottomPanelPresent && renderedBottomPanel ? (
    <div
      className={`psm-session-bottom-panel ${activeBottomPanel ? "psm-session-bottom-panel--open" : "psm-session-bottom-panel--closed"}`}
      data-no-window-drag
      aria-hidden={!activeBottomPanel}
    >
      {bottomPanels.length > 1 && (
        <div className="relative z-10 flex items-center gap-1 border-b border-border/70 bg-background/20 px-2 py-2" data-no-window-drag>
          {bottomPanels.map((panel) => {
            const active = panel.id === renderedBottomPanel.id;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => setActiveBottomPanelId(panel.id)}
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
        <PluginContributionBoundary pluginId={renderedBottomPanel.pluginId} contributionId={renderedBottomPanel.id} title={renderedBottomPanel.title}>
          <PluginContributionSlot render={() => renderedBottomPanel.render({
            session,
            activeEntryId,
            panelOpen: Boolean(activeBottomPanel),
            closePanel: () => closeBottomPanel(renderedBottomPanel.id),
            viewer: viewerController ?? undefined,
          })} />
        </PluginContributionBoundary>
      </div>
    </div>
  ) : null), [
    activeBottomPanel,
    activeEntryId,
    bottomPanelPresent,
    bottomPanels,
    closeBottomPanel,
    renderedBottomPanel,
    session,
    viewerController,
  ]);

  const mainViewSlot = useMemo(() => (activeMainView ? (
    <PluginContributionBoundary pluginId={activeMainView.pluginId} contributionId={activeMainView.id} title={activeMainView.title}>
      <PluginContributionSlot render={() => activeMainView.render({
        session,
        activeEntryId,
        mainViewOpen: true,
        closeMainView: () => closeMainView(activeMainView.id),
        viewer: viewerController ?? undefined,
      })} />
    </PluginContributionBoundary>
  ) : null), [activeEntryId, activeMainView, closeMainView, session, viewerController]);
  const mergedSlots = useMemo(
    () => ({ ...slots, right: sessionToolbarSlot }),
    [sessionToolbarSlot, slots],
  );
  const layoutSlots = useMemo(
    () => ({
      right: <>{rightFeaturePanel}{rightPanelSlot}</>,
      bottom: <>{bottomPanelSlot}{bottomFeatureTray}</>,
    }),
    [bottomFeatureTray, bottomPanelSlot, rightFeaturePanel, rightPanelSlot],
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
      onViewerControllerChange={setViewerController}
    />
  );
}

export default AppSessionViewerPane;
