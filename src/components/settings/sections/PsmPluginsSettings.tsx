import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleOff, Download, Package, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";

import SettingsCard from "@/components/settings/SettingsCard";
import SettingsToggleRow from "@/components/settings/SettingsToggleRow";
import {
  getPsmPluginPaths,
  installPsmPlugin,
  psmPluginHost,
  setPsmPluginEnabled,
  setPsmPluginSettings,
  uninstallPsmPlugin,
  updatePsmPlugins,
  type PsmPluginPaths,
  type PsmPluginStatus,
} from "@/plugins/runtime-host";
import type { PsmPluginSettingDefinition, PsmPluginSettingValue } from "@pi-session-manager/plugin-sdk";

function statusIcon(plugin: PsmPluginStatus) {
  if (plugin.state === "active") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (plugin.state === "disabled") return <CircleOff className="h-4 w-4 text-muted-foreground" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

function sourceLabel(plugin: PsmPluginStatus) {
  if (plugin.source === "builtin") return "Built-in";
  return plugin.packageName || "NPM";
}

function diagnosticMessage(diagnostic: PsmPluginStatus["diagnostics"][number] | string) {
  return typeof diagnostic === "string" ? diagnostic : diagnostic.message;
}

function settingValue(plugin: PsmPluginStatus, definition: PsmPluginSettingDefinition): PsmPluginSettingValue {
  const value = plugin.settings?.[definition.key]
  return value === undefined ? (definition.default ?? "") : value
}

function coerceNumber(value: string, definition: PsmPluginSettingDefinition) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return definition.default ?? 0
  const min = definition.min ?? Number.NEGATIVE_INFINITY
  const max = definition.max ?? Number.POSITIVE_INFINITY
  return Math.min(max, Math.max(min, parsed))
}

