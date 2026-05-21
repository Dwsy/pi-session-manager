import { useTranslation } from "react-i18next";

import SettingsCard from "@/components/settings/SettingsCard";
import type { ExportSettingsProps, SearchSettingsProps } from "@/components/settings/types";
import ExportSettings from "./ExportSettings";
import SearchSettings from "./SearchSettings";

type SearchExportSettingsProps = SearchSettingsProps & ExportSettingsProps;

export default function SearchExportSettings({
  settings,
  onUpdate,
}: SearchExportSettingsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t("settings.searchExport.searchTitle", "Search defaults")}
        description={t(
          "settings.searchExport.searchDescription",
          "Control how sessions are searched and highlighted.",
        )}
      >
        <SearchSettings settings={settings} onUpdate={onUpdate} />
      </SettingsCard>

      <SettingsCard
        title={t("settings.searchExport.exportTitle", "Export defaults")}
        description={t(
          "settings.searchExport.exportDescription",
          "Choose default formats and metadata for session export.",
        )}
      >
        <ExportSettings settings={settings} onUpdate={onUpdate} />
      </SettingsCard>
    </div>
  );
}
