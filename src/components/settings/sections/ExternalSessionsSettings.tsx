import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import Toggle from "@/components/ui/Toggle";
import { AgentIcon } from "@/components/session-viewer/AgentIcon";
import type { SessionSettingsProps } from "@/components/settings/types";
import type { SessionProviderInfo } from "@/types";
import { listSupportedSessionProviders } from "@/utils/sessionProvidersApi";

export default function ExternalSessionsSettings({
  settings,
  onUpdate,
}: SessionSettingsProps) {
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
        title={t(
          "settings.externalSessions.title",
          "Other external sessions",
        )}
        description={t(
          "settings.externalSessions.description",
          "Control whether sessions from other supported coding agents should be scanned and shown in the app.",
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {t(
                "settings.externalSessions.providerMatrixTitle",
                "Providers",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.externalSessions.providerMatrixHelp",
                "Manage each provider in one place: enable scanning for external sessions, or set it as the default resume target.",
              )}
            </div>
            {mergedProviders.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-background/40 divide-y divide-border/50">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_140px] gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div>
                    {t("settings.externalSessions.providerColumn", "Provider")}
                  </div>
                  <div className="text-center">
                    {t(
                      "settings.externalSessions.scanColumn",
                      "Show / Scan",
                    )}
                  </div>
                  <div className="text-center">
                    {t(
                      "settings.externalSessions.resumeColumn",
                      "Default Resume",
                    )}
                  </div>
                </div>
                {mergedProviders.map((provider) => {
                  const providerEnabled = enabledProviders.has(provider.slug);
                  const resumeChecked = selectedResumeTarget === provider.slug;
                  return (
                    <div
                      key={provider.slug}
                      className="grid grid-cols-[minmax(0,1fr)_110px_140px] items-center gap-3 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <AgentIcon source={provider.slug} size={14} />
                          <span className="text-sm font-medium text-foreground truncate">
                            {provider.display_name}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
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

                      <div className="flex items-center justify-center">
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

                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleResumeTargetToggle(provider.slug, !resumeChecked)
                          }
                          className={`inline-flex min-w-[124px] items-center justify-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                            resumeChecked
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                          }`}
                        >
                          {resumeChecked ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
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

          <SettingsToggleRow
            title={t(
              "settings.externalSessions.includeInStats",
              "Include external sessions in statistics",
            )}
            description={t(
              "settings.externalSessions.includeInStatsHelp",
              "When disabled, external agent sessions are excluded from dashboard and day statistics.",
            )}
            checked={settings.session.externalSessionsIncludeInStats === true}
            onChange={(checked) =>
              onUpdate("session", "externalSessionsIncludeInStats", checked)
            }
            className="items-start py-0"
            searchKey="external-sessions-includeInStats"
          />

          <SettingsToggleRow
            title={t(
              "settings.externalSessions.includeInSearch",
              "Include external sessions in search",
            )}
            description={t(
              "settings.externalSessions.includeInSearchHelp",
              "When disabled, external agent sessions are excluded from sidebar search and full-text search.",
            )}
            checked={settings.session.externalSessionsIncludeInSearch === true}
            onChange={(checked) =>
              onUpdate("session", "externalSessionsIncludeInSearch", checked)
            }
            className="items-start py-0"
            searchKey="external-sessions-includeInSearch"
          />

          <SettingsToggleRow
            title={t(
              "settings.externalSessions.showAgentIconInSessionBadge",
              "Show agent icon in SessionBadge",
            )}
            description={t(
              "settings.externalSessions.showAgentIconInSessionBadgeHelp",
              "Display the provider icon next to the source badge in session cards.",
            )}
            checked={settings.session.showAgentIconInSessionBadge !== false}
            onChange={(checked) =>
              onUpdate("session", "showAgentIconInSessionBadge", checked)
            }
            className="items-start py-0"
            searchKey="external-sessions-showAgentIcon"
          />
        </div>
      </SettingsCard>
    </div>
  );
}
