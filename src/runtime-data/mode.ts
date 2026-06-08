import { getRuntimeMode } from "./runtimeMode";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";

export function shouldSkipOnboardingForRuntime(): boolean {
  return getRuntimeMode() === "demo" || isStandaloneDatasetRuntime();
}

export function shouldBypassAuthGate(): boolean {
  return getRuntimeMode() !== "backend";
}

export function shouldShowConnectionBanner(): boolean {
  if (getRuntimeMode() === "backend") return true
  if (typeof window === "undefined") return false
  const isTauri = !!(window as { __TAURI__?: unknown }).__TAURI__
  return isTauri && localStorage.getItem("psm.remoteMode") === "true"
}
