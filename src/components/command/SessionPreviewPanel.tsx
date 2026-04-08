import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SearchPluginResult } from "@/plugins/types";
import SessionViewer from "@/components/SessionViewer";
import type { SessionInfo } from "@/types";
import { getRuntimeSessionByPath } from "@/runtime-data/sessionSource";

interface SessionPreviewPanelProps {
  result: SearchPluginResult | null;
  context: any;
  onClose: () => void;
  onNavigate: () => void;
}

export default function SessionPreviewPanel({
  result,
  context: _context,
  onClose,
  onNavigate: _onNavigate,
}: SessionPreviewPanelProps) {
  const { t } = useTranslation();
  const [fullSession, setFullSession] = useState<SessionInfo | null>(null);
  const [targetEntryId, setTargetEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setFullSession(null);
      setTargetEntryId(null);
      return;
    }

    const meta = result.metadata as any;
    const session = meta?.session;

    if (session) {
      setFullSession(session);
      if (result.pluginId === "message-search" && meta?.entryId) {
        setTargetEntryId(meta.entryId);
      } else {
        setTargetEntryId(null);
      }
    } else if (meta?.sessionPath) {
      let cancelled = false;
      const fetchSession = async () => {
        try {
          const info = await getRuntimeSessionByPath(meta.sessionPath);
          if (!cancelled && info) {
            setFullSession(info);
            if (result.pluginId === "message-search" && meta?.entryId) {
              setTargetEntryId(meta.entryId);
            } else {
              setTargetEntryId(null);
            }
          }
        } catch {
          // Ignore fetch errors
        }
      };
      void fetchSession();
      return () => {
        cancelled = true;
      };
    } else {
      setFullSession(null);
      setTargetEntryId(null);
    }
  }, [result?.id, result?.pluginId]);

  if (!result || !fullSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 p-8">
        <div className="w-12 h-12 rounded-full bg-surface-dark/50 flex items-center justify-center mb-3">
          <Search className="w-5 h-5" />
        </div>
        <p className="text-sm">{t("command.preview.selectHint", "Select a result to preview")}</p>
        <p className="text-xs mt-1 text-muted-foreground/40">
          {t("command.preview.selectHintDetail", "Choose a result on the left to inspect it here")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionViewer
          session={fullSession}
          onExport={() => {}}
          onRename={() => {}}
          onBack={onClose}
          initialEntryId={targetEntryId || undefined}
          previewMode
        />
      </div>
    </div>
  );
}
