import { useTranslation } from "react-i18next";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import SettingsOptionGroup from "@/components/settings/SettingsOptionGroup";
import SettingsRadioCardGroup from "@/components/settings/SettingsRadioCardGroup";
import type { AppSettings } from "@/components/settings/types";
import OnboardingThemePreview from "./OnboardingThemePreview";

type Appearance = AppSettings["appearance"];
type PreviewTheme = "dark" | "light" | "system";
type FontSize = Appearance["fontSize"];

const THEME_OPTIONS: readonly PreviewTheme[] = ["dark", "light", "system"];
const FONT_SIZE_OPTIONS: readonly FontSize[] = ["small", "medium", "large"];
const LOCALES = [
  { code: "zh-CN", name: "简体中文" },
  { code: "en-US", name: "English" },
  { code: "ja-JP", name: "日本語" },
  { code: "fr-FR", name: "Français" },
  { code: "de-DE", name: "Deutsch" },
  { code: "es-ES", name: "Español" },
] as const;

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const;

interface OnboardingAppearanceStepProps {
  appearance: Appearance;
  locale: string;
  onAppearanceChange: <K extends keyof Appearance>(
    key: K,
    value: Appearance[K],
  ) => void;
  onLocaleChange: (locale: string) => void;
}

export default function OnboardingAppearanceStep({
  appearance,
  locale,
  onAppearanceChange,
  onLocaleChange,
}: OnboardingAppearanceStepProps) {
  const { t, i18n } = useTranslation();
  // A custom Pi theme is configured elsewhere; the guide only offers the three
  // built-in modes and falls back to dark so the radio group always has a value.
  const selectedTheme: PreviewTheme =
    appearance.theme === "light" || appearance.theme === "system"
      ? appearance.theme
      : "dark";

  const handleLocaleChange = (nextLocale: string) => {
    onLocaleChange(nextLocale);
    void i18n.changeLanguage(nextLocale);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <h3 className="text-[13px] font-medium text-foreground">
          {t("onboarding.steps.appearance.themeLabel", "Theme")}
        </h3>
        <SettingsRadioCardGroup
          options={THEME_OPTIONS}
          value={selectedTheme}
          onChange={(theme) => onAppearanceChange("theme", theme)}
          name="onboarding-theme"
          containerClassName="grid grid-cols-3 gap-2"
          itemClassName="items-start"
          getPrefix={(theme) => {
            const Icon = THEME_ICONS[theme];
            return <Icon className="h-4 w-4 flex-shrink-0" />;
          }}
          getLabel={(theme) =>
            t(`onboarding.steps.appearance.themes.${theme}`, theme)
          }
          getDescription={(theme) =>
            t(`onboarding.steps.appearance.themeHints.${theme}`, "")
          }
        />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-foreground">
            {t("onboarding.steps.appearance.fontSizeLabel", "Text size")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              "onboarding.steps.appearance.fontSizeHint",
              "Applies to the whole app right away.",
            )}
          </p>
        </div>
        <SettingsOptionGroup
          options={FONT_SIZE_OPTIONS}
          value={appearance.fontSize}
          onChange={(size) => onAppearanceChange("fontSize", size)}
          renderLabel={(size) =>
            t(`onboarding.steps.appearance.fontSizes.${size}`, size)
          }
          containerClassName="flex flex-shrink-0 gap-2"
          optionClassName="px-4 py-1.5"
        />
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[13px] font-medium text-foreground">
          {t("onboarding.steps.appearance.languageLabel", "Language")}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {LOCALES.map((item) => {
            const active = item.code === locale;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => handleLocaleChange(item.code)}
                aria-pressed={active}
                className={`focus-ring motion-color flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-[13px] ${
                  active
                    ? "settings-accent-bg-soft settings-accent-ring settings-accent-fg border-transparent font-medium"
                    : "border-border text-foreground hover:border-border-hover"
                }`}
              >
                <span className="truncate">{item.name}</span>
                {active && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[13px] font-medium text-foreground">
          {t("onboarding.steps.appearance.previewLabel", "Live preview")}
        </h3>
        <OnboardingThemePreview />
      </section>
    </div>
  );
}
