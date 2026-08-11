import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";

const SIDEBAR_ROWS = [
  { widthClass: "w-4/5", active: true },
  { widthClass: "w-3/5", active: false },
  { widthClass: "w-2/3", active: false },
  { widthClass: "w-1/2", active: false },
];

/**
 * Miniature of the session viewer built entirely from theme tokens, so switching
 * theme, text size, or language updates it exactly like the real UI would.
 */
export default function OnboardingThemePreview() {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden="true"
      className="flex h-[168px] overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex w-[132px] flex-shrink-0 flex-col gap-2 border-r border-border bg-card px-2.5 py-3">
        <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("onboarding.steps.appearance.preview.sidebar", "Sessions")}
        </div>
        {SIDEBAR_ROWS.map((row, index) => (
          <div
            key={index}
            className={`rounded px-1.5 py-1 ${row.active ? "settings-accent-bg-soft" : ""}`}
          >
            <div
              className="h-1.5 rounded-full"
              style={{
                width: row.active ? "70%" : undefined,
                backgroundColor: row.active
                  ? "var(--accent)"
                  : "rgb(var(--color-muted-foreground) / 0.35)",
              }}
            />
            <div
              className={`mt-1 h-1 rounded-full bg-muted-foreground/20 ${row.widthClass}`}
            />
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3.5 py-3">
        <div
          className="max-w-[78%] self-end rounded-[10px] px-2.5 py-1.5 text-[11px] leading-snug"
          style={{
            backgroundColor: "var(--userMessageBg)",
            color: "var(--userMessageText)",
          }}
        >
          {t(
            "onboarding.steps.appearance.preview.userMessage",
            "Why is the build failing?",
          )}
        </div>

        <p className="text-[11px] leading-snug text-foreground">
          {t(
            "onboarding.steps.appearance.preview.assistantMessage",
            "The bundler cannot resolve the alias — let me check the config.",
          )}
        </p>

        <div
          className="rounded-lg border px-2.5 py-1.5"
          style={{
            backgroundColor: "var(--toolSuccessBg)",
            borderColor: "rgb(var(--color-success) / 0.25)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Terminal
              className="h-3 w-3"
              style={{ color: "var(--tool-color-bash)" }}
            />
            <span
              className="font-mono text-[10px]"
              style={{ color: "var(--tool-color-bash)" }}
            >
              npm run build
            </span>
          </div>
          <div
            className="mt-1 font-mono text-[10px]"
            style={{ color: "var(--toolDiffAdded)" }}
          >
            {t(
              "onboarding.steps.appearance.preview.toolResult",
              "built in 1.24s",
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
