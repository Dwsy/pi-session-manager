/**
 * Chat Input — Send a steer message to the live Pi session.
 * Stateless component (no hooks) to avoid React version conflicts.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Loader2, Zap } from "lucide-react";

interface ChatInputProps {
  sessionId: string;
  isLive: boolean;
  onSent?: () => void;
}

export default function ChatInput({ sessionId, isLive, onSent }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [steering, setSteering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || steering) return;
    try {
      setSteering(true);
      const transport = await import("../transport");
      await transport.invoke<string>("pi_agent_steering", {
        session_id: sessionId,
        message: input.trim(),
        deliver_as: "steer",
      });
      setInput("");
      onSent?.();
    } catch (e) {
      console.error("[ChatInput] steer failed:", e);
    } finally {
      setSteering(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, sessionId, steering, onSent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!isLive) return null;

  return (
    <div className="border-t border-border/50 bg-surface/60 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-green-500 animate-pulse flex-shrink-0" />
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a steer message…"
            className="w-full bg-muted/40 border border-border/60 rounded-lg pl-3 pr-10 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || steering}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors disabled:opacity-30 text-primary hover:text-primary/80"
          >
            {steering
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
