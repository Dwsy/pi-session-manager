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
  X,
} from "lucide-react";

import { invoke } from "@/transport";
import MarkdownContent from "@/components/ui/MarkdownContent";
import SettingsTabs from "@/components/settings/SettingsTabs";
import CompositionInput from "@/components/ui/CompositionInput";
import type { ResourceInfo, ResourceType } from "@/types";

// ─── Resources Tab ───────────────────────────────────────────────────────────

const RESOURCE_TYPES: {
  type: ResourceType;
  icon: React.ReactNode;
  labelKey: string;
  fallback: string;
}[] = [
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

interface ResourcesTabProps {
  /** Project cwd used to scan `.pi/` resources. Null = user scope only. */
  cwd?: string | null;
}

export default function ResourcesTab({ cwd = null }: ResourcesTabProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<ResourceType>("extensions");
  const [originFilter, setOriginFilter] = useState<
    "all" | "package" | "top-level"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "user" | "project">(
    "all",
  );
  const [toggling, setToggling] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<ResourceInfo | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await invoke<ResourceInfo[]>("scan_all_resources", {
        cwd: cwd ?? null,
      });
      setResources(data);
      const types: ResourceType[] = [
        "skills",
        "extensions",
        "prompts",
        "themes",
      ];
      const first = types.find((tp) => data.some((r) => r.resourceType === tp));
      if (first) setActiveType(first);
    } catch (e) {
      console.error("Failed to scan resources:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadResources();
  }, [cwd]);

  const typeCounts = useMemo(() => {
    const counts: Record<ResourceType, { total: number; enabled: number }> = {
      extensions: { total: 0, enabled: 0 },
      skills: { total: 0, enabled: 0 },
      prompts: { total: 0, enabled: 0 },
      themes: { total: 0, enabled: 0 },
    };
    for (const r of resources) {
      counts[r.resourceType].total++;
      if (r.enabled) counts[r.resourceType].enabled++;
    }
    return counts;
  }, [resources]);

  const filterCounts = useMemo(() => {
    const ofType = resources.filter((r) => r.resourceType === activeType);
    return {
      total: ofType.length,
      enabled: ofType.filter((r) => r.enabled).length,
      disabled: ofType.filter((r) => !r.enabled).length,
      package: ofType.filter((r) => r.metadata.origin === "package").length,
      topLevel: ofType.filter((r) => r.metadata.origin !== "package").length,
      user: ofType.filter((r) => r.metadata.scope === "user").length,
      project: ofType.filter((r) => r.metadata.scope === "project").length,
    };
  }, [resources, activeType]);

  const filtered = useMemo(() => {
    let items = resources.filter((r) => r.resourceType === activeType);
    if (originFilter !== "all") {
      items = items.filter((r) => r.metadata.origin === originFilter);
    }
    if (scopeFilter !== "all") {
      items = items.filter((r) => r.metadata.scope === scopeFilter);
    }
    if (statusFilter === "enabled") {
      items = items.filter((r) => r.enabled);
    } else if (statusFilter === "disabled") {
      items = items.filter((r) => !r.enabled);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q) ||
          r.metadata.source.toLowerCase().includes(q),
      );
    }

    type ResourceGroup = {
      key: string;
      label: string;
      sublabel: string;
      origin: "package" | "top-level";
      items: ResourceInfo[];
    };

    const groupMap = new Map<string, ResourceGroup>();
    for (const item of items) {
      const origin =
        item.metadata.origin === "package" ? "package" : "top-level";
      const key = `${origin}:${item.metadata.scope}:${item.metadata.source}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          key,
          label:
            origin === "package"
              ? item.metadata.source
              : item.metadata.scope === "user"
                ? "User"
                : "Project",
          sublabel:
            origin === "package"
              ? `${item.metadata.scope} package`
              : item.metadata.scope === "user"
                ? "~/.pi/agent/"
                : ".pi/",
          origin,
          items: [],
        };
        groupMap.set(key, group);
      }
      group.items.push(item);
    }

    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === "package" ? -1 : 1;
      if (a.sublabel !== b.sublabel)
        return a.sublabel.localeCompare(b.sublabel);
      return a.label.localeCompare(b.label);
    });
    for (const group of groups) {
      group.items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return groups;
  }, [resources, activeType, search, originFilter, statusFilter, scopeFilter]);

  const resourceKey = (item: ResourceInfo) =>
    `${item.metadata.origin}:${item.metadata.scope}:${item.metadata.source}:${item.path}`;

  const handleToggle = useCallback(
    async (item: ResourceInfo) => {
      const key = resourceKey(item);
      setToggling(key);
      try {
        const newEnabled = !item.enabled;
        await invoke("toggle_resource", {
          resourceType: item.resourceType,
          path: item.path,
          enabled: newEnabled,
          scope: item.metadata.scope,
          cwd: cwd ?? null,
          origin: item.metadata.origin,
          source: item.metadata.source,
        });
        setResources((prev) =>
          prev.map((r) =>
            resourceKey(r) === key ? { ...r, enabled: newEnabled } : r,
          ),
        );
      } catch (e) {
        console.error("Failed to toggle resource:", e);
      } finally {
        setToggling(null);
      }
    },
    [cwd],
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
      } catch (e) {
        setViewContent(`Failed to load: ${e}`);
      } finally {
        setViewLoading(false);
      }
    },
    [cwd],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin settings-accent-fg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SettingsTabs
        items={RESOURCE_TYPES.map((rt) => {
          const count = typeCounts[rt.type];
          const isActive = activeType === rt.type;
          return {
            id: rt.type,
            icon: rt.icon,
            label: (
              <>
                <span>{t(rt.labelKey, rt.fallback)}</span>
                {count.total > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                      isActive
                        ? "bg-black/10 text-primary-foreground/90 dark:bg-white/15"
                        : "bg-background/70 text-muted-foreground"
                    }`}
                  >
                    {count.enabled}/{count.total}
                  </span>
                )}
              </>
            ),
          };
        })}
        active={activeType}
        onChange={setActiveType}
      />

      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/20 p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <CompositionInput
            type="text"
            value={search}
            onChange={setSearch}
            placeholder={t("settings.piConfig.searchPlaceholder", "Filter...")}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface border border-border/70 rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:settings-accent-ring"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">
            {t("settings.piConfig.filter.status", "Status")}
          </span>
          {(
            [
              [
                "all",
                t("settings.piConfig.filter.all", "All"),
                filterCounts.total,
              ],
              [
                "enabled",
                t("settings.piConfig.filter.enabled", "On"),
                filterCounts.enabled,
              ],
              [
                "disabled",
                t("settings.piConfig.filter.disabled", "Off"),
                filterCounts.disabled,
              ],
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

          <span className="mx-1 h-3 w-px bg-border/70" />

          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">
            {t("settings.piConfig.filter.origin", "Source")}
          </span>
          {(
            [
              [
                "all",
                t("settings.piConfig.filter.all", "All"),
                filterCounts.total,
              ],
              [
                "package",
                t("settings.piConfig.filter.package", "Package"),
                filterCounts.package,
              ],
              [
                "top-level",
                t("settings.piConfig.filter.topLevel", "Top-level"),
                filterCounts.topLevel,
              ],
            ] as const
          ).map(([id, label, count]) => (
            <FilterChip
              key={id}
              active={originFilter === id}
              label={label}
              count={count}
              onClick={() => setOriginFilter(id)}
            />
          ))}

          <span className="mx-1 h-3 w-px bg-border/70" />

          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-0.5">
            {t("settings.piConfig.filter.scope", "Scope")}
          </span>
          {(
            [
              [
                "all",
                t("settings.piConfig.filter.all", "All"),
                filterCounts.total,
              ],
              [
                "user",
                t("settings.piConfig.scope.user", "User"),
                filterCounts.user,
              ],
              [
                "project",
                t("settings.piConfig.scope.project", "Project"),
                filterCounts.project,
              ],
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

      {/* Resource list */}
      <div className="max-h-[min(70vh,560px)] overflow-y-auto overflow-x-hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            {t("settings.piConfig.noResources", "No resources found")}
          </div>
        ) : (
          filtered.map((group) => (
            <ScopeGroup
              key={group.key}
              label={
                group.origin === "package"
                  ? group.label
                  : t(
                      group.sublabel.startsWith("~")
                        ? "settings.piConfig.scope.user"
                        : "settings.piConfig.scope.project",
                      group.label,
                    )
              }
              sublabel={group.sublabel}
              items={group.items}
              toggling={toggling}
              onToggle={handleToggle}
              onView={handleView}
            />
          ))
        )}
      </div>

      {/* Resource viewer modal */}
      {viewingItem && (
        <ResourceViewerModal
          item={viewingItem}
          content={viewContent}
          loading={viewLoading}
          onClose={() => {
            setViewingItem(null);
            setViewContent(null);
          }}
        />
      )}
    </div>
  );
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
      className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium motion-color motion-press focus-ring ${
        active
          ? "settings-accent-bg-soft settings-accent-fg border-[rgb(var(--color-ring)/0.35)]"
          : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-accent/10"
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

function ScopeGroup({
  label,
  sublabel,
  items,
  toggling,
  onToggle,
  onView,
}: {
  label: string;
  sublabel: string;
  items: ResourceInfo[];
  toggling: string | null;
  onToggle: (item: ResourceInfo) => void;
  onView: (item: ResourceInfo) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{sublabel}</span>
      </div>
      <div className="space-y-px">
        {items.map((item) => {
          const key = `${item.metadata.origin}:${item.metadata.scope}:${item.metadata.source}:${item.path}`;
          const isToggling = toggling === key;
          const hasFile =
            item.path.endsWith(".md") ||
            item.path.endsWith(".ts") ||
            item.path.endsWith(".js") ||
            item.path.endsWith(".json") ||
            Boolean(item.metadata.baseDir);
          return (
            <div
              key={key}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md border motion-surface motion-color group min-w-0 ${
                item.enabled
                  ? "border-transparent hover:bg-[rgb(var(--color-ring)/0.08)]"
                  : "border-border/40 bg-surface/30 hover:bg-surface/55"
              }`}
            >
              <button
                onClick={() => onToggle(item)}
                disabled={isToggling}
                aria-pressed={item.enabled}
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center motion-surface motion-color motion-press focus-ring ${
                  item.enabled
                    ? "settings-accent-bg-strong border-transparent text-primary-foreground"
                    : "border-border/80 bg-background text-muted-foreground group-hover:border-[rgb(var(--color-ring)/0.55)]"
                }`}
              >
                {isToggling ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : item.enabled ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : null}
              </button>
              <div className="flex-1 min-w-0 overflow-hidden cursor-default">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`block text-sm truncate ${
                      item.enabled ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {item.name}
                  </span>
                  {item.metadata.origin === "package" && (
                    <span className="shrink-0 rounded border border-border/60 bg-background/50 px-1 py-px text-[10px] text-muted-foreground">
                      pkg
                    </span>
                  )}
                  {!item.enabled && (
                    <span className="shrink-0 rounded border border-border/50 px-1 py-px text-[10px] text-muted-foreground">
                      off
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5 font-mono">
                  {item.path}
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              {hasFile && (
                <button
                  onClick={() => onView(item)}
                  className="p-1 rounded text-muted-foreground/50 hover:settings-accent-fg hover:bg-[rgb(var(--color-ring)/0.12)] opacity-0 group-hover:opacity-100 motion-color motion-opacity motion-press focus-ring flex-shrink-0"
                  title={t("components.piConfig.view")}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Resource Viewer Modal ───────────────────────────────────────────────────

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
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isMarkdown = item.path.endsWith(".md");

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ zIndex: 99999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-[80%] max-w-2xl max-h-[80vh] flex flex-col"
        style={{ zIndex: 99999 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              {item.name}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {item.path}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface motion-surface motion-color motion-press focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin settings-accent-fg" />
            </div>
          ) : content == null ? null : isMarkdown ? (
            <MarkdownContent content={content} className="text-sm" />
          ) : (
            <pre className="text-xs text-foreground whitespace-pre-wrap break-words font-mono">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.getElementById("portal-root") || document.body,
  );
}
