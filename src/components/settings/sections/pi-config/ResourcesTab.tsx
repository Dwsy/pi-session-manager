import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  Check,
  Eye,
  FileText,
  Loader2,
  Paintbrush,
  Puzzle,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import SettingsTabs from "@/components/settings/SettingsTabs";
import MarkdownContent from "@/components/ui/MarkdownContent";
import CompositionInput from "@/components/ui/CompositionInput";
import { invoke } from "@/transport";
import type {
  ProjectResourceTrust,
  ResourceInfo,
  ResourceOverrideState,
  ResourceType,
} from "@/types";

const RESOURCE_TYPES: Array<{
  type: ResourceType;
  icon: React.ReactNode;
  labelKey: string;
  fallback: string;
}> = [
  {
    type: "extensions",
    icon: <Blocks className="h-3.5 w-3.5" />,
    labelKey: "settings.piConfig.resourceType.extensions",
    fallback: "Extensions",
  },
  {
    type: "skills",
    icon: <Puzzle className="h-3.5 w-3.5" />,
    labelKey: "settings.piConfig.resourceType.skills",
    fallback: "Skills",
  },
  {
    type: "prompts",
    icon: <FileText className="h-3.5 w-3.5" />,
    labelKey: "settings.piConfig.resourceType.prompts",
    fallback: "Prompts",
  },
  {
    type: "themes",
    icon: <Paintbrush className="h-3.5 w-3.5" />,
    labelKey: "settings.piConfig.resourceType.themes",
    fallback: "Themes",
  },
];

const RESOURCE_STATES: ResourceOverrideState[] = [
  "inherit",
  "enabled",
  "disabled",
];

type StatusFilter =
  | "all"
  | "enabled"
  | "disabled"
  | "overridden"
  | "inherited";
type SourceFilter = "all" | "pi" | "agents" | "package";
type ScopeFilter = "all" | "user" | "project";

interface ResourcesTabProps {
  /** Project cwd used for trust-aware `.pi/` and `.agents/` discovery. */
  cwd?: string | null;
}

function resourceKey(item: ResourceInfo): string {
  return [
    item.metadata.origin,
    item.metadata.scope,
    item.metadata.source,
    item.metadata.discovery,
    item.metadata.baseDir ?? "",
    item.path,
  ].join(":");
}

