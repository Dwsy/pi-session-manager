import { useCallback, useState } from "react";

export function useSessionViewerPanelController() {
  const [showSystemPromptDialog, setShowSystemPromptDialog] = useState(false);
  const [traceMode, setTraceMode] = useState(false);

  const openSystemPromptDialog = useCallback(() => {
    setShowSystemPromptDialog(true);
  }, []);

  const closeSystemPromptDialog = useCallback(() => {
    setShowSystemPromptDialog(false);
  }, []);

  const toggleTraceMode = useCallback(() => {
    setTraceMode((prev) => !prev);
  }, []);

  const closeTraceMode = useCallback(() => {
    setTraceMode(false);
  }, []);

  return {
    showSystemPromptDialog,
    traceMode,
    openSystemPromptDialog,
    closeSystemPromptDialog,
    toggleTraceMode,
    closeTraceMode,
  };
}
