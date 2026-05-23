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

export default function ResourcesTab() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<ResourceType>("extensions");
  const [toggling, setToggling] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<ResourceInfo | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await invoke<ResourceInfo[]>("scan_all_resources", {
        cwd: null,
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

  const filtered = useMemo(() => {
    let items = resources.filter((r) => r.resourceType === activeType);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
      );
    }
    const user = items
      .filter((r) => r.metadata.scope === "user")
      .sort((a, b) => a.name.localeCompare(b.name));
    const project = items
      .filter((r) => r.metadata.scope === "project")
      .sort((a, b) => a.name.localeCompare(b.name));
    return { user, project };
  }, [resources, activeType, search]);

  const handleToggle = useCallback(async (item: ResourceInfo) => {
    const key = `${item.metadata.scope}:${item.path}`;
    setToggling(key);
    try {
      const newEnabled = !item.enabled;
      await invoke("toggle_resource", {
        resourceType: item.resourceType,
        path: item.path,
        enabled: newEnabled,
        scope: item.metadata.scope,
      });
      setResources((prev) =>
        prev.map((r) =>
          r.path === item.path && r.metadata.scope === item.metadata.scope
            ? { ...r, enabled: newEnabled }
            : r,
        ),
      );
    } catch (e) {
      console.error("Failed to toggle resource:", e);
    } finally {
      setToggling(null);
    }
  }, []);

  const handleView = useCallback(async (item: ResourceInfo) => {
    setViewingItem(item);
    setViewContent(null);
    setViewLoading(true);
    try {
      const content = await invoke<string>("read_resource_file", {
        path: item.path,
        scope: item.metadata.scope,
      });
      setViewContent(content);
    } catch (e) {
      setViewContent(`Failed to load: ${e}`);
    } finally {
      setViewLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-info" />
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
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      isActive
                        ? "bg-white/15 text-white"
                        : "bg-surface text-muted-foreground"
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <CompositionInput
          type="text"
          value={search}
          onChange={setSearch}
          placeholder={t("settings.piConfig.searchPlaceholder", "Filter...")}
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-info"
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

      {/* Resource list */}
      <div className="max-h-[400px] overflow-y-auto overflow-x-hidden space-y-3">
        {filtered.user.length === 0 && filtered.project.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            {t("settings.piConfig.noResources", "No resources found")}
          </div>
        ) : (
          <>
            {filtered.user.length > 0 && (
              <ScopeGroup
                label={t("settings.piConfig.scope.user", "User")}
                sublabel="~/.pi/agent/"
                items={filtered.user}
                toggling={toggling}
                onToggle={handleToggle}
                onView={handleView}
              />
            )}
            {filtered.project.length > 0 && (
              <ScopeGroup
                label={t("settings.piConfig.scope.project", "Project")}
                sublabel=".pi/"
                items={filtered.project}
                toggling={toggling}
                onToggle={handleToggle}
                onView={handleView}
              />
            )}
          </>
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
          const key = `${item.metadata.scope}:${item.path}`;
          const isToggling = toggling === key;
          const hasFile =
            item.path.endsWith(".md") ||
            item.path.endsWith(".ts") ||
            item.path.endsWith(".js") ||
            item.path.endsWith(".json");
          return (
            <div
              key={key}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md motion-surface motion-color group min-w-0 ${
                item.enabled ? "hover:bg-info/5" : "opacity-50 hover:opacity-70"
              }`}
            >
              <button
                onClick={() => onToggle(item)}
                disabled={isToggling}
                className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center motion-surface motion-color motion-press focus-ring ${
                  item.enabled
                    ? "bg-info border-info text-white"
                    : "border-border group-hover:border-muted-foreground"
                }`}
              >
                {isToggling ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : item.enabled ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : null}
              </button>
              <div className="flex-1 min-w-0 overflow-hidden cursor-default">
                <span className="block text-sm text-foreground truncate">
                  {item.name}
                </span>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 break-words mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              {hasFile && (
                <button
                  onClick={() => onView(item)}
                  className="p-1 rounded text-muted-foreground/40 hover:text-info hover:bg-info/10 opacity-0 group-hover:opacity-100 motion-color motion-opacity motion-press focus-ring flex-shrink-0"
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
              <Loader2 className="h-5 w-5 animate-spin text-info" />
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
