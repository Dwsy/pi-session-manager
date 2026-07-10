import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CloudDownload,
  Loader2,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { ModelIcon } from "@/components/session-viewer/ModelIcon";
import { ModalShell } from "../ui/ModalShell";
import type { ProviderEntry } from "../types";
import {
  fetchProviderRemoteModels,
  type ProviderRemoteModel,
  type ProviderRemoteModelsResult,
} from "../providerModels";
import { asErrorMessage } from "../utils";

export type { ProviderRemoteModel };

interface ProviderRemoteModelsModalProps {
  open: boolean;
  providerName: string;
  providerEntry?: ProviderEntry;
  existingModelIds: string[];
  onClose: () => void;
  onConfirm: (models: ProviderRemoteModel[]) => void;
}

export function ProviderRemoteModelsModal({
  open,
  providerName,
  providerEntry,
  existingModelIds,
  onClose,
  onConfirm,
}: ProviderRemoteModelsModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProviderRemoteModelsResult | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(),
  );

  const existingIdSet = useMemo(
    () =>
      new Set(
        existingModelIds
          .map((id) => id.trim().toLowerCase())
          .filter(Boolean),
      ),
    [existingModelIds],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedModelIds(new Set());
    setModelFilter("");
    setError(null);
    setResult(null);
    void loadRemoteModels();
  }, [open, providerName]);

  const models = result?.models ?? [];

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    if (!query) return models;
    return models.filter((model) =>
      `${model.id} ${model.name ?? ""} ${model.ownedBy ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [modelFilter, models]);

  const selectableModels = filteredModels.filter(
    (model) => !existingIdSet.has(model.id.trim().toLowerCase()),
  );
  const selectedCount = selectedModelIds.size;

  async function loadRemoteModels() {
    if (!providerEntry?.baseUrl?.trim()) {
      setError(
        t(
          "settings.modelConfigCenter.feedback.remoteModelsNeedBaseUrl",
          "当前 Provider 需要先填写 Base URL",
        ),
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchProviderRemoteModels(providerName, providerEntry);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(asErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(model: ProviderRemoteModel) {
    const key = model.id.trim().toLowerCase();
    if (!key || existingIdSet.has(key)) return;
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(model.id)) next.delete(model.id);
      else next.add(model.id);
      return next;
    });
  }

  function selectVisible() {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      for (const model of selectableModels) next.add(model.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedModelIds(new Set());
  }

  function handleConfirm() {
    onConfirm(models.filter((model) => selectedModelIds.has(model.id)));
  }

  if (!open) return null;

  return (
    <ModalShell
      title={t(
        "settings.modelConfigCenter.dialogs.remoteModelsTitle",
        "从供应商接口获取模型",
      )}
      description={t(
        "settings.modelConfigCenter.dialogs.remoteModelsDesc",
        "请求当前 Provider 的 /models 接口，勾选后添加到：{{provider}}",
        { provider: providerName || "-" },
      )}
      onClose={onClose}
      widthClass="max-w-3xl"
      footer={
        <>
          <div className="mr-auto text-[11px] text-muted-foreground">
            {t(
              "settings.modelConfigCenter.status.catalogSelected",
              "已选 {{count}} 个",
              { count: selectedCount },
            )}
            {result ? (
              <span className="ml-2 font-mono">
                {result.models.length} models · {result.latencyMs}ms
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
          >
            {t("settings.modelConfigCenter.actions.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all motion-press focus-ring disabled:opacity-50"
          >
            <CloudDownload className="h-4 w-4" />
            {t(
              "settings.modelConfigCenter.actions.addSelectedModels",
              "添加所选模型",
            )}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRemoteModels()}
            disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] font-medium text-foreground hover:bg-surface transition-colors focus-ring disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t(
              "settings.modelConfigCenter.actions.refreshRemoteModels",
              "重新获取",
            )}
          </button>
          <button
            type="button"
            onClick={selectVisible}
            disabled={selectableModels.length === 0}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] font-medium text-foreground hover:bg-surface transition-colors focus-ring disabled:opacity-60"
          >
            {t(
              "settings.modelConfigCenter.actions.selectVisibleModels",
              "全选可见",
            )}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] font-medium text-foreground hover:bg-surface transition-colors focus-ring disabled:opacity-60"
          >
            {t(
              "settings.modelConfigCenter.actions.clearModelSelection",
              "清空选择",
            )}
          </button>
          {result?.url ? (
            <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
              GET {result.url}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Server className="h-3 w-3" />
              {providerEntry?.baseUrl || "-"}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border/50">
          <div className="border-b border-border/30 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
              <input
                value={modelFilter}
                onChange={(event) => setModelFilter(event.target.value)}
                placeholder={t(
                  "settings.modelConfigCenter.placeholders.remoteModelSearch",
                  "搜索供应商模型",
                )}
                className="h-7 w-full rounded-md border border-border/50 bg-background/45 pl-6 pr-2 font-mono text-[11px] text-foreground outline-none focus:settings-accent-ring"
              />
            </div>
          </div>

          <div className="max-h-[420px] space-y-0.5 overflow-y-auto p-1">
            {loading && models.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t(
                  "settings.modelConfigCenter.status.loadingRemoteModels",
                  "正在请求供应商 /models ...",
                )}
              </div>
            ) : (
              filteredModels.map((model) => {
                const exists = existingIdSet.has(model.id.trim().toLowerCase());
                const checked = selectedModelIds.has(model.id);
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model)}
                    disabled={exists}
                    className={`flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                      exists
                        ? "cursor-not-allowed border-transparent bg-surface/40 opacity-60"
                        : checked
                          ? "border-primary/30 bg-primary/10"
                          : "border-transparent hover:bg-accent/10"
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked || exists
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-background"
                      }`}
                    >
                      {(checked || exists) && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <ModelIcon model={model.id} size={12} />
                        <span className="truncate text-xs font-medium">
                          {model.id}
                        </span>
                        {exists && (
                          <span className="rounded border border-border/50 px-1 py-px text-[9px] text-muted-foreground">
                            {t(
                              "settings.modelConfigCenter.status.alreadyAdded",
                              "已添加",
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                        {model.name ? <span>{model.name}</span> : null}
                        {model.ownedBy ? <span>{model.ownedBy}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            {!loading && !error && filteredModels.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {t(
                  "settings.modelConfigCenter.empty.noRemoteModels",
                  "供应商未返回可识别模型",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
