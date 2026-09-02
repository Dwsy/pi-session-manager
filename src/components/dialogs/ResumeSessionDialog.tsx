import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "@/hooks/useIsMobile";
import { useEscapeToClose } from "./useEscapeToClose";
import { AgentIcon } from "@/components/session-viewer/AgentIcon";
import type {
  SessionConvertTarget,
  SessionInfo,
  SessionProviderInfo,
} from "@/types";
import { getSessionSourceTag } from "@/utils/session";
import { getSessionListDisplayName } from "@/utils/sessionDisplay";
import { listSupportedSessionProviders } from "@/utils/sessionProvidersApi";

interface ResumeSessionDialogProps {
  session: SessionInfo;
  defaultTarget: SessionConvertTarget;
  mode?: "resume" | "copy";
  onResume: (target: SessionConvertTarget) => Promise<void> | void;
  onClose: () => void;
}

export default function ResumeSessionDialog({
  session,
  defaultTarget,
  mode = "resume",
  onResume,
  onClose,
}: ResumeSessionDialogProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  useEscapeToClose(onClose);
  const sourceLabel = useMemo(
    () => getSessionSourceTag(session.path) || t("session.convert.unknown"),
    [session.path, t],
  );
  const [providers, setProviders] = useState<SessionProviderInfo[]>([]);
  const [target, setTarget] = useState<SessionConvertTarget>(defaultTarget);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSupportedSessionProviders().then((items) => {
      if (cancelled) return;
      const targets = items
        .filter((item) => item.capabilities.canConvertTarget)
        .sort((a, b) => {
          if (a.slug === "pi") return -1;
          if (b.slug === "pi") return 1;
          return a.display_name.localeCompare(b.display_name);
        });
      setProviders(targets);
      if (!targets.some((item) => item.slug === defaultTarget) && targets[0]) {
        setTarget(targets[0].slug);
      } else {
        setTarget(defaultTarget);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [defaultTarget]);

  const handleSubmit = async (selectedTarget = target) => {
    if (submitting) return;
    setTarget(selectedTarget);
    setSubmitting(true);
    try {
      await onResume(selectedTarget);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (providers.length === 0 || submitting) return;

    const currentIndex = Math.max(
      0,
      providers.findIndex((provider) => provider.slug === target),
    );

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setTarget(providers[(currentIndex + 1) % providers.length].slug);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setTarget(
        providers[(currentIndex - 1 + providers.length) % providers.length].slug,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void handleSubmit(target);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-session-title"
        onKeyDown={handleKeyDown}
        className={`max-h-[calc(100vh-2rem)] overflow-hidden border border-border bg-background p-3 shadow-xl rounded-lg ${
          isMobile ? "w-[95vw] max-w-md" : "w-[28rem]"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Play className="h-4 w-4 shrink-0 text-primary" />
            <h3 id="resume-session-title" className="truncate text-sm font-semibold">
              {mode === "copy"
                ? t(
                    "session.resumeDialog.copyTitle",
                    "Choose a CLI for copy resume",
                  )
                : t("session.resumeDialog.title", "Resume in another CLI")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="focus-ring shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex min-w-0 items-center gap-2 border-b border-border/60 pb-2 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate text-foreground">
            {getSessionListDisplayName(session, t("session.list.untitled"))}
          </span>
          <span className="shrink-0">{sourceLabel}</span>
          <span className="shrink-0 text-[10px]">
            {t("session.resumeDialog.keyboardHint", "↑↓ select · Enter run · Esc close")}
          </span>
        </div>

        <div className="grid max-h-[min(68vh,28rem)] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
          {providers.map((option) => (
            <button
              key={option.slug}
              type="button"
              onClick={() => handleSubmit(option.slug)}
              disabled={submitting}
              aria-pressed={target === option.slug}
              onFocus={() => setTarget(option.slug)}
              className={`flex min-w-0 w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs focus-ring ${
                target === option.slug
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/70 bg-background hover:bg-muted"
              }`}
            >
              <AgentIcon source={option.slug} size={15} />
              <span className="min-w-0 flex-1 truncate font-medium">{option.display_name}</span>
              {target === option.slug && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
