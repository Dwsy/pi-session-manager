import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BrainCircuit, ChevronDown, Loader2 } from "lucide-react";
import { invoke } from "@/transport";
import { useTranslation } from "react-i18next";
import ModelSelector, { type RPCModel } from "@/components/ModelSelector";
import type { LiveSessionInfo } from "@/hooks/usePiLiveSessions";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

interface SessionViewerModelControlsProps {
  liveSession: LiveSessionInfo | null;
}

export default function SessionViewerModelControls({
  liveSession,
}: SessionViewerModelControlsProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<RPCModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [isChangingThinking, setIsChangingThinking] = useState(false);
  const [isChangingModel, setIsChangingModel] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const thinkingTriggerRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target
        && !popoverRef.current?.contains(target)
        && !thinkingTriggerRef.current?.contains(target)
      ) {
        setThinkingOpen(false);
      }
    }
    if (thinkingOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [thinkingOpen]);

  useEffect(() => {
    if (!thinkingOpen) return;

    const updatePopoverPosition = () => {
      const trigger = thinkingTriggerRef.current;
      if (!trigger || typeof window === "undefined") return;

      const rect = trigger.getBoundingClientRect();
      const width = 180;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const openUpward = viewportHeight - rect.bottom < 220 && rect.top > viewportHeight / 2;
      const left = Math.min(Math.max(8, rect.right - width), viewportWidth - width - 8);
      const top = openUpward ? Math.max(8, rect.top - 8 - 240) : rect.bottom + 8;

      setPopoverStyle({
        position: "fixed",
        top,
        left,
        width,
        zIndex: 1300,
      });
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [thinkingOpen]);

  useEffect(() => {
    if (!liveSession) return;

    const availableModels = liveSession.availableModels || [];
    const dedup = new Map<string, RPCModel>();
    for (const item of availableModels) {
      const key = `${item.provider}:${item.id}`;
      if (!dedup.has(key)) {
        dedup.set(key, {
          id: item.id,
          name: item.name || item.id,
          provider: item.provider,
        });
      }
    }
    setModels([...dedup.values()]);
    setModelsLoading(false);
  }, [liveSession]);

  useEffect(() => {
    if (!liveSession || (liveSession.availableModels && liveSession.availableModels.length > 1)) {
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    invoke<{
      models?: Array<{ provider: string; id: string; name?: string }>;
    }>("pi_agent_get_available_models", {
      sessionId: liveSession.sessionId,
    })
      .then((state) => {
        if (cancelled) return;
        const availableModels = state.models || [];
        const dedup = new Map<string, RPCModel>();
        for (const item of availableModels) {
          const key = `${item.provider}:${item.id}`;
          if (!dedup.has(key)) {
            dedup.set(key, {
              id: item.id,
              name: item.name || item.id,
              provider: item.provider,
            });
          }
        }
        if (dedup.size > 0) {
          setModels([...dedup.values()]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [liveSession?.availableModels, liveSession?.sessionId]);

  const currentModel = useMemo<RPCModel | null>(() => {
    if (!liveSession?.model || typeof liveSession.model === "string") {
      return null;
    }
    return {
      id: liveSession.model.id,
      name: liveSession.model.name || liveSession.model.id,
      provider: liveSession.model.provider,
    };
  }, [liveSession]);

  if (!liveSession) return null;

  const thinkingLevel = liveSession.thinkingLevel || "low";
  const thinkingLabelMap: Record<(typeof THINKING_LEVELS)[number], string> = {
    off: t("components.thinkingLevel.off", "Off"),
    minimal: t("components.thinkingLevel.minimal", "Minimal"),
    low: t("components.thinkingLevel.low", "Low"),
    medium: t("components.thinkingLevel.medium", "Medium"),
    high: t("components.thinkingLevel.high", "High"),
    xhigh: t("components.thinkingLevel.xhigh", "X-High"),
  };

  const handleModelSelect = async (model: RPCModel) => {
    try {
      setIsChangingModel(true);
      await invoke("pi_agent_set_model", {
        sessionId: liveSession.sessionId,
        provider: model.provider,
        modelId: model.id,
      });
    } catch (err) {
      console.error("Failed to set model:", err);
    } finally {
      setIsChangingModel(false);
    }
  };

  const handleSetThinkingLevel = async (level: string) => {
    try {
      setIsChangingThinking(true);
      await invoke("pi_agent_set_thinking_level", {
        sessionId: liveSession.sessionId,
        level,
      });
      setThinkingOpen(false);
    } catch (err) {
      console.error("Failed to set thinking level:", err);
    } finally {
      setIsChangingThinking(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <ModelSelector
        models={models}
        currentModel={currentModel}
        onSelect={handleModelSelect}
        loading={modelsLoading || isChangingModel}
        disabled={modelsLoading || isChangingModel}
      />

      <div className="relative">
        <button
          ref={thinkingTriggerRef}
          onClick={() => setThinkingOpen((prev) => !prev)}
          className="inline-flex min-w-[92px] items-center justify-between gap-1.5 rounded-md border border-border/70 bg-secondary px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary-hover active:bg-secondary-hover"
          title={t("session.modelControls.thinkingLevel", "Thinking Level")}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <BrainCircuit className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate font-medium">{thinkingLabelMap[thinkingLevel as keyof typeof thinkingLabelMap] || thinkingLevel}</span>
          </span>
          {isChangingThinking ? (
            <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform ${thinkingOpen ? "rotate-180" : ""}`} />
          )}
        </button>

        {thinkingOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={popoverRef}
                style={popoverStyle}
                className="overflow-hidden rounded-lg border border-border bg-popover shadow-md"
              >
                <div className="border-b border-border/60 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {t("session.modelControls.thinkingLevel", "Thinking Level")}
                </div>
                <div className="p-1.5 space-y-0.5">
                  {THINKING_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => handleSetThinkingLevel(level)}
                      disabled={isChangingThinking}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                        thinkingLevel === level
                          ? "bg-primary/12 text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      }`}
                    >
                      <span className="font-medium">
                        {thinkingLabelMap[level]}
                      </span>
                      {thinkingLevel === level && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          当前
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}
