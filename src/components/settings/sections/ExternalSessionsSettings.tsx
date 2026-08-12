import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bot, CheckCircle2, Circle, Cpu, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsListSection, {
  type SettingsListRow,
} from "@/components/settings/SettingsListSection";
import Toggle from "@/components/ui/Toggle";
import { AgentIcon } from "@/components/session-viewer/AgentIcon";
import type { SessionSettingsProps } from "@/components/settings/types";
import type { SessionProviderInfo } from "@/types";
import { listSupportedSessionProviders } from "@/utils/sessionProvidersApi";

export default function ExternalSessionsSettings({
  settings,
  onUpdate,
  mode = "all",
}: SessionSettingsProps & { mode?: "all" | "agents" | "resume" }) {
  const { t } = useTranslation();
  const [supportedProviders, setSupportedProviders] = useState<
    SessionProviderInfo[]
  >([]);

  const otherAgentProviders = useMemo(
    () =>
      supportedProviders.filter(
        (provider) => provider.slug !== "pi" && provider.capabilities.canScan,
      ),
    [supportedProviders],
  );
  const enabledProviders = useMemo(
    () => new Set(settings.session.externalSessionProviders ?? []),
    [settings.session.externalSessionProviders],
  );
  const convertTargets = useMemo(
    () =>
      supportedProviders
        .filter((provider) => provider.capabilities.canConvertTarget)
        .sort((a, b) => {
          if (a.slug === "pi") return -1;
          if (b.slug === "pi") return 1;
          return a.display_name.localeCompare(b.display_name);
        }),
    [supportedProviders],
  );
  const mergedProviders = useMemo(
    () =>
      convertTargets.map((provider) => ({
        ...provider,
        canScan: provider.slug !== "pi" && otherAgentProviders.some(
          (item) => item.slug === provider.slug,
        ),
      })),
    [convertTargets, otherAgentProviders],
  );
  const promptEnabled = settings.session.externalResumePromptEnabled !== false;
  const selectedResumeTarget = promptEnabled
    ? null
    : settings.session.defaultExternalResumeTarget;
  const behaviorRows: SettingsListRow[] = [
    {
      id: "include-stats",
      kind: "toggle",
      icon: <BarChart3 />,
      title: t(
        "settings.externalSessions.includeInStats",
        "Include external sessions in statistics",
      ),
      description: t(
        "settings.externalSessions.includeInStatsHelp",
        "When disabled, external agent sessions are excluded from dashboard and day statistics.",
      ),
      checked: settings.session.externalSessionsIncludeInStats === true,
      onChange: (checked) =>
        onUpdate("session", "externalSessionsIncludeInStats", checked),
      searchKey: "external-sessions-includeInStats",
    },
    {
      id: "include-search",
      kind: "toggle",
      icon: <Search />,
      title: t(
        "settings.externalSessions.includeInSearch",
        "Include external sessions in search",
      ),
      description: t(
        "settings.externalSessions.includeInSearchHelp",
        "When disabled, external agent sessions are excluded from sidebar search and full-text search.",
      ),
      checked: settings.session.externalSessionsIncludeInSearch === true,
      onChange: (checked) =>
        onUpdate("session", "externalSessionsIncludeInSearch", checked),
      searchKey: "external-sessions-includeInSearch",
    },
    {
      id: "agent-icon",
      kind: "toggle",
      icon: <Bot />,
      title: t(
        "settings.externalSessions.showAgentIconInSessionBadge",
        "Show agent icon in SessionBadge",
      ),
      description: t(
        "settings.externalSessions.showAgentIconInSessionBadgeHelp",
        "Display the provider icon next to the source badge in session cards.",
      ),
      checked: settings.session.showAgentIconInSessionBadge !== false,
      onChange: (checked) =>
        onUpdate("session", "showAgentIconInSessionBadge", checked),
      searchKey: "external-sessions-showAgentIcon",
    },
    {
      id: "model-icon",
      kind: "toggle",
      icon: <Cpu />,
      title: t(
        "settings.externalSessions.showModelIconInSessionBadge",
        "Show model icons in SessionBadge",
      ),
      description: t(
        "settings.externalSessions.showModelIconInSessionBadgeHelp",
        "Display icons for the top 2 models used in session card badges.",
      ),
      checked: settings.session.showModelIconInSessionBadge === true,
      onChange: (checked) =>
        onUpdate("session", "showModelIconInSessionBadge", checked),
      searchKey: "external-sessions-showModelIcon",
    },
  ];

  const handleResumeTargetToggle = (providerSlug: string, checked: boolean) => {
    if (!checked) {
      onUpdate("session", "externalResumePromptEnabled", true);
      return;
    }
    onUpdate("session", "defaultExternalResumeTarget", providerSlug);
    onUpdate("session", "externalResumePromptEnabled", false);
  };

  const handleProviderToggle = (providerSlug: string, checked: boolean) => {
    const next = new Set(settings.session.externalSessionProviders ?? []);
    if (checked) {
      next.add(providerSlug);
    } else {
      next.delete(providerSlug);
    }
    const values = Array.from(next).sort();
    onUpdate("session", "externalSessionProviders", values);
    onUpdate("session", "scanOtherAgentJsonl", values.length > 0);
  };

  useEffect(() => {
    let cancelled = false;
    listSupportedSessionProviders()
      .then((items) => {
        if (!cancelled) {
          setSupportedProviders(items);
        }
      })
      .catch((error) => {
        console.error("Failed to load supported session providers:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <SettingsCard
        title={
          mode === "resume"
            ? t("settings.sections.resumeTargets", "Resume Targets")
            : t(
                "settings.externalSessions.title",
                "External agent sessions",
              )
        }
        description={t(
          mode === "resume"
            ? "settings.sectionDescriptions.resumeTargets"
            : "settings.externalSessions.description",
          mode === "resume"
            ? "Default target CLI for resume commands."
            : "Scan supported local coding-agent sessions and choose the default resume target.",
        )}
        contentClassName="p-4"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">
              {mode === "resume"
                ? t(
                    "settings.externalSessions.resumeTargetsTitle",
                    "Resume targets",
                  )
                : t("settings.externalSessions.providerMatrixTitle", "Agent providers")}
            </div>
            <div className="text-xs text-muted-foreground">
              {mode === "resume"
                ? t(
                    "settings.externalSessions.resumeTargetsHelp",
                    "Choose the default CLI used when resuming or copying resume commands.",
                  )
                : t(
                    "settings.externalSessions.providerMatrixHelp",
                    "Turn on providers to show their local sessions. Pick one default CLI for resume commands.",
                  )}
            </div>
            {mergedProviders.length > 0 ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-background/35 divide-y divide-border/50 overflow-hidden">
                {mergedProviders.map((provider) => {
                  const providerEnabled = enabledProviders.has(provider.slug);
                  const resumeChecked = selectedResumeTarget === provider.slug;
                  const statusLabel = provider.canScan
                    ? providerEnabled
                      ? t("settings.externalSessions.scanEnabled", "Scanning")
                      : t("settings.externalSessions.scanDisabled", "Off")
                    : t("settings.externalSessions.resumeOnly", "Resume only");
                  return (
                    <div
                      key={provider.slug}
                      className={`grid items-center gap-3 px-4 py-3 max-md:grid-cols-[minmax(0,1fr)_auto] ${
                        mode === "resume"
                          ? "grid-cols-[minmax(0,1fr)_140px]"
                          : "grid-cols-[minmax(0,1fr)_86px_140px]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <AgentIcon source={provider.slug} size={14} />
                          <span className="text-sm font-medium text-foreground truncate">
                            {provider.display_name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              provider.canScan && providerEnabled
                                ? "bg-info/15 text-info"
                                : "bg-secondary/70 text-muted-foreground"
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {provider.canScan
                            ? t(
                                "settings.externalSessions.providerEnabledHelp",
                                "Show and scan sessions from this external provider.",
                              )
                            : t(
                                `session.convert.targetDescriptions.${provider.slug}`,
                              )}
                        </div>
                      </div>

                      {mode !== "resume" && (
                        <div className="flex items-center justify-center max-md:justify-end">
                          {provider.canScan ? (
                            <Toggle
                              checked={providerEnabled}
                              onChange={(checked) =>
                                handleProviderToggle(provider.slug, checked)
                              }
                              size="sm"
                            />
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {t(
                                "settings.externalSessions.scanNotApplicable",
                                "Built-in",
                              )}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-center max-md:col-span-2 max-md:justify-start">
                        <button
                          type="button"
                          onClick={() =>
                            handleResumeTargetToggle(provider.slug, !resumeChecked)
                          }
                          className={`inline-flex min-w-[124px] items-center justify-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            resumeChecked
                              ? "border-info/40 bg-info/15 text-foreground"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                          }`}
                        >
                          {resumeChecked ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-info" />
                          ) : (
                            <Circle className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {resumeChecked
                              ? t(
                                  "settings.externalSessions.defaultResumeSelected",
                                  "Selected",
                                )
                              : t(
                                  "settings.externalSessions.setAsDefaultResume",
                                  "Set default",
                                )}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                {t(
                  "settings.session.scanOtherAgentJsonlNoProviders",
                  "No additional agent providers are currently available.",
                )}
              </div>
            )}
          </div>

          {mode !== "agents" && (
            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
            {promptEnabled
              ? t(
                  "settings.externalSessions.resumePromptFallback",
                  "No default target selected. Resuming or copying a resume command will ask which CLI to use.",
                )
              : t(
                  "settings.externalSessions.defaultExternalResumeTargetHelp",
                  "When prompt is disabled, sessions will be resumed into this target CLI.",
                )}
            </div>
          )}

          {mode !== "resume" && <SettingsListSection rows={behaviorRows} />}
        </div>
      </SettingsCard>
    </div>
  );
}
