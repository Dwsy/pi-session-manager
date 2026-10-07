import { ask as askNative } from "@tauri-apps/plugin-dialog";

import { isTauri } from "@/transport";

/**
 * Confirmation dialog for destructive actions: prefers the native Tauri
 * ask dialog and falls back to window.confirm in the browser runtime or
 * when the dialog plugin is unavailable. Keeps settings destructive
 * actions on one dialog primitive instead of a mix of window.confirm
 * and native dialogs.
 */
export async function askConfirm(
  message: string,
  title = "Confirm",
): Promise<boolean> {
  if (isTauri()) {
    try {
      return await askNative(message, { title, kind: "warning" });
    } catch {
      // Plugin unavailable — fall through to window.confirm.
    }
  }
  return window.confirm(message);
}
