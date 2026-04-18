import { useMemo } from "react";
import type { ReactNode, RefObject } from "react";
import {
  Columns3,
  Database,
  FolderOpen,
  LayoutDashboard,
  List,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ConnectionBanner from "@/components/ConnectionBanner";
import { triggerHaptic } from "@/utils/haptics";
import type { SessionInfo } from "@/types";

export type MobileTab =
  | "list"
  | "projects"
  | "kanban"
  | "dashboard"
  | "settings";

export interface AppMobileLayoutProps {
  selectedSession: SessionInfo | null;
  mobileViewerRef: RefObject<HTMLDivElement>;
  mobileTab: MobileTab;
  onMobileTabChange: (tab: MobileTab) => void;
  renderSessionViewer: () => ReactNode;
  renderSessionList: () => ReactNode;
  renderProjectList: () => ReactNode;
  renderKanban: () => ReactNode;
  renderDashboard: () => ReactNode;
  renderSettings: () => ReactNode;
  showDashboardTab?: boolean;
  settingsLabel?: string;
  settingsIcon?: ReactNode;
  settingsActionOnly?: boolean;
  onOpenSettingsAction?: () => void;
  renderOverlays: () => ReactNode;
}

interface MobileNavItem {
  id: MobileTab;
  icon: ReactNode;
  label: string;
}

function AppMobileLayout({
  selectedSession,
  mobileViewerRef,
  mobileTab,
  onMobileTabChange,
  renderSessionViewer,
  renderSessionList,
  renderProjectList,
  renderKanban,
  renderDashboard,
  renderSettings,
  showDashboardTab = true,
  settingsLabel,
  settingsIcon,
  settingsActionOnly = false,
  onOpenSettingsAction,
  renderOverlays,
}: AppMobileLayoutProps) {
  const { t } = useTranslation();

  const tabs = useMemo<MobileNavItem[]>(() => {
    const next: MobileNavItem[] = [
      {
        id: "list",
        icon: <List className="h-5 w-5" />,
        label: t("app.viewMode.list", "List"),
      },
      {
        id: "projects",
        icon: <FolderOpen className="h-5 w-5" />,
        label: t("app.viewMode.project", "project"),
      },
      {
        id: "kanban",
        icon: <Columns3 className="h-5 w-5" />,
        label: t("tags.kanban.title", "Kanban"),
      },
    ];

    if (showDashboardTab) {
      next.push({
        id: "dashboard",
        icon: <LayoutDashboard className="h-5 w-5" />,
        label: t("dashboard.title", "Overview"),
      });
    }

    next.push({
      id: "settings",
      icon: settingsIcon || (settingsActionOnly ? <Database className="h-5 w-5" /> : <Settings className="h-5 w-5" />),
      label: settingsLabel || t("settings.title", "Settings"),
    });

    return next;
  }, [settingsActionOnly, settingsIcon, settingsLabel, showDashboardTab, t]);

  return (
    <div className="relative flex flex-col h-screen-safe bg-background text-foreground safe-area-top">
      <ConnectionBanner />

      {selectedSession && (
        <div
          ref={mobileViewerRef}
          className="absolute inset-0 z-30 flex flex-col bg-background"
        >
          <div className="flex-1 overflow-hidden">{renderSessionViewer()}</div>
        </div>
      )}

      <div
        className="flex-1 overflow-hidden flex flex-col"
        style={{ visibility: selectedSession ? "hidden" : "visible" }}
      >
        {mobileTab === "list" && renderSessionList()}
        {mobileTab === "projects" && renderProjectList()}
        {mobileTab === "kanban" && renderKanban()}
        {showDashboardTab && mobileTab === "dashboard" && renderDashboard()}
        {!settingsActionOnly && mobileTab === "settings" && renderSettings()}
      </div>

      {!selectedSession && (
        <nav className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm flex items-center justify-around px-1 safe-area-bottom">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-label={tab.label}
              onClick={() => {
                triggerHaptic("light");
                if (tab.id === "settings" && settingsActionOnly) {
                  onOpenSettingsAction?.();
                  return;
                }
                onMobileTabChange(tab.id);
              }}
              className={`flex flex-col items-center gap-1 py-1 px-1 rounded-lg motion-color motion-press focus-ring flex-1 min-w-0 max-w-[76px] ${
                mobileTab === tab.id && !(tab.id === "settings" && settingsActionOnly)
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {tab.icon}
              <span className="text-[10px] sm:text-[11px] leading-tight truncate w-full text-center">
                {tab.label}
              </span>
            </button>
          ))}
        </nav>
      )}

      {renderOverlays()}
    </div>
  );
}

export default AppMobileLayout;
