import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, FolderOpen, Loader2, RefreshCw } from "lucide-react";

import { invoke } from "@/transport";
import type { SessionInfo } from "@/types";
import { getPathBasename, pathsEqual } from "@/utils/path";
import ResourcesTab from "./pi-config/ResourcesTab";

const CWD_STORAGE_KEY = "psm.pi-resources.projectCwd";

function loadStoredCwd(): string | null {
  try {
    const value = localStorage.getItem(CWD_STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function storeCwd(cwd: string | null) {
  try {
    if (!cwd) {
      localStorage.removeItem(CWD_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CWD_STORAGE_KEY, cwd);
  } catch {
    // ignore storage failures
  }
}

export default function PiResourcesSettings() {
  const { t } = useTranslation();
  const [projectCwd, setProjectCwd] = useState<string | null>(() => loadStoredCwd());
  const [projects, setProjects] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const sessions = await invoke<SessionInfo[]>("scan_sessions");
      const unique = new Map<string, string>();
      for (const session of sessions) {
        const cwd = session.cwd?.trim();
        if (!cwd) continue;
        if (!unique.has(cwd)) unique.set(cwd, cwd);
      }
      const list = Array.from(unique.values()).sort((a, b) =>
        getPathBasename(a).localeCompare(getPathBasename(b)),
      );
      setProjects(list);
    } catch (error) {
      console.error("Failed to load project list for Pi resources:", error);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!pickerOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [pickerOpen]);

  const handleCwdChange = (value: string | null) => {
    setProjectCwd(value);
    storeCwd(value);
    setPickerOpen(false);
    setQuery("");
  };

  const projectOptions = useMemo(() => {
    if (projectCwd && !projects.some((cwd) => pathsEqual(cwd, projectCwd))) {
      return [projectCwd, ...projects];
    }
    return projects;
  }, [projectCwd, projects]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectOptions;
    return projectOptions.filter((cwd) => {
      const name = getPathBasename(cwd).toLowerCase();
      return name.includes(q) || cwd.toLowerCase().includes(q);
    });
  }, [projectOptions, query]);

  const selectedLabel = projectCwd
    ? getPathBasename(projectCwd)
    : t("settings.piResources.userOnly", "User only (~/.pi/agent)");

  const selectedSublabel = projectCwd
    ? projectCwd
    : t(
        "settings.piResources.userOnlyHint",
        "Only scan ~/.pi/agent resources",
      );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={rootRef}
        className="relative flex flex-wrap items-start gap-2 rounded-md border border-border/60 bg-card/30 px-2.5 py-2"
      >
        <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-foreground">
            {t("settings.piResources.projectScope", "Project scope")}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t(
              "settings.piResources.projectScopeHelp",
              "User resources always load. Choose a project cwd to also scan .pi/ in that project.",
            )}
          </p>
        </div>

        <div className="flex min-w-[260px] max-w-full flex-1 items-center gap-1.5 sm:flex-none sm:max-w-[360px]">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={loadingProjects}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border/70 bg-surface px-2 text-left text-xs text-foreground motion-color hover:bg-accent/10 focus-ring disabled:opacity-60"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{selectedLabel}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {selectedSublabel}
              </div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                pickerOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              void loadProjects();
              setRefreshToken((n) => n + 1);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-ring"
            title={t("settings.piResources.refresh", "Refresh")}
          >
            {loadingProjects ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {pickerOpen && (
          <div className="absolute right-2 top-[calc(100%-2px)] z-30 w-[min(420px,calc(100%-1rem))] overflow-hidden rounded-md border border-border/70 bg-popover shadow-lg">
            <div className="border-b border-border/60 p-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(
                  "settings.piResources.searchProjects",
                  "Search projects…",
                )}
                className="h-8 w-full rounded-md border border-border/60 bg-surface px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:settings-accent-ring"
              />
            </div>

            <div
              className="max-h-64 overflow-y-auto p-1"
              role="listbox"
              aria-label={t("settings.piResources.projectScope", "Project scope")}
            >
              <ProjectOption
                active={!projectCwd}
                title={t("settings.piResources.userOnly", "User only (~/.pi/agent)")}
                subtitle={t(
                  "settings.piResources.userOnlyHint",
                  "Only scan ~/.pi/agent resources",
                )}
                onClick={() => handleCwdChange(null)}
              />

              {filteredProjects.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  {loadingProjects
                    ? t("settings.piResources.loadingProjects", "Loading projects…")
                    : t("settings.piResources.noProjects", "No matching projects")}
                </div>
              ) : (
                filteredProjects.map((cwd) => (
                  <ProjectOption
                    key={cwd}
                    active={!!projectCwd && pathsEqual(projectCwd, cwd)}
                    title={getPathBasename(cwd)}
                    subtitle={cwd}
                    onClick={() => handleCwdChange(cwd)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResourcesTab key={`${projectCwd ?? "user"}:${refreshToken}`} cwd={projectCwd} />
      </div>
    </div>
  );
}

function ProjectOption({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left motion-color focus-ring ${
        active
          ? "settings-accent-bg-soft"
          : "hover:bg-accent/10"
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
          active
            ? "settings-accent-bg-strong border-transparent text-primary-foreground"
            : "border-border/70 bg-background text-transparent"
        }`}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {title}
        </span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
