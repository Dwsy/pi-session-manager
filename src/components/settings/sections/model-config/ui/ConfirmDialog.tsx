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
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    warning: "bg-warning text-warning-foreground hover:bg-warning/90",
    info: "bg-primary text-primary-foreground hover:bg-primary/90",
  } as const;

  return (
    <ModalShell
      title={dialog.title}
      description={dialog.description}
      onClose={() => {
        if (!confirming) onCancel();
      }}
      widthClass="max-w-md"
      overlayClassName="z-[60]"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="focus-ring rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-ring disabled:opacity-60 ${palette[dialog.tone]}`}
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            {dialog.confirmLabel}
          </button>
        </>
      }
    >
    </ModalShell>
  );
}
