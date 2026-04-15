import { useLayoutEffect, useCallback, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Maximize2, Minus } from "lucide-react";
import type { SessionInfo } from "@/types";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { TerminalType } from "@/components/settings/types";
import SessionViewer from "@/components/SessionViewer";
import type { SessionViewerToolbarSlots } from "@/components/session-viewer/SessionViewerToolbarTypes";

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
  onResumeSession?: (session: SessionInfo) => Promise<void> | void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  initialClickPoint?: { x: number; y: number } | null;
  animationMode?: SessionPreviewAnimationMode;
  onCloseAnimationComplete?: () => void;
}

const MODAL_OPEN_ANIMATION_DURATION_MS = 180;
const MODAL_CLOSE_ANIMATION_DURATION_MS = 140;

function resolveAnimationMode(
  explicitMode: SessionPreviewAnimationMode,
  prefersReducedMotion: boolean,
): SessionPreviewAnimationMode {
  if (prefersReducedMotion) {
    return "stable";
  }

  return explicitMode;
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
  onResumeSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  initialClickPoint,
  animationMode = "stable",
  onCloseAnimationComplete,
}: SessionPreviewModalProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [animationStyles, setAnimationStyles] = useState<React.CSSProperties>(
    {},
  );
  const modalRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeInFlightRef = useRef(false);
  const resolvedAnimationMode = resolveAnimationMode(
    animationMode,
    prefersReducedMotion,
  );

  const openAnimationDuration = prefersReducedMotion
    ? 1
    : MODAL_OPEN_ANIMATION_DURATION_MS;
  const closeAnimationDuration = prefersReducedMotion
    ? 1
    : MODAL_CLOSE_ANIMATION_DURATION_MS;
  const openAnimationTransition = `transform ${openAnimationDuration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${openAnimationDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  const closeAnimationTransition = `transform ${closeAnimationDuration}ms cubic-bezier(0.4, 0, 1, 1), opacity ${closeAnimationDuration}ms cubic-bezier(0.4, 0, 1, 1)`;

  const getTransformOrigin = useCallback(() => {
    if (resolvedAnimationMode !== "origin-point" || !initialClickPoint) {
      return "center center";
    }

    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) {
      return "center center";
    }

    const x = Math.min(
      Math.max(initialClickPoint.x - rect.left, 0),
      rect.width,
    );
    const y = Math.min(
      Math.max(initialClickPoint.y - rect.top, 0),
      rect.height,
    );
    return `${x}px ${y}px`;
  }, [initialClickPoint, resolvedAnimationMode]);

  const handleCloseWithAnimation = useCallback(() => {
    if (closeInFlightRef.current) {
      return;
    }

    closeInFlightRef.current = true;
    onCloseStart?.();

    if (!session) {
      onClose();
      onCloseAnimationComplete?.();
      closeInFlightRef.current = false;
      return;
    }

    if (prefersReducedMotion) {
      onClose();
      onCloseAnimationComplete?.();
      closeInFlightRef.current = false;
      return;
    }

    const transformOrigin = getTransformOrigin();

    setAnimationStyles({
      transformOrigin,
      transform: "scale(0.92)",
      opacity: 0,
      transition: closeAnimationTransition,
    });

    animationTimeoutRef.current = setTimeout(() => {
      setAnimationStyles({});
      onClose();
      onCloseAnimationComplete?.();
      closeInFlightRef.current = false;
    }, closeAnimationDuration + 10);
  }, [
    closeAnimationDuration,
    closeAnimationTransition,
    getTransformOrigin,
    onClose,
    onCloseStart,
    onCloseAnimationComplete,
    prefersReducedMotion,
    session,
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
        <div className="h-4 w-px bg-border/60 mx-0.5" />
        <button
          onClick={handleMinimize}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors no-drag"
          title={t("kanban.minimize", "Minimize")}
          aria-label={t("kanban.minimize", "Minimize")}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors no-drag"
          title={t("kanban.maximize", "Maximize")}
          aria-label={t("kanban.maximize", "Maximize")}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors no-drag"
          title={t("kanban.close", "Close")}
          aria-label={t("kanban.close", "Close")}
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

      if (!prefersReducedMotion) {
        const transformOrigin = getTransformOrigin();
        const initialScale =
          resolvedAnimationMode === "origin-point"
            ? "scale(0.92)"
            : "scale(0.97)";

        // Set initial state (before animation)
        setAnimationStyles({
          transformOrigin,
          transform: initialScale,
          opacity: 0,
          transition: "none",
        });

        // Trigger animation in next frame
        requestAnimationFrame(() => {
          setAnimationStyles({
            transformOrigin,
            transform: "scale(1)",
            opacity: 1,
            transition: openAnimationTransition,
          });

          // Clean up transition property after animation completes, keep transformOrigin
          animationTimeoutRef.current = setTimeout(() => {
            setAnimationStyles({
              transformOrigin,
            });
          }, openAnimationDuration + 10);
        });
      }
    } else {
      closeInFlightRef.current = false;
      setAnimationStyles({});
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [
    isOpen,
    getTransformOrigin,
    handleKeyDown,
    openAnimationDuration,
    openAnimationTransition,
    prefersReducedMotion,
    resolvedAnimationMode,
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
        style={{
          ...animationStyles,
        }}
      >
        <div className="flex-1 overflow-hidden bg-background">
          <SessionViewer
            session={session}
            previewMode
            slots={toolbarSlots}
            onExport={onExport}
            onConvert={onConvert}
            onRename={onRename}
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
