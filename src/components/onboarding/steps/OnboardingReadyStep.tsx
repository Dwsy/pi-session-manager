import { useTranslation } from "react-i18next";
import { ChevronRight, Database, Puzzle, Server } from "lucide-react";

import type { SettingsSection } from "@/components/settings/types";
import { formatShortcutDisplay } from "@/utils/platformShortcuts";

const SHORTCUTS = [
  { id: "palette", keys: "Cmd+P" },
  { id: "search", keys: "Cmd+Shift+F" },
  { id: "inSessionSearch", keys: "Cmd+F" },
  { id: "sidebar", keys: "Cmd+B" },
  { id: "projectView", keys: "Cmd+Shift+G" },
  { id: "terminal", keys: "Cmd+J" },
  { id: "settings", keys: "Cmd+," },
  { id: "resume", keys: "Cmd+R" },
] as const;

const NEXT_STEPS: ReadonlyArray<{
  id: string;
  section: SettingsSection;
  icon: typeof Database;
}> = [
  { id: "sources", section: "data-sources", icon: Database },
  { id: "server", section: "server-access", icon: Server },
  { id: "plugins", section: "psm-plugins", icon: Puzzle },
];

interface OnboardingReadyStepProps {
  /** Finishes the guide and opens the given settings section. */
  onOpenSettingsSection: (section: SettingsSection) => void;
}

export default function OnboardingReadyStep({
  onOpenSettingsSection,
}: OnboardingReadyStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-background/40">
        <header className="border-b border-border/60 px-4 py-2.5">
          <h3 className="text-[13px] font-medium text-foreground">
            {t("onboarding.steps.ready.shortcutsTitle", "Shortcuts worth knowing")}
          </h3>
        </header>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 px-4 py-3">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="truncate text-[13px] text-foreground">
                {t(`onboarding.steps.ready.shortcuts.${shortcut.id}`)}
              </span>
              <kbd className="flex-shrink-0 rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {formatShortcutDisplay(shortcut.keys, { symbolic: true })}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[13px] font-medium text-foreground">
          {t("onboarding.steps.ready.nextTitle", "Fine-tune later")}
        </h3>
        <div className="space-y-2">
          {NEXT_STEPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenSettingsSection(item.section)}
              className="focus-ring motion-color group flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:border-border-hover hover:bg-secondary/40"
            >
              <item.icon className="h-4 w-4 flex-shrink-0 settings-accent-fg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">
                  {t(`onboarding.steps.ready.links.${item.id}.title`)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t(`onboarding.steps.ready.links.${item.id}.description`)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
