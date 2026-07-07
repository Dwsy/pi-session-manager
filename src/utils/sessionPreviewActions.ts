import type { SessionInfo } from "@/types";

export interface SessionPreviewModalActions {
  onExport: () => void;
  onConvert?: () => void;
  onRename: () => void;
  onRenameSession: (newName: string) => void | Promise<void>;
  onFork?: () => void;
}

export function buildSessionPreviewModalActions(
  session: SessionInfo,
  handlers: {
    onPreviewExportSession: (session: SessionInfo) => void;
    onOpenPreviewRenameDialog: (session: SessionInfo) => void;
    onPreviewRenameSession: (
      session: SessionInfo,
      newName: string,
    ) => void | Promise<void>;
    onPreviewForkSession?: (session: SessionInfo) => void;
    onPreviewConvertSession?: (session: SessionInfo) => void;
  },
): SessionPreviewModalActions {
  return {
    onExport: () => handlers.onPreviewExportSession(session),
    onConvert: handlers.onPreviewConvertSession
      ? () => handlers.onPreviewConvertSession!(session)
      : undefined,
    onRename: () => handlers.onOpenPreviewRenameDialog(session),
    onRenameSession: (newName) =>
      handlers.onPreviewRenameSession(session, newName),
    onFork: handlers.onPreviewForkSession
      ? () => handlers.onPreviewForkSession!(session)
      : undefined,
  };
}