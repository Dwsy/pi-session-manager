import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import SettingsInput from "@/components/settings/SettingsInput";
import SettingsSelect from "@/components/settings/SettingsSelect";
import type { SettingDef } from "./settingsDefinitions";
import type { ModelOptionsData } from "./useModelOptions";

export default function SettingRow({
  def,
  value,
  saving,
  saved,
  onSave,
  modelData,
  currentProvider,
}: {
  def: SettingDef;
  value: unknown;
  saving: boolean;
  saved: boolean;
  onSave: (key: string, value: unknown) => void;
  modelData: ModelOptionsData;
  currentProvider?: string;
}) {
  const { t } = useTranslation();
  const label = t(def.labelKey, def.fallbackLabel);
  const desc = t(def.descKey, def.fallbackDesc);

  const savedIndicator = saved ? (
    <Check className="h-3 w-3 text-green-400" />
  ) : null;

  if (def.type === "bool") {
    const checked =
      value !== undefined ? value === true : def.defaultValue === true;
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <button
            onClick={() => onSave(def.key, !checked)}
            disabled={saving}
            className={`relative w-9 h-5 rounded-full motion-color focus-ring ${checked ? "bg-info" : "bg-border"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm motion-transform ${
                checked ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>
      </div>
    );
  }

  if (def.type === "enum" && def.options) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <SettingsSelect
            value={
              (value as string) ??
              (def.defaultValue as string | undefined) ??
              def.options[0]
            }
            onChange={(e) => onSave(def.key, e.target.value)}
            disabled={saving}
            className="w-auto text-xs rounded-md px-2 py-1 focus:ring-1 focus:ring-info"
          >
            {def.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </SettingsSelect>
        </div>
      </div>
    );
  }

  // Model provider dropdown
  if (def.type === "model-provider") {
    const { providers, loading: modelsLoading } = modelData;
    const current = (value as string) ?? "";
    // Include current value even if not in list yet
    const allProviders =
      current && !providers.includes(current)
        ? [current, ...providers]
        : providers;

    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {desc}
            {modelsLoading && <span className="ml-1 text-info">⟳</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <SettingsSelect
            value={current}
            onChange={(e) => onSave(def.key, e.target.value || null)}
            disabled={saving}
            className="w-auto text-xs rounded-md px-2 py-1 focus:ring-1 focus:ring-info max-w-[180px]"
          >
            <option value="">—</option>
            {allProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SettingsSelect>
        </div>
      </div>
    );
  }

  // Model ID dropdown (filtered by current provider)
  if (def.type === "model-id") {
    const { modelsByProvider, providers, loading: modelsLoading } = modelData;
    const current = (value as string) ?? "";
    // If provider is set, show only that provider's models; otherwise show all
    let modelOptions: string[];
    if (currentProvider && modelsByProvider.has(currentProvider)) {
      modelOptions = modelsByProvider.get(currentProvider)!;
    } else {
      // Show all models grouped
      modelOptions = providers.flatMap((p) => modelsByProvider.get(p) ?? []);
    }
    // Include current value even if not in list
    if (current && !modelOptions.includes(current)) {
      modelOptions = [current, ...modelOptions];
    }

    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">
            {desc}
            {modelsLoading && <span className="ml-1 text-info">⟳</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <SettingsSelect
            value={current}
            onChange={(e) => onSave(def.key, e.target.value || null)}
            disabled={saving}
            className="w-auto text-xs rounded-md px-2 py-1 focus:ring-1 focus:ring-info max-w-[220px]"
          >
            <option value="">—</option>
            {currentProvider && modelsByProvider.has(currentProvider)
              ? // Show current provider's models
                modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              : // Show all grouped by provider
                providers.map((p) => (
                  <optgroup key={p} label={p}>
                    {(modelsByProvider.get(p) ?? []).map((m) => (
                      <option key={`${p}/${m}`} value={m}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                ))}
          </SettingsSelect>
        </div>
      </div>
    );
  }

  // number input
  if (def.type === "number") {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
        <div className="min-w-0 mr-3">
          <div className="text-sm text-foreground">{label}</div>
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedIndicator}
          <SettingsInput
            type="number"
            value={
              (value as number) ??
              (def.defaultValue as number | undefined) ??
              ""
            }
            placeholder="—"
            onChange={(e) => {
              const v = e.target.value ? parseInt(e.target.value, 10) : null;
              onSave(def.key, v != null && !isNaN(v) ? v : null);
            }}
            disabled={saving}
            className="w-24 text-xs rounded-md px-2 py-1 placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-info"
          />
        </div>
      </div>
    );
  }

  // text fallback
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface/50 motion-surface motion-color">
      <div className="min-w-0 mr-3">
        <div className="text-sm text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {savedIndicator}
        <SettingsInput
          type="text"
          value={(value as string) ?? ""}
          placeholder="—"
          onChange={(e) => onSave(def.key, e.target.value || null)}
          disabled={saving}
          className="w-32 text-xs rounded-md px-2 py-1 placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-info"
        />
      </div>
    </div>
  );
}
