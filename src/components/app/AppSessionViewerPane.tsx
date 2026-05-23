import { Fragment, useCallback, useState } from "react";
import type { ComponentProps } from "react";

import SessionViewer from "@/components/SessionViewer";
import { useSettings } from "@/hooks/useSettings";
import { PluginContributionBoundary, PluginContributionSlot, usePsmPluginSessionUi } from "@/plugins/runtime-host";

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
}: AppSessionViewerPaneProps) {
  const { getSessionSetting } = useSettings();
  const conversationModeEnabled = getSessionSetting("conversationModeEnabled") !== false;
  const { toolbarItems, panels } = usePsmPluginSessionUi();
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});

  const togglePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : id));
  }, []);

  const closePanel = useCallback((id: string) => {
    setActivePanelId((prev) => (prev === id ? null : prev));
  }, []);

  const setPanelWidth = useCallback((id: string, width: number) => {
    setPanelWidths((prev) => ({ ...prev, [id]: width }));
  }, []);

  const rightPanels = panels.filter((panel) => (panel.side ?? "right") === "right");
  const activePanel = rightPanels.find((panel) => panel.id === activePanelId) ?? null;

  const sessionToolbarSlot = (
    <>
      {slots?.right}
      {toolbarItems.map((item) => {
        const panelId = item.panelId;
        return (
          <Fragment key={item.id}>
            <PluginContributionBoundary pluginId={item.pluginId} contributionId={item.id} title={item.title}>
              <PluginContributionSlot render={() => item.render({
                session,
                activeEntryId,
                panelOpen: panelId ? activePanelId === panelId : undefined,
                togglePanel: panelId ? () => togglePanel(panelId) : undefined,
              })} />
            </PluginContributionBoundary>
          </Fragment>
        );
      })}
    </>
  );

  const rightPanelSlot = activePanel ? (
    <aside
      className="hidden h-full min-h-0 shrink-0 border-l border-border/70 bg-surface-dark/65 xl:flex xl:flex-col"
      style={{ width: panelWidths[activePanel.id] ?? 380 }}
      data-no-window-drag
    >
      {rightPanels.length > 1 && (
        <div className="relative z-10 flex items-center gap-1 border-b border-border/70 bg-background/20 px-2 py-2" data-no-window-drag>
          {rightPanels.map((panel) => {
            const active = panel.id === activePanel.id;
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
        <PluginContributionBoundary pluginId={activePanel.pluginId} contributionId={activePanel.id} title={activePanel.title}>
          <PluginContributionSlot render={() => activePanel.render({
            session,
            activeEntryId,
            panelOpen: true,
            closePanel: () => closePanel(activePanel.id),
            width: panelWidths[activePanel.id] ?? 380,
            onWidthChange: (width) => setPanelWidth(activePanel.id, width),
          })} />
        </PluginContributionBoundary>
      </div>
    </aside>
  ) : null;

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
      slots={{ ...slots, right: sessionToolbarSlot }}
      layoutSlots={{ right: rightPanelSlot }}
      onActiveEntryIdChange={setActiveEntryId}
    />
  );
}

export default AppSessionViewerPane;
