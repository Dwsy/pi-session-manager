import { usePiLiveSessions } from "@/hooks/usePiLiveSessions";
import { getSessionSourceSlug } from "@/utils/session";

export interface UseSessionViewerLiveStateOptions {
  sessionId: string;
  sessionPath: string;
  previewMode: boolean;
}

export function useSessionViewerLiveState({
  sessionId,
  sessionPath,
  previewMode,
}: UseSessionViewerLiveStateOptions) {
  const { sessions: liveSessions } = usePiLiveSessions();

  // Only Pi sessions support Pi Live; skip for other agent types
  const sourceSlug = getSessionSourceSlug(sessionPath);
  const isPiSession = sourceSlug === "pi";

  const liveSession = previewMode || !isPiSession
    ? null
    : liveSessions.find((session) => session.sessionId.includes(sessionId)) || null;
  const isLive = previewMode || !isPiSession ? false : Boolean(liveSession);

  return {
    liveSession,
    isLive,
  };
}
