import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  Clock,
  PanelTopClose,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

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
import { invoke, listen } from "@/transport";

const RECAP_KINDS: { kind: RecapPeriodKind; key: string; fallback: string }[] = [
  { kind: "week", key: "settings.appBehavior.openWeekRecap", fallback: "This week" },
  { kind: "month", key: "settings.appBehavior.openMonthRecap", fallback: "This month" },
  { kind: "quarter", key: "settings.appBehavior.openQuarterRecap", fallback: "This quarter" },
  { kind: "year", key: "settings.appBehavior.openYearRecap", fallback: "This year" },
];

const AUTO_RECAP_PERIODS: {
  period: DashboardRecapAutoPeriod;
  icon: LucideIcon;
  defaultOn: boolean;
  titleKey: string;
  titleFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
  scheduleKey: string;
  scheduleFallback: string;
}[] = [
  {
    period: "week",
    icon: CalendarDays,
    defaultOn: false,
    titleKey: "settings.appBehavior.recapAutoWeek",
    titleFallback: "Weekly recap",
    descriptionKey: "settings.appBehavior.recapAutoWeekDescription",
    descriptionFallback: "Open last week's recap automatically.",
    scheduleKey: "settings.appBehavior.recapScheduleWeek",
    scheduleFallback: "Mondays",
  },
  {
    period: "month",
    icon: CalendarRange,
    defaultOn: false,
    titleKey: "settings.appBehavior.recapAutoMonth",
    titleFallback: "Monthly recap",
    descriptionKey: "settings.appBehavior.recapAutoMonthDescription",
    descriptionFallback: "Open last month's recap automatically.",
    scheduleKey: "settings.appBehavior.recapScheduleMonth",
    scheduleFallback: "Days 1–3",
  },
  {
    period: "year",
    icon: Sparkles,
    defaultOn: true,
    titleKey: "settings.appBehavior.recapAutoYear",
    titleFallback: "Annual recap",
    descriptionKey: "settings.appBehavior.recapAutoYearDescription",
    descriptionFallback: "Open midyear and year-end recaps in their seasonal windows.",
    scheduleKey: "settings.appBehavior.recapScheduleYear",
    scheduleFallback: "Midyear · Year-end",
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
    // Keep the toggle in sync when the setting is changed from the tray menu.
    const unlisten = listen<boolean>("lightweight-mode-changed", ({ payload }) => {
      setLightweightMode(payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
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
          "A compact period report for a week, month, quarter, or year — built only from local session statistics.",
        )}
        icon={<CalendarRange className="h-4 w-4" />}
        contentClassName="p-0"
      >
        <div className="divide-y divide-border/50">
          {AUTO_RECAP_PERIODS.map(
            ({
              period,
              icon: Icon,
              defaultOn,
              titleKey,
              titleFallback,
              descriptionKey,
              descriptionFallback,
              scheduleKey,
              scheduleFallback,
            }) => {
              const enabled = recapAutoEnabled[period];
              return (
                <div
                  key={period}
                  className="flex gap-3 px-3 py-3.5 transition-colors hover:bg-muted/20"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      enabled
                        ? "settings-accent-bg-soft settings-accent-border settings-accent-fg"
                        : "border-border/40 bg-secondary/35 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <SettingsToggleRow
                    title={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {t(titleKey, titleFallback)}
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-1.5 py-0.5 text-[10px] font-normal leading-none text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {t(scheduleKey, scheduleFallback)}
                        </span>
                      </span>
                    }
                    description={
                      <>
                        {t(descriptionKey, descriptionFallback)}
                        <span
                          className={`ml-1.5 inline-flex items-center rounded px-1 py-px align-middle text-[10px] leading-none ${
                            defaultOn
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          {defaultOn
                            ? t("settings.appBehavior.recapDefaultOn", "On by default")
                            : t("settings.appBehavior.recapDefaultOff", "Off by default")}
                        </span>
                      </>
                    }
                    checked={enabled}
                    onChange={(next) => handleRecapAutoChange(period, next)}
                    className="min-w-0 flex-1 items-start"
                    descriptionClassName="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground"
                    searchKey={`app-behavior-dashboard-recap-auto-${period}`}
                  />
                </div>
              );
            },
          )}

          <div
            className="bg-muted/15 px-3 py-3.5"
            data-settings-search="app-behavior-dashboard-recap-manual"
          >
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
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RECAP_KINDS.map(({ kind, key, fallback }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => requestDashboardRecap(kind)}
                  className="focus-ring group flex h-9 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
                >
                  <span className="truncate">{t(key, fallback)}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
