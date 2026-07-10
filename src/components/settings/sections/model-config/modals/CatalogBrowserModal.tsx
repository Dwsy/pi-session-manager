import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Library,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { ModelIcon } from "@/components/session-viewer/ModelIcon";
import { ModalShell } from "../ui/ModalShell";
import {
  fetchModelsDevCatalog,
  listCatalogModels,
  listCatalogProviders,
  type CatalogModelOption,
  type ModelsDevCatalog,
} from "../catalog";
import { asErrorMessage } from "../utils";

interface CatalogBrowserModalProps {
  open: boolean;
  targetProvider: string;
  existingModelIds: string[];
  onClose: () => void;
  onConfirm: (models: CatalogModelOption[]) => void;
}

export function CatalogBrowserModal({
  open,
  targetProvider,
  existingModelIds,
  onClose,
  onConfirm,
}: CatalogBrowserModalProps) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<ModelsDevCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [selectedCatalogProvider, setSelectedCatalogProvider] = useState("");
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
    setError(null);
    void loadCatalog();
  }, [open]);

  const providers = useMemo(
    () => (catalog ? listCatalogProviders(catalog) : []),
    [catalog],
  );

  const filteredProviders = useMemo(() => {
    const query = providerFilter.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((provider) =>
      `${provider.id} ${provider.name}`.toLowerCase().includes(query),
    );
  }, [providerFilter, providers]);

  useEffect(() => {
    if (!open || providers.length === 0) return;
    if (
      selectedCatalogProvider &&
      providers.some((provider) => provider.id === selectedCatalogProvider)
    ) {
      return;
    }
    const preferred =
      providers.find(
        (provider) =>
          provider.id === targetProvider ||
          provider.name.toLowerCase() === targetProvider.toLowerCase(),
      ) ?? providers[0];
    setSelectedCatalogProvider(preferred?.id ?? "");
  }, [open, providers, selectedCatalogProvider, targetProvider]);

  const models = useMemo(
    () =>
      catalog && selectedCatalogProvider
        ? listCatalogModels(catalog, selectedCatalogProvider)
        : [],
    [catalog, selectedCatalogProvider],
  );

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    if (!query) return models;
    return models.filter((model) =>
      `${model.id} ${model.name}`.toLowerCase().includes(query),
    );
  }, [modelFilter, models]);

  const selectableModels = filteredModels.filter(
    (model) => !existingIdSet.has(model.id.trim().toLowerCase()),
  );
  const selectedCount = selectedModelIds.size;

  async function loadCatalog(force = false) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchModelsDevCatalog({ force });
      setCatalog(data);
    } catch (err) {
      setError(asErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(model: CatalogModelOption) {
    const key = model.id.trim().toLowerCase();
    if (!key || existingIdSet.has(key)) return;

    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(model.id)) {
        next.delete(model.id);
      } else {
        next.add(model.id);
      }
      return next;
    });
  }

  function selectVisible() {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      for (const model of selectableModels) {
        next.add(model.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedModelIds(new Set());
  }

  function handleConfirm() {
    const selected = models.filter((model) => selectedModelIds.has(model.id));
    onConfirm(selected);
  }

  if (!open) return null;

  return (
    <ModalShell
      title={t(
        "settings.modelConfigCenter.dialogs.catalogTitle",
        "从 models.dev 添加模型",
      )}
      description={t(
        "settings.modelConfigCenter.dialogs.catalogDesc",
        "浏览 models.dev 目录，勾选后添加到当前 Provider：{{provider}}",
        { provider: targetProvider || "-" },
      )}
      onClose={onClose}
      widthClass="max-w-4xl"
      footer={
        <>
          <div className="mr-auto text-[11px] text-muted-foreground">
            {t(
              "settings.modelConfigCenter.status.catalogSelected",
              "已选 {{count}} 个",
              { count: selectedCount },
            )}
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
            <Library className="h-4 w-4" />
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
            onClick={() => void loadCatalog(true)}
            disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] font-medium text-foreground hover:bg-surface transition-colors focus-ring disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t(
              "settings.modelConfigCenter.actions.refreshCatalog",
              "刷新目录",
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
          <span className="text-[11px] text-muted-foreground">
            Source: models.dev/api.json
          </span>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid min-h-[420px] grid-cols-1 overflow-hidden rounded-lg border border-border/50 md:grid-cols-[220px_1fr]">
          <div className="flex min-h-0 flex-col border-b border-border/40 md:border-b-0 md:border-r">
            <div className="border-b border-border/30 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  value={providerFilter}
                  onChange={(event) => setProviderFilter(event.target.value)}
                  placeholder={t(
                    "settings.modelConfigCenter.placeholders.catalogProviderSearch",
                    "搜索 catalog providers",
                  )}
                  className="h-7 w-full rounded-md border border-border/50 bg-background/45 pl-6 pr-2 font-mono text-[11px] text-foreground outline-none focus:settings-accent-ring"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
              {loading && !catalog ? (
                <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t(
                    "settings.modelConfigCenter.status.loadingCatalog",
                    "加载 models.dev...",
                  )}
                </div>
              ) : (
                filteredProviders.map((provider) => {
                  const active = provider.id === selectedCatalogProvider;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => setSelectedCatalogProvider(provider.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
                        active
                          ? "settings-accent-bg-soft settings-accent-ring border border-transparent font-semibold"
                          : "border border-transparent hover:bg-accent/10"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs">{provider.name}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {provider.id}
                        </div>
                      </div>
                      <span className="rounded bg-surface px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                        {provider.modelCount}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border/30 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                  placeholder={t(
                    "settings.modelConfigCenter.placeholders.catalogModelSearch",
                    "搜索 catalog models",
                  )}
                  className="h-7 w-full rounded-md border border-border/50 bg-background/45 pl-6 pr-2 font-mono text-[11px] text-foreground outline-none focus:settings-accent-ring"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
              {filteredModels.map((model) => {
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
                        {model.reasoning && (
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        )}
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
                        <span>{model.name}</span>
                        {model.contextWindow ? (
                          <span>
                            {Math.round(model.contextWindow / 1024)}k ctx
                          </span>
                        ) : null}
                        {model.cost ? (
                          <span>
                            ${model.cost.input ?? 0}/{model.cost.output ?? 0}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}

              {!loading && filteredModels.length === 0 && (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {t(
                    "settings.modelConfigCenter.empty.noCatalogModels",
                    "没有匹配的 catalog 模型",
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
