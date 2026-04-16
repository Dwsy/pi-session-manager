import { Loader2 } from "lucide-react";
import type { ConfirmDialogState } from "../types";
import { ModalShell } from "./ModalShell";

export function ConfirmDialog({
  dialog,
  confirming,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  dialog: ConfirmDialogState;
  confirming: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const palette = {
    danger: "bg-red-600 hover:bg-red-700 text-white",
    warning: "bg-amber-500 hover:bg-amber-600 text-black",
    info: "bg-info hover:bg-info/90 text-white",
  } as const;

  return (
    <ModalShell
      title={dialog.title}
      description={dialog.description}
      onClose={() => {
        if (!confirming) onCancel();
      }}
      widthClass="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium motion-color motion-press focus-ring disabled:opacity-60 ${palette[dialog.tone]}`}
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {dialog.confirmLabel}
          </button>
        </>
      }
    >
      <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
        {dialog.description}
      </div>
    </ModalShell>
  );
}
