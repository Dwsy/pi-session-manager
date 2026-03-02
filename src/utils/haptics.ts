/**
 * Utility for triggering haptic feedback on supported devices.
 * Uses the Web Vibration API.
 */

export const HapticPatterns = {
  soft: [10],
  light: [15],
  medium: [20],
  heavy: [30],
  success: [15, 50, 20],
  warning: [30, 50, 30],
  error: [50, 50, 50, 50, 50],
};

export type HapticPattern = keyof typeof HapticPatterns;

/**
 * Trigger a haptic feedback pattern.
 * Safely fails if the navigator.vibrate API is not available.
 *
 * @param pattern The pattern to trigger, or a custom array of ms.
 */
export function triggerHaptic(
  pattern: HapticPattern | number | number[] = "light",
) {
  if (typeof window === "undefined" || !navigator.vibrate) {
    return;
  }

  try {
    if (typeof pattern === "string") {
      navigator.vibrate(HapticPatterns[pattern]);
    } else {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignore errors on devices where API exists but throws (e.g., some strict permissions)
    console.debug("Haptic feedback failed:", e);
  }
}
