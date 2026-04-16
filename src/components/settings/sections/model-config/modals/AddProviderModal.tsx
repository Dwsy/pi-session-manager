import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import { ModalShell } from "../ui/ModalShell";

interface AddProviderModalProps {
  open: boolean;
  newProviderName: string;
  onNewProviderNameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function AddProviderModal({
  open,
  newProviderName,
  onNewProviderNameChange,
  onClose,
  onConfirm,
}: AddProviderModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <ModalShell
      title={t(
        "settings.modelConfigCenter.dialogs.addProviderTitle",
        "Add Provider",
      )}
      description={t(
        "settings.modelConfigCenter.dialogs.addProviderDesc",
        "Give Provider a stable name first, then continue to fill in connection info on the right after creation.",
      )}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
          >
            {t("settings.modelConfigCenter.actions.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm text-white hover:bg-info/90 motion-color motion-press focus-ring"
          >
            <Plus className="h-4 w-4" />
            {t(
              "settings.modelConfigCenter.actions.createProvider",
              "Create Provider",
            )}
          </button>
        </>
      }
    >
      <SettingsField
        label={t(
          "settings.modelConfigCenter.fields.providerKey",
          "Provider Key",
        )}
      >
        <SettingsInput
          autoFocus
          value={newProviderName}
          onChange={(event) => onNewProviderNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
          placeholder={t(
            "settings.modelConfigCenter.placeholders.providerName",
            "e.g., local-openai",
          )}
        />
      </SettingsField>
    </ModalShell>
  );
}
