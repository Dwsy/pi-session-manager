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
    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded-md font-medium">
      <Zap className="w-3.5 h-3.5 fill-current" />
      <span>{t("session.online", "Online")}</span>
    </div>
  );
}
