import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FeedbackTone } from "../types";

export function ModelConfigFeedbackToast({
  tone,
  message,
  onClose,
}: {
  tone: FeedbackTone;
  message: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = {
    success:
      "border-success/30 bg-card text-success shadow-md",
    error: "border-destructive/30 bg-card text-destructive shadow-md",
    warning:
      "border-warning/30 bg-card text-warning shadow-md",
    info: "border-info/30 bg-card text-info shadow-md",
  } as const;

  const icons = {
    success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />,
    error: <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />,
    warning: (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
    ),
    info: <Info className="h-3.5 w-3.5 shrink-0 text-info" />,
  };

  return (
    <div
      className={`pointer-events-auto fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[90] w-[min(380px,calc(100vw-24px))] rounded-md border px-3 py-2 text-xs ${palette[tone]}`}
      role="status"
    >
      <div className="flex items-start gap-2">
        {icons[tone]}
        <p className="min-w-0 flex-1 leading-snug font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-current/60 hover:bg-foreground/10 hover:text-current focus-ring"
          aria-label={t("common.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}