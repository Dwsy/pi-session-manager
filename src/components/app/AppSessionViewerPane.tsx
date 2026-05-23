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
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});

  const togglePanel = useCallback((id: string) => {
    setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const closePanel = useCallback((id: string) => {
    setOpenPanels((prev) => ({ ...prev, [id]: false }));
  }, []);

  const setPanelWidth = useCallback((id: string, width: number) => {
    setPanelWidths((prev) => ({ ...prev, [id]: width }));
  }, []);

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
                panelOpen: panelId ? Boolean(openPanels[panelId]) : undefined,
                togglePanel: panelId ? () => togglePanel(panelId) : undefined,
              })} />
            </PluginContributionBoundary>
          </Fragment>
        );
      })}
    </>
  );

  const rightPanelSlot = (
    <>
      {panels.filter((panel) => (panel.side ?? "right") === "right").map((panel) => (
        <Fragment key={panel.id}>
          <PluginContributionBoundary pluginId={panel.pluginId} contributionId={panel.id} title={panel.title}>
            <PluginContributionSlot render={() => panel.render({
              session,
              panelOpen: Boolean(openPanels[panel.id]),
              closePanel: () => closePanel(panel.id),
              width: panelWidths[panel.id] ?? 380,
              onWidthChange: (width) => setPanelWidth(panel.id, width),
            })} />
          </PluginContributionBoundary>
        </Fragment>
      ))}
    </>
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
      slots={{ ...slots, right: sessionToolbarSlot }}
      layoutSlots={{ right: rightPanelSlot }}
    />
  );
}

export default AppSessionViewerPane;
