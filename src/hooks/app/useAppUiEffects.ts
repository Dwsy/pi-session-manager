import { useEffect } from "react";

import type { MobileTab } from "../../components/app/AppMobileLayout";
import type { SessionInfo } from "../../types";

export interface UseAppUiEffectsOptions {
  isMobile: boolean;
  showExportDialog: boolean;
  showRenameDialog: boolean;
  hasPendingDeleteSession: boolean;
  showSettings: boolean;
  showFullTextSearch: boolean;
  showOnboarding: boolean;
  mobileTab: MobileTab;
  pendingScrollEntryId: string | null;
  selectedSession: SessionInfo | null;
  clearPendingScrollEntryId: () => void;
}

export function useAppUiEffects({
  isMobile,
  showExportDialog,
  showRenameDialog,
  hasPendingDeleteSession,
  showSettings,
  showFullTextSearch,
  showOnboarding,
  mobileTab,
  pendingScrollEntryId,
  selectedSession,
  clearPendingScrollEntryId,
}: UseAppUiEffectsOptions): void {
  useEffect(() => {
    if (!isMobile) {
      return;
    }

    const isAnyModalOpen =
      showExportDialog ||
      showRenameDialog ||
      hasPendingDeleteSession ||
      showSettings ||
      showFullTextSearch ||
      showOnboarding ||
      mobileTab === "settings";

    if (isAnyModalOpen) {
      document.body.classList.add("mobile-modal-open");
    } else {
      document.body.classList.remove("mobile-modal-open");
    }

    return () => {
      document.body.classList.remove("mobile-modal-open");
    };
  }, [
    isMobile,
    showExportDialog,
    showRenameDialog,
    hasPendingDeleteSession,
    showSettings,
    showFullTextSearch,
    showOnboarding,
    mobileTab,
  ]);

  useEffect(() => {
    if (!pendingScrollEntryId || !selectedSession) {
      return;
    }

    const timer = setTimeout(clearPendingScrollEntryId, 0);
    return () => clearTimeout(timer);
  }, [pendingScrollEntryId, selectedSession, clearPendingScrollEntryId]);
}
