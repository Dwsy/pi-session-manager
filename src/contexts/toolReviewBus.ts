import type { SessionEntry } from "@/types";

export interface ToolReviewRequest {
  entries?: SessionEntry[];
  toolResultByCallId?: Map<string, SessionEntry>;
  sessionPath?: string;
  scopeLabel?: string;
  initialToolCallId?: string;
}

type Listener = (request: ToolReviewRequest) => void;

const listeners = new Set<Listener>();

export function subscribeToolReview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestToolReview(request?: ToolReviewRequest): boolean {
  if (!request) return false;
  if (listeners.size === 0) return false;
  for (const listener of listeners) {
    try {
      listener(request);
    } catch (error) {
      console.error("[toolReviewBus] listener failed:", error);
    }
  }
  return true;
}
