import type { ReactNode } from "react";
import { X } from "lucide-react";

export function ModalShell({
  title,
  description,
  children,
  footer,
  onClose,
  widthClass = "max-w-lg",
  overlayClassName = "z-50",
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  widthClass?: string;
  /** Overlay stacking class; raise for nested confirms over other modals. */
  overlayClassName?: string;
}) {
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] ${overlayClassName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full rounded-xl border border-border/70 bg-background shadow-2xl ${widthClass}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-foreground motion-color motion-press focus-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
