// Sidebar vibrancy — temporarily disabled, effect quality not satisfactory.
// To re-enable: restore the settings UI in AppearanceSettings.tsx and
// uncomment the implementation below.

export function useSidebarVibrancy() {
  return { isVibrancyEnabled: false, toggleVibrancy: () => {} };
}
