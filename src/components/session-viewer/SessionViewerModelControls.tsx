import { useState, useRef, useEffect } from "react";
import { Settings2, Loader2, BrainCircuit, Bot } from "lucide-react";
import type { LiveSessionInfo } from "../../hooks/usePiLiveSessions";
import { invoke } from "../../transport";
import { useTranslation } from "react-i18next";

interface SessionViewerModelControlsProps {
  liveSession: LiveSessionInfo | null;
}

export default function SessionViewerModelControls({
  liveSession,
}: SessionViewerModelControlsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isChangingThinking, setIsChangingThinking] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!liveSession) return null;

  const thinkingLevel = liveSession.thinking_level || "low";
  // Attempt to parse model ID - handles various formats passed from backend
  const modelId =
    typeof liveSession.model === "string"
      ? liveSession.model
      : liveSession.model?.id || "unknown";

  const handleSetThinkingLevel = async (level: string) => {
    try {
      setIsChangingThinking(true);
      await invoke("pi_agent_set_thinking", {
        sessionId: liveSession.session_id,
        level,
      });
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to set thinking level:", err);
    } finally {
      setIsChangingThinking(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground/80 hover:text-foreground hover:bg-secondary/50 transition-colors border border-transparent hover:border-border rounded-md"
        title={t("session.modelControls.title", "Model & Thinking Controls")}
      >
        <Bot className="w-3.5 h-3.5" />
        <span className="truncate max-w-[80px] font-medium">{modelId}</span>
        {thinkingLevel !== "low" && (
          <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-semibold tracking-wider uppercase ml-0.5 leading-none">
            {thinkingLevel}
          </span>
        )}
        <Settings2 className="w-3.5 h-3.5 opacity-50 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 p-1 bg-popover rounded-lg border border-border shadow-md z-50">
          <div className="px-3 py-2 border-b border-border/50 mb-1">
            <h4 className="font-medium text-xs text-foreground flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-primary" />
              {t("session.modelControls.thinkingLevel", "Thinking Level")}
            </h4>
          </div>

          <div className="p-1 flex flex-col gap-0.5">
            {["low", "medium", "high"].map((level) => (
              <button
                key={level}
                onClick={() => handleSetThinkingLevel(level)}
                disabled={isChangingThinking}
                className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                  thinkingLevel === level
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="capitalize">{level}</span>
                </div>
                {isChangingThinking && thinkingLevel !== level && (
                  <Loader2 className="w-3 h-3 animate-spin opacity-50" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
