import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  Palette,
  Rocket,
  X,
} from "lucide-react";

import { useEscapeToClose } from "@/components/dialogs/useEscapeToClose";
import type { SettingsSection } from "@/components/settings/types";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSettings } from "@/hooks/useSettings";
import type { SessionInfo, SessionProviderInfo } from "@/types";
import { listSupportedSessionProviders } from "@/utils/sessionProvidersApi";
import { persistOnboardingCompletion } from "./onboardingStatus";
import OnboardingAppearanceStep from "./steps/OnboardingAppearanceStep";
import OnboardingReadyStep from "./steps/OnboardingReadyStep";
import OnboardingSourcesStep from "./steps/OnboardingSourcesStep";
import OnboardingWelcomeStep from "./steps/OnboardingWelcomeStep";

const STEPS = [
  { id: "welcome", icon: Compass },
  { id: "sources", icon: Database },
  { id: "appearance", icon: Palette },
  { id: "ready", icon: Rocket },
] as const;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface OnboardingProps {
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  /** Closes the guide, optionally landing the user on a settings section. */
  onComplete: (openSettingsSection?: SettingsSection) => void;
}

export default function Onboarding({
  sessions,
  sessionsLoading,
  onComplete,
}: OnboardingProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { settings, updateSetting } = useSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [providers, setProviders] = useState<SessionProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    let cancelled = false;
    listSupportedSessionProviders()
      .then((items) => {
        if (cancelled) return;
        setProviders(items);
      })
      .catch((error) => {
        console.warn("Failed to detect session providers:", error);
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(
    (openSettingsSection?: SettingsSection) => {
      void persistOnboardingCompletion(settingsRef.current);
      onComplete(openSettingsSection);
    },
    [onComplete],
  );

  const dismiss = useCallback(() => finish(), [finish]);
  useEscapeToClose(dismiss);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const stepTitles = useMemo(
    () => STEPS.map((item) => t(`onboarding.steps.${item.id}.title`)),
    [t],
  );

  const enabledProviderSlugs = settings.session.externalSessionProviders ?? [];

  const handleToggleProvider = useCallback(
    (slug: string, enabled: boolean) => {
      const next = new Set(
        settingsRef.current.session.externalSessionProviders ?? [],
      );
      if (enabled) {
        next.add(slug);
      } else {
        next.delete(slug);
      }
      const values = Array.from(next).sort();
      updateSetting("session", "externalSessionProviders", values);
      updateSetting("session", "scanOtherAgentJsonl", values.length > 0);
    },
    [updateSetting],
  );

  const body = (() => {
    switch (step.id) {
      case "welcome":
        return (
          <OnboardingWelcomeStep
            sessions={sessions}
            loading={sessionsLoading}
          />
        );
      case "sources":
        return (
          <OnboardingSourcesStep
            providers={providers}
            loading={providersLoading}
            enabledSlugs={enabledProviderSlugs}
            onToggleProvider={handleToggleProvider}
          />
        );
      case "appearance":
        return (
          <OnboardingAppearanceStep
            appearance={settings.appearance}
            locale={settings.language.locale}
            onAppearanceChange={(key, value) =>
              updateSetting("appearance", key, value)
            }
            onLocaleChange={(locale) =>
              updateSetting("language", "locale", locale)
            }
          />
        );
      case "ready":
        return <OnboardingReadyStep onOpenSettingsSection={finish} />;
    }
  })();

  return (
    <div className="motion-overlay-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-step-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="motion-overlay-surface-enter relative flex h-[640px] max-h-[88vh] w-full max-w-[940px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none"
      >
        {!isMobile && (
          <nav
            aria-label={t("onboarding.progressLabel", "Onboarding steps")}
            className="flex w-[228px] flex-shrink-0 flex-col border-r border-border bg-background/40 px-4 py-6"
          >
            <div className="flex items-center gap-2.5 px-2">
              <img
                src="/icon-128.png"
                alt=""
                className="h-8 w-8 rounded-lg shadow-sm"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  Pi Session Manager
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {t("onboarding.subtitle", "First-launch setup")}
                </div>
              </div>
            </div>

            <ol className="mt-7 space-y-1">
              {STEPS.map((item, index) => {
                const active = index === stepIndex;
                const done = index < stepIndex;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setStepIndex(index)}
                      aria-current={active ? "step" : undefined}
                      className={`focus-ring motion-color flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left ${
                        active
                          ? "settings-accent-bg-soft settings-accent-ring settings-accent-fg font-medium"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 flex-shrink-0 ${done && !active ? "settings-accent-fg" : ""}`}
                      />
                      <span className="truncate text-[13px]">
                        {stepTitles[index]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              onClick={dismiss}
              className="focus-ring motion-color mt-auto rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              {t("onboarding.skip", "Skip setup")}
            </button>
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start gap-4 border-b border-border px-7 py-5">
            <div className="min-w-0 flex-1">
              <h2
                id="onboarding-step-title"
                className="text-base font-semibold text-foreground"
              >
                {t(`onboarding.steps.${step.id}.title`)}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {t(`onboarding.steps.${step.id}.description`)}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("common.close", "Close")}
              className="focus-ring motion-color -mr-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6">
            {body}
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-border px-7 py-4">
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("onboarding.stepProgress", {
                defaultValue: "Step {{current}} of {{total}}",
                current: stepIndex + 1,
                total: STEPS.length,
              })}
            </span>

            <div className="flex items-center gap-2">
              {isMobile && isFirst && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="focus-ring motion-color rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  {t("onboarding.skip", "Skip setup")}
                </button>
              )}
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => setStepIndex((index) => index - 1)}
                  className="focus-ring motion-color flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("onboarding.prev", "Back")}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  isLast ? finish() : setStepIndex((index) => index + 1)
                }
                className="focus-ring motion-press settings-accent-bg-strong flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium"
              >
                {isLast
                  ? t("onboarding.finish", "Start using")
                  : t("onboarding.next", "Next")}
                {!isLast && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
