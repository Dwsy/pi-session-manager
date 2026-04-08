import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
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
                "settings.externalSessions.enabledProviders",
                "Enabled external providers",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.externalSessions.enabledProvidersHelp",
                "Turn on the providers whose local sessions should be scanned and displayed.",
              )}
            </div>
            {otherAgentProviders.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-background/40 divide-y divide-border/50">
                {otherAgentProviders.map((provider) => {
                  const checked = enabledProviders.has(provider.slug);
                  return (
                    <div key={provider.slug} className="px-3 py-2">
                      <SettingsToggleRow
                        title={
                          <span className="inline-flex items-center gap-2">
                            <AgentIcon source={provider.slug} size={14} />
                            <span>{provider.display_name}</span>
                          </span>
                        }
                        description={t(
                          "settings.externalSessions.providerEnabledHelp",
                          "Show and scan sessions from this external provider.",
                        )}
                        checked={checked}
                        onChange={(nextChecked) =>
                          handleProviderToggle(provider.slug, nextChecked)
                        }
                        className="items-start py-0"
                      />
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

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {t(
                "settings.externalSessions.defaultExternalResumeTarget",
                "Default external resume target",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.externalSessions.defaultExternalResumeTargetHelp",
                "When prompt is disabled, non-Pi sessions will be resumed into this target CLI.",
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {t(
                "settings.externalSessions.resumeTargetSelectionHelp",
                "Single choice. Clear the current selection to open a target picker when resuming non-Pi sessions.",
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 divide-y divide-border/50">
              {convertTargets.map((provider) => {
                const checked = selectedResumeTarget === provider.slug;
                return (
                  <button
                    key={provider.slug}
                    type="button"
                    onClick={() =>
                      handleResumeTargetToggle(provider.slug, !checked)
                    }
                    className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors ${
                      checked
                        ? "bg-primary/10"
                        : "hover:bg-secondary/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AgentIcon source={provider.slug} size={14} />
                        <span className="text-sm font-medium text-foreground truncate">
                          {provider.display_name}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t(`session.convert.targetDescriptions.${provider.slug}`)}
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 transition-colors ${
                        checked ? "text-primary" : "text-muted-foreground/70"
                      }`}
                    >
                      {checked ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {promptEnabled && (
              <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                {t(
                  "settings.externalSessions.resumePromptFallback",
                  "No default target selected. Non-Pi sessions will ask which CLI to resume into.",
                )}
              </div>
            )}
          </div>

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
          />
        </div>
      </SettingsCard>
    </div>
  );
}
