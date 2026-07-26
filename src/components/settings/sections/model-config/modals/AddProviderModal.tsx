import { Copy, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import SettingsField from "@/components/settings/SettingsField";
import SettingsInput from "@/components/settings/SettingsInput";
import { ModalShell } from "../ui/ModalShell";

export type ProviderNameModalMode = "create" | "copy";

interface AddProviderModalProps {
  open: boolean;
  mode?: ProviderNameModalMode;
  /** Source provider name when mode is copy (shown in description). */
  sourceProviderName?: string;
  newProviderName: string;
  onNewProviderNameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function AddProviderModal({
  open,
  mode = "create",
  sourceProviderName = "",
  newProviderName,
  onNewProviderNameChange,
  onClose,
  onConfirm,
}: AddProviderModalProps) {
  const { t } = useTranslation();
  const isCopy = mode === "copy";

  if (!open) return null;

  return (
    <ModalShell
      title={
        isCopy
          ? t(
              "settings.modelConfigCenter.dialogs.copyProviderTitle",
              "复制 Provider",
            )
          : t(
              "settings.modelConfigCenter.dialogs.addProviderTitle",
              "Add Provider",
            )
      }
      description={
        isCopy
          ? t(
              "settings.modelConfigCenter.dialogs.copyProviderDesc",
              "为“{{name}}”的副本指定新名称，可改默认名后确认。",
              { name: sourceProviderName || "-" },
            )
          : t(
              "settings.modelConfigCenter.dialogs.addProviderDesc",
              "Give Provider a stable name first, then continue to fill in connection info on the right after creation.",
            )
      }
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all motion-press focus-ring"
          >
            {isCopy ? (
              <Copy className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isCopy
              ? t(
                  "settings.modelConfigCenter.actions.confirmCopyProvider",
                  "确认复制",
                )
              : t(
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
