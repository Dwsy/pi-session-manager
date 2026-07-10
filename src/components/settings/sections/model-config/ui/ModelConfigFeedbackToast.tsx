import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
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
  const palette = {
    success:
      "border-green-500/35 bg-card/95 text-green-800 shadow-lg dark:text-green-200",
    error: "border-red-500/35 bg-card/95 text-red-800 shadow-lg dark:text-red-200",
    warning:
      "border-amber-500/35 bg-card/95 text-amber-900 shadow-lg dark:text-amber-100",
    info: "border-blue-500/35 bg-card/95 text-blue-900 shadow-lg dark:text-blue-100",
  } as const;

  const icons = {
    success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />,
    error: <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />,
    warning: (
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
    ),
    info: <Info className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />,
  };

  return (
    <div
      className={`pointer-events-auto fixed right-3 top-[calc(env(safe-area-inset-top)+12px)] z-[90] w-[min(380px,calc(100vw-24px))] rounded-lg border px-3 py-2 text-xs backdrop-blur-md ${palette[tone]}`}
      role="status"
    >
      <div className="flex items-start gap-2">
        {icons[tone]}
        <p className="min-w-0 flex-1 leading-snug font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-current/60 hover:bg-foreground/10 hover:text-current focus-ring"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}