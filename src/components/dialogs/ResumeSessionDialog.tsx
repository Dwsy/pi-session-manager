import { useEffect, useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "@/hooks/useIsMobile";
import type {
  SessionConvertTarget,
  SessionInfo,
  SessionProviderInfo,
} from "@/types";
import { getSessionSourceTag } from "@/utils/session";
import { listSupportedSessionProviders } from "@/utils/sessionProvidersApi";

interface ResumeSessionDialogProps {
  session: SessionInfo;
  defaultTarget: SessionConvertTarget;
  onResume: (target: SessionConvertTarget) => Promise<void> | void;
  onClose: () => void;
}

export default function ResumeSessionDialog({
  session,
  defaultTarget,
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
      const targets = items.filter((item) => item.capabilities.canConvertTarget);
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

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onResume(target);
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
              {t("session.resumeDialog.title", "Resume in another CLI")}
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
            {session.name || session.first_message || t("session.list.untitled")}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("session.convert.source")}: {sourceLabel}
          </div>
        </div>

        <div className="space-y-2">
          {providers.map((option) => (
            <button
              key={option.slug}
              type="button"
              onClick={() => setTarget(option.slug)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                target === option.slug
                  ? "border-primary/40 bg-primary/10"
                  : "border-border/60 bg-secondary/20 hover:bg-secondary/50"
              }`}
            >
              <div className="font-medium">{option.display_name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t(`session.convert.targetDescriptions.${option.slug}`)}
              </div>
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
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-3 py-2 text-sm rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15 text-foreground transition-colors inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {submitting
              ? t("common.loading")
              : t("session.resume", "Resume")}
          </button>
        </div>
      </div>
    </div>
  );
}
