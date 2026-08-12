import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEscapeToClose } from "@/components/dialogs/useEscapeToClose";

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
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  widthClass?: string;
  /** Overlay stacking class; raise for nested confirms over other modals. */
  overlayClassName?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  useEscapeToClose(onClose);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/60 p-4 ${overlayClassName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full rounded-lg border border-border bg-background shadow-xl ${widthClass}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
