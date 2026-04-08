import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
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
          {otherAgentProviders.length > 0 ? (
            <div className="rounded-lg border border-border/60 bg-background/40 divide-y divide-border/50">
              {otherAgentProviders.map((provider) => {
                const checked = enabledProviders.has(provider.slug);
                return (
                  <div key={provider.slug} className="px-3 py-2">
                    <SettingsToggleRow
                      title={provider.display_name}
                      description={t(
                        "settings.externalSessions.providerEnabledHelp",
                        "Show and scan sessions from this external provider.",
                      )}
                      checked={checked}
                      onChange={(nextChecked) => {
                        const next = new Set(settings.session.externalSessionProviders ?? []);
                        if (nextChecked) {
                          next.add(provider.slug);
                        } else {
                          next.delete(provider.slug);
                        }
                        const values = Array.from(next).sort();
                        onUpdate("session", "externalSessionProviders", values);
                        onUpdate("session", "scanOtherAgentJsonl", values.length > 0);
                      }}
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
      </SettingsCard>
    </div>
  );
}
