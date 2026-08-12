import type { ReactNode } from "react";

import SessionContextMenu from "@/components/session-viewer/SessionContextMenu";
import type { TerminalType } from "@/components/settings/types";
import { useClipboard } from "@/hooks/useClipboard";
import { invoke, isTauri } from "@/transport";
import type { SessionInfo, Tag } from "@/types";
import {
  buildCopyResumeCommand,
  openSessionInTerminalDirect,
} from "@/utils/sessionResume";

export interface SessionRowContextMenuProps {
  session: SessionInfo;
  point: { x: number; y: number };
  tags: Tag[];
  sessionTagIds: string[];
  onToggleTag: (sessionId: string, tagId: string, currentlyAssigned: boolean) => void;
  onClose: () => void;
  onResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>;
  onConvertSession?: (session: SessionInfo) => void;
  onForkSession?: (session: SessionInfo) => void | Promise<void>;
  onRenameSession?: (session: SessionInfo) => void;
  onDeleteSession?: (session: SessionInfo) => void;
  terminal?: TerminalType;
  piPath?: string;
  customCommand?: string;
  resumeCommand?: string;
  pluginActions?: ReactNode;
}

/**
 * Shared right-click menu wiring for every session row surface (sidebar cards,
 * main-view tables). Keeps terminal/browser/clipboard fallbacks in one place.
 */
export default function SessionRowContextMenu({
  session,
  point,
  tags,
  sessionTagIds,
  onToggleTag,
  onClose,
  onResumeSession,
  onCopyResumeSession,
  onConvertSession,
  onForkSession,
  onRenameSession,
  onDeleteSession,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  pluginActions,
}: SessionRowContextMenuProps) {
  const { copyText } = useClipboard();

  return (
    <SessionContextMenu
      x={point.x}
      y={point.y}
      sessionId={session.id}
      tags={tags}
      sessionTagIds={sessionTagIds}
      onToggleTag={(tagId, assigned) => onToggleTag(session.id, tagId, assigned)}
      onOpenTerminal={
        onResumeSession
          ? () => {
              void onResumeSession(session);
            }
          : isTauri()
            ? () => {
                openSessionInTerminalDirect(session, {
                  terminal,
                  customCommand,
                  piPath,
                  resumeCommand,
                }).catch(console.error);
              }
            : undefined
      }
      onOpenBrowser={
        isTauri()
          ? () => {
              invoke("open_session_in_browser", { path: session.path }).catch(console.error);
            }
          : undefined
      }
      onConvert={onConvertSession ? () => onConvertSession(session) : undefined}
      pluginActions={pluginActions}
      onCopyPath={() => {
        void copyText(session.path).catch(console.error);
      }}
      onCopyResume={
        onCopyResumeSession
          ? async () => {
              await onCopyResumeSession(session);
            }
          : isTauri()
            ? () => {
                void buildCopyResumeCommand(session, { piPath, resumeCommand }).then((command) =>
                  copyText(command).catch(console.error),
                );
              }
            : undefined
      }
      onFork={onForkSession ? () => void onForkSession(session) : undefined}
      onRename={onRenameSession ? () => onRenameSession(session) : undefined}
      onDeleteDirect={onDeleteSession ? () => onDeleteSession(session) : undefined}
      onClose={onClose}
    />
  );
}
