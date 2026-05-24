import { useCallback, useState } from "react";

export function useSessionViewerPanelController() {
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false);

  const openSystemPromptDialog = useCallback(() => {
    setShowSystemPromptDialog(true);
  }, []);

  const closeSystemPromptDialog = useCallback(() => {
    setShowSystemPromptDialog(false);
  }, []);

  return {
    showSystemPromptDialog,
    openSystemPromptDialog,
    closeSystemPromptDialog,
  };
}
