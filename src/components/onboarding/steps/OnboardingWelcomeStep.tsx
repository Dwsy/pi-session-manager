import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, History, Loader2, MessagesSquare } from "lucide-react";

import type { SessionInfo } from "@/types";
import {
  summarizeSessionLibrary,
  topProjectsByActivity,
} from "../onboardingSummary";

const TOP_PROJECT_LIMIT = 5;

interface OnboardingWelcomeStepProps {
  sessions: SessionInfo[];
  loading: boolean;
}

export default function OnboardingWelcomeStep({
  sessions,
  loading,
}: OnboardingWelcomeStepProps) {
  const { t, i18n } = useTranslation();
  const summary = useMemo(() => summarizeSessionLibrary(sessions), [sessions]);
  const topProjects = useMemo(
    () => topProjectsByActivity(sessions, TOP_PROJECT_LIMIT),
    [sessions],
  );
  const busiestCount = topProjects[0]?.sessionCount ?? 1;
  const scanning = loading && summary.sessionCount === 0;

  const stats = [
    {
      id: "sessions",
      icon: MessagesSquare,
      value: summary.sessionCount.toLocaleString(i18n.language),
      label: t("onboarding.steps.welcome.stats.sessions", "Sessions"),
    },
    {
      id: "projects",
      icon: FolderOpen,
      value: summary.projectCount.toLocaleString(i18n.language),
      label: t("onboarding.steps.welcome.stats.projects", "Projects"),
    },
    {
      id: "since",
      icon: History,
      value: summary.firstSessionAt
        ? summary.firstSessionAt.toLocaleDateString(i18n.language, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "—",
      label: t("onboarding.steps.welcome.stats.since", "Earliest session"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.id}
            className="rounded-xl border border-border bg-background/40 px-4 py-3.5"
          >
            <stat.icon className="h-4 w-4 settings-accent-fg" />
            <div className="mt-2.5 truncate text-xl font-semibold tabular-nums text-foreground">
              {scanning ? (
                <span className="inline-block h-6 w-14 animate-pulse rounded bg-secondary align-middle" />
              ) : (
                stat.value
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-background/40">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <h3 className="text-[13px] font-medium text-foreground">
            {t("onboarding.steps.welcome.topProjectsTitle", "Busiest projects")}
          </h3>
          {scanning && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t("onboarding.steps.welcome.scanning", "Scanning sessions…")}
            </span>
          )}
        </header>

        <div className="divide-y divide-border/50">
          {topProjects.length === 0 &&
            (scanning ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="px-4 py-2.5">
                  <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
                  <div className="mt-2 h-1.5 w-full animate-pulse rounded-full bg-secondary/60" />
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                {t(
                  "onboarding.steps.welcome.topProjectsEmpty",
                  "No sessions found yet. Add a source in the next step and they will show up here.",
                )}
              </p>
            ))}

          {topProjects.map((project) => (
            <div key={project.path} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] text-foreground">
                  {project.name}
                </span>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {t("onboarding.steps.welcome.sessionCount", {
                    defaultValue: "{{count}} sessions",
                    count: project.sessionCount,
                  })}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (project.sessionCount / busiestCount) * 100)}%`,
                    backgroundColor: "var(--accent)",
                  }}
                />
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                {project.path}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
