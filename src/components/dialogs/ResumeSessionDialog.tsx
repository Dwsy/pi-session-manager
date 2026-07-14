import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "@/hooks/useIsMobile";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`bg-background border border-border rounded-xl p-6 shadow-2xl ${
          isMobile ? "w-[95vw] max-w-md" : "w-[32rem]"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">
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
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm">
          <div className="font-medium truncate">
            {getSessionListDisplayName(session, t("session.list.untitled"))}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("session.convert.source")}: {sourceLabel}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {mode === "copy"
              ? t(
                  "session.resumeDialog.copyHelp",
                  "Choose which CLI command should be copied for this session.",
                )
              : t(
                  "session.resumeDialog.resumeHelp",
                  "Choose which CLI this session should resume into.",
                )}
          </div>
        </div>

        <div className="space-y-2">
          {providers.map((option) => (
            <button
              key={option.slug}
              type="button"
              onClick={() => handleSubmit(option.slug)}
              disabled={submitting}
              className={`flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left motion-context ${
                target === option.slug
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/60 bg-secondary/20 hover:bg-secondary/50"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <AgentIcon source={option.slug} size={16} />
                  <span className="truncate">{option.display_name}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(`session.convert.targetDescriptions.${option.slug}`)}
                </div>
              </div>
              <span
                className={`mt-0.5 shrink-0 ${
                  target === option.slug
                    ? "text-primary"
                    : "text-muted-foreground/70"
                }`}
              >
                {target === option.slug ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-border/70 bg-secondary hover:bg-secondary-hover transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
