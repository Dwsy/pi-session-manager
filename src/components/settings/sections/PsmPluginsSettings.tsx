import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Download,
  FilePlus2,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import {
  addPathPsmPlugin,
  getPsmPluginPaths,
  installPsmPlugin,
  psmPluginHost,
  removePathPsmPlugin,
  setPsmPluginEnabled,
  setPsmPluginSettings,
  uninstallPsmPlugin,
  updatePsmPlugins,
  type PsmPluginPaths,
  type PsmPluginStatus,
} from "@/plugins/runtime-host";
import type { PsmPluginSettingDefinition, PsmPluginSettingValue } from "@pi-session-manager/plugin-sdk";
import { useModelOptions } from "./pi-config/useModelOptions";

interface PsmPluginsSettingsProps {
  pluginId?: string;
}

function statusIcon(plugin: PsmPluginStatus) {
  if (plugin.state === "active") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (plugin.state === "disabled") return <CircleOff className="h-4 w-4 text-muted-foreground" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

function sourceLabel(plugin: PsmPluginStatus) {
  if (plugin.source === "builtin") return "Built-in";
  if (plugin.source === "path") return "Path";
  return plugin.packageName || "NPM";
}

function diagnosticMessage(diagnostic: PsmPluginStatus["diagnostics"][number] | string) {
  return typeof diagnostic === "string" ? diagnostic : diagnostic.message;
}

function pluginSearchPrefix(plugin: PsmPluginStatus) {
  return `psm-plugin-${plugin.id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function pluginI18nBase(plugin: PsmPluginStatus) {
  return `plugins.${plugin.id}`;
}

function settingValue(plugin: PsmPluginStatus, definition: PsmPluginSettingDefinition): PsmPluginSettingValue {
  const value = plugin.settings?.[definition.key];
  return value === undefined ? (definition.default ?? "") : value;
}

function settingValueByKey(plugin: PsmPluginStatus, key: string): PsmPluginSettingValue {
  const definition = plugin.manifest?.configuration?.properties?.find((property) => property.key === key);
  const value = plugin.settings?.[key];
  return value === undefined ? (definition?.default ?? "") : value;
}

function coerceNumber(value: string, definition: PsmPluginSettingDefinition) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return definition.default ?? 0;
  const min = definition.min ?? Number.NEGATIVE_INFINITY;
  const max = definition.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, parsed));
}

export default function PsmPluginsSettings({ pluginId }: PsmPluginsSettingsProps) {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<PsmPluginStatus[]>([]);
  const [paths, setPaths] = useState<PsmPluginPaths | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [npmAction, setNpmAction] = useState<string | null>(null);
  const [pathAction, setPathAction] = useState<string | null>(null);
  const [packageNameInput, setPackageNameInput] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const installPrefix = paths?.npmDir ?? "~/.pi/pi-session-manager/extensions/npm";
  const trimmedPackageName = packageNameInput.trim();
  const trimmedPath = pathInput.trim();
  const npmBusy = loading || npmAction !== null;
  const pathBusy = loading || pathAction !== null;
  const visiblePlugins = useMemo(
    () => plugins.filter((plugin) => plugin.id !== "npm-discovery"),
    [plugins],
  );
  const selectedPlugin = pluginId ? visiblePlugins.find((plugin) => plugin.id === pluginId) : null;
  const needsModelOptions = selectedPlugin?.manifest?.configuration?.properties?.some((definition) => definition.type === "model-provider" || definition.type === "model-id") ?? false;
  const modelData = useModelOptions(needsModelOptions);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPlugins, nextPaths] = await Promise.all([
        psmPluginHost.reload(),
        getPsmPluginPaths(),
      ]);
      setPlugins(nextPlugins);
      setPaths(nextPaths);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const togglePlugin = async (plugin: PsmPluginStatus, enabled: boolean) => {
    setUpdatingId(plugin.id);
    setError(null);
    try {
      await setPsmPluginEnabled({
        pluginId: plugin.id,
        enabled,
        source: plugin.source,
        packageName: plugin.packageName ?? null,
        entryPath: plugin.source === "path" ? (plugin.entryPath ?? plugin.sourceId) : null,
      });
      setPlugins(await psmPluginHost.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const installPlugin = async () => {
    if (!trimmedPackageName) return;
    setNpmAction("install");
    setError(null);
    try {
      await installPsmPlugin(trimmedPackageName);
      setPlugins(await psmPluginHost.reload());
      setPackageNameInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNpmAction(null);
    }
  };

  const addPathPlugin = async () => {
    if (!trimmedPath) return;
    setPathAction("add");
    setError(null);
    try {
      await addPathPsmPlugin(trimmedPath);
      setPlugins(await psmPluginHost.reload());
      setPathInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPathAction(null);
    }
  };

  const updatePlugins = async () => {
    setNpmAction("update");
    setError(null);
    try {
      await updatePsmPlugins();
      setPlugins(await psmPluginHost.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNpmAction(null);
    }
  };

  const updatePluginSettings = async (plugin: PsmPluginStatus, nextSettings: Record<string, PsmPluginSettingValue>) => {
    setUpdatingId(`settings:${plugin.id}`);
    setError(null);
    try {
      await setPsmPluginSettings({
        pluginId: plugin.id,
        settings: nextSettings,
        source: plugin.source,
        packageName: plugin.packageName ?? null,
        entryPath: plugin.source === "path" ? (plugin.entryPath ?? plugin.sourceId) : null,
      });
      setPlugins(await psmPluginHost.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const updatePluginSetting = async (plugin: PsmPluginStatus, key: string, value: PsmPluginSettingValue) => {
    await updatePluginSettings(plugin, {
      ...(plugin.settings ?? {}),
      [key]: value,
    });
  };

  const updateModelProviderSetting = async (plugin: PsmPluginStatus, definition: PsmPluginSettingDefinition, provider: string) => {
    const modelKey = definition.modelKey ?? "model";
    const currentModel = String(settingValueByKey(plugin, modelKey) ?? "");
    const providerModels = provider ? (modelData.modelsByProvider.get(provider) ?? []) : [];
    const nextModel = provider && currentModel && providerModels.includes(currentModel) ? currentModel : "";

    await updatePluginSettings(plugin, {
      ...(plugin.settings ?? {}),
      [definition.key]: provider,
      [modelKey]: nextModel,
    });
  };

  const updateModelIdSetting = async (plugin: PsmPluginStatus, definition: PsmPluginSettingDefinition, rawValue: string) => {
    const providerKey = definition.providerKey ?? "provider";
    const parsed = rawValue.includes("::") ? rawValue.split("::", 2) : null;

    await updatePluginSettings(plugin, {
      ...(plugin.settings ?? {}),
      ...(parsed ? { [providerKey]: parsed[0] } : {}),
      [definition.key]: parsed ? parsed[1] : rawValue,
    });
  };

  const removePlugin = async (plugin: PsmPluginStatus) => {
    if (plugin.source === "npm" && !plugin.packageName) return;
    if (plugin.source === "path" && !(plugin.entryPath || plugin.sourceId)) return;
    const action = `remove:${plugin.id}`;
    if (plugin.source === "path") setPathAction(action);
    else setNpmAction(action);
    setError(null);
    try {
      if (plugin.source === "npm" && plugin.packageName) {
        await uninstallPsmPlugin(plugin.packageName);
      } else if (plugin.source === "path") {
        await removePathPsmPlugin(plugin.entryPath ?? plugin.sourceId);
      }
      setPlugins(await psmPluginHost.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNpmAction(null);
      setPathAction(null);
    }
  };

  const renderError = () => error ? (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </div>
  ) : null;

  const renderPluginSummary = (plugin: PsmPluginStatus) => (
    <div key={plugin.id} className="rounded-md border border-border/60 bg-surface/35 px-3 py-2.5">
      <SettingsToggleRow
        title={
          <span className="flex min-w-0 items-center gap-2">
            {statusIcon(plugin)}
            <span className="truncate">{plugin.name}</span>
            {plugin.version && <span className="shrink-0 text-xs font-normal text-muted-foreground">{plugin.version}</span>}
          </span>
        }
        description={
          <span className="block min-w-0 text-xs">
            <span className="font-mono">{plugin.id}</span>
            <span className="px-1.5">·</span>
            <span>{sourceLabel(plugin)}</span>
            <span className="px-1.5">·</span>
            <span>{plugin.commands.length} commands</span>
            <span className="px-1.5">/</span>
            <span>{plugin.tools.length} tools</span>
            {plugin.manifest?.configuration?.properties?.length ? (
              <>
                <span className="px-1.5">·</span>
                <span>{plugin.manifest.configuration.properties.length} settings</span>
              </>
            ) : null}
          </span>
        }
        checked={plugin.enabled && plugin.state !== "disabled"}
        onChange={(enabled) => void togglePlugin(plugin, enabled)}
        toggleSize="sm"
        className={updatingId === plugin.id ? "opacity-60" : ""}
      />
      {plugin.diagnostics.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {plugin.diagnostics.map((diagnostic, index) => (
            <div key={`${plugin.id}-${index}`} className="break-words">{diagnosticMessage(diagnostic)}</div>
          ))}
        </div>
      )}
      {((plugin.source === "npm" && plugin.packageName) || plugin.source === "path") && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void removePlugin(plugin)}
            disabled={npmBusy || pathBusy}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/15 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("settings.psmPlugins.remove", "Remove")}
          </button>
        </div>
      )}
    </div>
  );

  const renderSettingControl = (plugin: PsmPluginStatus, definition: PsmPluginSettingDefinition) => {
    const value = settingValue(plugin, definition);
    const fieldId = `${plugin.id}-${definition.key}`;
    const searchId = `${pluginSearchPrefix(plugin)}-${definition.key}`;
    const currentSettings = plugin.settings ?? {};
    const base = pluginI18nBase(plugin);
    const title = t(`${base}.settings.${definition.key}.title`, definition.title);
    const description = definition.description
      ? t(`${base}.settings.${definition.key}.description`, definition.description)
      : "";
    const disabled = updatingId === `settings:${plugin.id}`;
    const autoLabel = t("settings.psmPlugins.modelAuto", "Auto");

    return (
      <div
        key={definition.key}
        data-settings-search={searchId}
        className="grid min-h-[54px] grid-cols-1 items-start gap-2 border-t border-border/50 py-3 first:border-t-0 md:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.1fr)] md:gap-4"
      >
        <label htmlFor={fieldId} className="min-w-0 pt-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {description && <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>}
        </label>
        <div className="min-w-0">
          {definition.type === "model-provider" ? (
            <select
              id={fieldId}
              value={String(value)}
              disabled={disabled}
              onChange={(event) => void updateModelProviderSetting(plugin, definition, event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background/70 px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
            >
              <option value="">{autoLabel}</option>
              {String(value) && !modelData.providers.includes(String(value)) ? (
                <option value={String(value)}>{String(value)}</option>
              ) : null}
              {modelData.providers.map((provider) => (
                <option key={`${definition.key}-${provider}`} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          ) : definition.type === "model-id" ? (
            <select
              id={fieldId}
              value={String(value)}
              disabled={disabled}
              onChange={(event) => void updateModelIdSetting(plugin, definition, event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background/70 px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
            >
              <option value="">{autoLabel}</option>
              {(() => {
                const providerKey = definition.providerKey ?? "provider";
                const provider = String(settingValueByKey(plugin, providerKey) ?? "");
                const current = String(value);
                const providerModels = provider ? (modelData.modelsByProvider.get(provider) ?? []) : [];
                const modelOptions = provider
                  ? providerModels
                  : modelData.providers.flatMap((item) => (modelData.modelsByProvider.get(item) ?? []).map((model) => `${item}::${model}`));
                const currentValueInOptions = provider
                  ? providerModels.includes(current)
                  : modelOptions.some((option) => option.endsWith(`::${current}`));

                return (
                  <>
                    {current && !currentValueInOptions ? <option value={current}>{current}</option> : null}
                    {provider
                      ? providerModels.map((model) => (
                        <option key={`${definition.key}-${provider}-${model}`} value={model}>
                          {model}
                        </option>
                      ))
                      : modelData.providers.map((item) => (
                        <optgroup key={`${definition.key}-${item}`} label={item}>
                          {(modelData.modelsByProvider.get(item) ?? []).map((model) => (
                            <option key={`${definition.key}-${item}-${model}`} value={`${item}::${model}`}>
                              {model}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </>
                );
              })()}
            </select>
          ) : definition.type === "select" ? (
            <select
              id={fieldId}
              value={String(value)}
              disabled={disabled}
              onChange={(event) => void updatePluginSetting(plugin, definition.key, event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background/70 px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
            >
              {(definition.options ?? []).map((option) => (
                <option key={`${definition.key}-${String(option.value)}`} value={String(option.value)}>
                  {t(`${base}.settings.${definition.key}.options.${String(option.value)}`, option.label)}
                </option>
              ))}
            </select>
          ) : definition.type === "boolean" ? (
            <button
              id={fieldId}
              type="button"
              disabled={disabled}
              onClick={() => void updatePluginSetting(plugin, definition.key, !Boolean(value))}
              className={`inline-flex h-8 min-w-[84px] items-center justify-center rounded-md border px-2.5 text-xs font-medium ${Boolean(value) ? "border-info/35 bg-info/12 text-foreground" : "border-border bg-background/70 text-muted-foreground"}`}
            >
              {Boolean(value) ? t("settings.psmPlugins.enabled", "Enabled") : t("settings.psmPlugins.disabled", "Disabled")}
            </button>
          ) : definition.type === "number" ? (
            <input
              id={fieldId}
              type="number"
              min={definition.min}
              max={definition.max}
              step={definition.step ?? 1}
              value={String(value)}
              disabled={disabled}
              onChange={(event) => void updatePluginSetting(plugin, definition.key, coerceNumber(event.target.value, definition))}
              className="h-9 w-full rounded-md border border-border bg-background/70 px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
            />
          ) : (
            <input
              id={fieldId}
              type="text"
              defaultValue={String(value)}
              disabled={disabled}
              onBlur={(event) => {
                if (event.target.value !== String(currentSettings[definition.key] ?? definition.default ?? "")) {
                  void updatePluginSetting(plugin, definition.key, event.target.value);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-9 w-full rounded-md border border-border bg-background/70 px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
            />
          )}
        </div>
      </div>
    );
  };

  if (pluginId) {
    return (
      <div className="space-y-4">
        {renderError()}
        {!selectedPlugin && !loading ? (
          <SettingsCard
            title={t("settings.psmPlugins.pluginMissing", "Plugin not available")}
            description={t("settings.psmPlugins.pluginMissingDesc", "Reload plugins or install the package again.")}
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("settings.psmPlugins.reload", "Reload")}
            </button>
          </SettingsCard>
        ) : selectedPlugin ? (
          <SettingsCard
            title={t(`${pluginI18nBase(selectedPlugin)}.configuration.title`, selectedPlugin.manifest?.configuration?.title ?? selectedPlugin.name)}
            description={t(`${pluginI18nBase(selectedPlugin)}.configuration.description`, selectedPlugin.manifest?.configuration?.description ?? selectedPlugin.name)}
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            <div className="space-y-4">
              {renderPluginSummary(selectedPlugin)}
              <div className="rounded-md border border-border/60 bg-surface/30 px-3">
                {(selectedPlugin.manifest?.configuration?.properties ?? []).map((definition) => renderSettingControl(selectedPlugin, definition))}
              </div>
            </div>
          </SettingsCard>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title={t("settings.psmPlugins.title", "PSM Plugins")}
        description={t("settings.psmPlugins.description", "{{count}} plugins discovered", { count: visiblePlugins.length })}
        icon={<Package className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              <div className="truncate">
                {t("settings.psmPlugins.config", "Config")} <span className="font-mono text-foreground">{paths?.configPath ?? "~/.pi/pi-session-manager/plugins.json"}</span>
              </div>
              <div className="truncate">
                {t("settings.psmPlugins.npm", "NPM")} <span className="font-mono text-foreground">{installPrefix}</span>
              </div>
              <div className="truncate">
                {t("settings.psmPlugins.pathPlugins", "Path plugins")} <span className="font-mono text-foreground">{paths?.customPaths?.length ?? 0}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("settings.psmPlugins.reload", "Reload")}
            </button>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={packageNameInput}
                onChange={(event) => setPackageNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void installPlugin();
                }}
                placeholder={t("settings.psmPlugins.packagePlaceholder", "npm package name")}
                disabled={npmBusy}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-info disabled:opacity-60"
              />
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void installPlugin()}
                  disabled={npmBusy || !trimmedPackageName}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("settings.psmPlugins.install", "Install")}
                </button>
                <button
                  type="button"
                  onClick={() => void updatePlugins()}
                  disabled={npmBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${npmAction === "update" ? "animate-spin" : ""}`} />
                  {t("settings.psmPlugins.update", "Update")}
                </button>
              </div>
            </div>
            <div className="mt-2 truncate text-xs text-muted-foreground">
              <span className="font-mono text-foreground">npm install --prefix {installPrefix} &lt;package&gt;</span>
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addPathPlugin();
                }}
                placeholder={t("settings.psmPlugins.pathPlaceholder", "local plugin entry path")}
                disabled={pathBusy}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-info disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void addPathPlugin()}
                disabled={pathBusy || !trimmedPath}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                {t("settings.psmPlugins.addPath", "Add path")}
              </button>
            </div>
            <div className="mt-2 truncate text-xs text-muted-foreground">
              <span className="font-mono text-foreground">/absolute/path/to/plugin.mjs</span>
            </div>
          </div>

          {renderError()}

          <div className="space-y-2">
            {visiblePlugins.length === 0 && !loading ? (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {t("settings.psmPlugins.empty", "No PSM plugins discovered.")}
              </div>
            ) : (
              visiblePlugins.map(renderPluginSummary)
            )}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
