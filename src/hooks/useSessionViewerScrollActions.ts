import { useCallback } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import type { SessionViewerMessagesRef } from "@/components/session-viewer/SessionViewerMessages";

export interface UseSessionViewerScrollActionsOptions {
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void> | void;
  pendingScrollToBottomRef: MutableRefObject<boolean>;
  sessionDataIsAtBottomRef: MutableRefObject<boolean>;
  messagesRef: RefObject<SessionViewerMessagesRef>;
  setHasNewMessages: Dispatch<SetStateAction<boolean>>;
}

export function useSessionViewerScrollActions({
  hasMoreHistory,
  loadMoreHistory,
  pendingScrollToBottomRef,
  sessionDataIsAtBottomRef,
  messagesRef,
  setHasNewMessages,
}: UseSessionViewerScrollActionsOptions) {
  const handleReachBottom = useCallback(() => {
    if (hasMoreHistory) {
      void loadMoreHistory();
    }
  }, [hasMoreHistory, loadMoreHistory]);

  const handleScrollToTop = useCallback(() => {
    messagesRef.current?.scrollToTop();
  }, [messagesRef]);

  const handleScrollToBottom = useCallback(() => {
    messagesRef.current?.scrollToBottom();
    setHasNewMessages(false);
  }, [messagesRef, setHasNewMessages]);

  const handleChatSent = useCallback(() => {
    sessionDataIsAtBottomRef.current = true;
    pendingScrollToBottomRef.current = true;
    setHasNewMessages(false);
    messagesRef.current?.scrollToBottom();
  }, [messagesRef, pendingScrollToBottomRef, sessionDataIsAtBottomRef, setHasNewMessages]);

  return {
    handleReachBottom,
    handleScrollToTop,
    handleScrollToBottom,
    handleChatSent,
  };
}
