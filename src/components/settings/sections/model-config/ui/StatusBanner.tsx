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
    success: "border-success/30 bg-success/10 text-success",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
    warning: "border-warning/30 bg-warning/10 text-warning",
    info: "border-info/30 bg-info/10 text-info",
  } as const;

  const icons = {
    success: <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />,
    error: <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />,
    warning: <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />,
    info: <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" />,
  };

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${palette[tone]}`}
    >
      <div className="flex items-start gap-2.5">
        {icons[tone]}
        <span className="font-medium leading-relaxed">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="focus-ring rounded-md p-1 text-current/70 hover:bg-foreground/10 hover:text-current"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
