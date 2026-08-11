import { useState } from "react";
import { useTranslation } from "react-i18next";

import { resetOnboarding } from "./onboardingStatus";

/**
 * Shared control for the maintenance sections that let users replay the guide.
 * Clearing both the local flag and the persisted setting is what actually makes
 * the guide reappear, so the logic lives in one place.
 */
export default function ShowOnboardingAgainButton() {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    await resetOnboarding();
    setDone(true);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="settings-accent-bg-soft settings-accent-fg motion-color focus-ring rounded-lg px-4 py-2 text-sm font-medium hover:opacity-80"
    >
      {done
        ? t(
            "settings.advanced.onboardingReset",
            "Onboarding will be shown next time the app opens",
          )
        : t("settings.advanced.showOnboarding", "Show onboarding again")}
    </button>
  );
}
