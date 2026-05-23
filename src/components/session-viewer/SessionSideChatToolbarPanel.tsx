import { Loader2, MessageCircleQuestion, PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SessionSideChatToolbarPanelProps {
  open: boolean;
  loading?: boolean;
  onToggle: () => void;
}

export default function SessionSideChatToolbarPanel({
  open,
  loading = false,
  onToggle,
}: SessionSideChatToolbarPanelProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
        open
          ? "border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16"
          : "border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
      }`}
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
