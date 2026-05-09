import { AlertCircle, Check, X } from "lucide-react";
import type { FeedbackTone } from "../types";

export function StatusBanner({
  tone,
  message,
  onClose,
}: {
  tone: FeedbackTone;
  message: string;
  onClose: () => void;
}) {
  const palette = {
    success: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
    error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    info: "border-info/30 bg-info/10 text-info",
  } as const;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${palette[tone]}`}
    >
      <div className="flex items-start gap-2">
        {tone === "success" ? (
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
        ) : (
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        )}
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-1 text-current/80 hover:bg-black/10 hover:text-current motion-color motion-press focus-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
