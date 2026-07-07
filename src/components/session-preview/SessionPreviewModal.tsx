import { useLayoutEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Play, X, Maximize2, Minus } from "lucide-react";
import KbdTooltip from "@/components/ui/KbdTooltip";
import type { SessionInfo } from "@/types";
import type { TerminalType } from "@/components/settings/types";
import SessionViewer from "@/components/SessionViewer";
import type { SessionViewerToolbarSlots } from "@/components/session-viewer/SessionViewerToolbarTypes";
import SessionPreviewCodeReviewHost from "./SessionPreviewCodeReviewHost";

export type SessionPreviewAnimationMode = "stable" | "origin-point";

export interface SessionPreviewModalProps {
  session: SessionInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onCloseStart?: () => void;
  onExpand: () => void;
  onExport?: () => void;
  onConvert?: () => void;
  onRename?: () => void;
  onRenameSession?: (newName: string) => void | Promise<void>;
  onFork?: () => void;
  onResumeSession?: (session: SessionInfo) => Promise<void> | void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  initialClickPoint?: { x: number; y: number } | null;
  animationMode?: SessionPreviewAnimationMode;
  onCloseAnimationComplete?: () => void;
}

export default function SessionPreviewModal({
  session,
  isOpen,
  onClose,
  onCloseStart,
  onExpand,
  onExport = () => {},
  onConvert,
  onRename = () => {},
  onRenameSession,
  onFork,
  onResumeSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  onCloseAnimationComplete,
}: SessionPreviewModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeInFlightRef = useRef(false);

  const handleCloseWithAnimation = useCallback(() => {
    if (closeInFlightRef.current) {
      return;
    }

    closeInFlightRef.current = true;
    onCloseStart?.();
    onClose();
    onCloseAnimationComplete?.();
    closeInFlightRef.current = false;
  }, [
    onClose,
    onCloseStart,
    onCloseAnimationComplete,
  ]);

  const handleMinimize = useCallback(() => {
    handleCloseWithAnimation();
  }, [handleCloseWithAnimation]);

  const handleMaximize = useCallback(() => {
    onExpand();
  }, [onExpand]);

  const handleClose = useCallback(() => {
    handleCloseWithAnimation();
  }, [handleCloseWithAnimation]);



  // Create toolbar slots with preview controls
  const toolbarSlots: SessionViewerToolbarSlots = {
    right: (
      <>
        <SessionPreviewCodeReviewHost session={session} />
        {onResumeSession && (
          <KbdTooltip shortcut="Cmd+R">
            <button
              onClick={() => session && onResumeSession(session)}
              className="p-1.5 rounded border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors no-drag"
              title={t("session.resume", "Resume")}
              aria-label={t("session.resume", "Resume")}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </KbdTooltip>
        )}
        <div className="h-4 w-px bg-border/60 mx-0.5" />
        <button
          onClick={handleMinimize}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors no-drag"
          title={t("session.preview.minimize", "Minimize")}
          aria-label={t("session.preview.minimize", "Minimize")}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors no-drag"
          title={t("session.preview.maximize", "Maximize")}
          aria-label={t("session.preview.maximize", "Maximize")}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors no-drag"
          title={t("session.preview.close", "Close")}
          aria-label={t("session.preview.close", "Close")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="h-4 w-px bg-border/60 mx-0.5" />
      </>
    ),
  };

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleCloseWithAnimation();
        return;
      }

      // Cmd+Enter or Ctrl+Enter to expand/fullscreen
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onExpand();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusableElements =
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [handleCloseWithAnimation],
  );

  useLayoutEffect(() => {
    if (isOpen) {
      closeInFlightRef.current = false;
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      focusTimeoutRef.current = setTimeout(() => {
        if (modalRef.current) {
          const focusable = modalRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          focusable?.focus();
        }
      }, 50);

    } else {
      closeInFlightRef.current = false;
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [
    isOpen,
    handleKeyDown,
  ]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleCloseWithAnimation();
    }
  };

  if (!isOpen || !session) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-preview-title"
    >
      <div
        ref={modalRef}
        className="bg-surface rounded-lg shadow-2xl flex flex-col overflow-hidden border border-border w-full h-full sm:w-[90vw] sm:h-[90vh] sm:max-w-[90vw] sm:max-h-[90vh]"
      >
        <div className="flex-1 overflow-hidden bg-background">
          <SessionViewer
            session={session}
            previewVariant="conversation"
            slots={toolbarSlots}
            onExport={onExport}
            onConvert={onConvert}
            onRename={onRename}
            onRenameSession={onRenameSession}
            onFork={onFork}
            onBack={handleCloseWithAnimation}
            onResumeSession={onResumeSession}
            terminal={terminal}
            piPath={piPath}
            customCommand={customCommand}
            resumeCommand={resumeCommand}
          />
        </div>
      </div>
    </div>
  );
}
