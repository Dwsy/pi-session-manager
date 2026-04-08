import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import type { LiveSessionInfo } from "@/hooks/usePiLiveSessions";

interface SessionViewerOnlineStatusBarProps {
  liveSession: LiveSessionInfo | null;
}

export default function SessionViewerOnlineStatusBar({
  liveSession,
}: SessionViewerOnlineStatusBarProps) {
  const { t } = useTranslation();

  if (!liveSession) return null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/10 px-1 py-1 text-[11px] font-medium text-green-500">
      <Zap className="h-2.5 w-2.5 fill-current" />
      <span>
        {liveSession.isStreaming
          ? t("session.streaming", "Streaming")
          : t("session.online", "Live")}
      </span>
    </div>
  );
}
