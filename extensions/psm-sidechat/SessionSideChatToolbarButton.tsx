import { Loader2, MessageCircleQuestion, PanelRightOpen } from "lucide-react";
import type { PsmPluginI18nClient } from "@pi-session-manager/plugin-sdk";

import { sideChatStyles } from "./styles";

interface SessionSideChatToolbarPanelProps {
  i18n: PsmPluginI18nClient;
  open: boolean;
  loading?: boolean;
  onToggle: () => void;
}

export default function SessionSideChatToolbarPanel({
  i18n,
  open,
  loading = false,
  onToggle,
}: SessionSideChatToolbarPanelProps) {
  const { t } = i18n;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={sideChatStyles.toolbarButton(open)}
      title={t("session.sideChat.title", "Side chat")}
      aria-label={t("session.sideChat.title", "Side chat")}
      aria-pressed={open}
      aria-expanded={open}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : open ? (
        <PanelRightOpen className="h-3.5 w-3.5" />
      ) : (
        <MessageCircleQuestion className="h-3.5 w-3.5" />
      )}
      <span className="hidden xl:inline">{t("session.sideChat.shortLabel", "Ask")}</span>
    </button>
  );
}
