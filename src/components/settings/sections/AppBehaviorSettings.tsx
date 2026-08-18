import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, CalendarRange, PanelTopClose } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import type { UpdateSettingsProps } from "@/components/settings/types";
import {
  isDashboardRecapAutoEnabled,
  requestDashboardRecap,
  setDashboardRecapAutoEnabled,
  type DashboardRecapAutoPeriod,
} from "@/components/dashboard/dashboardRecap";
import type { RecapPeriodKind } from "@/components/dashboard/recap/recapTypes";
import { invoke } from "@/transport";

const RECAP_KINDS: { kind: RecapPeriodKind; key: string; fallback: string }[] = [
  { kind: "week", key: "settings.appBehavior.openWeekRecap", fallback: "This week" },
  { kind: "month", key: "settings.appBehavior.openMonthRecap", fallback: "This month" },
  { kind: "quarter", key: "settings.appBehavior.openQuarterRecap", fallback: "This quarter" },
  { kind: "year", key: "settings.appBehavior.openYearRecap", fallback: "This year" },
];

const AUTO_RECAP_PERIODS: {
  period: DashboardRecapAutoPeriod;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
}[] = [
  {
    period: "week",
    titleKey: "settings.appBehavior.recapAutoWeek",
    titleFallback: "Weekly recap",
    descriptionKey: "settings.appBehavior.recapAutoWeekDescription",
    descriptionFallback: "Open last week's recap on Mondays. Off by default.",
  },
  {
    period: "month",
    titleKey: "settings.appBehavior.recapAutoMonth",
    titleFallback: "Monthly recap",
    descriptionKey: "settings.appBehavior.recapAutoMonthDescription",
    descriptionFallback: "Open last month's recap during the first three days of a new month. Off by default.",
  },
  {
    period: "year",
    titleKey: "settings.appBehavior.recapAutoYear",
    titleFallback: "Annual recap",
    descriptionKey: "settings.appBehavior.recapAutoYearDescription",
    descriptionFallback: "Open midyear and year-end recaps in their seasonal windows. On by default.",
  },
];

export default function AppBehaviorSettings(_: UpdateSettingsProps) {
  const { t } = useTranslation();
  const [lightweightMode, setLightweightMode] = useState(false);
  const [recapAutoEnabled, setRecapAutoEnabled] = useState<Record<DashboardRecapAutoPeriod, boolean>>(() => ({
    week: isDashboardRecapAutoEnabled("week"),
    month: isDashboardRecapAutoEnabled("month"),
    year: isDashboardRecapAutoEnabled("year"),
  }));

  useEffect(() => {
    invoke<boolean>("get_lightweight_mode")
      .then(setLightweightMode)
      .catch(console.error);
  }, []);

  const handleToggleLightweightMode = async (enabled: boolean) => {
    setLightweightMode(enabled);
    try {
      await invoke("set_lightweight_mode", { enabled });
    } catch (error) {
      console.error("Failed to set lightweight mode:", error);
      setLightweightMode(!enabled);
    }
  };

  const handleRecapAutoChange = (period: DashboardRecapAutoPeriod, enabled: boolean) => {
    setRecapAutoEnabled((current) => ({ ...current, [period]: enabled }));
    setDashboardRecapAutoEnabled(period, enabled);
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title={t("settings.appBehavior.title", "App behavior")}
        description={t(
          "settings.appBehavior.description",
          "Control window behavior and everyday app-level defaults.",
        )}
        icon={<AppWindow className="h-4 w-4" />}
        contentClassName="p-0"
      >
        <div className="flex gap-3 px-3 py-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary/35 text-muted-foreground">
            <PanelTopClose className="h-4 w-4" />
          </div>
          <SettingsToggleRow
            title={t("settings.advanced.lightweightMode", "Lightweight mode")}
            description={t(
              "settings.advanced.lightweightModeDesc",
              "When enabled, closing the window minimizes to system tray instead of quitting. Tray menu: Show / Open Web / Quit",
            )}
            checked={lightweightMode}
            onChange={handleToggleLightweightMode}
            className="min-w-0 flex-1 items-start"
            descriptionClassName="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground"
            searchKey="advanced-lightweightMode"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title={t("settings.appBehavior.recapTitle", "Dashboard recaps")}
        description={t(
          "settings.appBehavior.recapDescription",
          "A story-style look back at a week, month, quarter, or year — built only from local session statistics.",
        )}
        icon={<CalendarRange className="h-4 w-4" />}
        contentClassName="p-0"
      >
        <div className="divide-y divide-border/50">
          {AUTO_RECAP_PERIODS.map(({ period, titleKey, titleFallback, descriptionKey, descriptionFallback }) => (
            <div key={period} className="flex gap-3 px-3 py-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-secondary/35 text-muted-foreground">
                <CalendarRange className="h-4 w-4" />
              </div>
              <SettingsToggleRow
                title={t(titleKey, titleFallback)}
                description={t(descriptionKey, descriptionFallback)}
                checked={recapAutoEnabled[period]}
                onChange={(enabled) => handleRecapAutoChange(period, enabled)}
                className="min-w-0 flex-1 items-start"
                descriptionClassName="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground"
                searchKey={`app-behavior-dashboard-recap-auto-${period}`}
              />
            </div>
          ))}
          <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]" data-settings-search="app-behavior-dashboard-recap-manual">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {t("settings.appBehavior.recapManual", "Open a recap now")}
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {t(
                  "settings.appBehavior.recapManualDescription",
                  "Manual views never mark an automatic cycle as shown. Statistics stay on this device.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {RECAP_KINDS.map(({ kind, key, fallback }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => requestDashboardRecap(kind)}
                  className="focus-ring h-8 rounded border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/40"
                >
                  {t(key, fallback)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