export default function ResourcesTab({ cwd = null }: ResourcesTabProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [trust, setTrust] = useState<ProjectResourceTrust | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<ResourceType>("extensions");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [changing, setChanging] = useState<{
    key: string;
    state: ResourceOverrideState;
  } | null>(null);
  const [trustChanging, setTrustChanging] = useState(false);
  const [viewingItem, setViewingItem] = useState<ResourceInfo | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, trustState] = await Promise.all([
        invoke<ResourceInfo[]>("scan_all_resources", { cwd: cwd ?? null }),
        cwd
          ? invoke<ProjectResourceTrust>("get_project_resource_trust", { cwd })
          : Promise.resolve(null),
      ]);
      setResources(data);
      setTrust(trustState);
      setActiveType((current) => {
        if (data.some((resource) => resource.resourceType === current)) {
          return current;
        }
        return (
          RESOURCE_TYPES.find(({ type }) =>
            data.some((resource) => resource.resourceType === type),
          )?.type ?? current
        );
      });
    } catch (cause) {
      console.error("Failed to load Pi resources:", cause);
      setResources([]);
      setTrust(null);
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  const typeCounts = useMemo(() => {
    const counts: Record<ResourceType, { total: number; enabled: number }> = {
      extensions: { total: 0, enabled: 0 },
      skills: { total: 0, enabled: 0 },
      prompts: { total: 0, enabled: 0 },
      themes: { total: 0, enabled: 0 },
    };
    for (const resource of resources) {
      counts[resource.resourceType].total += 1;
      if (resource.enabled) counts[resource.resourceType].enabled += 1;
    }
    return counts;
  }, [resources]);

  const filterCounts = useMemo(() => {
    const current = resources.filter(
      (resource) => resource.resourceType === activeType,
    );
    return {
      total: current.length,
      enabled: current.filter((resource) => resource.enabled).length,
      disabled: current.filter((resource) => !resource.enabled).length,
      overridden: current.filter((resource) => resource.state !== "inherit")
        .length,
      inherited: current.filter((resource) => resource.state === "inherit")
        .length,
      pi: current.filter((resource) => resource.metadata.discovery === "pi")
        .length,
      agents: current.filter(
        (resource) => resource.metadata.discovery === "agents",
      ).length,
      package: current.filter(
        (resource) => resource.metadata.discovery === "package",
      ).length,
      user: current.filter((resource) => resource.metadata.scope === "user")
        .length,
      project: current.filter(
        (resource) => resource.metadata.scope === "project",
      ).length,
    };
  }, [activeType, resources]);

  const groups = useMemo(() => {
    let items = resources.filter(
      (resource) => resource.resourceType === activeType,
    );
    if (statusFilter === "enabled") {
      items = items.filter((resource) => resource.enabled);
    } else if (statusFilter === "disabled") {
      items = items.filter((resource) => !resource.enabled);
    } else if (statusFilter === "overridden") {
      items = items.filter((resource) => resource.state !== "inherit");
    } else if (statusFilter === "inherited") {
      items = items.filter((resource) => resource.state === "inherit");
    }
    if (sourceFilter !== "all") {
      items = items.filter(
        (resource) => resource.metadata.discovery === sourceFilter,
      );
    }
    if (scopeFilter !== "all") {
      items = items.filter(
        (resource) => resource.metadata.scope === scopeFilter,
      );
    }
    const query = search.trim().toLowerCase();
    if (query) {
      items = items.filter((resource) =>
        [
          resource.name,
          resource.path,
          resource.description,
          resource.metadata.source,
          resource.metadata.baseDir ?? "",
        ].some((value) => value.toLowerCase().includes(query)),
      );
    }

    type ResourceGroup = {
      key: string;
      label: string;
      sublabel: string;
      order: number;
      items: ResourceInfo[];
    };
    const grouped = new Map<string, ResourceGroup>();
    for (const item of items) {
      const isPackage = item.metadata.discovery === "package";
      const scopeLabel =
        item.metadata.scope === "project"
          ? t("settings.piConfig.scope.project", "Project")
          : t("settings.piConfig.scope.user", "User");
      const discoveryLabel =
        item.metadata.discovery === "agents"
          ? t("settings.piResources.catalog.sourceAgents", ".agents")
          : t("settings.piResources.catalog.sourcePi", ".pi");
      const key = isPackage
        ? `package:${item.metadata.scope}:${item.metadata.source}`
        : `${item.metadata.discovery}:${item.metadata.scope}:${item.metadata.baseDir ?? ""}`;
      let group = grouped.get(key);
      if (!group) {
        group = {
          key,
          label: isPackage
            ? item.metadata.source
            : t("settings.piResources.catalog.scopeSource", {
                scope: scopeLabel,
                source: discoveryLabel,
                defaultValue: "{{scope}} · {{source}}",
              }),
          sublabel: isPackage
            ? t("settings.piResources.catalog.packageScope", {
                scope: scopeLabel,
                defaultValue: "{{scope}} package",
              })
            : item.metadata.baseDir ?? discoveryLabel,
          order: isPackage
            ? 4
            : item.metadata.scope === "project"
              ? item.metadata.discovery === "pi"
                ? 0
                : 1
              : item.metadata.discovery === "pi"
                ? 2
                : 3,
          items: [],
        };
        grouped.set(key, group);
      }
      group.items.push(item);
    }

    const result = Array.from(grouped.values());
    result.sort(
      (left, right) =>
        left.order - right.order || left.label.localeCompare(right.label),
    );
    for (const group of result) {
      group.items.sort((left, right) => left.name.localeCompare(right.name));
    }
    return result;
  }, [
    activeType,
    resources,
    scopeFilter,
    search,
    sourceFilter,
    statusFilter,
    t,
  ]);

  const handleTrustChange = useCallback(
    async (trusted: boolean) => {
      if (!cwd) return;
      setTrustChanging(true);
      setError(null);
      try {
        await invoke<ProjectResourceTrust>("set_project_resource_trust", {
          cwd,
          trusted,
        });
        await loadResources();
      } catch (cause) {
        console.error("Failed to change project resource trust:", cause);
        setError(String(cause));
      } finally {
        setTrustChanging(false);
      }
    },
    [cwd, loadResources],
  );

  const handleStateChange = useCallback(
    async (item: ResourceInfo, state: ResourceOverrideState) => {
      const key = resourceKey(item);
      setChanging({ key, state });
      setError(null);
      try {
        await invoke("set_resource_state", {
          resourceType: item.resourceType,
          path: item.path,
          state,
          scope: item.metadata.scope,
          cwd: cwd ?? null,
          origin: item.metadata.origin,
          source: item.metadata.source,
        });
        await loadResources();
      } catch (cause) {
        console.error("Failed to change Pi resource state:", cause);
        setError(String(cause));
      } finally {
        setChanging(null);
      }
    },
    [cwd, loadResources],
  );

  const handleView = useCallback(
    async (item: ResourceInfo) => {
      setViewingItem(item);
      setViewContent(null);
      setViewLoading(true);
      try {
        const content = await invoke<string>("read_resource_file", {
          path: item.path,
          scope: item.metadata.scope,
          cwd: cwd ?? null,
          baseDir: item.metadata.baseDir ?? null,
        });
        setViewContent(content);
      } catch (cause) {
        setViewContent(
          t("settings.piResources.catalog.loadFileFailed", {
            reason: String(cause),
            defaultValue: "Failed to load: {{reason}}",
          }),
        );
      } finally {
        setViewLoading(false);
      }
    },
    [cwd, t],
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin settings-accent-fg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cwd && trust ? (
        <ProjectTrustBanner
          trust={trust}
          changing={trustChanging}
          onChange={handleTrustChange}
        />
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger">
          {t("settings.piResources.catalog.error", {
            reason: error,
            defaultValue: "Resource operation failed: {{reason}}",
          })}
        </div>
      ) : null}

      <SettingsTabs
        items={RESOURCE_TYPES.map((item) => {
          const count = typeCounts[item.type];
          const active = activeType === item.type;
          return {
            id: item.type,
            icon: item.icon,
            label: (
              <>
                <span>{t(item.labelKey, item.fallback)}</span>
                {count.total > 0 ? (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-black/10 text-primary-foreground/90 dark:bg-white/15"
                        : "bg-background/70 text-muted-foreground"
                    }`}
                  >
                    {count.enabled}/{count.total}
                  </span>
                ) : null}
              </>
            ),
          };
        })}
        active={activeType}
        onChange={setActiveType}
      />

      <div className="grid gap-2 rounded-md border border-border/60 bg-card/20 p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <CompositionInput
            type="text"
            value={search}
            onChange={setSearch}
            placeholder={t(
              "settings.piResources.catalog.searchPlaceholder",
              "Search name, path, description, or package…",
            )}
            className="w-full rounded-md border border-border/70 bg-surface py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:settings-accent-ring"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t(
                "settings.piResources.catalog.clearSearch",
                "Clear resource search",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterLabel>
            {t("settings.piConfig.filter.status", "Status")}
          </FilterLabel>
          {(
            [
              ["all", t("settings.piConfig.filter.all", "All"), filterCounts.total],
              ["enabled", t("settings.piConfig.filter.enabled", "On"), filterCounts.enabled],
              ["disabled", t("settings.piConfig.filter.disabled", "Off"), filterCounts.disabled],
              ["overridden", t("settings.piResources.catalog.overridden", "Overridden"), filterCounts.overridden],
              ["inherited", t("settings.piResources.catalog.inherited", "Inherited"), filterCounts.inherited],
            ] as const
          ).map(([id, label, count]) => (
            <FilterChip
              key={id}
              active={statusFilter === id}
              label={label}
              count={count}
              onClick={() => setStatusFilter(id)}
            />
          ))}

          <FilterDivider />
          <FilterLabel>
            {t("settings.piConfig.filter.origin", "Source")}
          </FilterLabel>
          {(
            [
              ["all", t("settings.piConfig.filter.all", "All"), filterCounts.total],
              ["pi", t("settings.piResources.catalog.sourcePi", ".pi"), filterCounts.pi],
              ["agents", t("settings.piResources.catalog.sourceAgents", ".agents"), filterCounts.agents],
              ["package", t("settings.piConfig.filter.package", "Package"), filterCounts.package],
            ] as const
          ).map(([id, label, count]) => (
            <FilterChip
              key={id}
              active={sourceFilter === id}
              label={label}
              count={count}
              onClick={() => setSourceFilter(id)}
            />
          ))}

          <FilterDivider />
          <FilterLabel>
            {t("settings.piConfig.filter.scope", "Scope")}
          </FilterLabel>
          {(
            [
              ["all", t("settings.piConfig.filter.all", "All"), filterCounts.total],
              ["user", t("settings.piConfig.scope.user", "User"), filterCounts.user],
              ["project", t("settings.piConfig.scope.project", "Project"), filterCounts.project],
            ] as const
          ).map(([id, label, count]) => (
            <FilterChip
              key={id}
              active={scopeFilter === id}
              label={label}
              count={count}
              onClick={() => setScopeFilter(id)}
            />
          ))}
        </div>
      </div>

      <div className="max-h-[min(70vh,560px)] space-y-3 overflow-x-hidden overflow-y-auto settings-scrollbar">
        {groups.length === 0 ? (
          <div className="py-7 text-center text-xs text-muted-foreground">
            {trust?.required && !trust.trusted
              ? t(
                  "settings.piResources.catalog.projectLockedEmpty",
                  "Project resources are hidden until this project is trusted.",
                )
              : t("settings.piConfig.noResources", "No resources found")}
          </div>
        ) : (
          groups.map((group) => (
            <ResourceGroup
              key={group.key}
              label={group.label}
              sublabel={group.sublabel}
              items={group.items}
              changing={changing}
              onStateChange={handleStateChange}
              onView={handleView}
            />
          ))
        )}
      </div>

      {viewingItem ? (
        <ResourceViewerModal
          item={viewingItem}
          content={viewContent}
          loading={viewLoading}
          onClose={() => {
            setViewingItem(null);
            setViewContent(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectTrustBanner({
  trust,
  changing,
  onChange,
}: {
  trust: ProjectResourceTrust;
  changing: boolean;
  onChange: (trusted: boolean) => void;
}) {
  const { t } = useTranslation();
  const trusted = trust.trusted;
  return (
    <div
      className={`flex flex-wrap items-start gap-2 rounded-md border px-3 py-2 ${
        trusted
          ? "border-success/30 bg-success/10"
          : "border-warning/35 bg-warning/10"
      }`}
    >
      {trusted ? (
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      ) : (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground">
          {trusted
            ? t("settings.piResources.catalog.projectTrusted", "Project resources trusted")
            : t("settings.piResources.catalog.projectUntrusted", "Project resources locked")}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {trusted
            ? t(
                "settings.piResources.catalog.projectTrustedHelp",
                "Project .pi resources, ancestor .agents skills, and project packages can be discovered and changed.",
              )
            : t(
                "settings.piResources.catalog.projectUntrustedHelp",
                "Trust this project before loading or changing project-local resources. User resources remain available.",
              )}
        </p>
        {trust.inheritedFrom && trust.inheritedFrom !== trust.cwd ? (
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {t("settings.piResources.catalog.trustInheritedFrom", {
              path: trust.inheritedFrom,
              defaultValue: "Inherited decision from {{path}}",
            })}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={changing}
        onClick={() => onChange(!trusted)}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[11px] font-medium text-foreground motion-color hover:bg-accent/10 focus-ring disabled:opacity-60"
      >
        {changing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {trusted
          ? t("settings.piResources.catalog.revokeTrust", "Revoke trust")
          : t("settings.piResources.catalog.trustProject", "Trust project")}
      </button>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function FilterDivider() {
  return <span className="mx-1 h-3 w-px bg-border/70" aria-hidden="true" />;
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium focus-ring ${
        active
          ? "settings-accent-bg-soft settings-accent-ring settings-accent-fg border-transparent font-semibold"
          : "border-border bg-background text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums text-[10px] ${
          active ? "opacity-80" : "text-muted-foreground/80"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ResourceGroup({
  label,
  sublabel,
  items,
  changing,
  onStateChange,
  onView,
}: {
  label: string;
  sublabel: string;
  items: ResourceInfo[];
  changing: { key: string; state: ResourceOverrideState } | null;
  onStateChange: (item: ResourceInfo, state: ResourceOverrideState) => void;
  onView: (item: ResourceInfo) => void;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-1.5 flex min-w-0 items-center gap-2 px-1">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {label}
        </span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {sublabel}
        </span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="space-y-px">
        {items.map((item) => {
          const key = resourceKey(item);
          const isChanging = changing?.key === key;
          return (
            <article
              key={key}
              className={`group flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 ${
                item.enabled
                  ? "border-transparent hover:bg-[rgb(var(--color-ring)/0.08)]"
                  : "border-border/40 bg-surface/30 hover:bg-surface/55"
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  item.enabled
                    ? "border-success/45 bg-success/15 text-success"
                    : "border-border/70 bg-background text-muted-foreground"
                }`}
                title={
                  item.enabled
                    ? t("settings.piResources.catalog.effectiveEnabled", "Effectively enabled")
                    : t("settings.piResources.catalog.effectiveDisabled", "Effectively disabled")
                }
              >
                {item.enabled ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
              </span>

              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`truncate text-sm ${
                      item.enabled ? "text-foreground" : "text-foreground/75"
                    }`}
                  >
                    {item.name}
                  </span>
                  <ResourceBadge item={item} />
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/90">
                  {item.path}
                </p>
                {item.description ? (
                  <p className="mt-0.5 line-clamp-2 break-words text-[11px] text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </div>

              <div
                className="inline-flex shrink-0 overflow-hidden rounded-md border border-border/70 bg-background"
                role="group"
                aria-label={t("settings.piResources.catalog.overrideFor", {
                  name: item.name,
                  defaultValue: "Override for {{name}}",
                })}
              >
                {RESOURCE_STATES.map((state) => (
                  <button
                    key={state}
                    type="button"
                    disabled={isChanging}
                    aria-pressed={item.state === state}
                    aria-label={t(
                      `settings.piResources.catalog.state.${state}`,
                      state === "inherit"
                        ? "Auto"
                        : state === "enabled"
                          ? "On"
                          : "Off",
                    )}
                    onClick={() => {
                      if (item.state !== state) onStateChange(item, state);
                    }}
                    className={`h-6 border-r border-border/60 px-1.5 text-[10px] font-medium last:border-r-0 focus-ring disabled:opacity-60 ${
                      item.state === state
                        ? "settings-accent-bg-soft settings-accent-fg"
                        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                    }`}
                  >
                    {isChanging && changing?.state === state ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      t(
                        `settings.piResources.catalog.state.${state}`,
                        state === "inherit"
                          ? "Auto"
                          : state === "enabled"
                            ? "On"
                            : "Off",
                      )
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onView(item)}
                className="shrink-0 rounded p-1 text-muted-foreground/60 motion-opacity hover:bg-muted hover:text-primary focus-ring"
                title={t("components.piConfig.view", "View resource")}
                aria-label={t("settings.piResources.catalog.viewResource", {
                  name: item.name,
                  defaultValue: "View {{name}}",
                })}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ResourceBadge({ item }: { item: ResourceInfo }) {
  const { t } = useTranslation();
  const label =
    item.metadata.discovery === "package"
      ? t("settings.piResources.catalog.badgePackage", "pkg")
      : item.metadata.discovery === "agents"
        ? t("settings.piResources.catalog.badgeAgents", ".agents")
        : t("settings.piResources.catalog.badgePi", ".pi");
  return (
    <span className="shrink-0 rounded border border-border/60 bg-background/50 px-1 py-px text-[9px] text-muted-foreground">
      {label}
    </span>
  );
}

function ResourceViewerModal({
  item,
  content,
  loading,
  onClose,
}: {
  item: ResourceInfo;
  content: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const markdown = item.path.endsWith(".md");
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: 99999 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.piResources.catalog.viewerTitle", {
          name: item.name,
          defaultValue: "Resource: {{name}}",
        })}
        className="flex max-h-[80vh] w-[80%] max-w-2xl flex-col rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {item.name}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              {item.metadata.baseDir
                ? `${item.metadata.baseDir}/${item.path}`
                : item.path}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
            aria-label={t("settings.piResources.catalog.closeViewer", "Close resource viewer")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 settings-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin settings-accent-fg" />
            </div>
          ) : content == null ? null : markdown ? (
            <MarkdownContent content={content} className="text-sm" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.getElementById("portal-root") || document.body,
  );
}
