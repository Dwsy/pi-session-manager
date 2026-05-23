import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Loader2, RotateCcw } from "lucide-react";

import { invoke } from "@/transport";
import type { ConfigVersionMeta } from "@/types";

// ─── Config Versions Tab ─────────────────────────────────────────────────────

export default function ConfigVersionsTab() {
  const { t, i18n } = useTranslation();
  const [versions, setVersions] = useState<ConfigVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await invoke<ConfigVersionMeta[]>("list_config_versions", {
        filePath: null,
      });
      setVersions(data);
    } catch (e) {
      console.error("Failed to load config versions:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (id: number) => {
    if (previewId === id) {
      setPreviewId(null);
      setPreviewContent(null);
      return;
    }
    try {
      const ver = await invoke<{ id: number; content: string }>(
        "get_config_version",
        { id },
      );
      setPreviewId(id);
      setPreviewContent(ver.content);
    } catch (e) {
      console.error("Failed to get version:", e);
    }
  };

  const handleRestore = async (id: number) => {
    if (
      !confirm(
        t(
          "settings.piConfig.confirmRestore",
          "Restore this version? Current config will be saved as a new snapshot.",
        ),
      )
    )
      return;
    setRestoring(id);
    try {
      await invoke("restore_config_version", { id });
      await loadVersions();
    } catch (e) {
      console.error("Failed to restore:", e);
    } finally {
      setRestoring(null);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso + "Z");
      const locale = i18n.language?.startsWith("zh") ? "zh-CN" : "en-US";
      return d.toLocaleString(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-info" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {t("settings.piConfig.noVersions", "No version history yet")}
        <p className="text-xs mt-1">
          {t(
            "settings.piConfig.versionsHint",
            "Snapshots are created automatically when settings change.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[450px] overflow-y-auto divide-y divide-border rounded-lg border border-border">
      {versions.map((v) => (
        <div key={v.id}>
          <div className="flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-surface/30 motion-surface motion-color">
            <span className="text-muted-foreground font-mono w-8 text-right flex-shrink-0">
              #{v.id}
            </span>
            <span className="flex-1 text-foreground">
              {formatTime(v.createdAt)}
            </span>
            <span className="text-muted-foreground flex-shrink-0">
              {formatSize(v.sizeBytes)}
            </span>
            <button
              onClick={() => handlePreview(v.id)}
              className={`p-1 rounded motion-surface motion-color motion-press focus-ring ${previewId === v.id ? "text-info bg-info/10" : "text-muted-foreground hover:text-foreground"}`}
              title={t("settings.piConfig.preview", "Preview")}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleRestore(v.id)}
              disabled={restoring === v.id}
              className="p-1 rounded text-muted-foreground hover:text-warning motion-surface motion-color motion-press focus-ring"
              title={t("settings.piConfig.restore", "Restore")}
            >
              {restoring === v.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {previewId === v.id && previewContent && (
            <pre className="px-3 py-2 text-[11px] bg-surface text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto border-t border-border/50">
              {previewContent}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
