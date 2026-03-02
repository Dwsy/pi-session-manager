import { Suspense } from "react";
import type { ComponentType, LazyExoticComponent, ReactNode } from "react";

export interface SettingsPanelOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface AppSettingsPaneProps {
  isOpen: boolean;
  onClose: () => void;
  fallback: ReactNode;
  SettingsPanelComponent: LazyExoticComponent<ComponentType<SettingsPanelOverlayProps>>;
}

function AppSettingsPane({
  isOpen,
  onClose,
  fallback,
  SettingsPanelComponent,
}: AppSettingsPaneProps) {
  return (
    <Suspense fallback={fallback}>
      <SettingsPanelComponent isOpen={isOpen} onClose={onClose} />
    </Suspense>
  );
}

export default AppSettingsPane;
