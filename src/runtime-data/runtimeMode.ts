import { isDemoModeEnabled } from "@/demo";
import { isBrowserDatasetModeEnabled } from "@/browser-dataset";

export type RuntimeMode = "demo" | "browser-dataset" | "backend";

export function getRuntimeMode(): RuntimeMode {
  if (isDemoModeEnabled()) {
    return "demo";
  }
  if (isBrowserDatasetModeEnabled()) {
    return "browser-dataset";
  }
  return "backend";
}
