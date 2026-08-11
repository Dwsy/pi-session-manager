import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, SearchX } from "lucide-react";

import { AgentIcon } from "@/components/session-viewer/AgentIcon";
import Toggle from "@/components/ui/Toggle";
import type { SessionProviderInfo } from "@/types";

interface OnboardingSourcesStepProps {
  providers: SessionProviderInfo[];
  loading: boolean;
  enabledSlugs: string[];
  onToggleProvider: (slug: string, enabled: boolean) => void;
}

export default function OnboardingSourcesStep({
  providers,
  loading,
  enabledSlugs,
  onToggleProvider,
}: OnboardingSourcesStepProps) {
  const { t } = useTranslation();
  const enabled = useMemo(() => new Set(enabledSlugs), [enabledSlugs]);

  const pi = providers.find((provider) => provider.slug === "pi");
  const scannable = providers.filter(
    (provider) => provider.slug !== "pi" && provider.capabilities.canScan,
  );
  const detected = scannable.filter((provider) => provider.detected);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-background/40 px-4 py-3.5">
        <div className="flex items-start gap-3">
          <AgentIcon source="pi" size={16} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground">
                {t("onboarding.steps.sources.piTitle", "Pi sessions")}
              </span>
              <span className="settings-accent-bg-soft settings-accent-fg flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                <Check className="h-3 w-3" />
                {t("onboarding.steps.sources.alwaysOn", "Always scanned")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "onboarding.steps.sources.piDescription",
                "The default Pi session directory is always part of your library.",
              )}
            </p>
            <div className="mt-2 space-y-1">
              {(pi?.roots.length ? pi.roots : ["~/.pi/agent/sessions"]).map(
                (root) => (
                  <div
                    key={root}
                    className="truncate rounded-md bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                  >
                    {root}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background/40">
        <header className="border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-medium text-foreground">
              {t(
                "onboarding.steps.sources.detectedTitle",
                "Other agents found on this machine",
              )}
            </h3>
            {loading ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {t("onboarding.steps.sources.selectedCount", {
                  defaultValue: "{{selected}} of {{total}} enabled",
                  selected: detected.filter((provider) =>
                    enabled.has(provider.slug),
                  ).length,
                  total: detected.length,
                })}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "onboarding.steps.sources.detectedDescription",
              "Detected by looking for each agent's session directory. Enabling one adds its sessions to the list, search, and conversions.",
            )}
          </p>
        </header>

        <div className="divide-y divide-border/50">
          {loading &&
            Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3">
                <div className="h-4 w-4 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
              </div>
            ))}

          {!loading && detected.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <SearchX
                className="h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-[13px] text-foreground">
                {t(
                  "onboarding.steps.sources.noneTitle",
                  "Only Pi sessions found",
                )}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {t(
                  "onboarding.steps.sources.noneDescription",
                  "Claude Code, Codex, Cursor and others show up here once they have sessions on this machine. Custom directories can be added in Settings later.",
                )}
              </p>
            </div>
          )}

          {!loading &&
            detected.map((provider) => {
              const isEnabled = enabled.has(provider.slug);
              return (
                <div
                  key={provider.slug}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <AgentIcon source={provider.slug} size={16} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {provider.display_name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isEnabled
                            ? "settings-accent-bg-soft settings-accent-fg"
                            : "bg-secondary/70 text-muted-foreground"
                        }`}
                      >
                        {isEnabled
                          ? t("onboarding.steps.sources.enabled", "Included")
                          : t("onboarding.steps.sources.disabled", "Skipped")}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                      {provider.roots[0]}
                    </div>
                  </div>
                  <Toggle
                    checked={isEnabled}
                    onChange={(checked) =>
                      onToggleProvider(provider.slug, checked)
                    }
                    size="sm"
                  />
                </div>
              );
            })}
        </div>
      </section>

      {!loading && scannable.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[13px] font-medium text-foreground">
            {t("onboarding.steps.sources.supportedTitle", "Agents PSM can scan")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {scannable.map((provider) => (
              <span
                key={provider.slug}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                  provider.detected
                    ? "settings-accent-border settings-accent-fg"
                    : "border-border text-muted-foreground/70"
                }`}
              >
                <AgentIcon source={provider.slug} size={12} />
                {provider.display_name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
