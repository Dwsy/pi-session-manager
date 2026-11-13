import { invoke as tauriInvoke, isTauri } from "@tauri-apps/api/core";

let reportedMissingNativeCommand = false;

/** Native Force Touch trackpad feedback; no-op in web previews and on other OSes. */
export function triggerTimelineHoverHaptic(): void {
  if (typeof navigator === "undefined" || !isTauri()) return;
  if (!/Macintosh|Mac OS X/i.test(navigator.userAgent)) return;

  // Each actual tick entry must trigger a native click, even when rapidly
  // moving across adjacent ticks. There is deliberately no time throttle.
  // navigator.vibrate doesn't operate the macOS trackpad; use AppKit via Tauri.
  void tauriInvoke("trigger_timeline_haptic").catch((error: unknown) => {
    // A Vite hot-reload cannot register new Rust commands in an older binary.
    // Report once in development rather than silently pretending to vibrate.
    if (import.meta.env.DEV && !reportedMissingNativeCommand) {
      reportedMissingNativeCommand = true;
      console.warn("Timeline haptic needs the rebuilt Tauri app or a supported trackpad:", error);
    }
  });
}
