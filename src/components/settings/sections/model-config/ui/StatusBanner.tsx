import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
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
    info: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  } as const;

  const icons = {
    success: <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />,
    error: <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />,
    warning: <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />,
    info: <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />,
  };

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm shadow-sm transition-all duration-200 ${palette[tone]}`}
    >
      <div className="flex items-start gap-2.5">
        {icons[tone]}
        <span className="font-medium leading-relaxed">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1 text-current/70 hover:bg-black/10 hover:text-current dark:hover:bg-white/10 transition-colors focus-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
