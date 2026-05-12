import { usePiLiveSessions } from "@/hooks/usePiLiveSessions";

export interface UseSessionViewerLiveStateOptions {
  sessionId: string;
  previewMode: boolean;
}

export function useSessionViewerLiveState({
  sessionId,
  previewMode,
}: UseSessionViewerLiveStateOptions) {
  const { sessions: liveSessions } = usePiLiveSessions();
  const liveSession = previewMode
    ? null
    : liveSessions.find((session) => session.sessionId.includes(sessionId)) || null;
  const isLive = previewMode ? false : Boolean(liveSession);

  return {
    liveSession,
    isLive,
  };
}