export default function PsmPluginsSettings() {
  const [plugins, setPlugins] = useState<PsmPluginStatus[]>([]);
  const [paths, setPaths] = useState<PsmPluginPaths | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [npmAction, setNpmAction] = useState<string | null>(null);
  const [packageNameInput, setPackageNameInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const installPrefix = paths?.npmDir ?? "~/.pi/pi-session-manager/extensions/npm";
  const trimmedPackageName = packageNameInput.trim();
  const npmBusy = loading || npmAction !== null;
  const pluginCount = useMemo(
    () => plugins.filter((plugin) => plugin.id !== "npm-discovery").length,
    [plugins],
  );

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

  const uninstallPlugin = async (plugin: PsmPluginStatus) => {
    if (plugin.source !== "npm" || !plugin.packageName) return;
    setNpmAction(`uninstall:${plugin.id}`);
    setError(null);
    try {
      await uninstallPsmPlugin(plugin.packageName);
      setPlugins(await psmPluginHost.reload());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setNpmAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="PSM Plugins"
        description={`${pluginCount} plugin${pluginCount === 1 ? "" : "s"} discovered`}
        icon={<Package className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              <div className="truncate">
                Config <span className="font-mono text-foreground">{paths?.configPath ?? "~/.pi/pi-session-manager/plugins.json"}</span>
              </div>
              <div className="truncate">
                NPM <span className="font-mono text-foreground">{installPrefix}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Reload
            </button>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={packageNameInput}
                onChange={(event) => setPackageNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void installPlugin();
                }}
                placeholder="npm package name"
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
                  Install
                </button>
                <button
                  type="button"
                  onClick={() => void updatePlugins()}
                  disabled={npmBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${npmAction === "update" ? "animate-spin" : ""}`} />
                  Update
                </button>
              </div>
            </div>
            <div className="mt-2 truncate text-xs text-muted-foreground">
              <span className="font-mono text-foreground">npm install --prefix {installPrefix} &lt;package&gt;</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {plugins.length === 0 && !loading ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No PSM plugins discovered.
              </div>
            ) : (
              plugins.map((plugin) => (
                <div key={plugin.id} className="rounded-lg border border-border/60 bg-surface/40 p-3">
                  <SettingsToggleRow
                    title={
                      <span className="flex min-w-0 items-center gap-2">
                        {statusIcon(plugin)}
                        <span className="truncate">{plugin.name}</span>
                        {plugin.version && (
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {plugin.version}
                          </span>
                        )}
                      </span>
                    }
                    description={
                      <span className="block min-w-0">
                        <span className="font-mono">{plugin.id}</span>
                        <span className="px-1.5">·</span>
                        <span>{sourceLabel(plugin)}</span>
                        {(plugin.commands.length > 0 || plugin.tools.length > 0) && (
                          <>
                            <span className="px-1.5">·</span>
                            <span>{plugin.commands.length} commands</span>
                            <span className="px-1.5">/</span>
                            <span>{plugin.tools.length} tools</span>
                          </>
                        )}
                      </span>
                    }
                    checked={plugin.enabled && plugin.state !== "disabled"}
                    onChange={(enabled) => void togglePlugin(plugin, enabled)}
                    toggleSize="sm"
                    className={updatingId === plugin.id ? "opacity-60" : ""}
                  />
                  {plugin.manifest?.configuration?.properties?.length ? (
                    <div className="mt-3 rounded-lg border border-border/60 bg-background/45 p-3">
                      <div className="mb-3 flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            {plugin.manifest.configuration.title ?? `${plugin.name} Settings`}
                          </div>
                          {plugin.manifest.configuration.description && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {plugin.manifest.configuration.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {plugin.manifest.configuration.properties.map((definition) => {
                          const value = settingValue(plugin, definition);
                          const fieldId = `${plugin.id}-${definition.key}`;
                          const currentSettings = plugin.settings ?? {};
                          return (
                            <label key={definition.key} htmlFor={fieldId} className="block space-y-1.5">
                              <span className="text-xs font-medium text-foreground">{definition.title}</span>
                              {definition.type === "select" ? (
                                <select
                                  id={fieldId}
                                  value={String(value)}
                                  disabled={updatingId === `settings:${plugin.id}`}
                                  onChange={(event) => void updatePluginSetting(plugin, definition.key, event.target.value)}
                                  className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
                                >
                                  {(definition.options ?? []).map((option) => (
                                    <option key={`${definition.key}-${String(option.value)}`} value={String(option.value)}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : definition.type === "boolean" ? (
                                <button
                                  id={fieldId}
                                  type="button"
                                  disabled={updatingId === `settings:${plugin.id}`}
                                  onClick={() => void updatePluginSetting(plugin, definition.key, !Boolean(value))}
                                  className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium ${Boolean(value) ? "border-primary/35 bg-primary/12 text-foreground" : "border-border bg-surface text-muted-foreground"}`}
                                >
                                  {Boolean(value) ? "Enabled" : "Disabled"}
                                </button>
                              ) : definition.type === "number" ? (
                                <input
                                  id={fieldId}
                                  type="number"
                                  min={definition.min}
                                  max={definition.max}
                                  step={definition.step ?? 1}
                                  value={String(value)}
                                  disabled={updatingId === `settings:${plugin.id}`}
                                  onChange={(event) => void updatePluginSetting(plugin, definition.key, coerceNumber(event.target.value, definition))}
                                  className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
                                />
                              ) : (
                                <input
                                  id={fieldId}
                                  type="text"
                                  defaultValue={String(value)}
                                  disabled={updatingId === `settings:${plugin.id}`}
                                  onBlur={(event) => {
                                    if (event.target.value !== String(currentSettings[definition.key] ?? definition.default ?? "")) {
                                      void updatePluginSetting(plugin, definition.key, event.target.value);
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                  className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-foreground outline-none focus:border-info disabled:opacity-60"
                                />
                              )}
                              {definition.description && (
                                <span className="block text-xs leading-5 text-muted-foreground">{definition.description}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {plugin.diagnostics.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      {plugin.diagnostics.map((diagnostic, index) => (
                        <div key={`${plugin.id}-${index}`} className="break-words">{diagnosticMessage(diagnostic)}</div>
                      ))}
                    </div>
                  )}
                  {plugin.source === "npm" && plugin.packageName && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void uninstallPlugin(plugin)}
                        disabled={npmBusy}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/15 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Uninstall
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
